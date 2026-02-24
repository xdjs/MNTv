import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Nugget, Source } from "@/mock/types";

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

export function useAINuggets(
  trackId: string,
  artist: string,
  title: string,
  album: string | undefined,
  durationSec: number,
  regenerateKey: number = 0,
  coverArtUrl?: string,
  artistImageUrl?: string
): UseAINuggetsResult {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listenCount, setListenCount] = useState(1);

  const generate = useCallback(async () => {
    if (!artist || !title) return;
    
    setLoading(true);
    setError(null);

    try {
      const trackKey = `${artist}::${title}`;

      // Query listen history
      let currentListenCount = 1;
      let previousNuggets: string[] = [];

      const { data: historyRow } = await supabase
        .from("nugget_history" as any)
        .select("*")
        .eq("track_key", trackKey)
        .maybeSingle();

      if (historyRow) {
        currentListenCount = (historyRow as any).listen_count || 1;
        previousNuggets = (historyRow as any).previous_nuggets || [];
      }

      setListenCount(currentListenCount);

      const { data, error: fnError } = await supabase.functions.invoke("generate-nuggets", {
        body: { artist, title, album, listenCount: currentListenCount, previousNuggets },
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
          // Store imageHint data temporarily for resolution
          imageCaption: n.imageHint?.caption,
        } as Nugget;
      });

      // ── Resolve images and apply visual rotation ──────────────────
      const visualSlotIndex = trackId.charCodeAt(0) % 3;

      // Resolve all imageHints in parallel
      const imageResults = await Promise.allSettled(
        aiNuggets.map((n) =>
          n.imageHint ? resolveImageHint(n.imageHint) : Promise.resolve(null)
        )
      );

      // Attach resolved imageUrls
      for (let i = 0; i < newNuggets.length; i++) {
        const result = imageResults[i];
        if (result?.status === "fulfilled" && result.value) {
          newNuggets[i].imageUrl = result.value;
          newNuggets[i].imageCaption = aiNuggets[i].imageHint?.caption;
        }
      }

      // Try to mark the visual slot, falling back if image resolution failed
      let visualAssigned = false;
      for (let attempt = 0; attempt < 3 && !visualAssigned; attempt++) {
        const idx = (visualSlotIndex + attempt) % 3;
        if (idx < newNuggets.length && newNuggets[idx].imageUrl) {
          newNuggets[idx].visualOnly = true;
          visualAssigned = true;
        }
      }

      // If no resolved images, ALWAYS assign a visual nugget using fallbacks
      if (!visualAssigned) {
        const fallbackIdx = visualSlotIndex % newNuggets.length;
        const nugget = newNuggets[fallbackIdx];
        if (nugget) {
          // Try artist image first (local asset, always reliable), then cover art
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

      // Upsert listen history
      const newHeadlines = newNuggets.map((n) => n.headline || n.text).filter(Boolean);
      const updatedPreviousNuggets = [...previousNuggets, ...newHeadlines];

      if (historyRow) {
        await supabase
          .from("nugget_history" as any)
          .update({
            listen_count: currentListenCount + 1,
            previous_nuggets: updatedPreviousNuggets,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("track_key", trackKey);
      } else {
        await supabase
          .from("nugget_history" as any)
          .insert({
            track_key: trackKey,
            listen_count: 1,
            previous_nuggets: newHeadlines,
          } as any);
      }
    } catch (e) {
      console.error("AI nugget generation failed:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [trackId, artist, title, album, durationSec, coverArtUrl, artistImageUrl]);

  useEffect(() => {
    generate();
  }, [generate, regenerateKey]);

  return { nuggets, sources, loading, error, listenCount };
}
