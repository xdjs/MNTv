/**
 * useSignOut — single source of truth for ending a user's session.
 *
 * Hard reload at the end is intentional: it tears down the Spotify Web
 * Playback SDK + MusicKit JS singletons (which would otherwise keep
 * playing audio into an unauthenticated session) and avoids the
 * ProtectedRoute re-render race that React Router navigate("/") hits
 * when clearProfile fires mid-render.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearStoredProfile } from "./useMusicNerdState";
import { clearSpotifyToken } from "./useSpotifyToken";
import { clearAppleMusicToken } from "./useAppleMusicToken";
import { PKCE_STATE_KEY, PKCE_VERIFIER_KEY } from "./useSpotifyAuth";

/** Belt-and-suspenders cleanup of any Supabase-issued auth token in
 *  localStorage. supabase.auth.signOut() should remove the
 *  `sb-{ref}-auth-token` key itself, but auth-js v2's _signOut only
 *  calls _removeSession() when the network call to /auth/v1/logout
 *  succeeds (or returns a session-missing error). On a 5xx, network
 *  timeout, or CORS failure, the local key is NEVER cleared and the
 *  function returns { error } instead of throwing — which means the
 *  Bearer JWT survives the "logout" until expiry (~1 hour). This sweep
 *  guarantees the token is gone regardless. */
function nukeSupabaseAuthTokens(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /^sb-.*-auth-token$/.test(key)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) localStorage.removeItem(key);
}

export function useSignOut() {
  const signOut = useCallback(async () => {
    // 1. Kill the Supabase session FIRST. Wrapped in try/catch AND we
    //    also inspect the returned error: supabase-js v2 returns
    //    { error } on network/server failure rather than throwing, so
    //    the catch alone isn't enough to detect a failed signOut.
    //    Either way we proceed to the local cleanup below — half-
    //    signed-in is worse than fully-signed-out-locally.
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn("[useSignOut] supabase.auth.signOut returned error:", error);
    } catch (err) {
      console.warn("[useSignOut] supabase.auth.signOut threw:", err);
    }

    // 2. Belt-and-suspenders: explicitly remove any sb-*-auth-token
    //    keys. Closes the gap where supabase-js failed to clean up
    //    after a network error in step 1.
    nukeSupabaseAuthTokens();

    // 3. Wipe per-service client state via the top-level helpers.
    //    Each one dispatches its own change event so sibling hook
    //    instances and other tabs flip reactively.
    clearStoredProfile();
    clearSpotifyToken();
    clearAppleMusicToken();

    // 4. sessionStorage cleanup. PKCE keys are imported as constants
    //    instead of hardcoded so a rename in useSpotifyAuth picks up
    //    here automatically.
    sessionStorage.removeItem("musicnerd_redirect");
    sessionStorage.removeItem("spotify_pending_taste");
    sessionStorage.removeItem(PKCE_STATE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);

    // 5. Hard navigate. See module-level comment for why a full reload
    //    instead of React Router navigate().
    window.location.href = "/";
  }, []);

  return { signOut };
}
