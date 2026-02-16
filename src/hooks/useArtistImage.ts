import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const imageCache = new Map<string, string | null>();

/**
 * Hook that fetches a real artist photo from MusicBrainz → Wikidata → Wikimedia Commons.
 * Falls back to the provided local image if the API doesn't return a result.
 */
export function useArtistImage(artistName: string, fallbackUrl: string): string {
  const [imageUrl, setImageUrl] = useState<string>(() => {
    const cached = imageCache.get(artistName);
    return cached ?? fallbackUrl;
  });

  useEffect(() => {
    // If already cached, use it
    if (imageCache.has(artistName)) {
      const cached = imageCache.get(artistName);
      setImageUrl(cached ?? fallbackUrl);
      return;
    }

    let cancelled = false;

    async function fetchImage() {
      try {
        const { data, error } = await supabase.functions.invoke("artist-image", {
          body: { artist: artistName, width: 600 },
        });

        if (cancelled) return;

        if (!error && data?.imageUrl) {
          imageCache.set(artistName, data.imageUrl);
          setImageUrl(data.imageUrl);
        } else {
          imageCache.set(artistName, null);
          setImageUrl(fallbackUrl);
        }
      } catch {
        if (!cancelled) {
          imageCache.set(artistName, null);
          setImageUrl(fallbackUrl);
        }
      }
    }

    fetchImage();
    return () => { cancelled = true; };
  }, [artistName, fallbackUrl]);

  return imageUrl;
}
