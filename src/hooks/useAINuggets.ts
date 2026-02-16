import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Nugget, Source } from "@/mock/types";

interface AINuggetData {
  text: string;
  kind: "process" | "constraint" | "pattern" | "human" | "influence";
  listenFor?: boolean;
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
}

export function useAINuggets(
  trackId: string,
  artist: string,
  title: string,
  album: string | undefined,
  durationSec: number
): UseAINuggetsResult {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!artist || !title) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-nuggets", {
        body: { artist, title, album },
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

        // Create source with a reliable Google Search link instead of potentially hallucinated URLs
        const searchQuery = n.source.type === "youtube"
          ? `${n.source.title} ${n.source.publisher} site:youtube.com`
          : `${n.source.title} ${n.source.publisher}`;
        const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

        const source: Source = {
          id: sourceId,
          type: n.source.type,
          title: n.source.title,
          publisher: n.source.publisher,
          url: n.source.url || googleSearchUrl,
          embedId: n.source.embedId,
          quoteSnippet: n.source.quoteSnippet,
          locator: n.source.locator,
        };
        newSources.set(sourceId, source);

        // Distribute nuggets: first one early (8-15s), rest spread across remaining duration
        const earlyStart = 10;
        const usableDuration = durationSec - 20; // leave buffer at end
        const spacing = usableDuration / aiNuggets.length;
        const timestampSec = Math.floor(earlyStart + spacing * i);

        return {
          id: nuggetId,
          trackId,
          timestampSec: Math.min(timestampSec, durationSec - 10),
          durationMs: 7000,
          text: n.text,
          kind: n.kind,
          listenFor: n.listenFor || false,
          sourceId,
        };
      });

      setNuggets(newNuggets);
      setSources(newSources);
    } catch (e) {
      console.error("AI nugget generation failed:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [trackId, artist, title, album, durationSec]);

  useEffect(() => {
    generate();
  }, [generate]);

  return { nuggets, sources, loading, error };
}
