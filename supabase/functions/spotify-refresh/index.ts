// Refresh a Spotify provider token.
//
// Why this is server-side: Supabase's Spotify OAuth provider uses the
// authorization-code-with-client-secret flow (not PKCE), which means
// refreshing a Supabase-issued Spotify refresh token requires the
// SPOTIFY_CLIENT_SECRET. We must not expose the secret client-side, so
// refresh has to happen here.
//
// Auth gate: verify_jwt = true. Only authenticated callers can hit this.
// The caller supplies the refresh token in the body; we treat it as
// opaque and pass through to Spotify. No binding to auth.uid() yet —
// that ties in once Task 6 (post-signin sync) lands and the browser can
// just call `getValidToken()` without knowing about this function at all.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// This function returns a live Spotify access token on success. JWT is
// the primary defense (`verify_jwt = true` in config.toml), but the
// response is still sensitive enough to warrant an explicit origin
// allowlist rather than a wildcard — a cross-origin page with a stolen
// JWT could otherwise read the token through a browser request.
//
// The Vercel preview matcher is deliberately scoped to the xdjs team
// slug pattern (`<branch>-xdjs.vercel.app`). A loose `.endsWith(".vercel.app")`
// would match `attacker.evil.vercel.app` — anyone can deploy to Vercel
// for free, so a CORS-allowed subdomain without JWT binding to the
// team would be a real exposure.
const ALLOWED_EXACT_ORIGINS = [
  "https://musicnerd.tv",
  "https://www.musicnerd.tv",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
];
const VERCEL_PREVIEW_MATCHER = /^https:\/\/[a-z0-9-]+-xdjs\.vercel\.app$/;

function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (ALLOWED_EXACT_ORIGINS.includes(origin)) return origin;
  if (VERCEL_PREVIEW_MATCHER.test(origin)) return origin;
  // Default to the canonical production origin when the request has no
  // Origin header (server-to-server, curl without -H Origin). The
  // browser won't honor this unless it matches the requester's origin,
  // so unauthorized cross-origin readers can't glean the token.
  return "https://musicnerd.tv";
}

function corsFor(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(req),
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

interface SpotifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  // Belt-and-suspenders: `verify_jwt = true` in config.toml already rejects
  // unauthenticated requests at the Supabase gateway, so in production this
  // branch is dead code. Kept so running via `deno run` locally (which
  // doesn't route through the gateway) still 401s cleanly instead of
  // NPE'ing on the next `req.json()`.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  let refreshToken: string | null = null;
  try {
    const body = await req.json();
    refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : null;
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid JSON body" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (!refreshToken) {
    return new Response(
      JSON.stringify({ error: "refreshToken required" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.error("[spotify-refresh] missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET env vars");
    return new Response(
      JSON.stringify({ error: "server misconfigured" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    // Spotify accepts either client_id+client_secret in the body, or
    // HTTP Basic auth. We use Basic to keep the body minimal and so the
    // secret never appears in a request log that happens to capture body.
    const basic = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = (await res.json()) as SpotifyTokenResponse;
    if (!res.ok || !data.access_token) {
      console.warn(`[spotify-refresh] spotify returned ${res.status}:`, data.error, data.error_description);
      return new Response(
        JSON.stringify({ error: data.error || "refresh failed", detail: data.error_description }),
        { status: res.status || 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Spotify sometimes rotates the refresh token, sometimes doesn't. If
    // it returns a new one, surface it so the caller can persist. If not,
    // the caller should keep using the one it sent in.
    return new Response(
      JSON.stringify({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresIn: data.expires_in ?? 3600,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[spotify-refresh] threw:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
