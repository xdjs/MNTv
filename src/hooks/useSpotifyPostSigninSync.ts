import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "./useMusicNerdState";
import { completeSpotifyConnect } from "./completeSpotifyConnect";

const PENDING_TASTE_KEY = "spotify_pending_taste";

/**
 * After Supabase's Spotify OAuth lands the user on /connect, this hook:
 *   1. Detects the fresh Spotify-provider session
 *   2. Skips if we already have Spotify taste data in the local profile
 *      (returning users don't need a second taste fetch)
 *   3. Skips for anonymous/non-Spotify sessions (Apple Music path)
 *   4. Calls `completeSpotifyConnect(provider_token)` to pull top artists/
 *      tracks and writes the patch to sessionStorage under the same key
 *      Connect.tsx's existing reader (`spotify_pending_taste`) expects.
 *
 * Design note (T2): the patch is EPHEMERAL — this hook does NOT call
 * saveProfile. `handleTierSelect` in Connect.tsx is still the single
 * write point for the localStorage profile, preserving the invariant
 * "profile exists = onboarding complete" that Task 6.5's route gate
 * depends on.
 */
export function useSpotifyPostSigninSync(): void {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  // Guards against re-firing the taste fetch on every re-render of Connect.
  // Scoped per user id so switching accounts re-runs the sync.
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.app_metadata?.provider !== "spotify") return;
    // Skip if this user id has already been synced in this session.
    if (syncedUserIdRef.current === user.id) return;
    // Skip if the local profile already has Spotify taste data — the user
    // is returning, not newly signing in.
    if (profile?.streamingService === "Spotify" && (profile?.topArtists?.length ?? 0) > 0) {
      syncedUserIdRef.current = user.id;
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.provider_token;
      if (!accessToken) {
        // Post-JWT-refresh sessions drop provider_token. Don't mark this
        // user as synced — we want to retry once a fresh OAuth lands.
        return;
      }

      const patch = await completeSpotifyConnect(accessToken);
      if (cancelled || !patch) return;

      // Write the patch to sessionStorage so Connect.tsx's existing
      // reader picks it up and advances to the tier picker. Same key
      // the legacy SpotifyCallback.tsx used, so no change on the
      // Connect.tsx read side.
      const payload = {
        displayName: patch.spotifyDisplayName ?? null,
        topArtists: patch.topArtists ?? [],
        topTracks: patch.topTracks ?? [],
        artistImages: patch.artistImages ?? {},
        artistIds: patch.artistIds ?? {},
        trackImages: patch.trackImages ?? [],
      };
      try {
        sessionStorage.setItem(PENDING_TASTE_KEY, JSON.stringify(payload));
      } catch {
        // Quota or storage disabled — worst case the user sees the
        // connect screen again and has to re-click. Not fatal.
      }
      syncedUserIdRef.current = user.id;
    })();
    return () => { cancelled = true; };
    // `profile?.topArtists?.length` (not `.topArtists`) is the stable dep:
    // the length flipping 0→N is what ends the short-circuit, and using
    // the array identity would re-fire on every saveProfile call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.app_metadata?.provider, profile?.streamingService, profile?.topArtists?.length]);
}
