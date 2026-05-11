/**
 * Shared client-side cache key builder for the in-memory nugget cache.
 *
 * Two callers must agree on the exact format byte-for-byte:
 *   - usePreGeneratedStories.ts WRITES the cache when pre-gen returns
 *     a successful response (in-memory prefill, so a tap on a pink-ring
 *     story shows the first nugget instantly).
 *   - useAINuggets.ts READS the cache on Listen page mount.
 *
 * A single character drift between the two sides silently voids the
 * whole "instant on tap" UX — the cache miss is invisible (just falls
 * through to a full SSE call). Centralizing the format here removes
 * that class of bug.
 *
 * Format: `${rawTrackId}::${tier}::${regenerateKey}` where rawTrackId
 * mirrors `listenHrefForStory`'s URL-encoded form so it matches what
 * Listen receives from React Router params (RR doesn't decode wildcard
 * route params, so the trackId arg to useAINuggets is already encoded).
 */

interface BuildClientCacheKeyOptions {
  artist: string;
  title: string;
  /** Spotify URI (`spotify:track:...`) or Apple URI (`apple:song:...`). */
  uri?: string;
  /** Tier the cache row was generated for. */
  tier: string;
  /** Repeat-listen key (0 for first listen, bumped on user-driven regen). */
  regenerateKey?: number;
}

export function buildClientNuggetCacheKey({
  artist,
  title,
  uri,
  tier,
  regenerateKey = 0,
}: BuildClientCacheKeyOptions): string {
  const enc = encodeURIComponent;
  // Album slot is intentionally blanked. Different entry points to the
  // same recording (story rail with empty album, search with album
  // populated, artist-profile tile, etc.) all need to land on the same
  // cache row. URI uniquely identifies the recording. canonicalCacheKey
  // in useAINuggets blanks album for the same reason.
  const rawTrackId = `real::${enc(artist)}::${enc(title)}::${enc("")}::${enc(uri ?? "")}`;
  return `${rawTrackId}::${tier}::${regenerateKey}`;
}
