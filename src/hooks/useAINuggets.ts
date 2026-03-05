import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Nugget, Source } from "@/mock/types";
import { usePlayer } from "@/contexts/PlayerContext";

interface ImageHint {
  type: "artist" | "album" | "wiki";
  query: string;
  caption: string;
}

interface AINuggetData {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery";
  listenFor?: boolean;
  imageHint?: ImageHint;
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

interface UseAINuggetsResult {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  loading: boolean;
  error: string | null;
  listenCount: number;
}

async function resolveImageHint(hint: ImageHint): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("nugget-image", {
      body: { type: hint.type, query: hint.query, width: 500 },
    });
    if (error || !data?.imageUrl) return null;
    return data.imageUrl;
  } catch {
    return null;
  }
}

// ── Sentinel poll helper ──────────────────────────────────────────────────────
// Called when another client's 'generating' sentinel is detected. Polls the DB
// every 3 seconds for up to 30 seconds waiting for status → 'ready'.
async function pollForReadyNuggets(
  trackId: string,
  maxAttempts = 10,
  intervalMs = 3000
): Promise<{ nuggets: Nugget[]; sources: Map<string, Source> } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { data } = await supabase
      .from("nugget_cache")
      .select("nuggets, sources, status")
      .eq("track_id", trackId)
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
  tier: "casual" | "curious" | "nerd" = "casual"
): UseAINuggetsResult {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listenCount, setListenCount] = useState(1);

  const { getNuggetCache, setNuggetCache } = usePlayer();
  const lastRegenerateKeyRef = useRef(regenerateKey);

  const generate = useCallback(async () => {
    if (!artist || !title) return;

    // ── In-memory cache check ──────────────────────────────────────
    const cacheKey = `${trackId}::${tier}`;
    const isRegenerate = regenerateKey !== lastRegenerateKeyRef.current;
    lastRegenerateKeyRef.current = regenerateKey;

    if (!isRegenerate) {
      const cached = getNuggetCache(cacheKey);
      if (cached) {
        console.log("[NuggetMemCache] Serving from in-memory cache:", cacheKey);
        setNuggets(cached.nuggets);
        setSources(cached.sources);
        setListenCount(cached.listenCount);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    // true once we own the 'generating' sentinel; reset to false after cache write succeeds
    let sentinelClaimed = false;

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

      setListenCount(currentListenCount);

      // ── Check nugget_cache for first listen ──────────────────────
      if (currentListenCount <= 1) {
        const { data: cached } = await supabase
          .from("nugget_cache")
          .select("nuggets, sources, status")
          .eq("track_id", trackId)
          .maybeSingle();

        if (cached?.status === "ready" && (cached.nuggets as Nugget[] | null)?.length) {
          console.log("[NuggetCache] Serving cached nuggets for", trackId);
          const cachedNuggets = cached.nuggets as Nugget[];
          const cachedSources = new Map<string, Source>();
          const rawSources = cached.sources as Record<string, Source>;
          for (const [key, val] of Object.entries(rawSources)) {
            cachedSources.set(key, val);
          }
          setNuggets(cachedNuggets);
          setSources(cachedSources);

          // Write to in-memory cache
          setNuggetCache(cacheKey, { nuggets: cachedNuggets, sources: cachedSources, listenCount: currentListenCount });

          // Upsert listen history so next time we generate fresh
          if (historyRow) {
            await supabase
              .from("nugget_history")
              .update({
                listen_count: currentListenCount + 1,
                previous_nuggets: cachedNuggets.map((n) => n.headline || n.text).filter(Boolean) as Json,
                updated_at: new Date().toISOString(),
              })
              .eq("track_key", trackKey)
              .eq("user_id", userId);
          } else {
            await supabase
              .from("nugget_history")
              .insert({
                track_key: trackKey,
                user_id: userId,
                listen_count: 2,
                previous_nuggets: cachedNuggets.map((n) => n.headline || n.text).filter(Boolean) as Json,
              });
          }

          setLoading(false);
          return;
        }

        if (cached?.status === "generating") {
          // Another client is already generating — poll every 3 s for up to 30 s.
          console.log("[NuggetCache] Generation in progress, polling…", trackId);
          const polled = await pollForReadyNuggets(trackId);
          if (polled) {
            console.log("[NuggetCache] Poll succeeded — serving result for", trackId);
            setNuggets(polled.nuggets);
            setSources(polled.sources);
            setNuggetCache(cacheKey, { nuggets: polled.nuggets, sources: polled.sources, listenCount: currentListenCount });
            setLoading(false);
            return;
          }
          // Timed out — the generating client likely crashed; remove stale sentinel.
          console.warn("[NuggetCache] Poll timed out — removing stale sentinel for", trackId);
          await supabase.from("nugget_cache").delete().eq("track_id", trackId);
        }

        // No cache entry (or stale sentinel removed) — claim the work.
        // The unique index on track_id means only one concurrent INSERT wins.
        // A duplicate INSERT returns PG error 23505; we ignore it and generate anyway
        // (acceptable rare edge case — at worst two clients generate simultaneously).
        const { error: claimError } = await supabase
          .from("nugget_cache")
          .insert({ track_id: trackId, status: "generating", nuggets: [], sources: {} });
        if (!claimError) {
          sentinelClaimed = true;
          console.log("[NuggetCache] Claimed generation sentinel for", trackId);
        } else if (claimError.code !== "23505") {
          // Unexpected error (not a unique violation) — log but proceed.
          console.warn("[NuggetCache] Sentinel insert error:", claimError.message);
        }
      }

      // ── Generate fresh nuggets via AI ─────────────────────────────
      const { data, error: fnError } = await supabase.functions.invoke("generate-nuggets", {
        body: { artist, title, album, listenCount: currentListenCount, previousNuggets, tier },
      });

      if (fnError) {
        throw new Error(fnError.message || "Failed to generate nuggets");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const aiNuggets: AINuggetData[] = data?.nuggets || [];

      const newSources = new Map<string, Source>();
      const newNuggets: Nugget[] = aiNuggets.map((n, i) => {
        const sourceId = `ai-src-${trackId}-${i}`;
        const nuggetId = `ai-nug-${trackId}-${i}`;

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

        // Distribute nuggets across track duration
        const earlyStart = 10;
        const usableDuration = durationSec - 20;
        const spacing = usableDuration / aiNuggets.length;
        const timestampSec = Math.floor(earlyStart + spacing * i);

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
          imageCaption: n.imageHint?.caption,
        } as Nugget;
      });

      // ── Resolve images and apply visual rotation ──────────────────
      const visualSlotIndex = trackId.charCodeAt(0) % 3;

      const imageResults = await Promise.allSettled(
        aiNuggets.map((n) =>
          n.imageHint ? resolveImageHint(n.imageHint) : Promise.resolve(null)
        )
      );

      for (let i = 0; i < newNuggets.length; i++) {
        const result = imageResults[i];
        if (result?.status === "fulfilled" && result.value) {
          newNuggets[i].imageUrl = result.value;
          newNuggets[i].imageCaption = aiNuggets[i].imageHint?.caption;
        }
      }

      let visualAssigned = false;
      for (let attempt = 0; attempt < 3 && !visualAssigned; attempt++) {
        const idx = (visualSlotIndex + attempt) % 3;
        if (idx < newNuggets.length && newNuggets[idx].imageUrl) {
          newNuggets[idx].visualOnly = true;
          visualAssigned = true;
        }
      }

      if (!visualAssigned) {
        const fallbackIdx = visualSlotIndex % newNuggets.length;
        const nugget = newNuggets[fallbackIdx];
        if (nugget) {
          const fallbackUrl = artistImageUrl || coverArtUrl;
          if (fallbackUrl) {
            nugget.imageUrl = fallbackUrl;
            nugget.imageCaption = nugget.imageCaption || nugget.headline;
            nugget.visualOnly = true;
            console.log("[NuggetVisual] Used fallback image for visual nugget:", fallbackUrl);
          } else {
            console.warn("[NuggetVisual] No fallback images available — all nuggets text-only");
          }
        }
      }

      setNuggets(newNuggets);
      setSources(newSources);

      // Write to in-memory cache
      setNuggetCache(cacheKey, { nuggets: newNuggets, sources: newSources, listenCount: currentListenCount });

      // ── Write to nugget_cache for future first-time listeners ─────
      // This is the primary deduplication fix: once the AI result is written here,
      // every subsequent first-listen to the same track hits the cache instead of
      // firing a new Gemini API call.
      if (currentListenCount <= 1) {
        const cacheSourcesObj: Record<string, Source> = {};
        newSources.forEach((src, key) => { cacheSourcesObj[key] = src; });
        await supabase.from("nugget_cache").upsert(
          {
            track_id: trackId,
            nuggets: newNuggets as unknown as Json,
            sources: cacheSourcesObj as unknown as Json,
            status: "ready",
          },
          { onConflict: "track_id" }
        );
        sentinelClaimed = false; // sentinel resolved — no cleanup needed if error occurs later
        console.log("[NuggetCache] Cached fresh nuggets for", trackId);
      }

      // ── Upsert listen history ─────────────────────────────────────
      const newHeadlines = newNuggets.map((n) => n.headline || n.text).filter(Boolean);
      const updatedPreviousNuggets = [...previousNuggets, ...newHeadlines];

      if (historyRow) {
        await supabase
          .from("nugget_history")
          .update({
            listen_count: currentListenCount + 1,
            previous_nuggets: updatedPreviousNuggets as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("track_key", trackKey)
          .eq("user_id", userId);
      } else {
        await supabase
          .from("nugget_history")
          .insert({
            track_key: trackKey,
            user_id: userId,
            listen_count: 1,
            previous_nuggets: newHeadlines as Json,
          });
      }
    } catch (e) {
      console.error("AI nugget generation failed:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
      // Remove the 'generating' sentinel so waiting clients don't poll indefinitely.
      if (sentinelClaimed) {
        // Wrap in Promise.resolve so .catch() is available (PostgrestFilterBuilder is PromiseLike, not Promise).
        await Promise.resolve(
          supabase.from("nugget_cache").delete().eq("track_id", trackId)
        ).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [trackId, artist, title, album, durationSec, coverArtUrl, artistImageUrl, tier, regenerateKey, getNuggetCache, setNuggetCache]);

  useEffect(() => {
    generate();
  }, [generate, regenerateKey]);

  return { nuggets, sources, loading, error, listenCount };
}
