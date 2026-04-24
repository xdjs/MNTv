/**
 * Spotify auth helpers — Supabase-managed OAuth.
 *
 * `signInWithSpotify` delegates the whole OAuth dance to Supabase's
 * built-in Spotify provider. Supabase redirects the user to Spotify,
 * exchanges the code server-side with `client_secret`, and sends the
 * user back to /connect with a real Supabase session. AuthContext's
 * `onAuthStateChange` then bridges `session.provider_token` +
 * `session.provider_refresh_token` into localStorage via
 * `src/lib/spotifyTokenStore.ts` so the Web Playback SDK and
 * `useSpotifyToken` keep reading from the same shape they always have.
 *
 * `refreshSpotifyToken` remains for the tail of the migration: tokens
 * minted under the old PKCE flow (which used `client_id` only) are
 * still in localStorage for some users and can be refreshed without
 * the secret. New Supabase-issued tokens go through the
 * `spotify-refresh` edge function in `useSpotifyToken.getValidToken`
 * because Supabase's provider uses the server-side code flow that
 * requires `client_secret` — and the secret must not be shipped to
 * the browser.
 *
 * `fetchSpotifyTaste` is unchanged — it hits the `spotify-taste` edge
 * function with the caller's Spotify access token so the server can
 * build RAG-ready taste data.
 */

import { supabase } from "@/integrations/supabase/client";

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const SPOTIFY_SCOPES =
  "user-top-read user-read-recently-played user-read-private streaming user-read-playback-state user-modify-playback-state";

// ── Supabase-managed OAuth ────────────────────────────────────────────────────

/**
 * Trigger Supabase's Spotify OAuth provider. Scopes are passed per-call
 * (not configured in the dashboard) so rotating scopes doesn't need a
 * dashboard edit.
 */
export async function signInWithSpotify(): Promise<void> {
  // Guard against missing env in local/preview builds. Supabase's
  // signInWithOAuth will happily redirect with an invalid client id and
  // let Spotify return a generic error — this throws early with a
  // useful message the first time a dev forgets .env.local.
  if (!SPOTIFY_CLIENT_ID) throw new Error("VITE_SPOTIFY_CLIENT_ID is not set");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      scopes: SPOTIFY_SCOPES,
      redirectTo: `${window.location.origin}/connect`,
      // Force Spotify to re-prompt on every sign-in. Without this,
      // Spotify silently reuses the prior grant, so a user who
      // previously consented with a narrower scope set (before
      // `streaming` was required by the Web Playback SDK) would keep
      // their old grant and hit "Invalid token scopes" errors at every
      // play attempt. Supabase forwards `queryParams` as query string
      // parameters on the authorize URL, which is how we restore the
      // behavior the legacy PKCE flow had built in.
      queryParams: { show_dialog: "true" },
    },
  });
  if (error) {
    console.error("[signInWithSpotify] failed:", error);
    throw error;
  }
}

// ── Refresh (legacy PKCE fallback) ───────────────────────────────────────────
//
// Used by `useSpotifyToken.getValidToken` only when the primary
// `spotify-refresh` edge function returns null — which is the expected
// path for tokens that were issued under the old client-side PKCE flow
// (they only need `client_id` to refresh). Tokens issued by Supabase's
// provider carry a refresh token that requires `client_secret`, which
// we don't ship to the browser; those go through the edge function.

export async function refreshSpotifyToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    // Expected for Supabase-issued refresh tokens — they require the
    // client secret and so fail with 400 invalid_client. Caller falls
    // through to the edge function. Log at debug rather than error so
    // the expected failures are observable (revoked grants, Spotify API
    // shifts) without polluting the console on every refresh tick.
    console.debug(`[refreshSpotifyToken] legacy refresh returned ${res.status}; caller falls through`);
    return null;
  }

  const data = await res.json();
  return data.access_token
    ? {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 3600,
      }
    : null;
}

// ── Taste fetch — via edge function (backend needs it for RAG) ───────────────

export async function fetchSpotifyTaste(accessToken: string): Promise<{
  topArtists: string[];
  topTracks: string[];
  artistImages: Record<string, string>;
  artistIds: Record<string, string>;
  trackImages: { title: string; artist: string; imageUrl: string; uri?: string }[];
  displayName: string | null;
} | null> {
  const { data, error } = await supabase.functions.invoke("spotify-taste", {
    body: { accessToken },
  });

  if (error || !data) {
    console.error("Taste fetch error:", error);
    return null;
  }

  return {
    topArtists: data.topArtists || [],
    topTracks: data.topTracks || [],
    artistImages: data.artistImages || {},
    artistIds: data.artistIds || {},
    trackImages: data.trackImages || [],
    displayName: data.displayName || null,
  };
}
