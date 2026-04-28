import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile, applyTastePatch } from "./useMusicNerdState";
import { fetchSpotifyTaste } from "./useSpotifyAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Silently re-pull the user's Spotify top-artists/top-tracks when the
 * cached snapshot is stale. Mounted once at the app level so the check
 * runs no matter which route the user lands on (a returning user with a
 * /listen bookmark never hits /connect).
 *
 * Why this exists:
 *   The /connect Navigate short-circuit (added to fix the post-OAuth
 *   route stall) means returning users skip `useSpotifyPostSigninSync`
 *   entirely. Without this, `profile.topArtists` etc. would be frozen
 *   from the user's first sign-in forever — Browse rails, ArtistUpdates,
 *   and AI nugget context would all use stale taste data.
 *
 * Why background, not blocking:
 *   The taste fetch is cheap (just hits Spotify's `top-artists` /
 *   `top-tracks` endpoints, no Gemini/Exa) and the UI doesn't need to
 *   wait — components re-render via the profile-updated event when the
 *   merge lands.
 *
 * Refresh policy:
 *   - First load with no `tasteRefreshedAt` (existing users pre-feature)
 *     → refresh
 *   - `tasteRefreshedAt` older than `TASTE_TTL_MS` → refresh
 *   - Otherwise skip
 */

const TASTE_TTL_MS = 24 * 60 * 60 * 1000;

interface BackgroundTasteRefreshState {
  /** True from the moment the fetch starts until it resolves (success or
   *  failure). Consumed by the global refresh indicator. */
  refreshing: boolean;
  /** ISO timestamp of the last refresh attempt that landed (success).
   *  Reflects what `tasteRefreshedAt` will be on the profile after the
   *  merge propagates. */
  lastRefreshedAt: string | null;
}

export function useBackgroundTasteRefresh(): BackgroundTasteRefreshState {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(
    profile?.tasteRefreshedAt ?? null
  );
  // Per-user guard — switching accounts re-runs the check. Without this
  // the effect would re-fire every render once `refreshing` flips back
  // to false, since neither user.id nor profile fields change.
  const refreshedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.app_metadata?.provider !== "spotify") return;
    if (!profile) return; // No profile yet → fresh sign-in path handles it
    if (refreshedForUserRef.current === user.id) return;

    const lastRefreshIso = profile.tasteRefreshedAt;
    const lastRefreshMs = lastRefreshIso ? Date.parse(lastRefreshIso) : 0;
    const ageMs = Date.now() - lastRefreshMs;
    if (lastRefreshIso && ageMs < TASTE_TTL_MS) {
      console.info(`[bg-taste-refresh] skip — fresh (${Math.round(ageMs / 1000 / 60)}m old)`);
      refreshedForUserRef.current = user.id;
      return;
    }

    refreshedForUserRef.current = user.id;
    let cancelled = false;
    const ageLabel = lastRefreshIso ? `${Math.round(ageMs / 1000 / 60 / 60)}h` : "never";
    console.info(`[bg-taste-refresh] start (last refresh: ${ageLabel})`);
    setRefreshing(true);

    (async () => {
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !sessionData.session?.provider_token) {
          console.warn("[bg-taste-refresh] no provider_token, skipping");
          return;
        }
        const taste = await fetchSpotifyTaste(sessionData.session.provider_token);
        if (cancelled) return;
        if (!taste) {
          console.warn("[bg-taste-refresh] fetch returned null — leaving cache untouched");
          return;
        }
        const merged = await applyTastePatch(
          {
            topArtists: taste.topArtists,
            topTracks: taste.topTracks,
            artistImages: taste.artistImages,
            artistIds: taste.artistIds,
            trackImages: taste.trackImages,
            spotifyDisplayName: taste.displayName ?? undefined,
          },
          user.id
        );
        if (cancelled) return;
        if (merged) {
          const now = new Date().toISOString();
          setLastRefreshedAt(now);
          console.info("[bg-taste-refresh] success");
        }
      } catch (err) {
        console.warn("[bg-taste-refresh] threw:", err);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => { cancelled = true; };
    // Deliberately exclude `profile` object identity from deps — only the
    // user identity matters. Once we've checked for a given user, we
    // don't re-check on every profile update (which the refresh itself
    // would trigger, causing an infinite loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.app_metadata?.provider]);

  return { refreshing, lastRefreshedAt };
}
