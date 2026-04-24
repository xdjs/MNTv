import type { UserProfile } from "@/mock/types";
import { fetchSpotifyTaste } from "@/hooks/useSpotifyAuth";

/**
 * Profile fields that a fresh Spotify taste fetch populates. Separated
 * from the full `UserProfile` so callers can merge the patch onto an
 * existing profile without overwriting tier/lastFm/etc.
 */
export type SpotifyProfilePatch = Pick<
  UserProfile,
  | "streamingService"
  | "spotifyDisplayName"
  | "topArtists"
  | "topTracks"
  | "artistImages"
  | "artistIds"
  | "trackImages"
>;

/**
 * Fetch the user's Spotify taste profile and reshape it into a patch the
 * caller can merge into the app's `UserProfile`. Extracted from the old
 * SpotifyCallback.tsx so the same logic runs from either:
 *   - the new post-signin effect in Connect.tsx (after Supabase OAuth)
 *   - the legacy callback page until Task 7 deletes it
 *
 * Returns `null` on fetch failure — caller decides how to surface (today:
 * silent no-op; Task 9 will wire a reconnect banner for the refresh case).
 */
export async function completeSpotifyConnect(
  accessToken: string,
): Promise<SpotifyProfilePatch | null> {
  const taste = await fetchSpotifyTaste(accessToken);
  if (!taste) return null;
  return {
    streamingService: "Spotify",
    spotifyDisplayName: taste.displayName ?? undefined,
    topArtists: taste.topArtists,
    topTracks: taste.topTracks,
    artistImages: taste.artistImages,
    artistIds: taste.artistIds,
    trackImages: taste.trackImages,
  };
}
