import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "./useMusicNerdState";
import { completeSpotifyConnect, type SpotifyProfilePatch } from "@/lib/completeSpotifyConnect";

interface UseSpotifyPostSigninSyncOptions {
  /**
   * Called once with the freshly fetched Spotify taste patch after
   * Supabase OAuth lands a provider=spotify session on /connect. The
   * caller owns what to do with the patch — typically: feed pending-
   * state setters and advance onboarding's step.
   *
   * Not invoked for:
   *   - unauthenticated renders
   *   - non-Spotify provider sessions (Apple Music path)
   *   - users whose local profile already has Spotify taste data
   *   - sessions that have lost `provider_token` (post-JWT-refresh)
   *   - sync failures (the taste-fetch returned null)
   *
   * Scoped per user id — switching accounts re-fires the callback.
   */
  onSynced: (patch: SpotifyProfilePatch) => void;
}

/**
 * After Supabase's Spotify OAuth lands the user on /connect, this hook
 * fetches taste data and delivers it to the caller via `onSynced`.
 *
 * Earlier revisions wrote the patch into sessionStorage for Connect's
 * existing mount-time reader to pick up. That created a race: the
 * reader fired on mount (before auth resolved), saw nothing, and
 * never re-ran — so the async write never reached the UI. A
 * PR #75 review (claude[bot] round 6) caught this; the callback
 * pattern is the fix.
 *
 * The patch is EPHEMERAL — this hook does NOT call `saveProfile`.
 * `handleTierSelect` in Connect.tsx is still the single write point
 * for the localStorage profile, preserving the invariant
 * "profile exists = onboarding complete" that the route gate depends
 * on.
 */
export function useSpotifyPostSigninSync({ onSynced }: UseSpotifyPostSigninSyncOptions): void {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  // Stable ref for the callback so re-renders don't re-run the effect.
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  // Guard against re-firing on every re-render of Connect. Scoped per
  // user id so switching accounts re-runs the sync.
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.app_metadata?.provider !== "spotify") return;
    if (syncedUserIdRef.current === user.id) return;
    // Skip if the local profile already has Spotify taste data — the user
    // is returning, not newly signing in.
    if (profile?.streamingService === "Spotify" && (profile?.topArtists?.length ?? 0) > 0) {
      syncedUserIdRef.current = user.id;
      return;
    }

    let cancelled = false;
    (async () => {
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("[useSpotifyPostSigninSync] getSession failed:", error);
          return;
        }
        session = data.session;
      } catch (err) {
        // Network-level failure on getSession (rare but possible).
        // Don't mark as synced so a subsequent retry can succeed.
        console.warn("[useSpotifyPostSigninSync] getSession threw:", err);
        return;
      }
      const accessToken = session?.provider_token;
      if (!accessToken) {
        // Post-JWT-refresh sessions drop provider_token. Don't mark
        // synced — we want to retry once a fresh OAuth lands.
        return;
      }

      const patch = await completeSpotifyConnect(accessToken);
      if (cancelled || !patch) return;

      syncedUserIdRef.current = user.id;
      onSyncedRef.current(patch);
    })();
    return () => { cancelled = true; };
    // `profile?.topArtists?.length` (not `.topArtists`) is the stable dep:
    // the length flipping 0→N is what ends the short-circuit, and using
    // the array identity would re-fire on every saveProfile call.
    // onSynced is intentionally excluded — it's read via ref to avoid
    // re-triggering when the caller's closure identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.app_metadata?.provider, profile?.streamingService, profile?.topArtists?.length]);
}
