import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Artist } from "@/mock/types";

const imageCache = new Map<string, string>();

const SKIP_API_LOOKUP = new Set(["Jamee Cornelia"]);

/**
 * Hook that enriches an array of artists with real photos from MusicBrainz/Wikidata.
 * Returns the same array with imageUrl potentially replaced by the real photo.
 * Falls back to the original imageUrl if the API doesn't return a result.
 */
export function useArtistImages(artists: Artist[]): Artist[] {
  const [enriched, setEnriched] = useState<Artist[]>(artists);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      // Only fetch for artists not already cached
      const toFetch = artists.filter((a) => !imageCache.has(a.name));

      if (toFetch.length === 0) {
        // All cached, apply immediately
        setEnriched(
          artists.map((a) => ({
            ...a,
            imageUrl: imageCache.get(a.name) || a.imageUrl,
          }))
        );
        return;
      }

      // Fetch sequentially with delays to respect MusicBrainz rate limits (1 req/sec)
      for (let i = 0; i < toFetch.length; i++) {
        if (cancelled) return;

        // Wait 1.5s between requests to stay well within rate limits
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }

        const artist = toFetch[i];
        try {
          const { data, error } = await supabase.functions.invoke("artist-image", {
            body: { artist: artist.name, width: 600 },
          });

          if (!error && data?.imageUrl) {
            imageCache.set(artist.name, data.imageUrl);
          } else {
            // Cache the fallback so we don't re-fetch
            imageCache.set(artist.name, artist.imageUrl);
          }
        } catch {
          imageCache.set(artist.name, artist.imageUrl);
        }

        // Update progressively after each fetch
        if (!cancelled) {
          setEnriched(
            artists.map((a) => ({
              ...a,
              imageUrl: imageCache.get(a.name) || a.imageUrl,
            }))
          );
        }
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [artists]);

  return enriched;
}
