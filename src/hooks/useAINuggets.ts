import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Nugget, Source } from "@/mock/types";
import { usePlayer } from "@/contexts/PlayerContext";
import { getSeedListenNuggets } from "@/data/seedNuggets";
import { isValidSourceShape } from "@/lib/sourceShape";
import { isSafeUrl } from "@/lib/urlSafety";

// Back-compat re-export for any consumer that imported
// isValidSourceShape from this module before it moved to
// @/lib/sourceShape. New callers should prefer the lib path.
export { isValidSourceShape };

interface AINuggetData {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery" | "context";
  listenFor?: boolean;
  imageUrl?: string;
  imageCaption?: string;
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    url?: string;
    embedId?: string;
    quoteSnippet?: string;
    locator?: string;
  };
}

// ── Helpers for consistent ID/object creation across SSE, cache, and JSON paths ──

// Early-cancel thresholds for the SSE stream. Module-scope so they
// aren't re-allocated per nugget event in the loop.
//   - MIN_EARLY_CANCEL_NUGGETS: keep at least casual-tier worth of
//     content (3) plus one buffer before considering a cancel.
//   - EARLY_CANCEL_REMAINING_SEC: track-end window where additional
//     nuggets won't reach the user; bail rather than burn Gemini.
const MIN_EARLY_CANCEL_NUGGETS = 4;
const EARLY_CANCEL_REMAINING_SEC = 45;

/**
 * Blank the album slot in a `real::…` trackId before composing the
 * nugget_cache key. Different entry points populate the album slot
 * inconsistently (story rail leaves it empty, tile/search fill it),
 * so keying on the URI only means every entry point reads and writes
 * the same cache row for the same recording. Non-`real::` ids
 * (seed-nugget slugs) are passed through unchanged. Mirror of the
 * server-side canonicalization in generate-nuggets/index.ts.
 */
function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Exported for unit tests — see src/test/canonicalCacheKey.test.ts.
// Internal call sites still go through this same function.
export function canonicalCacheKey(trackId: string, tier: string): string {
  // Listen receives `trackId` from React Router params, which keeps URL-
  // encoded characters (`%20`, `%3A`, etc.). The server-side write path
  // builds the cache key from the request body's raw artist/title/uri
  // strings (no encoding). Without normalizing here, every Listen mount
  // on a track with spaces or special chars cache-misses and re-runs
  // the full ~30s nugget pipeline.
  //
  // A `real%3A%3A…` trackId still starts with the right prefix once
  // decoded; check for both forms so the early-return path doesn't
  // skip encoded inputs.
  if (!trackId.startsWith("real::") && !trackId.startsWith("real%3A%3A")) {
    return `${trackId}::${tier}`;
  }
  // Normalize encoded delimiters before split so parts line up regardless
  // of how the upstream route preserved them.
  const normalized = trackId.replace(/%3A%3A/gi, "::");
  const parts = normalized.split("::");
  // Expected: ["real", artist, title, album, uri...]. Fewer than 5 parts
  // means the id is malformed — preserve original to avoid losing data.
  if (parts.length < 5) return `${trackId}::${tier}`;
  parts[1] = safeDecode(parts[1]); // artist
  parts[2] = safeDecode(parts[2]); // title
  // Album slot is intentionally blanked. The same recording can be
  // reached via multiple entry points (album page, search, story rail,
  // direct link) and they don't all populate the album field
  // consistently. Keying on (artist, title, uri) only — without album
  // — means every entry point reads/writes the same cache row for the
  // same track, avoiding split-cache bugs where Listen would re-run a
  // 30s pipeline because the same song happens to be in two albums.
  parts[3] = "";
  parts[4] = safeDecode(parts[4]); // uri
  return `${parts.join("::")}::${tier}`;
}

function makeIds(trackId: string, listenCount: number, index: number) {
  return {
    sourceId: `ai-src-${trackId}-L${listenCount}-${index}`,
    nuggetId: `ai-nug-${trackId}-L${listenCount}-${index}`,
  };
}

function makeSource(id: string, s: AINuggetData["source"]): Source {
  return { id, type: s.type, title: s.title, publisher: s.publisher, url: s.url, embedId: s.embedId, quoteSnippet: s.quoteSnippet, locator: s.locator };
}

export function makeTimestamp(index: number, totalNuggets: number, durationSec: number) {
  // Nugget timestamps are reveal-times during playback. Three constraints:
  //   1. First nugget pinned at `earlyStart=0` so a story tap with a
  //      cached first nugget shows it the moment the song starts —
  //      Pete's exact mental model: "If a story is pink, that means
  //      that if I click on it, the first thing that displays is that
  //      nugget while the song is playing." A 3s buffer (or worse, the
  //      old earlyStart+spacing≈49s) makes the user think nothing
  //      happened.
  //   2. Last nugget pinned at `durationSec - endBuffer` so the user
  //      doesn't lose the final beat to a nugget appearing in the last
  //      few seconds of the track.
  //   3. Middle nuggets distributed evenly between.
  const earlyStart = 0;
  const endBuffer = 15;
  const usable = Math.max(durationSec - earlyStart - endBuffer, 30);
  // Denominator guards a 1-nugget track (would otherwise divide by 0
  // and place the only nugget at NaN). With one nugget we want it at
  // earlyStart exactly, so the formula collapses to `earlyStart + 0`.
  const denom = Math.max(totalNuggets - 1, 1);
  const spacing = usable / denom;
  return Math.min(Math.floor(earlyStart + spacing * index), durationSec - 10);
}

/**
 * Headline guard — derive a non-empty headline from the nugget's text when the
 * server/cache sent an empty one. Mirrors server-side generateHeadlineFromText.
 * Exported so callers can sanitize nuggets that bypass makeNugget (cache reads,
 * seed data, poll results) without duplicating the derivation logic.
 */
export function deriveHeadline(headline: string | undefined, text: string | undefined): string {
  let result = headline ?? "";
  const body = text ?? "";
  if (!result.trim() && body.trim()) {
    const first = body.split(/[.!?]\s+/)[0].trim().replace(/[.!?]+$/, "");
    result = first && first.length > 10
      ? (first.length > 80 ? first.slice(0, 77) + "..." : first)
      : (body.length > 80 ? body.slice(0, 77) + "..." : body);
  }
  if (!result.trim()) result = "Music Fact";
  return result;
}

/** Apply deriveHeadline to an already-formed Nugget (cache/seed/poll paths). */
export function sanitizeNugget(n: Nugget): Nugget {
  const headline = deriveHeadline(n.headline, n.text);
  return headline === n.headline ? n : { ...n, headline };
}

export function makeNugget(n: AINuggetData, nuggetId: string, sourceId: string, trackId: string, timestampSec: number): Nugget {
  return {
    id: nuggetId, trackId, timestampSec, durationMs: 7000,
    headline: deriveHeadline(n.headline, n.text), text: n.text, kind: n.kind,
    listenFor: n.listenFor || false, sourceId,
    imageUrl: n.imageUrl, imageCaption: n.imageCaption,
  };
}

/**
 * Sparse-track fallback. Synthesizes a single honest, catalog-grounded
 * nugget when both the nugget_cache lookup and the SSE pipeline come up
 * empty. The Validator + source filter rightly strip fabricated content
 * for very-low-popularity artists (Pete Rango, Cherele, Ty Symph, Dame
 * Atlas, etc.) where Exa returns no usable journalism — but we don't
 * want to leave the user staring at a blank Listen page after tapping a
 * pre-warmed story.
 *
 * The nugget deliberately does NOT pretend to know things — no
 * collaborators, no labels, no quotes, no fabricated context. It just
 * names the track, invites the listen, and acknowledges that we'll add
 * depth as new sources surface.
 */
export function makeSparseFallbackNugget(
  artist: string,
  title: string,
  trackId: string,
  durationSec: number,
  coverArtUrl?: string,
): { nugget: Nugget; source: Source } {
  const nuggetId = `synth-nug-${trackId}-L1-0`;
  const sourceId = `synth-src-${trackId}-L1-0`;
  // Runtime is the one verifiable, track-specific fact available here.
  const runtime = durationSec > 0
    ? `${Math.floor(durationSec / 60)}:${String(Math.round(durationSec % 60)).padStart(2, "0")}`
    : null;
  return {
    nugget: {
      id: nuggetId,
      trackId,
      // Pinned at 0 — same as makeTimestamp's earlyStart — so the
      // synthetic fallback feels indistinguishable from a cache-hit
      // first nugget when the user taps.
      timestampSec: 0,
      durationMs: 7000,
      // Constitution compliance. The previous copy broke two rules at
      // once: "One of your under-the-radar picks" patronized the listener
      // with their own taste, and "we'll layer in the story as more
      // sources surface" was meta-commentary about the absence of
      // information — the exact framing the constitution calls lazy and
      // self-defeating. This states only what we can verify from catalog
      // data (artist, title, runtime) and frames it as a listen rather
      // than an apology.
      headline: runtime
        ? `${artist} brings "${title}" in at ${runtime}.`
        : `${artist} — "${title}".`,
      text: runtime
        ? `Give it the full ${runtime} before you decide. The first pass is for the groove; the details surface on the second.`
        : `Give it a full pass before you decide — the details surface on the second listen.`,
      kind: "track",
      listenFor: false,
      sourceId,
      imageUrl: coverArtUrl,
      imageCaption: title,
    },
    source: {
      id: sourceId,
      type: "catalog",
      title,
      publisher: "MusicNerd",
    },
  };
}

interface UseAINuggetsResult {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  loading: boolean;
  error: string | null;
  listenCount: number;
  artistSummary: string | null;
  fromCache: boolean;
  /** True while wave 2 or 3 is generating in the background. UI hint only;
   *  main `loading` stays false because initial nuggets are already visible. */
  waveLoading: boolean;
}

// ── Sentinel poll helper ──────────────────────────────────────────────────────
// Called when another client's 'generating' sentinel is detected. Polls the DB
// every 3 seconds for up to 30 seconds waiting for status → 'ready'.
async function pollForReadyNuggets(
  cacheTrackId: string,
  maxAttempts = 10,
  intervalMs = 3000
): Promise<{ nuggets: Nugget[]; sources: Map<string, Source> } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { data } = await supabase
      .from("nugget_cache")
      .select("nuggets, sources, status")
      .eq("track_id", cacheTrackId)
      .maybeSingle();

    if (data?.status === "ready" && (data.nuggets as Nugget[] | null)?.length) {
      const nuggs = (data.nuggets as Nugget[]).map(sanitizeNugget);
      const srcs = new Map<string, Source>();
      const rawSourcesObj = (data.sources ?? {}) as Record<string, unknown>;
      for (const [key, val] of Object.entries(rawSourcesObj)) {
        if (key.startsWith("_")) continue;
        if (!isValidSourceShape(val)) continue;
        // Defense-in-depth: drop unsafe URL schemes at cache-read
        // time so every render site doesn't have to remember the
        // guard. Render-side checks remain in place — this is belt
        // + braces.
        if (!isSafeUrl(val.url)) continue;
        srcs.set(key, val);
      }
      return { nuggets: nuggs, sources: srcs };
    }
    // If the row is gone or no longer 'generating', stop waiting.
    if (!data || data.status !== "generating") break;
  }
  return null;
}

export function useAINuggets(
  trackId: string,
  artist: string,
  title: string,
  album: string | undefined,
  durationSec: number,
  regenerateKey: number = 0,
  coverArtUrl?: string,
  artistImageUrl?: string,
  tier: "casual" | "curious" | "nerd" = "casual",
  topArtists?: string[],
  topTracks?: string[],
  // Non-primary artists on the track (e.g. for "Better" by Ty Symph,
  // Pete Rango, collaborators = ["Pete Rango"]). Passed through to
  // wave-2/3 so the server has the same research targets the Stories
  // pre-gen used in wave 1 — otherwise wave-2 loses a key research
  // signal and falls back to thin generic content on collab tracks.
  collaborators?: string[],
): UseAINuggetsResult {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [loading, setLoading] = useState(true);
  // Sync the two state slices into refs (below, after the state declarations
  // and their refs are created) — see nuggetsRef / sourcesRef usage in the
  // wave 2/3 upsert.
  const [error, setError] = useState<string | null>(null);
  const [listenCount, setListenCount] = useState(1);
  const [artistSummary, setArtistSummary] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const {
    getNuggetCache, setNuggetCache, getTrackListenCount, setTrackListenCount,
    currentTime, isPlaying,
  } = usePlayer();
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror currentTime into a ref so the SSE handler (closes over stale
  // currentTime from effect-setup time) can read the LIVE playback
  // position when deciding whether to early-cancel mid-stream.
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  // Same for isPlaying — without a ref the early-cancel closure sees
  // whatever isPlaying was at the moment the effect fired and never
  // updates. A user who pauses mid-stream would still trigger the
  // cancel because the closure thinks they're still playing.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  // Track when the last generation attempt started — used to only debounce
  // on rapid skips (< 5s between tracks), not on first page load.
  const lastGenTimestampRef = useRef(0);

  // ── Wave orchestration ─────────────────────────────────────────────
  // Wave 1 is the initial generate() call. Wave 2/3 fire in-session when
  // the user has consumed all current nuggets AND the track has time left.
  // Cap at wave 3 (9 total nuggets). Each wave bumps listenCount to unlock
  // deeper angles in the ANGLE_POOL, and passes accumulated headlines as
  // previousNuggets for dedup across waves.
  const currentWaveRef = useRef(1);
  const waveInFlightRef = useRef(false);
  // Cooldown timestamp — when a wave attempt fails we hold off retrying for
  // 30 s so a transient server error doesn't fire a new request every 500 ms
  // (the effect re-evaluates on every currentTime tick).
  const waveCooldownUntilRef = useRef(0);
  // Latch: once a wave-2 attempt comes back empty for THIS track, the
  // Validator + source filter stripped everything the Writer produced
  // (typical for sub-1k-listener artists where Exa returns no journalism).
  // No amount of retries will change that within the same track, so we
  // stop firing wave requests entirely instead of burning a Gemini call
  // every 30s. Cleared on track change via cancelledRef cycling.
  const waveExhaustedRef = useRef(false);
  // Mirror waveInFlightRef as state so the UI can surface a "more coming" pill.
  const [waveLoading, setWaveLoading] = useState(false);
  // Track the current trackId via ref so in-flight wave generations can
  // detect a track change and drop their results rather than appending to
  // a different track's nuggets.
  const currentTrackIdRef = useRef(trackId);
  currentTrackIdRef.current = trackId;
  // Sync nuggets + sources into refs so the wave 2/3 upsert sees the
  // latest arrays even if an SSE chunk lands between effect-fire and the
  // post-request cache upsert (previously the upsert closed over stale
  // state and could drop those SSE-delivered sources from the cache row).
  const nuggetsRef = useRef<Nugget[]>([]);
  const sourcesRef = useRef<Map<string, Source>>(new Map());
  nuggetsRef.current = nuggets;
  sourcesRef.current = sources;
  // Reset wave state when the track changes.
  useEffect(() => {
    currentWaveRef.current = 1;
    waveInFlightRef.current = false;
    waveCooldownUntilRef.current = 0;
    waveExhaustedRef.current = false;
  }, [trackId, regenerateKey]);

  const generate = useCallback(async () => {
    if (!artist || !title) return;
    setFromCache(false);

    // Clear stale state from a previous track so SSE appends don't stack
    // nuggets across track boundaries (the SSE path uses functional
    // updaters: setNuggets(prev => [...prev, nugget])).
    setNuggets([]);
    setSources(new Map());

    // ── In-memory cache check ──────────────────────────────────────
    // Include regenerateKey so repeat listens (which bump the key) always
    // miss the cache and trigger fresh generation. Format MUST match
    // what usePreGeneratedStories writes via buildClientNuggetCacheKey
    // (`real::enc(artist)::enc(title)::enc("")::enc(uri)::tier::regen`).
    // Listen receives `trackId` already URL-encoded from React Router
    // wildcard params, so concatenating directly produces the same
    // string the helper builds from raw artist/title/uri.
    const cacheKey = `${trackId}::${tier}::${regenerateKey}`;

    // Pre-gen always writes at regenerateKey=0. Re-listens bump
    // regenerateKey for "deeper content on re-listen", which means
    // the cache lookup at the bumped key misses on every return
    // visit — even though the pre-gen / earlier-session content is
    // still in the in-mem cache at key=0. Result: user taps mini-
    // player to return to the song they're listening to and sees
    // the loading placeholder instead of their nuggets.
    // Fall back to regenerateKey=0 when the current key misses. The
    // wave-2/3 trigger downstream still fires with the current
    // regenerateKey to fetch deeper content from the server — the
    // user just gets instant content from pre-gen / earlier session
    // first, deeper content in the background.
    let cached = getNuggetCache(cacheKey);
    if (!cached && regenerateKey > 0) {
      const fallbackKey = `${trackId}::${tier}::0`;
      cached = getNuggetCache(fallbackKey);
      if (cached && import.meta.env.DEV) {
        console.log("[NuggetMemCache] Falling back to regenerateKey=0:", fallbackKey);
      }
    }
    if (cached) {
      if (import.meta.env.DEV) console.log("[NuggetMemCache] Serving from in-memory cache:", cacheKey);
      setFromCache(true);
      setNuggets(cached.nuggets);
      setSources(cached.sources);
      setListenCount(cached.listenCount);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    // true once we own the 'generating' sentinel; reset to false after cache write succeeds
    let sentinelClaimed = false;
    // Hoisted so the catch block's cache-fallback can read the latest
    // listen count when SSE fails (the deeper-tier path skips the cache
    // check; on failure we want to recover with whatever cached row
    // exists, regardless of which listen the user is on).
    let currentListenCount = 1;
    // Tier-scoped key for nugget_cache DB table — different tiers get
    // different cached nuggets. We blank the album slot so that different
    // entry points to the same track (story rail with empty album, tile /
    // search with album populated, artist-profile tile, etc.) resolve to
    // the same cache row. The URI still uniquely identifies the recording,
    // so album is purely cosmetic for the cache key. MUST match the
    // canonicalization in generate-nuggets/index.ts's server-side upsert.
    const dbCacheKey = canonicalCacheKey(trackId, tier);

    try {
      const trackKey = `${artist}::${title}`;

      // Use Supabase session userId if available, otherwise fall back to a
      // stable anonymous ID so listen history still works without auth.
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? (() => {
        const key = "musicnerd_anon_id";
        let id = localStorage.getItem(key);
        if (!id) {
          id = crypto.randomUUID();
          localStorage.setItem(key, id);
        }
        return id;
      })();

      // ── Listen history ────────────────────────────────────────────
      // currentListenCount declared above (outside try) so the catch's
      // fallback can use it. Reset to default in case a previous
      // generate() run left a stale value in scope.
      currentListenCount = 1;
      let previousNuggets: string[] = [];

      const { data: historyRow } = await supabase
        .from("nugget_history")
        .select("*")
        .eq("track_key", trackKey)
        .eq("user_id", userId)
        .maybeSingle();

      if (historyRow) {
        currentListenCount = historyRow.listen_count || 1;
        previousNuggets = (historyRow.previous_nuggets as string[]) || [];
      }

      // If regenerateKey > 0, the user completed the track and is re-listening.
      // Ensure listen count is at least regenerateKey + 1 even if DB hasn't caught up.
      if (regenerateKey > 0 && currentListenCount <= regenerateKey) {
        currentListenCount = regenerateKey + 1;
      }

      if (cancelledRef.current) return;
      setListenCount(currentListenCount);
      setTrackListenCount(trackKey, currentListenCount);

      // ── Seed data shortcut for demo tracks ──────────────────────
      const seedData = await getSeedListenNuggets(artist, title, tier, currentListenCount);
      if (seedData) {
        if (import.meta.env.DEV) console.log("[SeedNuggets] Serving seed data for", trackKey, "listen", currentListenCount, "tier", tier);

        const newSources = new Map<string, Source>();
        const newNuggets: Nugget[] = seedData.map((n, i) => {
          const sourceId = `seed-src-${trackId}-L${currentListenCount}-${i}`;
          const nuggetId = `seed-nug-${trackId}-L${currentListenCount}-${i}`;

          const source: Source = {
            id: sourceId,
            type: n.source.type,
            title: n.source.title,
            publisher: n.source.publisher,
            url: n.source.url,
            embedId: n.source.embedId,
            quoteSnippet: n.source.quoteSnippet,
            locator: n.source.locator,
          };
          newSources.set(sourceId, source);

          // Mirror the spacing logic in makeTimestamp: first seed nugget
          // pinned at earlyStart (0s) so it shows the moment the song
          // starts, last at duration - endBuffer, middle distributed
          // evenly.
          const earlyStart = 0;
          const endBuffer = 15;
          const usableDuration = Math.max(durationSec - earlyStart - endBuffer, 30);
          const seedDenom = Math.max(seedData.length - 1, 1);
          const spacing = usableDuration / seedDenom;
          const timestampSec = Math.floor(earlyStart + spacing * i);

          return {
            id: nuggetId,
            trackId,
            timestampSec: Math.min(timestampSec, durationSec - 10),
            durationMs: 7000,
            headline: deriveHeadline(n.headline, n.text),
            text: n.text,
            kind: n.kind,
            listenFor: n.listenFor || false,
            sourceId,
          } as Nugget;
        });

        // Assign images — never use DiceBear placeholder URLs
        const isRealImg = (url?: string) => url && !url.includes("dicebear.com");
        const contextualImageIndices = new Set<number>();
        for (let idx = 0; idx < newNuggets.length; idx++) {
          const nugget = newNuggets[idx];
          const seedNugget = seedData[idx];
          if (seedNugget?.imageUrl) {
            nugget.imageUrl = seedNugget.imageUrl;
            nugget.imageCaption = seedNugget.imageCaption || nugget.headline;
            contextualImageIndices.add(idx);
          } else if (nugget.kind === "artist" && isRealImg(artistImageUrl)) {
            nugget.imageUrl = artistImageUrl;
            nugget.imageCaption = artist;
          } else if ((nugget.kind === "track" || nugget.kind === "discovery") && isRealImg(coverArtUrl)) {
            nugget.imageUrl = coverArtUrl;
            nugget.imageCaption = nugget.kind === "track"
              ? `${title}${album ? " \u2014 " + album : ""}`
              : nugget.headline || "Explore next";
          }
        }

        // Visual rotation — only promote to visualOnly if the image is contextual
        // (server-provided), not a fallback artist photo or album cover (redundant
        // with the Listen page background).
        let hashSum = 0;
        for (let c = 0; c < trackId.length; c++) hashSum += trackId.charCodeAt(c);
        const visualSlotIndex = hashSum % 3;
        let visualAssigned = false;
        for (let attempt = 0; attempt < 3 && !visualAssigned; attempt++) {
          const idx = (visualSlotIndex + attempt) % 3;
          if (idx < newNuggets.length && contextualImageIndices.has(idx)) {
            newNuggets[idx].visualOnly = true;
            visualAssigned = true;
          }
        }

        if (cancelledRef.current) return;
        setNuggets(newNuggets);
        setSources(newSources);
        setNuggetCache(cacheKey, { nuggets: newNuggets, sources: newSources, listenCount: currentListenCount });
        setLoading(false);
        return;
      }

      // ── Check nugget_cache ──────────────────────────────────────
      // Pete's invariant: if a cache row exists, ALWAYS serve it on
      // tap so the user sees the first nugget the moment the song
      // starts. Deeper-listen content variation can be a separate
      // feature later; right now we'd rather show consistent content
      // instantly than rotate variety at the cost of leaving the user
      // staring at cover art for 15-30s while a fresh SSE pipeline
      // runs. Previous gate (`currentListenCount <= 1 && regenerateKey === 0`)
      // skipped the cache for any repeat listener, which broke the
      // pink-ring-→-nugget-on-tap promise as soon as a track had been
      // played more than once. `regenerateKey > 0` (manual user-driven
      // refresh) still bypasses below if needed.
      if (regenerateKey === 0) {
        const { data: cached } = await supabase
          .from("nugget_cache")
          .select("nuggets, sources, status")
          .eq("track_id", dbCacheKey)
          .maybeSingle();

        if (cached?.status === "ready" && (cached.nuggets as Nugget[] | null)?.length) {
          if (import.meta.env.DEV) console.log("[NuggetCache] Serving cached nuggets for", dbCacheKey);
          // Sanitize — older cache entries may have empty headlines that
          // predate the server-side/makeNugget headline guard.
          const cachedNuggets = (cached.nuggets as Nugget[]).map(sanitizeNugget);
          const cachedSources = new Map<string, Source>();
          const rawSourcesObj = (cached.sources ?? {}) as Record<string, unknown>;
          for (const [key, val] of Object.entries(rawSourcesObj)) {
            // Skip meta keys (anything beginning with `_`) and any value
            // that doesn't satisfy the Source shape contract — a
            // malformed row would otherwise silently corrupt the cache.
            if (key.startsWith("_")) continue;
            if (!isValidSourceShape(val)) continue;
            // Defense-in-depth: drop unsafe URL schemes here so every
            // render site doesn't have to remember the guard. Render-
            // side `isSafeUrl` checks remain in place.
            if (!isSafeUrl(val.url)) continue;
            cachedSources.set(key, val);
          }
          if (cancelledRef.current) return;
          setNuggets(cachedNuggets);
          setSources(cachedSources);
          setFromCache(true);

          // Write to in-memory cache
          setNuggetCache(cacheKey, { nuggets: cachedNuggets, sources: cachedSources, listenCount: currentListenCount });

          // Don't increment listen_count here — Listen.tsx handles that
          // after the 5-second playback threshold is met.

          setLoading(false);
          return;
        }

        if (cached?.status === "generating") {
          // Another client is already generating — poll every 3 s for up to 30 s.
          if (import.meta.env.DEV) console.log("[NuggetCache] Generation in progress, polling…", dbCacheKey);
          const polled = await pollForReadyNuggets(dbCacheKey);
          if (cancelledRef.current) return;
          if (polled) {
            if (import.meta.env.DEV) console.log("[NuggetCache] Poll succeeded — serving result for", dbCacheKey);
            setNuggets(polled.nuggets);
            setSources(polled.sources);
            setNuggetCache(cacheKey, { nuggets: polled.nuggets, sources: polled.sources, listenCount: currentListenCount });
            setLoading(false);
            return;
          }
          // Timed out — the generating client likely crashed; remove stale sentinel.
          console.warn("[NuggetCache] Poll timed out — removing stale sentinel for", dbCacheKey);
          await supabase.from("nugget_cache").delete().eq("track_id", dbCacheKey);
        }

        // Debounce before committing to generation — only if there was a
        // recent generation attempt (rapid skipping). First page loads skip
        // the delay so the user doesn't wait unnecessarily.
        // Timestamp is updated BEFORE the check intentionally: if the user
        // skips again during the 3s sleep (cancelling this run), the next
        // invocation will also see < 5s and sleep again (cascade-debouncing).
        const timeSinceLastGen = Date.now() - lastGenTimestampRef.current;
        lastGenTimestampRef.current = Date.now();
        if (timeSinceLastGen < 5000) {
          await new Promise((r) => setTimeout(r, 3000));
          if (cancelledRef.current) return;
        }

        // No cache entry (or stale sentinel removed) — claim the work.
        // The unique index on track_id means only one concurrent INSERT wins.
        // A duplicate INSERT returns PG error 23505; we ignore it and generate anyway
        // (acceptable rare edge case — at worst two clients generate simultaneously).
        const { error: claimError } = await supabase
          .from("nugget_cache")
          .insert({ track_id: dbCacheKey, status: "generating", nuggets: [], sources: {} });
        if (!claimError) {
          sentinelClaimed = true;
          if (import.meta.env.DEV) console.log("[NuggetCache] Claimed generation sentinel for", dbCacheKey);
        } else if (claimError.code !== "23505") {
          // Unexpected error (not a unique violation) — log but proceed.
          console.warn("[NuggetCache] Sentinel insert error:", claimError.message);
        }
      }

      // ── Generate fresh nuggets via AI ─────────────────────────────
      // Extract the catalog track ID from trackId. The route embeds a URI
      // in the format `real::Artist::Title::Album::{uri}` where {uri} is
      // either `spotify:track:XXX` (Spotify) or `apple:song:XXX` (Apple
      // Music). spotifyTrackId is currently the only field generate-nuggets
      // reads; appleTrackId is forward-prep for a follow-up that teaches
      // the edge function to enrich prompts via Apple's catalog API.
      const spotifyUriMatch = trackId.match(/spotify:track:([a-zA-Z0-9]{22})/);
      const appleUriMatch = trackId.match(/apple:song:(\d+)/);
      const spotifyTrackIdValue = spotifyUriMatch?.[1];
      const appleTrackIdValue = appleUriMatch?.[1];

      // ── SSE streaming: fetch nuggets as they individually resolve ──
      const requestBody = {
        artist,
        title,
        album,
        listenCount: currentListenCount,
        previousNuggets,
        tier,
        userTopArtists: topArtists?.slice(0, 10),
        userTopTracks: topTracks?.slice(0, 10),
        spotifyArtistImageUrl: artistImageUrl,
        spotifyTrackId: spotifyTrackIdValue,
        appleTrackId: appleTrackIdValue,
        durationSec,  // server uses this to compute cache-side timestamps
      };

      // Get auth token for the request
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const authToken = authSession?.access_token || SUPABASE_ANON_KEY;

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      // 60s timeout: if the edge function stalls mid-stream (never sends
      // done, never closes), the fetch aborts cleanly. User track-skips
      // also abort via abortRef.current.abort() in the effect cleanup.
      // 120s timeout — matches Supabase edge function limit (150s) with
      // margin. Lesser-known artists need longer for Exa research + Gemini.
      const timeoutId = setTimeout(() => abortRef.current?.abort(), 120_000);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-nuggets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${authToken}`,
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(requestBody),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `Edge Function returned ${response.status}`);
      }

      if (cancelledRef.current) return;

      let aiNuggets: AINuggetData[] = [];
      let aiArtistSummary = "";
      let aiExternalLinks: { label: string; url: string }[] = [];
      let aiNoTrackData = false;

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && response.body) {
        // ── SSE path: parse streaming events ──
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // Flips true when we've decided to stop reading early because
        // the user is near track-end and we have enough nuggets. Read
        // by both inner and outer loops so we exit cleanly without
        // throwing an AbortError (which would skip the cache write).
        let earlyComplete = false;

        while (true) {
          if (earlyComplete) {
            await reader.cancel().catch(() => {}); // tell server we're done
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelledRef.current) { reader.cancel(); return; }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer — split on double-newline (SSE
          // standard event separator) to correctly handle multi-line events.
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // keep incomplete last event

          for (const event of events) {
            const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            let payload: any;
            try {
              payload = JSON.parse(dataLine.slice(6));
            } catch (e) {
              console.warn("[SSE] Malformed event:", dataLine, e);
              continue;
            }
            if (payload.type === "nugget") {
              aiNuggets.push(payload.nugget);
              const n = payload.nugget as AINuggetData;
              const { sourceId, nuggetId } = makeIds(trackId, currentListenCount, payload.index);
              const source = makeSource(sourceId, n.source);
              // Use provisional timestamp during streaming; recalculated after done
              const ts = makeTimestamp(payload.index, payload.totalExpected || aiNuggets.length, durationSec);
              const nugget = makeNugget(n, nuggetId, sourceId, trackId, ts);

              setSources((prev) => new Map(prev).set(sourceId, source));
              // Dedup by id: a re-fire of the generate effect (deps churn
              // from useUserProfile re-emitting) cancels the old fetch but
              // resets cancelledRef to false, so a late SSE chunk from the
              // old stream can append into the new state and collide with
              // the cache-restored nugget that has the same listenCount +
              // index. React then renders only one of the two same-keyed
              // children and the other "disappears" mid-typewrite.
              setNuggets((prev) => (prev.some((p) => p.id === nugget.id) ? prev : [...prev, nugget]));
              if (import.meta.env.DEV) console.log(`[SSE] Received nugget ${payload.index}: "${n.headline?.slice(0, 40)}"`);

              // Early-cancel: if we already have enough nuggets to cover
              // the rest of playback, abort the stream rather than burning
              // Gemini calls the user will never see. Conditions:
              //   - have ≥ MIN_EARLY_CANCEL_NUGGETS (4) — keep at least
              //     casual-tier worth of content even on short tracks
              //   - track has ≤ EARLY_CANCEL_REMAINING_SEC (45s) left
              //   - playback is actively running (paused users may still
              //     read, so don't cancel on them)
              // We treat the partial set as the final cache row — this
              // listen's full nugget budget got pruned to "what fits the
              // remaining playback window," not lost.
              //
              // NOTE on `aiNuggets.length`: this is a LOCAL `let` array
              // (declared at line 545), pushed synchronously above on
              // line 589 BEFORE this check runs. It's not React state,
              // so the count is live — no ref-mirror needed.
              // `isPlayingRef.current` and `currentTimeRef.current` ARE
              // ref-mirrored because they come from React state via
              // usePlayer() and would otherwise be stale closures.
              // (MIN_EARLY_CANCEL_NUGGETS / EARLY_CANCEL_REMAINING_SEC
              //  hoisted to module scope; were re-evaluated per nugget here.)
              const liveCurrentTime = currentTimeRef.current;
              const remainingSec = durationSec - liveCurrentTime;
              if (
                isPlayingRef.current &&
                aiNuggets.length >= MIN_EARLY_CANCEL_NUGGETS &&
                remainingSec > 0 &&
                remainingSec <= EARLY_CANCEL_REMAINING_SEC
              ) {
                if (import.meta.env.DEV) {
                  console.log(`[SSE] early-complete: ${aiNuggets.length} nuggets in hand, ${Math.round(remainingSec)}s left on track — stopping stream + caching what we have`);
                }
                earlyComplete = true;
                // Break out of the event loop; outer while sees the
                // flag, cancels the reader, and falls through to the
                // post-stream cache write so the partial set isn't lost.
                break;
              }

            } else if (payload.type === "done") {
              aiArtistSummary = payload.artistSummary || "";
              aiExternalLinks = payload.externalLinks || [];
              aiNoTrackData = !!payload.noTrackData;
              setArtistSummary(aiArtistSummary);

              // Recalculate all timestamps now that we know the true total count
              const totalCount = aiNuggets.length;
              setNuggets((prev) => prev.map((nugget, i) => ({
                ...nugget,
                timestampSec: makeTimestamp(i, totalCount, durationSec),
              })));
              if (import.meta.env.DEV) console.log(`[SSE] All ${totalCount} nuggets received — timestamps recalculated`);

            } else if (payload.type === "error") {
              // Server signals all Writer attempts failed — propagate so we
              // hit the catch block without touching the success path
              // (cache writes, history updates).
              throw new Error(payload.message || "SSE server reported error");
            }
          }
        }

        // SSE complete — skip the old nugget processing below
        // Write to cache + history, then return
        if (cancelledRef.current) return;

        // Defensive: the server should have sent an explicit "error" event
        // when no nuggets were generated. This guard catches any lingering
        // paths (e.g. stream closed without a terminal event) and prevents
        // caching an empty result.
        if (aiNuggets.length === 0) {
          throw new Error("SSE stream closed with no nuggets");
        }

        // Enrich SSE nuggets with Spotify fallback images (server resolves
        // Wikipedia/Exa but may miss lesser-known artists — same logic as
        // the JSON path's image-assignment block).
        const isRealImg = (url?: string) => url && !url.includes("dicebear.com");
        for (const n of aiNuggets) {
          if (n.imageUrl) continue; // server already resolved
          if (n.kind === "artist" && isRealImg(artistImageUrl)) {
            n.imageUrl = artistImageUrl;
            n.imageCaption = artist;
          } else if (isRealImg(coverArtUrl)) {
            n.imageUrl = coverArtUrl;
            n.imageCaption = title;
          }
        }

        // Write to in-memory cache
        const allNuggets = aiNuggets.map((n: AINuggetData, i: number) => {
          const { sourceId, nuggetId } = makeIds(trackId, currentListenCount, i);
          return makeNugget(n, nuggetId, sourceId, trackId, makeTimestamp(i, aiNuggets.length, durationSec));
        });
        const allSources = new Map<string, Source>();
        aiNuggets.forEach((n: AINuggetData, i: number) => {
          const { sourceId } = makeIds(trackId, currentListenCount, i);
          allSources.set(sourceId, makeSource(sourceId, n.source));
        });
        setNuggetCache(cacheKey, { nuggets: allNuggets, sources: allSources, listenCount: currentListenCount });

        // Write to DB cache for future listeners
        if (currentListenCount <= 1) {
          const cacheSourcesObj: Record<string, Source | string | { label: string; url: string }[]> = {};
          allSources.forEach((src, key) => { cacheSourcesObj[key] = src; });
          cacheSourcesObj.artistSummary = aiArtistSummary;
          cacheSourcesObj.externalLinks = aiExternalLinks;
          await supabase.from("nugget_cache").upsert(
            { track_id: dbCacheKey, nuggets: allNuggets as unknown as Json, sources: cacheSourcesObj as unknown as Json, status: "ready" },
            { onConflict: "track_id" }
          );
          // Note: if cancelledRef becomes true between the upsert completing
          // and this line, the sentinel stays in "ready" state (correct data,
          // just attributed to a nominally cancelled run). This is harmless.
          sentinelClaimed = false;
          if (import.meta.env.DEV) console.log("[NuggetCache] Cached SSE nuggets for", dbCacheKey);
        }

        // Update nugget history
        const newHeadlines = allNuggets.map((n) => n.headline || n.text).filter(Boolean);
        const updatedPreviousNuggets = [...previousNuggets, ...newHeadlines];
        if (historyRow) {
          await supabase.from("nugget_history").update({ previous_nuggets: updatedPreviousNuggets as Json, updated_at: new Date().toISOString() }).eq("track_key", trackKey).eq("user_id", userId);
        } else {
          await supabase.from("nugget_history").insert({ track_key: trackKey, user_id: userId, listen_count: 1, previous_nuggets: updatedPreviousNuggets as Json });
        }

        clearTimeout(timeoutId);
        abortRef.current = null; // clear completed controller
        return; // SSE path complete — finally block handles setLoading(false)

      } else {
        clearTimeout(timeoutId);
        // ── JSON fallback path ──
        const data = await response.json();
        if (data?.error) throw new Error(data.error);
        aiNuggets = data?.nuggets || [];
        aiArtistSummary = data?.artistSummary || "";
        aiExternalLinks = data?.externalLinks || [];
        aiNoTrackData = !!data?.noTrackData;
        // Sparse-track guard. JSON path returns 200 with `nuggets: []`
        // when the Validator + source filter strip everything (low-
        // popularity artists). Throw so the catch block's synthetic
        // fallback fires — otherwise we'd render an empty Listen page
        // and call it success.
        if (aiNuggets.length === 0) {
          throw new Error("JSON path returned no nuggets (likely sparse-artist validation strip)");
        }
      }
      if (aiNoTrackData) {
        if (import.meta.env.DEV) console.log("[NuggetGen] Sparse artist — no track data, nugget 2 is 'context' kind");
      }

      const newSources = new Map<string, Source>();
      const newNuggets: Nugget[] = aiNuggets.map((n, i) => {
        const { sourceId, nuggetId } = makeIds(trackId, currentListenCount, i);
        newSources.set(sourceId, makeSource(sourceId, n.source));
        return makeNugget(n, nuggetId, sourceId, trackId, makeTimestamp(i, aiNuggets.length, durationSec));
      });

      // ── Assign images: prefer server-resolved contextual images, fall back to Spotify ──
      // Never use DiceBear placeholder URLs as nugget images — they look broken on companion.
      const isRealImage = (url?: string) => url && !url.includes("dicebear.com");
      const contextualImageIndices = new Set<number>();
      for (let idx = 0; idx < newNuggets.length; idx++) {
        const nugget = newNuggets[idx];
        const aiNugget = aiNuggets[idx];

        // Prefer server-resolved contextual image (Wikipedia/Commons)
        if (aiNugget?.imageUrl) {
          nugget.imageUrl = aiNugget.imageUrl;
          nugget.imageCaption = aiNugget.imageCaption || nugget.headline;
          contextualImageIndices.add(idx);
        }
        // "context" kind: keep backend-resolved image, only fallback to artist photo
        else if (nugget.kind === "context" && isRealImage(artistImageUrl)) {
          nugget.imageUrl = artistImageUrl;
          nugget.imageCaption = artist;
        }
        // Fall back to Spotify images (only real URLs, not DiceBear placeholders)
        else if (nugget.kind === "artist" && isRealImage(artistImageUrl)) {
          nugget.imageUrl = artistImageUrl;
          nugget.imageCaption = artist;
        } else if ((nugget.kind === "track" || nugget.kind === "discovery") && isRealImage(coverArtUrl)) {
          nugget.imageUrl = coverArtUrl;
          nugget.imageCaption = nugget.kind === "track"
            ? `${title}${album ? " \u2014 " + album : ""}`
            : nugget.headline || "Explore next";
        }
      }

      // ── Visual rotation — only promote contextual (server-provided) images ──
      // Fallback images (artist photo, album cover) are redundant with the
      // Listen page background, so they should never become visualOnly cards.
      let hashSum = 0;
      for (let c = 0; c < trackId.length; c++) hashSum += trackId.charCodeAt(c);
      const visualSlotIndex = hashSum % 3;

      let visualAssigned = false;
      for (let attempt = 0; attempt < 3 && !visualAssigned; attempt++) {
        const idx = (visualSlotIndex + attempt) % 3;
        if (idx < newNuggets.length && contextualImageIndices.has(idx)) {
          newNuggets[idx].visualOnly = true;
          visualAssigned = true;
        }
      }

      if (cancelledRef.current) return;
      setNuggets(newNuggets);
      setSources(newSources);
      setArtistSummary(aiArtistSummary);

      // Write to in-memory cache
      setNuggetCache(cacheKey, { nuggets: newNuggets, sources: newSources, listenCount: currentListenCount });

      // ── Write to nugget_cache for future first-time listeners ─────
      // This is the primary deduplication fix: once the AI result is written here,
      // every subsequent first-listen to the same track hits the cache instead of
      // firing a new Gemini API call.
      if (currentListenCount <= 1) {
        const cacheSourcesObj: Record<string, Source | string | { label: string; url: string }[]> = {};
        newSources.forEach((src, key) => { cacheSourcesObj[key] = src; });
        // Store companion metadata alongside sources for the companion page to read
        cacheSourcesObj.artistSummary = aiArtistSummary;
        cacheSourcesObj.externalLinks = aiExternalLinks;
        await supabase.from("nugget_cache").upsert(
          {
            track_id: dbCacheKey,
            nuggets: newNuggets as unknown as Json,
            sources: cacheSourcesObj as unknown as Json,
            status: "ready",
          },
          { onConflict: "track_id" }
        );
        sentinelClaimed = false; // sentinel resolved — no cleanup needed if error occurs later
        if (import.meta.env.DEV) console.log("[NuggetCache] Cached fresh nuggets for", dbCacheKey);
      }

      // ── Update previous_nuggets for deduplication ─────────────────
      // Only update previous_nuggets here — listen_count is managed solely
      // by Listen.tsx's 5-second threshold to avoid double-counting.
      const newHeadlines = newNuggets.map((n) => n.headline || n.text).filter(Boolean);
      const updatedPreviousNuggets = [...previousNuggets, ...newHeadlines];

      if (historyRow) {
        await supabase
          .from("nugget_history")
          .update({
            previous_nuggets: updatedPreviousNuggets as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("track_key", trackKey)
          .eq("user_id", userId);
      } else {
        // No history row yet — create one now with the headlines so listen 2
        // can deduplicate. listen_count starts at 1; Listen.tsx will bump it
        // to 2 at the 5-second threshold.
        await supabase
          .from("nugget_history")
          .insert({
            track_key: trackKey,
            user_id: userId,
            listen_count: 1,
            previous_nuggets: updatedPreviousNuggets as Json,
          });
      }
    } catch (e) {
      // AbortError is intentional (user skipped track) — don't surface it
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("AI nugget generation failed:", e);

      // FALLBACK: try the canonical cache row even though `currentListenCount`
      // gated us out of using it earlier. The repeat-listen flow normally
      // skips cache to force a fresh deeper-tier generation, but if the
      // generation fails (network, edge timeout, 5xx) we'd otherwise leave
      // the user staring at cover art with zero nuggets — when there's a
      // perfectly good listen-1 cache row sitting in the DB. The deeper-
      // tier content is "nice to have"; cached nuggets are the safety net.
      if (!cancelledRef.current) {
        try {
          const { data: fallback } = await supabase
            .from("nugget_cache")
            .select("nuggets, sources, status")
            .eq("track_id", dbCacheKey)
            .maybeSingle();
          const fbNuggets = fallback?.status === "ready"
            ? (fallback.nuggets as Nugget[] | null) ?? []
            : [];
          if (fbNuggets.length > 0) {
            console.warn(`[useAINuggets] SSE failed; falling back to cached nuggets (${fbNuggets.length}) for ${dbCacheKey}`);
            const sanitized = fbNuggets.map(sanitizeNugget);
            const fbSources = new Map<string, Source>();
            const rawSources = (fallback!.sources ?? {}) as Record<string, unknown>;
            for (const [k, v] of Object.entries(rawSources)) {
              // Same shape + scheme guards as the primary cache-read
              // path — a malformed row that slips into this catch-
              // block fallback would otherwise crash downstream on
              // source.url reads or surface an unsafe scheme.
              if (k.startsWith("_")) continue;
              if (!isValidSourceShape(v)) continue;
              if (!isSafeUrl(v.url)) continue;
              fbSources.set(k, v);
            }
            setNuggets(sanitized);
            setSources(fbSources);
            setNuggetCache(cacheKey, { nuggets: sanitized, sources: fbSources, listenCount: currentListenCount });
            setError(null);
            // Don't fall through to error / sentinel cleanup — we recovered.
            return;
          }
        } catch (fbErr) {
          console.warn("[useAINuggets] cache fallback lookup threw:", fbErr);
        }
        // Sparse-track synthetic fallback. SSE produced nothing AND no
        // DB cache row exists — happens reliably for very-low-popularity
        // artists where the Validator + source filter strip every
        // Writer attempt. Better to surface ONE honest catalog-grounded
        // nugget than leave the user staring at cover art with no
        // content to read.
        console.warn(`[useAINuggets] SSE failed and no cache row exists for ${dbCacheKey}; synthesizing catalog fallback`);
        const synth = makeSparseFallbackNugget(artist, title, trackId, durationSec, coverArtUrl);
        const synthSources = new Map<string, Source>([[synth.source.id, synth.source]]);
        setNuggets([synth.nugget]);
        setSources(synthSources);
        // do NOT write synthetic fallbacks
        // to the in-memory client cache. Otherwise re-visiting the same
        // track in the same session would serve the synthetic from memory
        // forever and never retry the real SSE pipeline. The DB cache
        // also doesn't get a synthetic write here (no admin key on the
        // client), so leaving the in-mem cache empty means a future
        // mount will go through the full pipeline again.
        setError(null);
        // Sentinel cleanup so a future tap retries the real pipeline.
        if (sentinelClaimed) {
          try { await supabase.from("nugget_cache").delete().eq("track_id", dbCacheKey); } catch { /* noop */ }
        }
        return;
      }
      // Remove the 'generating' sentinel so waiting clients don't poll indefinitely.
      if (sentinelClaimed) {
        try { await supabase.from("nugget_cache").delete().eq("track_id", dbCacheKey); } catch { /* noop */ }
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [trackId, artist, title, album, durationSec, coverArtUrl, artistImageUrl, tier, regenerateKey, topArtists, topTracks, getNuggetCache, setNuggetCache, setTrackListenCount]);

  useEffect(() => {
    cancelledRef.current = false;
    generate();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, [generate, regenerateKey]);

  // ── Wave 2/3 trigger ────────────────────────────────────────────────
  // Fire the next wave when all current nuggets have been consumed (last
  // timestamp passed + small buffer) AND the track has ≥45s remaining.
  // Uses batch JSON (not SSE) for subsequent waves — the UX priority is
  // "first nugget fast" which only applies to wave 1; waves 2/3 arrive
  // in the background while the user reads wave 1's content.
  useEffect(() => {
    if (currentWaveRef.current >= 3) return;        // cap reached
    if (waveInFlightRef.current) return;            // already generating
    if (nuggets.length === 0) return;               // wave 1 not yet landed
    if (!durationSec || durationSec < 90) return;   // track too short
    // Removed `if (!isPlaying) return;` — a deliberate pause shouldn't
    // halt background research. The "not enough time left" gate below
    // already covers the meaningful case where there's no remaining
    // playback to spend the nuggets on. Pete: "I noticed I never
    // received [wave-2 nuggets] because I was paused."
    if (cancelledRef.current) return;               // track changed / unmount
    if (Date.now() < waveCooldownUntilRef.current) return;  // recent failure, cooldown
    if (waveExhaustedRef.current) return;           // server returned 0 — no more for this track

    // Tap fan-out if we served from cache but only
    // have a single nugget (firstNuggetOnly partial), the user still
    // needs the rest of the tier-scaled set generated. Previously
    // `fromCache` blocked all wave extension which left every story
    // tap at exactly 1 nugget. Allow wave 2 when below the tier's
    // expected count.
    const expectedForTier = tier === "nerd" ? 9 : tier === "curious" ? 6 : 3;
    const isPartialCache = fromCache && nuggets.length < expectedForTier;
    if (fromCache && !isPartialCache) return;       // full-set cache, nothing to extend

    const lastTimestamp = Math.max(...nuggets.map((n) => n.timestampSec));
    if (currentTime < lastTimestamp + 5) return;    // user still consuming
    if (durationSec - currentTime < 45) return;     // not enough time left

    const nextWave = currentWaveRef.current + 1;
    const waveTrackId = trackId;
    // Hold off bumping currentWaveRef until we actually get nuggets back —
    // that way a transient failure on wave 2 doesn't permanently lock the
    // user out of wave 2 content for the rest of the session.
    let advancedWaveRef = false;
    waveInFlightRef.current = true;
    setWaveLoading(true);
    if (import.meta.env.DEV) console.log(`[NuggetWave ${nextWave}] firing — ${Math.floor(durationSec - currentTime)}s remaining, ${nuggets.length} nuggets so far`);

    (async () => {
      try {
        const previousHeadlines = nuggets.map((n) => n.headline || n.text).filter(Boolean);
        const spotifyUriMatch = trackId.match(/spotify:track:([a-zA-Z0-9]{22})/);
        const appleUriMatch = trackId.match(/apple:song:(\d+)/);
        const requestBody = {
          artist,
          collaborators,
          title,
          album,
          listenCount: nextWave,                     // unlocks deeper angles
          previousNuggets: previousHeadlines,        // cross-wave dedup
          tier,
          userTopArtists: topArtists?.slice(0, 10),
          userTopTracks: topTracks?.slice(0, 10),
          spotifyArtistImageUrl: artistImageUrl,
          spotifyTrackId: spotifyUriMatch?.[1],
          appleTrackId: appleUriMatch?.[1],
        };
        // 60s hard timeout — server cap is 90s but a wedged call
        // shouldn't pin waveInFlightRef true forever (the only thing
        // that releases it is this function's finally block). 60s
        // covers warm Gemini paths comfortably and aborts cold
        // starts that wandered off.
        const invokePromise = supabase.functions.invoke("generate-nuggets", { body: requestBody });
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ timedOut: true }), 60_000);
        });
        const raceResult = await Promise.race<
          Awaited<typeof invokePromise> | { timedOut: true }
        >([invokePromise, timeoutPromise]);
        // Clear the timer regardless of which side won — without this the
        // 60s closure stays scheduled even after the invoke resolves,
        // accumulating one stale timer per wave trigger over the session.
        if (timeoutId) clearTimeout(timeoutId);

        // Drop entirely only if the user genuinely navigated to a
        // DIFFERENT track. Unmount-cancellation (Listen → Browse) is
        // NOT a reason to discard — the OLD wave-2 fetch is still
        // valid for the OLD track's cache key, and writing the
        // result so the return visit hits a populated cache is the
        // whole point of "background research keeps going" (Pete:
        // "I thought we had fixed this?").
        if (waveTrackId !== currentTrackIdRef.current) {
          if (import.meta.env.DEV) console.log(`[NuggetWave ${nextWave}] dropped — user switched tracks`);
          return;
        }
        // Pure unmount cancellation: setState calls below will be
        // no-ops in React 18 (which is fine — we still want the
        // cache write to happen so a return visit sees the nuggets).
        if ("timedOut" in raceResult) {
          if (import.meta.env.DEV) console.warn(`[NuggetWave ${nextWave}] TIMEOUT after 60s — backing off`);
          return;
        }
        const { data, error } = raceResult;
        if (error) {
          if (import.meta.env.DEV) console.warn(`[NuggetWave ${nextWave}] error:`, error.message);
          return;
        }
        const newNuggetData = (data?.nuggets as AINuggetData[] | undefined) ?? [];
        if (newNuggetData.length === 0) {
          // Latch: the Validator stripped everything (typical for
          // sub-1k-listener artists with no Exa coverage). Don't burn
          // another Gemini call every 30s for the rest of the track.
          waveExhaustedRef.current = true;
          if (import.meta.env.DEV) console.log(`[NuggetWave ${nextWave}] server returned 0 nuggets — exhausted, no more retries for this track`);
          return;
        }

        // Assign timestamps in the post-last-existing-nugget window so the
        // new cards unlock after the user has finished with wave 1.
        const waveStart = Math.max(currentTime + 5, lastTimestamp + 10);
        const waveEnd = durationSec - 10;
        const waveSpan = Math.max(waveEnd - waveStart, 10);
        const waveSpacing = waveSpan / (newNuggetData.length + 1);

        const newNuggets: Nugget[] = [];
        const newSources = new Map<string, Source>();
        newNuggetData.forEach((n, i) => {
          const absoluteIndex = nuggets.length + i;
          const { sourceId, nuggetId } = makeIds(trackId, nextWave, absoluteIndex);
          const ts = Math.min(Math.floor(waveStart + waveSpacing * (i + 1)), durationSec - 5);
          newSources.set(sourceId, makeSource(sourceId, n.source));
          newNuggets.push(makeNugget(n, nuggetId, sourceId, trackId, ts));
        });

        // Dedup by id: defensive against a wave-2 effect re-fire that
        // would otherwise append the same set twice (e.g. if the
        // effect deps change before the previous wave's finally
        // block clears waveInFlightRef — possible during a profile
        // re-emit while a wave is in flight).
        setNuggets((prev) => {
          const have = new Set(prev.map((p) => p.id));
          const filtered = newNuggets.filter((n) => !have.has(n.id));
          return filtered.length ? [...prev, ...filtered] : prev;
        });
        setSources((prev) => {
          const next = new Map(prev);
          newSources.forEach((v, k) => next.set(k, v));
          return next;
        });
        // Only advance the wave counter now that we have new nuggets landed —
        // see the `let advancedWaveRef` comment above.
        currentWaveRef.current = nextWave;
        advancedWaveRef = true;
        if (import.meta.env.DEV) console.log(`[NuggetWave ${nextWave}] appended ${newNuggets.length} nuggets`);

        // Persist the accumulated set for future replays. Read current
        // state from refs rather than closures so we include any
        // sources/nuggets that arrived via SSE while this request was
        // in flight.
        const allNuggets = [...nuggetsRef.current, ...newNuggets];
        const allSources = new Map(sourcesRef.current);
        newSources.forEach((v, k) => allSources.set(k, v));

        // CRITICAL: also write the in-memory cache so a same-session
        // navigation away and back (Listen → Browse → mini-player tap
        // → Listen) restores the FULL set of nuggets the user was
        // viewing, not just the original pre-gen entry. Pete's report:
        // "I had nugget 3 visible, went to Browse, came back via mini-
        // player, only saw nugget 1 with everything else gone."
        // Without this write, the in-mem cache stays pinned to the
        // pre-gen entry; on remount useAINuggets hits in-mem first
        // (short-circuiting before DB), so wave 2/3 content
        // accumulated during the session evaporates. Match the SSE-
        // complete path's setNuggetCache call (line ~855).
        const inMemCacheKey = `${trackId}::${tier}::${regenerateKey}`;
        setNuggetCache(inMemCacheKey, {
          nuggets: allNuggets,
          sources: allSources,
          listenCount,
        });

        // Non-fatal: persist to DB too so cross-session replays benefit.
        try {
          const dbCacheKey = canonicalCacheKey(trackId, tier);
          const cacheSourcesObj: Record<string, Source> = {};
          allSources.forEach((src, key) => { cacheSourcesObj[key] = src; });
          await supabase.from("nugget_cache").upsert(
            { track_id: dbCacheKey, nuggets: allNuggets as unknown as Json, sources: cacheSourcesObj as unknown as Json, status: "ready" },
            { onConflict: "track_id" },
          );
        } catch (e) {
          if (import.meta.env.DEV) console.warn(`[NuggetWave ${nextWave}] cache upsert failed (non-fatal)`, e);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (import.meta.env.DEV) console.warn(`[NuggetWave ${nextWave}] threw:`, e);
      } finally {
        waveInFlightRef.current = false;
        setWaveLoading(false);
        // If we exited without advancing the wave counter, the attempt
        // either errored or came back empty. Apply the cooldown so the
        // effect doesn't re-fire immediately on the next currentTime tick.
        if (!advancedWaveRef) {
          waveCooldownUntilRef.current = Date.now() + 30_000;
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nuggets/sources read at trigger time, not subscribed
  }, [currentTime, nuggets.length, durationSec, isPlaying, trackId, artist, title, album, tier, fromCache, regenerateKey, listenCount, setNuggetCache]);

  return { nuggets, sources, loading, error, listenCount, artistSummary, fromCache, waveLoading };
}
