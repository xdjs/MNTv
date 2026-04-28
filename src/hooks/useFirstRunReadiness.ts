import { useEffect, useState } from "react";
import { useArtistUpdatesContext } from "@/contexts/ArtistUpdatesContext";

/**
 * Decides when the "preparing your experience" splash can hand the
 * user off to Browse. Reads from `ArtistUpdatesContext` so we measure
 * the same pre-gen the app already kicked off on profile hydration —
 * no duplicate requests.
 *
 * Gating policy:
 * - Artist updates BLOCK the hand-off. The "Your artists, lately" rail
 *   is the first thing on /browse and looks broken with empty
 *   skeletons; it has to be populated before we advance.
 * - Stories DO NOT block. Pre-gen warms the per-track nugget cache for
 *   future taps — the user doesn't need it to use Browse. Including
 *   stories here would mean 60-120s of Gemini cold starts on the
 *   splash. Stories show their own per-card loading state on Browse.
 *
 * "Ready" is the FIRST of:
 *   - MIN_ARTISTS artist-update rows have resolved (data or confirmed empty).
 *   - MAX_WAIT_MS has elapsed since the hook mounted.
 */

const MIN_ARTISTS = 1;
// Higher ceiling than the prior 15s — a single artist on a cold cache
// can spend 30-60s in a Gemini call. Better to wait than to drop the
// user onto Browse with an empty rail.
const MAX_WAIT_MS = 90_000;

export interface FirstRunReadiness {
  ready: boolean;
  artistsReady: number;
  artistsTotal: number;
  /** True after 3s — used to reveal the manual "Jump in" escape hatch. */
  skipAvailable: boolean;
}

export function useFirstRunReadiness(): FirstRunReadiness {
  const {
    totalCount: artistsTotal,
    readyCount: artistsReady,
  } = useArtistUpdatesContext();

  const [timedOut, setTimedOut] = useState(false);
  const [skipAvailable, setSkipAvailable] = useState(false);
  useEffect(() => {
    const skipTimer = setTimeout(() => setSkipAvailable(true), 3_000);
    const maxTimer = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => {
      clearTimeout(skipTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  const enoughArtists = artistsTotal > 0 && artistsReady >= Math.min(MIN_ARTISTS, artistsTotal);
  const contentReady = enoughArtists;

  return {
    ready: contentReady || timedOut,
    artistsReady,
    artistsTotal,
    skipAvailable,
  };
}
