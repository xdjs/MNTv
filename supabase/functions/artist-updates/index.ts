// Artist-level updates for the Browse "Your artists, lately" row.
//
// Per call: takes ONE artist name + tier, returns up to 3 ArtistUpdate
// items (1 recent release if any, plus 2 fact nuggets). The hook
// calls this function in throttled parallel for each of the user's
// top artists and groups the array under the artist's name for the
// nested-per-artist Browse row.
//
// Budget note: we cap at 1 release + 2 facts so a single cold-start
// call stays under Gemini's typical ≤8s latency window. Increasing
// fact count here has a direct linear cost on Browse first-paint.
//
// Cached under `nugget_cache.track_id = "artist::<name>::<tier>"`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSpotifyAppToken } from "../_shared/spotify-token.ts";
import {
  CONSTITUTION_PREAMBLE,
  CONSTITUTION_WRITER_RULES,
} from "../generate-nuggets/constitution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FACTS_PER_ARTIST = 2;
const RECENT_WINDOW_DAYS = 90;

// ── Types ─────────────────────────────────────────────────────────────

interface ArtistUpdate {
  artistId: string;
  artistName: string;
  artistImageUrl: string;
  kind: "new-release" | "collab" | "fact";
  headline: string;
  body: string;
  source?: {
    type: string;
    title?: string;
    publisher?: string;
    url?: string;
  };
  nuggetId?: string;         // deep-link anchor on ArtistProfile
  relatedTrackUri?: string;  // for new-release/collab kinds
}

interface SpotifyArtistSearchResult {
  id: string;
  name: string;
  images?: { url: string }[];
  followers?: { total: number };
}

interface SpotifyReleaseItem {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  uri: string;
  artists: { id: string; name: string }[];
  external_urls?: { spotify: string };
  images?: { url: string }[];
}

// ── Module-level admin client for cache upsert ────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ADMIN_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const cacheAdminClient = SUPABASE_ADMIN_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY)
  : null;

// ── Spotify helpers ────────────────────────────────────────────────────

async function searchArtist(
  token: string,
  name: string,
): Promise<SpotifyArtistSearchResult | null> {
  const url = `https://api.spotify.com/v1/search?type=artist&limit=1&q=${encodeURIComponent(
    name,
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.artists?.items?.[0];
  if (!first || !first.id) return null;
  // Require the match to be reasonably close. Spotify sometimes returns
  // unrelated artists for sparse names — case-insensitive, trim-tolerant.
  const matches = String(first.name).trim().toLowerCase() === name.trim().toLowerCase();
  return matches ? first : null;
}

async function fetchRecentRelease(
  token: string,
  artistId: string,
): Promise<SpotifyReleaseItem | null> {
  const url = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=single,album&limit=5&market=US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const items = (data?.items ?? []) as SpotifyReleaseItem[];
  if (items.length === 0) return null;
  // Spotify's default ordering is already most-recent-first but we sort
  // defensively so a market variance can't surface an older release.
  items.sort((a, b) => (a.release_date < b.release_date ? 1 : -1));
  return items[0];
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return Infinity;
  return Math.floor((Date.now() - then) / 86400_000);
}

function buildReleaseUpdate(
  artist: SpotifyArtistSearchResult,
  release: SpotifyReleaseItem,
): ArtistUpdate {
  const otherArtists = release.artists
    .filter((a) => a.id !== artist.id)
    .map((a) => a.name);
  const isCollab = otherArtists.length > 0;
  const kind: ArtistUpdate["kind"] = isCollab ? "collab" : "new-release";
  const daysAgo = daysSince(release.release_date);
  const freshness =
    daysAgo <= 7
      ? "this week"
      : daysAgo <= 30
      ? "this month"
      : daysAgo <= 60
      ? "last month"
      : `${Math.round(daysAgo / 30)} months ago`;
  const headline = isCollab
    ? `${artist.name} teamed up with ${otherArtists.slice(0, 2).join(" and ")} on "${release.name}"`
    : `${artist.name} released ${release.album_type === "single" ? "a new single" : "a new album"}: "${release.name}"`;
  const body = `Dropped ${freshness} — tap in to hear what ${
    isCollab ? "they just made together" : "they've been working on"
  }.`;
  const releaseImg =
    (release.images?.[0]?.url) ??
    (artist.images?.[0]?.url) ??
    "";
  return {
    artistId: artist.id,
    artistName: artist.name,
    artistImageUrl: releaseImg,
    kind,
    headline,
    body,
    source: {
      type: "spotify",
      title: release.name,
      publisher: "Spotify",
      url: release.external_urls?.spotify,
    },
    relatedTrackUri: release.uri,
    nuggetId: `release-${release.id}`,
  };
}

// ── Gemini fact generation (batched: N facts in one call) ─────────────

async function generateArtistFacts(
  artistName: string,
  tier: "casual" | "curious" | "nerd",
  count: number,
): Promise<{ headline: string; body: string }[]> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) {
    console.warn("[artist-updates] GOOGLE_AI_API_KEY not set — skipping facts");
    return [];
  }

  const writerRules = CONSTITUTION_WRITER_RULES.map((rule) =>
    typeof rule === "function" ? rule(artistName) : rule,
  ).join("\n\n");

  const tierGuidance =
    tier === "nerd"
      ? "Audience is a hardcore music nerd — surface deep production, session-credit, micro-genre, or lineage facts."
      : tier === "curious"
      ? "Audience is a curious fan — lead with specific people, collaborators, or cause-and-effect moments."
      : "Audience is a casual listener — relatable origin stories, turning-point moments, and unlikely personal details work well.";

  const prompt = `${CONSTITUTION_PREAMBLE}

${writerRules}

${tierGuidance}

Write ${count} DISTINCT nuggets about ${artistName}. Each must pass the SWAP TEST — the headline is useless if you could swap in another artist's name and the sentence still works. No release-date recaps; those are covered elsewhere. Make the ${count} cover ${count === 2 ? "different angles (e.g. one collaborator story, one production/lineage/cultural detail)" : "different angles — no two should overlap"}.

Return JSON only, no preamble:
{
  "nuggets": [
    { "headline": "<complete-fact sentence, sentence case, names ${artistName} explicitly>",
      "body": "<1-3 sentences of context adding who/where/what-happened-next>" },
    …
  ]
}`;

  // Use the same model + request shape as generate-nuggets' Writer:
  // `gemini-2.5-flash`, `role: "user"` on parts, and NO
  // `responseMimeType`. The response sometimes comes wrapped in a
  // ```json code fence which we strip before JSON.parse.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    },
  );
  if (!res.ok) {
    console.warn(`[artist-updates] Gemini ${res.status}:`, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const text = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  if (!text) {
    console.warn("[artist-updates] Gemini returned empty text");
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    const nuggets = Array.isArray(parsed?.nuggets) ? parsed.nuggets : [];
    const accepted = nuggets
      .filter(
        (n: unknown): n is { headline: string; body: string } =>
          !!n && typeof (n as { headline?: unknown }).headline === "string" &&
          typeof (n as { body?: unknown }).body === "string",
      )
      .slice(0, count)
      .map((n) => ({ headline: String(n.headline), body: String(n.body) }));
    console.log(`[artist-updates] Gemini returned ${accepted.length}/${count} facts for ${artistName}`);
    return accepted;
  } catch (e) {
    console.warn("[artist-updates] Gemini non-JSON output:", text.slice(0, 300), String(e));
    return [];
  }
}

function buildFactUpdate(
  artist: SpotifyArtistSearchResult,
  headline: string,
  body: string,
  index: number,
): ArtistUpdate {
  return {
    artistId: artist.id,
    artistName: artist.name,
    artistImageUrl: artist.images?.[0]?.url ?? "",
    kind: "fact",
    headline,
    body,
    source: { type: "generated", publisher: "MusicNerd" },
    // Stable-ish id so the client can dedupe inside a cache row if we
    // ever regenerate. Uses the index within the fact set.
    nuggetId: `fact-${artist.id}-${index}`,
  };
}

// ── Cache ──────────────────────────────────────────────────────────────

function cacheKey(artistName: string, tier: string): string {
  // Normalized (lowercased + trimmed) so whitespace / case variations
  // land on the same cache row.
  return `artist::${artistName.trim().toLowerCase()}::${tier}`;
}

async function readFromCache(key: string): Promise<ArtistUpdate[] | null> {
  if (!cacheAdminClient) return null;
  try {
    const { data } = await cacheAdminClient
      .from("nugget_cache")
      .select("nuggets, status")
      .eq("track_id", key)
      .maybeSingle();
    if (!data || data.status !== "ready") return null;
    const updates = (data.nuggets as ArtistUpdate[] | null) ?? [];
    return updates.length > 0 ? updates : null;
  } catch (e) {
    console.warn("[artist-updates] cache read threw:", e);
    return null;
  }
}

async function writeToCache(key: string, updates: ArtistUpdate[]): Promise<void> {
  if (!cacheAdminClient || updates.length === 0) return;
  try {
    await cacheAdminClient.from("nugget_cache").upsert(
      { track_id: key, nuggets: updates, sources: {}, status: "ready" },
      { onConflict: "track_id" },
    );
  } catch (e) {
    console.warn("[artist-updates] cache write threw:", e);
  }
}

// ── Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: { artist?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const artist = typeof body.artist === "string" ? body.artist.trim() : "";
  const tier = body.tier === "curious" || body.tier === "nerd" ? body.tier : "casual";

  if (!artist) {
    return new Response(JSON.stringify({ error: "artist required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = cacheKey(artist, tier);

  // 1. Cache hit? Return the whole set.
  const cached = await readFromCache(key);
  if (cached) {
    return new Response(JSON.stringify({ updates: cached, cached: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Resolve artist on Spotify.
  let token: string;
  try {
    token = await getSpotifyAppToken();
  } catch (e) {
    console.error("[artist-updates] Spotify token unavailable:", e);
    return new Response(JSON.stringify({ error: "spotify unavailable" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const artistInfo = await searchArtist(token, artist);
  if (!artistInfo) {
    return new Response(JSON.stringify({ updates: [], reason: "artist-not-found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Run release lookup + fact generation in parallel to minimize
  //    total latency for the user (cold-start overlap).
  const [release, facts] = await Promise.all([
    fetchRecentRelease(token, artistInfo.id),
    generateArtistFacts(artistInfo.name, tier, FACTS_PER_ARTIST),
  ]);

  const releaseAgeDays = release ? daysSince(release.release_date) : null;
  console.log(
    `[artist-updates] ${artistInfo.name} → release=${
      release ? `${release.name} (${releaseAgeDays}d)` : "none"
    }, facts=${facts.length}`,
  );

  const updates: ArtistUpdate[] = [];

  // Release first so it anchors the row visually as "what's new."
  if (release && releaseAgeDays !== null && releaseAgeDays <= RECENT_WINDOW_DAYS) {
    updates.push(buildReleaseUpdate(artistInfo, release));
  }

  facts.forEach((f, i) => {
    updates.push(buildFactUpdate(artistInfo, f.headline, f.body, i));
  });

  if (updates.length === 0) {
    // Couldn't compose anything — don't cache; let a retry try again.
    return new Response(JSON.stringify({ updates: [], reason: "compose-failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await writeToCache(key, updates);
  return new Response(JSON.stringify({ updates, cached: false }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
