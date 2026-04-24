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
 * caller can merge into the app's `UserProfile`. Called from
 * `useSpotifyPostSigninSync` after Supabase OAuth lands on /connect.
 *
 * Returns `null` on fetch failure — caller decides how to surface.
 * Today: silent no-op on the sign-in path; `SpotifyReconnectBanner`
 * covers the refresh-failure path downstream.
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
