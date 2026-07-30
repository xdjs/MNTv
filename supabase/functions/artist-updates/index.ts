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

// One fact per artist keeps the /preparing-to-browse transition
// snappy: each edge-function call is a single Gemini generation
// instead of a batched-two-nuggets prompt. "New release + 1 fact"
// is the minimum viable row content; more nuggets per artist belong
// on the Artist Profile page via useArtistLatestFacts.
const FACTS_PER_ARTIST = 1;
// Playable tracks per artist for the Browse "Get into" lane. Enough to
// feel like a shelf worth browsing, few enough that three artist rows
// don't turn Browse into a catalog. These cost nothing extra — the
// top-tracks call already happens for prompt grounding.
const TRACKS_PER_ARTIST = 4;
const RECENT_WINDOW_DAYS = 90;

// Sparse-mode is now driven by actual research results, not follower
// count — see the post-Exa branch in `serve`. Pete's correction
// (2026-04-30): "Pete Rango and Cherele have tons of good information
// out there even though they don't meet the [follower] criteria. Sparse
// mode shouldn't be triggered just because they're under 5k followers,
// only if our research doesn't find good information." The previous
// `SPARSE_FOLLOWER_THRESHOLD = 5000` constant is gone with this
// change; the only remaining reference is in the comment block at
// `generateArtistFacts`'s sparse-mode prompt where the language is
// historical and harmless.

// ── Types ─────────────────────────────────────────────────────────────

interface ArtistUpdate {
  artistId: string;
  artistName: string;
  artistImageUrl: string;
  // "track" entries are catalog tracks for the Browse "Get into" lane.
  // They ride the same array as facts so they flow through the existing
  // nugget_cache row and response shape unchanged — a separate response
  // field would miss every cached hit, which returns early before the
  // artist is even resolved on Spotify.
  kind: "new-release" | "collab" | "fact" | "track";
  headline: string;
  body: string;
  /** Track-level metadata for new-release/collab kinds — lets the client
   *  build a /listen/ route that the Spotify SDK can actually play. */
  relatedTrackTitle?: string;
  relatedAlbumName?: string;
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
  genres?: string[];
  popularity?: number;
}

interface SpotifyTopTrack {
  name: string;
  // uri + album art are what let a top track become a playable tile in
  // the Browse "Get into" lane, not just prompt grounding.
  uri?: string;
  album?: {
    name?: string;
    release_date?: string;
    images?: { url: string }[];
  };
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
  // Populated by fetchRecentRelease's secondary call to /albums/:id/tracks.
  // Present iff the call succeeded; client navigates to the artist page as
  // a fallback when these are missing.
  firstTrackUri?: string;
  firstTrackName?: string;
}

// ── Module-level admin client for cache upsert ────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Migration note (verified 2026-04-30 via diagnostic deploy):
//   - SUPABASE_SECRET_KEY (singular) is NOT auto-injected by Supabase.
//     The team's pattern below treats it as the migration target —
//     once we generate a service-role JWT signed via JWT Signing Keys
//     and stash it under this name (`supabase secrets set
//     SUPABASE_SECRET_KEY=<jwt>`), this lookup picks it up
//     transparently with no code change needed.
//   - SUPABASE_SERVICE_ROLE_KEY is what's actually resolving today.
//     Supabase has marked it deprecated in the dashboard ("use
//     SUPABASE_SECRET_KEYS instead"); when they remove it we MUST
//     have set the singular SECRET_KEY first or this client goes
//     null and the sentinel concurrency guard silently degrades.
//   - SUPABASE_SECRET_KEYS (plural, new) is a JSON blob of JWT
//     signing-key metadata, NOT a usable service-role token. We
//     can't fall back to it without a JWT-signing step.
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

async function fetchArtistTopTracks(
  token: string,
  artistId: string,
  limit = 5,
): Promise<SpotifyTopTrack[]> {
  // Used only in sparse mode — gives Gemini real, verifiable track
  // names + release dates to anchor catalog-grounded nuggets. Skipped
  // in the non-sparse path to save a call.
  const url = `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  const tracks = (data?.tracks ?? []) as SpotifyTopTrack[];
  return tracks.slice(0, limit);
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
  const release = items[0];

  // Grab the first track of the release. The album-level URI
  // (`spotify:album:…`) can't be played via Spotify's `uris` array
  // (that endpoint only takes track URIs), so the Listen route would
  // open with a playable-looking URI and silently fail to start
  // playback. Track-level URI gives Listen something it can actually
  // hand to the Web Playback SDK.
  try {
    const tracksRes = await fetch(
      `https://api.spotify.com/v1/albums/${release.id}/tracks?limit=1&market=US`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (tracksRes.ok) {
      const tracksData = await tracksRes.json();
      const firstTrack = tracksData?.items?.[0];
      if (firstTrack?.uri && firstTrack?.name) {
        release.firstTrackUri = firstTrack.uri;
        release.firstTrackName = firstTrack.name;
      }
    }
  } catch (e) {
    console.warn("[artist-updates] album-tracks fetch failed:", e);
    // Fall through — we'll still return the release without track info.
    // The client falls back to artist-page navigation in that case.
  }
  return release;
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
  // Prefer the album's first track URI for navigation; fall back to the
  // album URI (which won't actually play, but at least the client can
  // detect the missing track signal and route to the artist page).
  const navUri = release.firstTrackUri ?? release.uri;
  const navTitle = release.firstTrackName ?? release.name;
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
    relatedTrackUri: navUri,
    relatedTrackTitle: navTitle,
    relatedAlbumName: release.name,
    nuggetId: `release-${release.id}`,
  };
}

// A catalog track for the Browse "Get into" lane.
//
// Carries no headline/body of its own — the client renders these as
// artwork tiles, not readable cards, and splitArtistUpdates routes
// "track" kinds to the play lane only. Album art goes in
// artistImageUrl to match buildReleaseUpdate's convention, where that
// field already holds a cover rather than an artist photo.
function buildTrackUpdate(
  artist: { id: string; name: string },
  track: SpotifyTopTrack,
): ArtistUpdate | null {
  if (!track.name || !track.uri) return null;
  return {
    artistId: artist.id,
    artistName: artist.name,
    artistImageUrl: track.album?.images?.[0]?.url ?? "",
    kind: "track",
    headline: track.name,
    body: "",
    relatedTrackUri: track.uri,
    relatedTrackTitle: track.name,
    relatedAlbumName: track.album?.name,
    nuggetId: `track-${track.uri}`,
  };
}

// ── Exa research (lightweight wrapper) ─────────────────────────────────
//
// One Exa /search call per non-sparse artist gives Gemini real journalism
// to anchor a fact in. Without this, the row was effectively asking
// gemini-2.5-flash to recall trivia from training data — Pete's
// complaint: "really poor, feels like its not diving in doing research
// like we do our regular nuggets." generate-nuggets uses 3 Exa calls
// (artist / track / discovery) and a Curator+Writer+Validator pipeline;
// here we settle for a single artist-scoped search to keep wall-time
// under the existing GEMINI_TIMEOUT_MS budget.
//
// Always run — sparse-mode is now decided AFTER seeing the result
// (citation count + body-text mention), so we can't gate the call.
// If the result comes back with no usable signal, callers swap to the
// catalog-grounded sparse prompt and ignore these snippets.
const EXA_TIMEOUT_MS = 8_000;

async function researchArtistOnExa(
  artistName: string,
  apiKey: string,
): Promise<{ snippets: string; citations: { title: string; url: string }[] }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), EXA_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${artistName} interview production credits collaborators backstory`,
        type: "auto",
        numResults: 4,
        livecrawl: "fallback",
        contents: {
          text: { maxCharacters: 3500 },
          highlights: { numSentences: 3, highlightsPerUrl: 2 },
        },
        includeText: [artistName],
        excludeDomains: ["facebook.com", "instagram.com", "tiktok.com"],
      }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      console.warn(`[artist-updates] Exa ${res.status} for ${artistName}:`, await res.text().catch(() => ""));
      return { snippets: "", citations: [] };
    }
    const data = await res.json();
    const results = (data?.results ?? []) as Array<{
      title?: string;
      url?: string;
      text?: string;
      highlights?: string[];
    }>;
    const citations = results
      .filter((r) => r.url)
      .map((r) => ({ title: r.title || "", url: r.url! }));
    const snippets = results
      .map((r, i) => {
        const highlightBlock = r.highlights?.length
          ? `\n[Key excerpts]:\n${r.highlights.map((h) => `• ${h}`).join("\n")}`
          : "";
        const body = (r.text || "").slice(0, 2500);
        return `[Source ${i + 1}: "${r.title || "(no title)"}" — ${r.url}]${highlightBlock}\n${body}`;
      })
      .join("\n\n---\n\n");
    return { snippets, citations };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      console.warn(`[artist-updates] Exa timed out after ${EXA_TIMEOUT_MS}ms for ${artistName}`);
    } else {
      console.warn(`[artist-updates] Exa threw for ${artistName}:`, e);
    }
    return { snippets: "", citations: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ── Gemini fact generation (batched: N facts in one call) ─────────────

interface FactGenerationContext {
  artistName: string;
  tier: "casual" | "curious" | "nerd";
  count: number;
  /** When true, Gemini gets a locked-down prompt that forbids open-ended
   *  storytelling and requires grounding in the catalog data supplied
   *  below. Used when follower count suggests there's no real press to
   *  draw from — the anti-hallucination gate for indie / niche artists. */
  sparse: boolean;
  /** Spotify genre tags for the artist (from /v1/artists search hit). */
  genres?: string[];
  /** Top tracks with album + release year — catalog grounding for
   *  sparse prompts. Ignored in non-sparse mode. */
  topTracks?: SpotifyTopTrack[];
  /** Exa research snippets — multi-page text + highlights from journalism
   *  about the artist. Empty string if Exa is unavailable or returned
   *  nothing. Sparse mode skips Exa and ignores this field. */
  researchSnippets?: string;
}

async function generateArtistFacts(
  ctx: FactGenerationContext,
): Promise<{ headline: string; body: string }[]> {
  const { artistName, tier, count, sparse, genres, topTracks, researchSnippets } = ctx;
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) {
    console.warn("[artist-updates] GOOGLE_AI_API_KEY not set — skipping facts");
    return [];
  }

  const writerRules = CONSTITUTION_WRITER_RULES.map((rule) =>
    typeof rule === "function" ? rule(artistName) : rule,
  ).join("\n\n");

  const tierGuidance = sparse
    ? // Override tier-specific "deep production", "session credits",
      // etc. asks — for sparse artists Gemini has no verified material
      // for those angles and will fabricate. Mirrors the sparse-focus
      // override shipped to generate-nuggets in commit 96fc5c1.
      "Audience context applies BUT: skip any ask for deep production, session credits, studio anecdotes, or collaborator stories. Restrict to what's verifiable from the catalog data below."
    : tier === "nerd"
      ? "Audience is a hardcore music nerd — surface deep production, session-credit, micro-genre, or lineage facts."
      : tier === "curious"
      ? "Audience is a curious fan — lead with specific people, collaborators, or cause-and-effect moments."
      : "Audience is a casual listener — relatable origin stories, turning-point moments, and unlikely personal details work well.";

  const multiNuggetAngleLine =
    count === 1
      ? ""
      : count === 2
      ? "\nMake the 2 cover different angles (e.g. one collaborator story, one production/lineage/cultural detail)."
      : `\nMake the ${count} cover different angles — no two should overlap.`;

  // Sparse mode: Gemini gets a CATALOG-ONLY grounding block and an
  // explicit ban on inventing collaborators, stories, labels, etc.
  // Non-sparse: same prompt as before (mainstream artists can draw
  // on training data more safely, though Exa grounding is still the
  // real fix — tracked as follow-up).
  const sparseGroundingBlock = sparse
    ? `\n\nVERIFIED CATALOG DATA (this is the ONLY ground truth you have — do not invent beyond it):
- Artist: ${artistName}
- Genres (from Spotify): ${(genres ?? []).slice(0, 4).join(", ") || "(none listed)"}
- Known tracks: ${
        (topTracks ?? [])
          .slice(0, 5)
          .map((t) => `"${t.name}"${t.album?.release_date ? ` (${t.album.release_date.slice(0, 4)})` : ""}`)
          .join(", ") || "(none available)"
      }

SPARSE DATA MODE: There is essentially no press coverage, interviews, or journalism about ${artistName}. You MUST NOT fabricate:
  - collaborator names, producer names, label names, engineer names
  - voicemails, discarded demos, near-miss anecdotes, recording stories
  - venues, cities, or scenes unless they appear in the data above
  - quotes attributed to ${artistName} or anyone else

If you cannot produce ${count === 1 ? "a nugget" : `${count} nuggets`} grounded strictly in the catalog data above (track titles, genre lineage, release-year context), return an empty nuggets array. Zero nuggets is allowed and preferred over invented stories.

Acceptable sparse-mode angles — every fact must reveal a SHIFT or
TURNING POINT in the artist's catalog, not just describe a pattern.
A naming-convention observation is weak; a hiatus → comeback or
solo-to-collaborator pivot tells a story.

Strong angles (prefer these):
  - Hiatus / comeback: long gap between releases (years apart) followed
    by a flurry — implies a return to making music. Use the actual
    years from above.
  - Career pivot visible in titles: "(feat. X)" or "(${artistName} Mix)"
    or "(${artistName} Remix)" reveals collaboration; spot when this
    pattern starts/stops.
  - Output tempo shift: years with one release vs. years with several
    suggest a productivity change. Use the actual track-count-by-year
    from above.
  - Genre-lineage anchor: "${artistName}'s <listed genre> sits in the
    same lineage as <well-known foundational act in that genre>…"
    (only if the genre IS in the list above)

Weak angles (avoid unless nothing else works):
  - Title aesthetics or naming conventions ("opulent titles", "color
    motifs", "punctuation patterns") — describes surface, no story.
  - Generic catalog stats ("X has Y tracks") — uninformative.
  - "Earliest listed track" timestamp facts — Spotify catalog ≠ debut.

Format: lead with the shift, anchor with the year(s) and at least one
real track name from above. NEVER invent collaborators, labels, or
quotes. NEVER claim anything that can't be verified from the list.`
    : "";

  const exaResearchBlock = !sparse && researchSnippets
    ? `\n\nEXA RESEARCH (multi-page journalism about ${artistName} — treat this as the PRIMARY ground truth, ahead of training data and ahead of Google Search):
${researchSnippets}

REQUIREMENTS WHEN USING EXA RESEARCH:
- Pull the most specific, surprising, or non-obvious detail from the snippets above. Vague summaries fail the SWAP TEST — anchor every fact in something concrete that came out of the research.
- Every fact MUST contain at least TWO of: a real person's name, a year/date, a place/venue, a song or album title, a label, a producer, an engineer, a co-writer, or a verifiable number. Vibe statements ("X has a unique sound") fail.
- Quote sparingly. If you quote, attribute to a named source from the research and keep it under 12 words.
- If the research contradicts what you "know" from training data, trust the research.
- If the research is thin and you can't pull two concrete anchors, return zero nuggets — empty array is better than a generic fact.

CITATION RULES — HARD constraints (do not break these):
1. Every named publication, magazine, year, quote, person, venue, label, or producer in your nugget MUST literally appear in the EXA RESEARCH snippets above. Search Ctrl+F style: if it's not there verbatim, it's fabricated.
2. Do NOT introduce a publication you "know" from training data (Attack Magazine, Pitchfork, Stereogum, Rolling Stone, Resident Advisor, etc.) unless that exact name appears in the research above.
3. Do NOT cite a year, interview, quote, or specific incident that isn't in the research — even if it sounds plausible. The user can click "View Source" and discover the lie.
4. If the only honest citation is the artist's own platform (Bandcamp / Soundcloud / their personal site), use that — don't dress it up as journalism.
5. If the research is too thin to anchor any fact in two verifiable specifics, return zero nuggets. Empty is better than fabricated.
`
    : "";

  const prompt = `${CONSTITUTION_PREAMBLE}

${writerRules}

${tierGuidance}${sparseGroundingBlock}${exaResearchBlock}

You also have Google Search available as a tool. USE IT to verify or
extend the Exa research above — interviews, production credits, label
history, scene context, recent press. Cross-check any specific name /
year / venue / song title before committing to it. Only fall back to
the catalog data above if both Exa and Google Search are empty.

ARTIST NAME LOCK: refer to the artist as "${artistName}" throughout —
that's their public/stage name and how the audience knows them.
- Do NOT introduce a legal/birth/alternate name in the headline or body
  (e.g. "X, known professionally as Y"). Even if Google surfaces one,
  drop it. The audience came here for the artist they recognize.
- All pronoun/short references must trace back to "${artistName}", not
  to a discovered alternate. Never use just a last name from a legal
  identity.

Write ${count === 1 ? "ONE nugget" : `${count} DISTINCT nuggets`} about ${artistName}. ${
    count === 1 ? "It" : "Each"
  } must pass the SWAP TEST — the headline is useless if you could swap in another artist's name and the sentence still works. No release-date recaps; those are covered elsewhere.${multiNuggetAngleLine}

Return JSON only, no preamble:
{
  "nuggets": [
    { "headline": "<complete-fact sentence, sentence case, names ${artistName} explicitly>",
      "body": "<1-3 sentences of context adding who/where/what-happened-next>" }${count > 1 ? ",\n    …" : ""}
  ]
}`;

  // Use `gemini-2.5-flash` with Google Search grounding enabled. The
  // model autonomously decides whether to search; grounded responses
  // come back with `groundingMetadata` we could surface as citations
  // (future). For now we just use the grounded text.
  //
  // `responseMimeType` is intentionally NOT set — incompatible with
  // grounding tools. The response sometimes comes wrapped in a
  // ```json fence which we strip before JSON.parse.
  //
  // 40s abort timeout: keeps the worst-case wall time predictable so a
  // hung Gemini doesn't hold the cache sentinel for the full
  // STALE_GENERATION_MS (55s) before followers can re-claim. Mirrors
  // the Promise.race pattern in fetchSpotifyTaste on the client side.
  const GEMINI_TIMEOUT_MS = 40_000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GEMINI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.7 },
        }),
        signal: ctl.signal,
      },
    );
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name === "AbortError") {
      console.warn(`[artist-updates] Gemini timed out after ${GEMINI_TIMEOUT_MS}ms for ${artistName}`);
    } else {
      console.warn(`[artist-updates] Gemini fetch threw for ${artistName}:`, e);
    }
    return [];
  }
  clearTimeout(timer);
  if (!res.ok) {
    console.warn(`[artist-updates] Gemini ${res.status}:`, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  // Surface grounding usage so we can tell whether a weak fact came
  // from no search results vs. Gemini ignoring the tool. The metadata
  // shape: `groundingMetadata.groundingChunks` is an array of pages
  // the model cited.
  const groundingChunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const searchQueries = data?.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];
  if (groundingChunks.length > 0) {
    console.log(`[artist-updates] grounded fact for ${artistName} — ${groundingChunks.length} sources, queries: ${JSON.stringify(searchQueries)}`);
  } else {
    console.log(`[artist-updates] no grounding for ${artistName} (catalog-only fallback)`);
  }
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
  citation?: { title: string; url: string },
): ArtistUpdate {
  // Prefer an Exa citation if we have one — gives the fact a real
  // article to click through to. Falls back to the generic MusicNerd
  // source attribution when Exa was unavailable / sparse mode.
  const source = citation && citation.url
    ? { type: "web", title: citation.title, url: citation.url }
    : { type: "generated", publisher: "MusicNerd" };
  return {
    artistId: artist.id,
    artistName: artist.name,
    artistImageUrl: artist.images?.[0]?.url ?? "",
    kind: "fact",
    headline,
    body,
    source,
    // Stable-ish id so the client can dedupe inside a cache row if we
    // ever regenerate. Uses the index within the fact set.
    nuggetId: `fact-${artist.id}-${index}`,
  };
}

// ── Cache ──────────────────────────────────────────────────────────────

// How long a cached artist-updates row stays fresh. Past this window we
// treat the row as a miss and regenerate so timely content (new releases,
// recent activity) doesn't go stale on long-running cached entries.
// 7 days strikes a balance: most artists release less often than weekly,
// but a fan visiting after a release shouldn't see week-old "latest".
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// How long a `status='generating'` sentinel is treated as live before
// we assume the generator crashed/timed out and re-claim. Generation
// itself takes 5-60s for cold Gemini; 55s caps below the Supabase
// edge-function timeout floor (60s on free, 120s on paid) so a
// follower can't end up holding the function alive past infra deadline.
const STALE_GENERATION_MS = 55 * 1000;

// Poll deadline for followers waiting on the leader. Must stay below
// the Supabase function timeout — 50s leaves headroom for the
// post-poll cache write before the platform pulls the rug.
const POLL_TIMEOUT_MS = 50 * 1000;
// Exponential backoff caps DB read load while the leader runs.
// Sequence is 1s, 2s, 4s, 8s, capped at POLL_INTERVAL_CAP_MS, which
// keeps total reads to ~10 over the 50s window vs. ~50 with flat 1s.
const POLL_INTERVAL_INITIAL_MS = 1_000;
const POLL_INTERVAL_CAP_MS = 8_000;

// Bump when the SHAPE of a cached row changes, not when its content
// does. Rows are cached for 7 days, so without this a shape change is
// invisible for a week: old rows still read as valid and get served,
// missing whatever the new shape added.
//
// v2 — rows gained `kind: "track"` entries for the Browse play targets.
//
// MUST stay in sync with buildArtistUpdatesCacheKey in
// src/lib/artistFactToNugget.ts, which reads these rows from the client.
const CACHE_VERSION = "v2";

function cacheKey(artistName: string, tier: string): string {
  // Normalized (lowercased + trimmed) so whitespace / case variations
  // land on the same cache row.
  return `artist::${artistName.trim().toLowerCase()}::${tier}::${CACHE_VERSION}`;
}

type CacheState =
  | { kind: "ready"; updates: ArtistUpdate[] }
  | { kind: "generating"; ageMs: number }
  | { kind: "stale" }   // ready row past TTL — treat as miss, evict before re-claim
  | { kind: "missing" };

async function readCacheState(key: string): Promise<CacheState> {
  if (!cacheAdminClient) return { kind: "missing" };
  try {
    const { data } = await cacheAdminClient
      .from("nugget_cache")
      .select("nuggets, status, created_at")
      .eq("track_id", key)
      .maybeSingle();
    if (!data) return { kind: "missing" };

    const ageMs = data.created_at
      ? Date.now() - new Date(data.created_at as string).getTime()
      : Infinity;

    if (data.status === "generating") return { kind: "generating", ageMs };

    if (data.status === "ready") {
      if (ageMs > CACHE_TTL_MS) return { kind: "stale" };
      const updates = (data.nuggets as ArtistUpdate[] | null) ?? [];
      if (updates.length === 0) return { kind: "missing" };
      return { kind: "ready", updates };
    }

    return { kind: "missing" };
  } catch (e) {
    console.warn("[artist-updates] cache read threw:", e);
    return { kind: "missing" };
  }
}

/**
 * Wait for an in-flight generation (status='generating') to flip to
 * 'ready'. Returns the generated updates, or null on timeout / eviction.
 * Polled rather than push-notified because Supabase realtime would be
 * over-engineering for a 1-2× per cache-miss event.
 */
async function waitForGeneration(key: string): Promise<ArtistUpdate[] | null> {
  if (!cacheAdminClient) return null;
  const start = Date.now();
  let delay = POLL_INTERVAL_INITIAL_MS;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    // Cap remaining wait so the final sleep doesn't push us past the
    // poll deadline (which is itself capped under the Supabase
    // function timeout). Without this clamp a freshly-bumped 8s
    // delay could fire after we should have given up.
    const remaining = POLL_TIMEOUT_MS - (Date.now() - start);
    const sleepMs = Math.min(delay, remaining);
    if (sleepMs <= 0) break;
    await new Promise((r) => setTimeout(r, sleepMs));
    const state = await readCacheState(key);
    if (state.kind === "ready") {
      console.info(`[artist-updates] poll resolved for ${key} in ${Date.now() - start}ms`);
      return state.updates;
    }
    if (state.kind === "missing" || state.kind === "stale") {
      // Leader's row was evicted (rare — manual SQL delete or stale).
      // Fall through to caller so they can claim + generate.
      return null;
    }
    // 'generating' — keep waiting; double the delay (cap at ceiling)
    // so total reads stay ~10 over the window instead of ~50.
    delay = Math.min(delay * 2, POLL_INTERVAL_CAP_MS);
  }
  console.warn(`[artist-updates] poll timed out for ${key} after ${POLL_TIMEOUT_MS}ms`);
  return null;
}

/**
 * Atomically try to claim the right to generate for `key`. Uses an
 * INSERT (which fails on the unique track_id constraint if a row
 * exists), so two concurrent callers can't both think they won.
 *
 * Caller is responsible for evicting any stale row first — we don't
 * try to overwrite, because UPSERT would silently let a second
 * "leader" through.
 */
async function tryClaim(key: string): Promise<boolean> {
  if (!cacheAdminClient) return true; // No cache → degrade to "always generate"
  const { error } = await cacheAdminClient.from("nugget_cache").insert({
    track_id: key,
    nuggets: [],
    sources: {},
    status: "generating",
  });
  if (error) {
    // Postgres 23505 = unique_violation — expected when another caller
    // already claimed. Anything else is a real failure; log and treat
    // as "lost the claim" so we fall through to polling.
    if (error.code !== "23505") {
      console.warn("[artist-updates] tryClaim threw:", error);
    }
    return false;
  }
  return true;
}

async function evictStaleRow(key: string): Promise<void> {
  if (!cacheAdminClient) return;
  try {
    await cacheAdminClient.from("nugget_cache").delete().eq("track_id", key);
  } catch (e) {
    console.warn("[artist-updates] evict threw:", e);
  }
}

async function writeToCache(key: string, updates: ArtistUpdate[]): Promise<void> {
  if (!cacheAdminClient || updates.length === 0) return;
  try {
    // Explicitly set created_at so the TTL window resets when we
    // regenerate a stale row. The column defaults to `now()` on INSERT
    // only, so an upsert that hits the existing row would otherwise
    // leave the original timestamp and the row would be stale forever
    // after first refresh.
    await cacheAdminClient.from("nugget_cache").upsert(
      {
        track_id: key,
        nuggets: updates,
        sources: {},
        status: "ready",
        created_at: new Date().toISOString(),
      },
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

  // 300 is generous — the longest legitimate artist names ("...And You
  // Will Know Us by the Trail of Dead") are <50 chars. Cap is here to
  // bound the input that flows into the Spotify search URL, the cache
  // key, and the Gemini prompt body — not to enforce a name standard.
  // Reject silently with the same shape as the missing-input case.
  const MAX_ARTIST_LEN = 300;
  if (!artist || artist.length > MAX_ARTIST_LEN) {
    return new Response(JSON.stringify({ error: "artist required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = cacheKey(artist, tier);

  // 1. Cache state machine — picks one of:
  //    - ready  → return cached
  //    - generating (fresh) → poll for the leader's result; on timeout
  //      / eviction, fall through to claim+generate ourselves
  //    - generating (stale) → leader probably crashed; evict and claim
  //    - stale  → ready row past TTL; evict and claim
  //    - missing → claim and generate
  //
  //    The claim is an INSERT with track_id UNIQUE — atomic, so two
  //    concurrent callers can't both win. The loser polls.
  const initialState = await readCacheState(key);

  if (initialState.kind === "ready") {
    return new Response(JSON.stringify({ updates: initialState.updates, cached: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (initialState.kind === "generating" && initialState.ageMs < STALE_GENERATION_MS) {
    console.info(`[artist-updates] ${artist} — joining in-flight generation`);
    const polled = await waitForGeneration(key);
    if (polled) {
      return new Response(JSON.stringify({ updates: polled, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Polling failed/timed out — fall through to evict + claim.
  }

  // Evict any stale row before attempting to claim. INSERT into
  // existing track_id would fail with unique_violation; better to
  // delete first so our claim succeeds.
  if (initialState.kind === "stale" || initialState.kind === "generating") {
    await evictStaleRow(key);
  }

  const claimed = await tryClaim(key);
  if (!claimed) {
    // Lost a tight race with another concurrent caller. Poll for
    // their result rather than generating a duplicate.
    console.info(`[artist-updates] ${artist} — lost claim race, polling for winner`);
    const polled = await waitForGeneration(key);
    if (polled) {
      return new Response(JSON.stringify({ updates: polled, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Worst case: poll timed out and we still need to respond. Fall
    // through to generation. The duplicate write is benign — last
    // writeToCache wins, both responses arrive at consistent data on
    // any subsequent read.
    console.warn(`[artist-updates] ${artist} — lost claim AND poll failed; generating anyway`);
  }

  // 2. Resolve artist on Spotify.
  let token: string;
  try {
    token = await getSpotifyAppToken();
  } catch (e) {
    console.error("[artist-updates] Spotify token unavailable:", e);
    // Release the sentinel — followers shouldn't poll forever on a
    // transient Spotify-token failure.
    await evictStaleRow(key);
    return new Response(JSON.stringify({ error: "spotify unavailable" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const artistInfo = await searchArtist(token, artist);
  if (!artistInfo) {
    // Release the sentinel — this artist is unresolvable on Spotify, no
    // amount of polling will produce a ready row. Followers should give
    // up immediately on the next poll cycle.
    await evictStaleRow(key);
    return new Response(JSON.stringify({ updates: [], reason: "artist-not-found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Sparse detection — driven by whether our research actually
  //    surfaces material about the artist, NOT by follower count.
  //    Pete's correction (2026-04-30): "Pete Rango and Cherele have
  //    tons of good information out there even though they don't meet
  //    the [follower] criteria. Sparse mode shouldn't be triggered
  //    just because they're under 5k followers — only if our research
  //    doesn't find good information."
  //
  //    We always run Exa now. Sparse-mode is determined post-hoc from
  //    the result: if Exa returns no usable snippets and the artist
  //    isn't even mentioned in what we got back, fall through to the
  //    catalog-grounded sparse prompt + top-tracks fetch.
  const followers = artistInfo.followers?.total ?? 0;
  const exaApiKey = Deno.env.get("EXA_API_KEY");

  // Wrap the post-claim generation flow in a try/catch so the sentinel
  // is always released — without this, an unexpected throw inside
  // fetchRecentRelease / generateArtistFacts / writeToCache would
  // leave the row at status='generating' for the full
  // STALE_GENERATION_MS window (55s), during which concurrent
  // followers would poll until timeout and then re-claim. The four
  // explicit error paths above (missing token, artist-not-found,
  // empty updates) already evict, but those don't cover an unexpected
  // throw mid-flow. catch + re-throw so the platform still sees a
  // 500 — we just want to make sure the sentinel doesn't outlive us.
  try {
    // 4. Fetch Spotify data + Exa research in parallel. We run Exa
    //    every time and decide sparse-mode AFTER seeing the result
    //    (citation count + body-text mention). Top-tracks always
    //    fetched too — cheap call, and the sparse-mode prompt needs
    //    them as catalog grounding when we DO fall through.
    const [release, topTracks, exaResult] = await Promise.all([
      fetchRecentRelease(token, artistInfo.id),
      fetchArtistTopTracks(token, artistInfo.id),
      exaApiKey
        ? researchArtistOnExa(artistInfo.name, exaApiKey)
        : Promise.resolve({ snippets: "", citations: [] as { title: string; url: string }[] }),
    ]);

    // Sparse iff: few/no usable Exa citations AND the artist's name
    // doesn't appear in any snippet body. Mirrors the trigger in
    // generate-nuggets/index.ts so behavior stays consistent across
    // both Browse rails. A press article with a generic title still
    // counts as research if it talks about the artist in the body.
    const artistMentionedInBody = !!exaResult.snippets &&
      exaResult.snippets.toLowerCase().includes(artistInfo.name.toLowerCase());
    const isSparse = exaResult.citations.length <= 1 && !artistMentionedInBody;

    const facts = await generateArtistFacts({
      artistName: artistInfo.name,
      tier,
      count: FACTS_PER_ARTIST,
      sparse: isSparse,
      genres: artistInfo.genres,
      topTracks: isSparse ? topTracks : undefined,
      researchSnippets: isSparse ? "" : exaResult.snippets,
    });

    const releaseAgeDays = release ? daysSince(release.release_date) : null;
    console.log(
      `[artist-updates] ${artistInfo.name} (followers=${followers}, exa=${exaResult.citations.length}c/${artistMentionedInBody ? "body" : "no-body"}${isSparse ? ", SPARSE" : ""}) → release=${
        release ? `${release.name} (${releaseAgeDays}d)` : "none"
      }, facts=${facts.length}, topTracks=${topTracks.length}`,
    );

    const updates: ArtistUpdate[] = [];

    // Release first so it anchors the row visually as "what's new."
    if (release && releaseAgeDays !== null && releaseAgeDays <= RECENT_WINDOW_DAYS) {
      updates.push(buildReleaseUpdate(artistInfo, release));
    }

    facts.forEach((f, i) => {
      // Round-robin through Exa citations so multiple facts on the same
      // artist don't all link to the same article (we ask for 1 fact per
      // artist today but this keeps it correct if FACTS_PER_ARTIST grows).
      const citation = exaResult.citations[i % Math.max(exaResult.citations.length, 1)];
      updates.push(buildFactUpdate(artistInfo, f.headline, f.body, i, citation));
    });

    // Catalog tracks for the "Get into" lane. Appended last so they never
    // displace a fact or release. Skips whatever the release card already
    // offers — the same song appearing twice in one artist's row reads as
    // a bug. Case-insensitive because Spotify's top-tracks and album-track
    // endpoints don't always agree on capitalisation.
    // Snapshot before appending tracks: "did we compose anything worth
    // showing" must stay a question about facts and releases. Tracks are
    // free catalog data and would otherwise mask a total generation
    // failure as a success, caching a row of bare tiles.
    const composedCount = updates.length;

    const releaseTrackTitle = updates
      .find((u) => u.kind === "new-release" || u.kind === "collab")
      ?.relatedTrackTitle
      ?.trim()
      .toLowerCase();
    let trackCount = 0;
    for (const t of topTracks) {
      if (trackCount >= TRACKS_PER_ARTIST) break;
      if (t.name?.trim().toLowerCase() === releaseTrackTitle) continue;
      const trackUpdate = buildTrackUpdate(artistInfo, t);
      if (!trackUpdate) continue;
      updates.push(trackUpdate);
      trackCount++;
    }

    if (composedCount === 0) {
      // Couldn't compose anything (sparse artist + Gemini returned 0
      // facts, no recent release). We claimed the sentinel earlier via
      // tryClaim() — must release it now so concurrent followers don't
      // sit in waitForGeneration polling for a row that's never going
      // to flip to 'ready'. Without this they'd timeout after 95s and
      // re-claim+re-fail in a thundering loop.
      await evictStaleRow(key);
      return new Response(JSON.stringify({ updates: [], reason: "compose-failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await writeToCache(key, updates);
    return new Response(JSON.stringify({ updates, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[artist-updates] unexpected generation error — evicting sentinel:", e);
    await evictStaleRow(key);
    return new Response(JSON.stringify({ error: "generation-failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
