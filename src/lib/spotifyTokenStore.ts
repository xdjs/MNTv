/**
 * Shared storage contract for the Spotify playback token.
 *
 * Lifecycle — there are three writers and one reader:
 *   1. AuthContext's `bridgeSpotifyProviderTokens` copies tokens out of a
 *      Supabase session after OAuth completes (the post-migration path).
 *   2. `saveSpotifyToken` (useSpotifyToken) persists a token from the
 *      legacy PKCE callback or from refresh responses.
 *   3. `clearSpotifyToken` (useSpotifyToken) wipes the key on sign-out.
 *   Reader: `useSpotifyToken.readToken` — used by every playback consumer
 *   (engine, currently-playing poller, bookmark auth resolution).
 *
 * Every writer dispatches `TOKEN_CHANGED_EVENT` so mounted hook instances
 * re-sync from localStorage. A raw `localStorage.setItem` skips the event
 * and leaves the PlayerProvider's `hasSpotifyToken` stale — which was the
 * exact bug that kept the SDK from initializing after fresh OAuth in PR
 * #74. Centralizing the constants + bridge here is the defense against
 * that class of drift.
 */

import type { Session } from "@supabase/supabase-js";

export const SPOTIFY_STORAGE_KEY = "spotify_playback_token";
export const TOKEN_CHANGED_EVENT = "spotify-token-changed";

// Ephemeral handoff for post-OAuth Spotify taste data. The
// `useSpotifyPostSigninSync` hook writes to this key in sessionStorage
// after fetching taste from the edge function; Connect.tsx's existing
// effect consumes the same key and advances to the tier picker. Both
// sides must import this constant so a rename breaks the build rather
// than silently breaking the handoff.
export const SPOTIFY_PENDING_TASTE_KEY = "spotify_pending_taste";

export interface StoredSpotifyToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Copy Spotify provider tokens from a Supabase session into localStorage.
 * Idempotent + defensive:
 *   - no-op if the session is null or not from the Spotify provider
 *   - no-op if the session lacks a provider_token (post-JWT-refresh
 *     sessions DROP the provider token; Supabase doesn't persist it,
 *     so we must not overwrite what's already in localStorage with an
 *     empty string)
 *   - skips the write if an existing token has a longer expiry, so a
 *     freshly-refreshed client-side token isn't clobbered by a stale
 *     session-bound one on re-hydration
 *
 * Exported for unit testing.
 */
export function bridgeSpotifyProviderTokens(session: Session | null): void {
  if (!session?.provider_token) return;
  if (session.user?.app_metadata?.provider !== "spotify") return;
  // Skip the write if the session has no refresh token. Spotify requires
  // a refresh token to issue new access tokens, so persisting without one
  // would leave the Web Playback SDK stuck once the first access token
  // expires (~1h) with no path forward.
  if (!session.provider_refresh_token) return;

  // `session.expires_in` is strictly the Supabase JWT's TTL, not the
  // Spotify access token's TTL — the two refresh on independent
  // schedules. Both default to 3600s so they coincide today;
  // useSpotifyToken's 60s refresh buffer + the reconnect banner catch
  // any drift if Spotify ever changes its TTL.
  // TODO(cleanup): if Supabase ever surfaces a provider-scoped TTL
  // field (e.g. `provider_expires_at`), prefer that over expires_in.
  const expiresAt = Date.now() + ((session.expires_in ?? 3600) * 1000);

  if (typeof window === "undefined") return;

  const existingRaw = localStorage.getItem(SPOTIFY_STORAGE_KEY);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as StoredSpotifyToken;
      if (existing.expiresAt > expiresAt) return;
    } catch {
      // fall through — bad JSON, overwrite
    }
  }

  const token: StoredSpotifyToken = {
    accessToken: session.provider_token,
    refreshToken: session.provider_refresh_token,
    expiresAt,
  };
  localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(token));
  window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
}
