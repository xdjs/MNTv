import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Nugget, Source } from "@/mock/types";
import { usePlayer } from "@/contexts/PlayerContext";
import { getSeedListenNuggets } from "@/data/seedNuggets";

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
  const earlyStart = 20;
  const endBuffer = 15;
  const usable = Math.max(durationSec - earlyStart - endBuffer, 30);
  const spacing = usable / (totalNuggets + 1);
  return Math.min(Math.floor(earlyStart + spacing * (index + 1)), durationSec - 10);
}

function makeNugget(n: AINuggetData, nuggetId: string, sourceId: string, trackId: string, timestampSec: number): Nugget {
  return {
    id: nuggetId, trackId, timestampSec, durationMs: 7000,
    headline: n.headline, text: n.text, kind: n.kind,
    listenFor: n.listenFor || false, sourceId,
    imageUrl: n.imageUrl, imageCaption: n.imageCaption,
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
      const nuggs = data.nuggets as Nugget[];
      const srcs = new Map<string, Source>();
      for (const [key, val] of Object.entries(data.sources as Record<string, Source>)) {
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
  topTracks?: string[]
): UseAINuggetsResult {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listenCount, setListenCount] = useState(1);
  const [artistSummary, setArtistSummary] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const { getNuggetCache, setNuggetCache, getTrackListenCount, setTrackListenCount } = usePlayer();
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Track when the last generation attempt started — used to only debounce
  // on rapid skips (< 5s between tracks), not on first page load.
  const lastGenTimestampRef = useRef(0);

  const generate = useCallback(async () => {
    if (!artist || !title) return;
    setFromCache(false);

    // ── In-memory cache check ──────────────────────────────────────
    // Include regenerateKey so repeat listens (which bump the key) always
    // miss the cache and trigger fresh generation.
    const cacheKey = `${trackId}::${tier}::${regenerateKey}`;

    const cached = getNuggetCache(cacheKey);
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
    // Tier-scoped key for nugget_cache DB table — different tiers get different cached nuggets
    const dbCacheKey = `${trackId}::${tier}`;

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
      let currentListenCount = 1;
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

          const earlyStart = 20;
          const endBuffer = 15;
          const usableDuration = Math.max(durationSec - earlyStart - endBuffer, 30);
          const spacing = usableDuration / (seedData.length + 1);
          const timestampSec = Math.floor(earlyStart + spacing * (i + 1));

          return {
            id: nuggetId,
            trackId,
            timestampSec: Math.min(timestampSec, durationSec - 10),
            durationMs: 7000,
            headline: n.headline,
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

      // ── Check nugget_cache for first listen ──────────────────────
      // Skip DB cache when regenerateKey > 0 — that means the track was
      // completed and the user is re-listening; always generate fresh.
      if (currentListenCount <= 1 && regenerateKey === 0) {
        const { data: cached } = await supabase
          .from("nugget_cache")
          .select("nuggets, sources, status")
          .eq("track_id", dbCacheKey)
          .maybeSingle();

        if (cached?.status === "ready" && (cached.nuggets as Nugget[] | null)?.length) {
          if (import.meta.env.DEV) console.log("[NuggetCache] Serving cached nuggets for", dbCacheKey);
          const cachedNuggets = cached.nuggets as Nugget[];
          const cachedSources = new Map<string, Source>();
          const rawSources = cached.sources as Record<string, Source>;
          for (const [key, val] of Object.entries(rawSources)) {
            cachedSources.set(key, val);
          }
          if (cancelledRef.current) return;
          setNuggets(cachedNuggets);
          setSources(cachedSources);

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
      // Extract Spotify track ID from trackId (format: real::Artist::Title::Album::spotify:track:XXXXX)
      const spotifyUriMatch = trackId.match(/spotify:track:([a-zA-Z0-9]{22})/);
      const spotifyTrackIdValue = spotifyUriMatch?.[1];

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
      };

      // Get auth token for the request
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const authToken = authSession?.access_token || SUPABASE_ANON_KEY;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

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

        while (true) {
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
            try {
              const payload = JSON.parse(dataLine.slice(6));
              if (payload.type === "nugget") {
                aiNuggets.push(payload.nugget);
                const n = payload.nugget as AINuggetData;
                const { sourceId, nuggetId } = makeIds(trackId, currentListenCount, payload.index);
                const source = makeSource(sourceId, n.source);
                // Use provisional timestamp during streaming; recalculated after done
                const ts = makeTimestamp(payload.index, payload.totalExpected || aiNuggets.length, durationSec);
                const nugget = makeNugget(n, nuggetId, sourceId, trackId, ts);

                setSources((prev) => new Map(prev).set(sourceId, source));
                setNuggets((prev) => [...prev, nugget]);
                if (import.meta.env.DEV) console.log(`[SSE] Received nugget ${payload.index}: "${n.headline?.slice(0, 40)}"`);

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
              }
            } catch (e) { console.warn("[SSE] Malformed event:", dataLine, e); }
          }
        }

        // SSE complete — skip the old nugget processing below
        // Write to cache + history, then return
        if (cancelledRef.current) return;

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

        abortRef.current = null; // clear completed controller
        return; // SSE path complete — finally block handles setLoading(false)

      } else {
        // ── JSON fallback path ──
        const data = await response.json();
        if (data?.error) throw new Error(data.error);
        aiNuggets = data?.nuggets || [];
        aiArtistSummary = data?.artistSummary || "";
        aiExternalLinks = data?.externalLinks || [];
        aiNoTrackData = !!data?.noTrackData;
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
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
      // Remove the 'generating' sentinel so waiting clients don't poll indefinitely.
      if (sentinelClaimed) {
        // Wrap in Promise.resolve so .catch() is available (PostgrestFilterBuilder is PromiseLike, not Promise).
        await Promise.resolve(
          supabase.from("nugget_cache").delete().eq("track_id", dbCacheKey)
        ).catch(() => {});
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

  return { nuggets, sources, loading, error, listenCount, artistSummary, fromCache };
}
