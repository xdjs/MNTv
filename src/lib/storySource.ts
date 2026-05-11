// Story source selection — implements the cascade window for the
// Stories rail. Pete's spec (2026-05-10):
//   "Your Stories is based on latest liked tracks. Lets do liked in
//    the last 15 days and rotates on that, once that's exhausted and
//    no new tracks have been found, we can look back further to 30
//    days or more. Tap a story → it clears from my stories and
//    presents a new track."
//
// Cascade order (each window keeps tracks from PRIOR windows excluded):
//   1. liked-in-last-15d, unvisited
//   2. liked-in-last-30d, unvisited
//   3. liked-in-last-60d, unvisited
//   4. liked-in-last-365d, unvisited
//   5. all liked tracks, unvisited
//   6. fall back to topTracks/trackImages (the old short_term top-track list)
//
// Returns up to `targetCount` tracks. Caller (StoriesContext) hands the
// result to usePreGeneratedStories which doesn't care which cascade
// stage they came from.

import type { UserProfile } from "@/mock/types";
import { readVisited, type VisitedMap } from "./storyVisited";

type Track = NonNullable<UserProfile["trackImages"]>[number];
type LikedTrack = NonNullable<UserProfile["likedTracks"]>[number];

export interface StorySourceResult {
  tracks: Track[];
  /** Which cascade stage produced the result. Used for logging /
   *  observability so we can tell at a glance whether a user is on
   *  fresh likes vs falling back. */
  source:
    | "liked-15d"
    | "liked-30d"
    | "liked-60d"
    | "liked-365d"
    | "liked-all"
    | "top-tracks"
    | "empty";
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WINDOWS_DAYS = [15, 30, 60, 365];

/** Convert a LikedTrack to the same Track shape usePreGeneratedStories
 *  expects. The `addedAt` field is dropped — pre-gen doesn't care. */
function toTrack(l: LikedTrack): Track {
  return {
    title: l.title,
    artist: l.artist,
    collaborators: l.collaborators,
    imageUrl: l.imageUrl,
    uri: l.uri,
  };
}

function trackKey(t: { artist: string; title: string }): string {
  return `${t.artist}::${t.title}`;
}

export function selectStorySource(
  profile: UserProfile | null,
  targetCount: number,
  visited?: VisitedMap,
): StorySourceResult {
  if (!profile) return { tracks: [], source: "empty" };
  const visitedMap = visited ?? readVisited();

  const liked = profile.likedTracks ?? [];
  const top = profile.trackImages ?? [];

  // Helper: filter liked tracks to a date window + unvisited + has URI.
  const inWindow = (days: number): LikedTrack[] => {
    const cutoff = Date.now() - days * ONE_DAY_MS;
    return liked.filter((l) => {
      if (!l.uri) return false;
      if (visitedMap.has(trackKey(l))) return false;
      if (!l.addedAt) return false;
      const t = Date.parse(l.addedAt);
      return Number.isFinite(t) && t >= cutoff;
    });
  };

  // Cascade through 15d → 30d → 60d → 365d. Returns the FIRST window
  // that contains AT LEAST `targetCount` tracks. A window with fewer
  // is skipped entirely — we'd rather show 5 tracks from the 30d
  // window than 4 from the 15d window, since the user expects a full
  // rail. Trade-off: a few fresh sub-targetCount likes don't get
  // priority over a denser older window. Pete 2026-05-11 (review
  // note 4): if we want freshness-bias instead, accumulate across
  // windows and short-circuit when total >= targetCount.
  for (const days of WINDOWS_DAYS) {
    const windowTracks = inWindow(days);
    if (windowTracks.length >= targetCount) {
      return {
        tracks: windowTracks.slice(0, targetCount).map(toTrack),
        source: `liked-${days}d` as StorySourceResult["source"],
      };
    }
  }

  // No window had ≥ targetCount. Try ALL liked tracks (any age, just
  // unvisited + has URI).
  const allLikedUnvisited = liked.filter(
    (l) => !!l.uri && !visitedMap.has(trackKey(l)),
  );
  if (allLikedUnvisited.length > 0) {
    return {
      tracks: allLikedUnvisited.slice(0, targetCount).map(toTrack),
      source: "liked-all",
    };
  }

  // Final fallback: topTracks (the old short_term top-track list).
  // Filter the same way: unvisited + has URI.
  const topUnvisited = top.filter(
    (t) => !!t.uri && !visitedMap.has(trackKey(t)),
  );
  if (topUnvisited.length > 0) {
    return {
      tracks: topUnvisited.slice(0, targetCount),
      source: "top-tracks",
    };
  }

  return { tracks: [], source: "empty" };
}
