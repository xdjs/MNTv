// Story source selection — implements the cascade window for the
// Stories rail. Pete's spec (2026-05-10):
//   "Your Stories is based on latest liked tracks. Lets do liked in
//    the last 15 days and rotates on that, once that's exhausted and
//    no new tracks have been found, we can look back further to 30
//    days or more. Tap a story → it clears from my stories and
//    presents a new track."
//
// Cascade order — windows are nested (30d includes the 15d subset),
// so cross-window deduplication is done by `seenKeys` in the
// accumulator loop below, NOT by inWindow() itself. The accumulator
// walks freshest-first and only adds a track the first time it's
// seen, so a track in both the 15d and 30d windows is counted once
// and attributed to the 15d window.
//   1. liked-in-last-15d, unvisited
//   2. liked-in-last-30d, unvisited  (minus any already taken from 15d)
//   3. liked-in-last-60d, unvisited  (minus any already taken from 15d/30d)
//   4. liked-in-last-365d, unvisited (minus any already taken from prior)
//   5. all liked tracks, unvisited   (catch-all if 365d cap is too tight)
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

  // Cascade through 15d → 30d → 60d → 365d, accumulating the freshest
  // tracks first and falling back to wider windows only to fill the
  // remaining slots. A user with 4 likes in 15d and 8 likes in 30d
  // sees the 4 freshest first, then 1 from the 30d window — the
  // freshest content always surfaces, the rail still hits targetCount.
  // The `source` label reflects the WIDEST window we had to consult
  // so observability still tells us "this user's freshness profile."
  // switched from skip-on-partial
  // to accumulate-freshest-first per the WCAG/UX argument that fresh
  // is what the user actually wants.
  const accumulated: LikedTrack[] = [];
  const seenKeys = new Set<string>();
  let widestWindow = 0;
  for (const days of WINDOWS_DAYS) {
    if (accumulated.length >= targetCount) break;
    const windowTracks = inWindow(days);
    let contributedFromThisWindow = false;
    for (const t of windowTracks) {
      const k = trackKey(t);
      if (seenKeys.has(k)) continue;
      accumulated.push(t);
      seenKeys.add(k);
      contributedFromThisWindow = true;
      if (accumulated.length >= targetCount) break;
    }
    // Only update widestWindow when this window actually contributed
    // a track — otherwise the `source` label would falsely report
    // e.g. "liked-30d" for a user whose 30d window only contained
    // duplicates of their 15d window.
    if (contributedFromThisWindow) widestWindow = days;
  }
  if (accumulated.length >= targetCount) {
    return {
      tracks: accumulated.slice(0, targetCount).map(toTrack),
      source: `liked-${widestWindow}d` as StorySourceResult["source"],
    };
  }

  // No window had ≥ targetCount. Try ALL liked tracks (any age, just
  // unvisited + has URI). Order is preserved from `liked`, which
  // spotify-taste returns sorted `added_at desc` (newest first) per
  // Spotify's /me/tracks default. If that contract ever changes, the
  // freshest-first guarantee silently breaks here.
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
