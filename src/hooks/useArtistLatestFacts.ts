import { edgeFunctionName } from "@/lib/edgeFunctionName";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";
import { readAppleStorefront } from "@/lib/appleStorefront";
import { isReadableUpdate } from "@/lib/artistUpdateKind";

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
 *
 * Returns only updates with something to read. The same response also
 * carries Browse's `kind: "track"` play targets, which have no body —
 * see isReadableUpdate. Filtering here rather than in the component
 * means the hook's name matches what it returns.
 */
export function useArtistLatestFacts(
  artistName: string | null,
  tier: "casual" | "curious" | "nerd",
  artistId?: string,
  service: "apple" | "spotify" = "spotify",
): { updates: ArtistUpdate[]; loading: boolean } {
  const storefront = service === "apple" ? readAppleStorefront() : "";
  const [updates, setUpdates] = useState<ArtistUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artistName) {
      setUpdates([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setUpdates([]);
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(edgeFunctionName("artist-updates"), {
          body: { artist: artistName, tier, ...(service === "apple" ? { service, storefront, artistId } : artistId ? { spotifyArtistId: artistId } : {}) },
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
        // The edge function returns Browse's play targets in the same
        // array. Those have no body, so "Latest Facts" would render
        // them as titles with nothing underneath.
        setUpdates(next.filter((u) => isReadableUpdate(u) && (artistId ? u.artistId === artistId : service !== "apple")));
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
  }, [artistName, tier, artistId, service, storefront]);

  return { updates, loading };
}
