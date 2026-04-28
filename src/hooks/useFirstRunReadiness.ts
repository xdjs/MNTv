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
 *   - MIN_STORIES stories have resolved AND MIN_ARTISTS artist-update
 *     rows have resolved (either returned data or confirmed empty).
 *   - MAX_WAIT_MS has elapsed since the hook mounted.
 *
 * Tuning:
 *   - MIN_STORIES = 2 — enough story rails to hide a first-paint with
 *     skeletons while the rest stream in.
 *   - MIN_ARTISTS = 2 — top-2 artist rows need to be populated so
 *     Browse opens with content above the fold. The 3rd artist
 *     continues fetching in the background and streams into its row
 *     once it lands, with the per-row skeleton covering the gap.
 *   - MAX_WAIT_MS = 15_000 — cold-path artist-updates can take ~8-10s
 *     for 2 artists at concurrency 2. 15s gives that window real
 *     headroom; beyond, impatience beats the gate and Browse's own
 *     per-row skeletons take over.
 */
// What we wait on before letting the user into Browse:
// - Artist updates: blocking. The "Your artists, lately" rail is the
//   first thing the user sees on /browse and looks broken with empty
//   skeletons; it has to be populated before we hand off.
// - Stories: NOT blocking. Pre-gen warms the per-track nugget cache
//   for future taps — the user doesn't need it to use Browse, and
//   waiting on it can mean 60-120s of Gemini cold starts. Stories
//   show their own per-card loading state on Browse.
const MIN_ARTISTS = 1;
// Higher ceiling than the prior 15s — a single artist on a cold cache
// can spend 30-60s in a Gemini call. Better to wait than to drop the
// user onto Browse with an empty rail.
const MAX_WAIT_MS = 90_000;

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

  // Only artist-updates block the gate. Stories continue loading on
  // Browse via their own per-card state.
  const enoughArtists = artistsTotal > 0 && artistsReady >= Math.min(MIN_ARTISTS, artistsTotal);
  const contentReady = enoughArtists;

  return {
    ready: contentReady || timedOut,
    storiesReady,
    storiesTotal,
    artistsReady,
    artistsTotal,
    skipAvailable,
  };
}
