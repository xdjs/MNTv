// bookmark-nugget: single endpoint, three actions (add/remove/list).
//
// Identity is taken from the caller's streaming service token, verified
// server-side. The client sends its Spotify access token (or Apple Music
// user token) along with the action payload; we call the service's own
// API to confirm the token is real and extract a stable user identifier.
// No Supabase Auth session required — this lets users bookmark without
// a second sign-in flow on top of Spotify/Apple OAuth.
//
// DB writes use SUPABASE_SECRET_KEY (with legacy fallback) which bypasses
// RLS. Direct client access to nugget_bookmarks is denied by the migration.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Service = "spotify" | "apple";

interface VerifiedIdentity {
  service: Service;
  userServiceId: string;
}

// ── Spotify verifier ──────────────────────────────────────────────────
async function verifySpotifyToken(token: string): Promise<VerifiedIdentity | null> {
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body?.id) return null;
    return { service: "spotify", userServiceId: String(body.id) };
  } catch {
    return null;
  }
}

// ── Apple verifier ────────────────────────────────────────────────────
// Apple Music doesn't expose a simple /me endpoint. Any authenticated
// call to /v1/me/* requires BOTH the developer token and the user token,
// so we hit a cheap one (storefront) to verify both are valid. We key
// identity off a hash of (userToken, storefront) because Apple doesn't
// surface a stable MusicKit user id.
//
// KNOWN LIMITATION — the Music-User-Token ROTATES on re-authorization,
// MusicKit storage clear, new-device sign-in, and at its ~6-month TTL.
// So this identifier is stable WITHIN a MusicKit session but NOT across
// re-auth events — when a user re-auths, their bookmarks saved under
// the previous hash are orphaned, and the deny-all RLS on
// `nugget_bookmarks` prevents client-side reconciliation. The durable
// fix is to anchor bookmark identity to `auth.uid()` via
// `supabase.auth.linkIdentity()` once the Spotify-Supabase OAuth
// migration has shipped — tracked as a separate slice.
async function verifyAppleToken(userToken: string, storefront: string): Promise<VerifiedIdentity | null> {
  try {
    const devToken = await getAppleDeveloperToken();
    if (!devToken) return null;
    const res = await fetch(`https://api.music.apple.com/v1/me/storefront`, {
      headers: {
        Authorization: `Bearer ${devToken}`,
        "Music-User-Token": userToken,
      },
    });
    if (!res.ok) return null;
    // Hash user token + storefront for a stable, non-reversible identifier.
    const encoder = new TextEncoder();
    const data = encoder.encode(`${userToken}::${storefront}`);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { service: "apple", userServiceId: `apple:${hash.slice(0, 32)}` };
  } catch {
    return null;
  }
}

// ── Shared: resolve identity from request body ────────────────────────
async function resolveIdentity(body: Record<string, unknown>): Promise<VerifiedIdentity | null> {
  const spotifyToken = typeof body.spotifyToken === "string" ? body.spotifyToken : null;
  const appleUserToken = typeof body.appleUserToken === "string" ? body.appleUserToken : null;
  const appleStorefront = typeof body.appleStorefront === "string" ? body.appleStorefront : "us";

  if (spotifyToken) return verifySpotifyToken(spotifyToken);
  if (appleUserToken) return verifyAppleToken(appleUserToken, appleStorefront);
  return null;
}

// ── Supabase admin client ─────────────────────────────────────────────
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  // Prefer the new publishable/secret key system; fall back to legacy
  // service_role during migration.
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// ── Handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (!["add", "remove", "list"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action (expected add | remove | list)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const identity = await resolveIdentity(body);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — invalid or missing streaming service token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = getAdminClient();

    if (action === "list") {
      const { data, error } = await db
        .from("nugget_bookmarks")
        .select("id, service, user_service_id, track_id, artist, title, album, nugget_kind, headline, body, source, image_url, created_at")
        .eq("service", identity.service)
        .eq("user_service_id", identity.userServiceId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        console.error("[bookmark-nugget] list error:", error.message);
        return new Response(JSON.stringify({ error: "List failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ bookmarks: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      const bookmarkId = typeof body.bookmarkId === "string" ? body.bookmarkId : null;
      if (!bookmarkId) {
        return new Response(JSON.stringify({ error: "bookmarkId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Enforce ownership at the WHERE clause — admin client bypasses RLS,
      // so we match on (id + service + user_service_id) to prevent cross-user
      // deletion even if the client lies about bookmarkId.
      const { error } = await db
        .from("nugget_bookmarks")
        .delete()
        .eq("id", bookmarkId)
        .eq("service", identity.service)
        .eq("user_service_id", identity.userServiceId);
      if (error) {
        console.error("[bookmark-nugget] remove error:", error.message);
        return new Response(JSON.stringify({ error: "Remove failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "add"
    const nugget = body.nugget && typeof body.nugget === "object" ? body.nugget as Record<string, unknown> : null;
    if (!nugget) {
      return new Response(JSON.stringify({ error: "nugget payload required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // image_url is rendered as <img src={...}> on the Profile page, so reject
    // anything that isn't a plain https:// URL. A client could otherwise pass
    // javascript:/data:/vbscript: URIs and get them reflected in an <img>.
    const rawImageUrl = nugget.imageUrl ? String(nugget.imageUrl) : null;
    const safeImageUrl = rawImageUrl && /^https:\/\//i.test(rawImageUrl) ? rawImageUrl : null;

    // source is stored as JSONB and rendered on Profile — only persist plain
    // objects to keep the shape predictable and avoid stray primitives/arrays.
    const rawSource = nugget.source;
    const safeSource = rawSource && typeof rawSource === "object" && !Array.isArray(rawSource) ? rawSource : null;

    const record = {
      service: identity.service,
      user_service_id: identity.userServiceId,
      track_id: String(nugget.trackId ?? nugget.track_id ?? ""),
      artist: String(nugget.artist ?? ""),
      title: String(nugget.title ?? ""),
      album: nugget.album ? String(nugget.album) : null,
      nugget_kind: String(nugget.kind ?? nugget.nuggetKind ?? "artist"),
      headline: String(nugget.headline ?? "").slice(0, 500),
      body: String(nugget.body ?? nugget.text ?? "").slice(0, 4000),
      source: safeSource,
      image_url: safeImageUrl,
    };

    if (!record.track_id || !record.artist || !record.title || !record.headline) {
      return new Response(
        JSON.stringify({ error: "track_id, artist, title, headline required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotent insert — unique index on (service, user_service_id,
    // track_id, nugget_kind, headline) collapses duplicate taps. On
    // conflict we return the existing row so the client can show
    // instant "already bookmarked" feedback.
    const { data: inserted, error: insertErr } = await db
      .from("nugget_bookmarks")
      .upsert(record, {
        onConflict: "service,user_service_id,track_id,nugget_kind,headline",
        ignoreDuplicates: false,
      })
      .select("id, created_at")
      .single();

    if (insertErr) {
      console.error("[bookmark-nugget] add error:", insertErr.message);
      return new Response(JSON.stringify({ error: "Add failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, bookmark: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bookmark-nugget] unexpected error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
