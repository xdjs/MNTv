import { useEffect, useState } from "react";
import { useStoriesContext } from "@/contexts/StoriesContext";
import { useArtistUpdatesContext } from "@/contexts/ArtistUpdatesContext";

/**
 * Decides when the "preparing your experience" splash can hand the
 * user off to Browse. Reads directly from the two hoisted contexts so
 * we're measuring the same pre-gen the app already kicked off on
 * profile hydration — no duplicate requests.
 *
 * "Ready" is the FIRST of:
 *   - MIN_READY stories have resolved AND MIN_READY artist updates
 *     have resolved (either returned data or confirmed empty).
 *   - MAX_WAIT_MS has elapsed since the hook mounted.
 *
 * Tuning:
 *   - MIN_READY = 2 is "enough to look full above the fold" without
 *     forcing the user to wait for everything. Raise if Browse still
 *     feels sparse on arrival.
 *   - MAX_WAIT_MS = 10_000 is the we-give-up-and-let-them-in ceiling.
 *     Beyond this, the user's impatience beats the content ready-state
 *     and Browse's own skeleton state takes over.
 */
const MIN_READY = 2;
const MAX_WAIT_MS = 10_000;

export interface FirstRunReadiness {
  ready: boolean;
  storiesReady: number;
  storiesTotal: number;
  artistsReady: number;
  artistsTotal: number;
  /** True after 3s — used to reveal the manual "Jump to Browse" escape hatch. */
  skipAvailable: boolean;
}

export function useFirstRunReadiness(): FirstRunReadiness {
  const { stories } = useStoriesContext();
  const {
    totalCount: artistsTotal,
    readyCount: artistsReady,
  } = useArtistUpdatesContext();

  // Stories resolve as items with ready=true. "Total" is whatever the
  // rail seeded, which may be zero while the profile is still being
  // hydrated — guard against zero so we don't claim readiness
  // vacuously.
  const storiesReady = stories.filter((s) => s.ready).length;
  const storiesTotal = stories.length;

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

  const enoughStories = storiesTotal > 0 && storiesReady >= Math.min(MIN_READY, storiesTotal);
  const enoughArtists = artistsTotal > 0 && artistsReady >= Math.min(MIN_READY, artistsTotal);
  const contentReady = enoughStories && enoughArtists;

  return {
    ready: contentReady || timedOut,
    storiesReady,
    storiesTotal,
    artistsReady,
    artistsTotal,
    skipAvailable,
  };
}
