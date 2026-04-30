import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

/**
 * Fetches the `ArtistUpdate[]` for a single artist. Hits the same
 * `artist-updates` edge function the Browse hook uses, so a cache row
 * warmed by Browse is instant on the artist profile.
 *
 * Scope is one-artist-at-a-time because the artist profile only ever
 * needs its own data — the multi-artist throttling + grouping in
 * `useArtistUpdates` would be overkill here.
 *
 * The hook returns quickly from cache on warm artists (users arriving
 * via a Browse nugget tap); a cold artist (e.g. navigated from "Fans
 * Also Like") triggers a fresh edge-function call with the usual
 * generation latency.
 */
export function useArtistLatestFacts(
  artistName: string | null,
  tier: "casual" | "curious" | "nerd",
): { updates: ArtistUpdate[]; loading: boolean } {
  const [updates, setUpdates] = useState<ArtistUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artistName) {
      setUpdates([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("artist-updates", {
          body: { artist: artistName, tier },
        });
        if (cancelled) return;
        if (error) {
          if (import.meta.env.DEV) {
            console.warn(`[artist-latest-facts] ${artistName} failed:`, error.message);
          }
          setUpdates([]);
          return;
        }
        const next = (data?.updates as ArtistUpdate[] | undefined) ?? [];
        setUpdates(next);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn(`[artist-latest-facts] ${artistName} threw:`, e);
        }
        setUpdates([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [artistName, tier]);

  return { updates, loading };
}
