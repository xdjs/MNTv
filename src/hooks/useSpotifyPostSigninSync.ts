import { useEffect, useRef, useState } from "react";
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
export function useSpotifyPostSigninSync({ onSynced }: UseSpotifyPostSigninSyncOptions): {
  /** True from the moment the async taste fetch starts until it
   *  resolves (success or null). Consumers use this to show a loading
   *  state — otherwise the user waits on a blank Connect page while
   *  the fetch runs and often clicks "Sign in with Spotify" a second
   *  time, thinking nothing happened. */
  syncing: boolean;
  /** Non-null when the taste fetch failed (timeout, network, edge-fn
   *  error). Consumers should surface a retry affordance; otherwise
   *  the overlay silently dismisses back to the Connect screen and the
   *  user thinks their click did nothing. */
  syncError: string | null;
  /** Bumping this re-triggers the sync effect. Connect passes it as a
   *  dep so the "Try again" button in the overlay can re-run the
   *  taste fetch without kicking the user back through Spotify OAuth. */
  retrySync: () => void;
} {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
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
    // Wait for useUserProfile's DB hydration to settle before deciding
    // whether to fetch. Without this gate, a returning user (DB row
    // already has Spotify data) starts a fetch in run-1 against
    // profile=null, then profile loads + Connect navigates to
    // /preparing + ConnectInner unmounts + the in-flight fetch is
    // discarded as "cancelled (newer run started)". Wasted Spotify
    // API call and noisy console log. Letting profile settle first
    // routes returning users through the cache-hit short-circuit
    // below; new users still start the fetch correctly once
    // profileLoading flips false with profile=null.
    if (profileLoading) return;
    // Skip if the local profile already has Spotify taste data — the user
    // is returning, not newly signing in.
    if (profile?.streamingService === "Spotify" && (profile?.topArtists?.length ?? 0) > 0) {
      syncedUserIdRef.current = user.id;
      // Defensive: if a prior effect run started a sync (profile arrived
      // mid-fetch), its finally block won't flip syncing off because
      // `cancelled` is true. Clear it here — we know no work is running.
      setSyncing(false);
      setSyncError(null);
      return;
    }

    let cancelled = false;
    const runLabel = retryTick === 0 ? "initial" : `retry#${retryTick}`;
    console.info(`[post-signin-sync] ${runLabel} start for user=${user.id}`);
    setSyncError(null);
    // Defer the spinner — a returning user's DB-load merge usually
    // populates profile within ~200-400ms, which would re-fire the
    // effect with cache-hit and cancel this run. Showing the spinner
    // immediately causes a flash before /preparing takes over. If the
    // sync genuinely needs more than 600ms, the spinner kicks in.
    const spinnerDelay = setTimeout(() => {
      if (!cancelled) setSyncing(true);
    }, 600);
    (async () => {
      try {
        let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.warn(`[post-signin-sync] ${runLabel} getSession failed:`, error);
            if (!cancelled) setSyncError("We couldn't read your session. Try again?");
            return;
          }
          session = data.session;
        } catch (err) {
          // Network-level failure on getSession (rare but possible).
          // Don't mark as synced so a subsequent retry can succeed.
          console.warn(`[post-signin-sync] ${runLabel} getSession threw:`, err);
          if (!cancelled) setSyncError("We couldn't read your session. Try again?");
          return;
        }
        const accessToken = session?.provider_token;
        if (!accessToken) {
          // Post-JWT-refresh sessions drop provider_token. Don't mark
          // synced — we want to retry once a fresh OAuth lands.
          console.warn(`[post-signin-sync] ${runLabel} no provider_token on session`);
          if (!cancelled) setSyncError("Your Spotify access expired. Reconnect to continue.");
          return;
        }

        const patch = await completeSpotifyConnect(accessToken);
        if (cancelled) {
          console.info(`[post-signin-sync] ${runLabel} cancelled (newer run started)`);
          return;
        }
        if (!patch) {
          // fetchSpotifyTaste already logged the specific cause
          // (timeout / invoke error / missing payload). Surface a
          // generic retry message — the retry button in the overlay
          // re-fires the effect without bouncing through OAuth again.
          setSyncError("We couldn't read your Spotify taste. Try again?");
          return;
        }
        console.info(`[post-signin-sync] ${runLabel} success`);
        syncedUserIdRef.current = user.id;
        onSyncedRef.current(patch);
      } finally {
        // Always flip syncing off so the UI doesn't stay stuck in a
        // spinner — every error path above `return`s through here.
        clearTimeout(spinnerDelay);
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
      // Cancel the deferred spinner if it hasn't fired yet — keeps the
      // overlay from flashing on for a brief sync that gets cancelled
      // (returning user, DB hydration short-circuits).
      clearTimeout(spinnerDelay);
      // Defensive: ensure syncing flips off when this run is cancelled.
      // The next effect run might short-circuit (cache hit) and not call
      // setSyncing — without this, the spinner stays up forever.
      // React batches with the next run's setStates, so if the next run
      // starts a fresh sync (setSyncing(true)), that wins and overlay
      // stays correctly visible.
      setSyncing(false);
    };
    // `profile?.topArtists?.length` (not `.topArtists`) is the stable dep:
    // the length flipping 0→N is what ends the short-circuit, and using
    // the array identity would re-fire on every saveProfile call.
    // onSynced is intentionally excluded — it's read via ref to avoid
    // re-triggering when the caller's closure identity changes.
    // `retryTick` is included so calling `retrySync()` re-runs the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.app_metadata?.provider, profile?.streamingService, profile?.topArtists?.length, profileLoading, retryTick]);

  const retrySync = () => {
    // Clear the per-user guard so the effect doesn't short-circuit.
    syncedUserIdRef.current = null;
    // Synchronously set syncing=true so the overlay stays visible
    // through the render gap before the effect re-runs. Otherwise the
    // overlay briefly unmounts (visible=false while both syncing and
    // syncError are false) and triggers an exit/enter flicker. The
    // effect's finally block will flip it off correctly on completion.
    setSyncing(true);
    setSyncError(null);
    setRetryTick((n) => n + 1);
  };

  return { syncing, syncError, retrySync };
}
