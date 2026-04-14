/**
 * useSignOut — single source of truth for ending a user's session.
 *
 * Every consumer (Browse sign-out button, settings menu, session-expired
 * banner, tier-switch flow, etc.) should go through this hook so that:
 *   1. The Supabase session is actually invalidated server-side. Without
 *      `supabase.auth.signOut()` the JWT stays in localStorage, the
 *      Bearer token keeps working against authenticated edge functions,
 *      and useUserProfile re-hydrates the profile from DB on next mount.
 *   2. Every localStorage / sessionStorage key we've stamped during the
 *      user's session is wiped. Token cleanup goes through the hook
 *      module's top-level `clearSpotifyToken` / `clearAppleMusicToken`
 *      helpers instead of hardcoded string keys so a rename can't miss
 *      a call site.
 *   3. A hard reload tears down stateful singletons (Spotify Web
 *      Playback SDK, MusicKit JS instance) that would otherwise keep
 *      playing audio into an unauthenticated session, and avoids the
 *      ProtectedRoute re-render race that `navigate("/")` hits when
 *      clearProfile fires mid-render.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "./useMusicNerdState";
import { clearSpotifyToken } from "./useSpotifyToken";
import { clearAppleMusicToken } from "./useAppleMusicToken";

export function useSignOut() {
  const { clearProfile } = useUserProfile();

  const signOut = useCallback(async () => {
    // 1. Kill the Supabase session FIRST. This revokes the refresh token
    //    server-side, removes the `sb-*-auth-token` localStorage key, and
    //    fires `onAuthStateChange('SIGNED_OUT')` across all tabs so every
    //    listening component (AuthContext, useUserProfile) reacts.
    //    Swallow errors — we still want to clear local state on network
    //    failures so the user isn't stuck in a half-signed-in state.
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[useSignOut] supabase.auth.signOut failed:", err);
    }

    // 2. Wipe client-side state via the hooks' own helpers. Using the
    //    exported top-level functions avoids hardcoded key drift if
    //    STORAGE_KEY constants ever rename.
    clearProfile();
    clearSpotifyToken();
    clearAppleMusicToken();

    // 3. sessionStorage cleanup. Covers: post-OAuth redirect targets,
    //    pending Spotify taste blob that survives the OAuth round-trip,
    //    and any half-completed PKCE flow. All are session-scoped but
    //    cleaning them up explicitly avoids stale verifiers confusing a
    //    later sign-in attempt on the same tab.
    sessionStorage.removeItem("musicnerd_redirect");
    sessionStorage.removeItem("spotify_pending_taste");
    sessionStorage.removeItem("spotify_pkce_state");
    sessionStorage.removeItem("spotify_pkce_verifier");

    // 4. Hard navigate. See module-level comment for why this is a full
    //    page reload instead of React Router navigate().
    window.location.href = "/";
  }, [clearProfile]);

  return signOut;
}
