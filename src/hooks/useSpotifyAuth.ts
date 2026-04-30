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
  // No dev-experience guard here anymore. `signInWithOAuth` doesn't
  // consume VITE_SPOTIFY_CLIENT_ID — Supabase's server-side provider
  // config supplies the client id. The env-var precondition moved into
  // `refreshSpotifyToken` below where it actually matters. The supabase
  // client itself already logs a dev warning for missing VITE_SUPABASE_*
  // vars (src/integrations/supabase/client.ts).
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
  // This path (legacy PKCE tokens) actually needs the client id — it's
  // a POST body field Spotify requires. Fail fast with a message that
  // points at the env var if the build is missing it.
  if (!SPOTIFY_CLIENT_ID) {
    console.error("[refreshSpotifyToken] VITE_SPOTIFY_CLIENT_ID is not set — check .env.local");
    return null;
  }
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

// Hard ceiling on the spotify-taste invoke. Supabase's client doesn't
// impose one, so a wedged function (cold start stuck, Spotify rate-
// limited, network drop mid-stream) would hang the promise forever.
// Healthy warm calls land in 2-5s; cold starts in 7-10s. 20s gives
// cold starts real headroom without making a retry feel like an
// eternity.
const TASTE_FETCH_TIMEOUT_MS = 20_000;

/**
 * Fire-and-forget ping to wake the spotify-taste edge function so the
 * real call after OAuth return doesn't eat the cold-start latency.
 * Sends `{ accessToken: "prewarm" }`; the function passes that as a
 * Bearer token to Spotify which 401s immediately, returning before
 * any expensive work. Safe to call from Connect mount.
 *
 * FRAGILITY NOTE: this only works because spotify-taste is currently
 * `verify_jwt = false`, so the request reaches the function body and
 * gets short-circuited by Spotify's auth check. If spotify-taste is
 * ever flipped to `verify_jwt = true`, the request would 401 at the
 * Supabase auth layer (no/invalid JWT), the container wouldn't run,
 * and the prewarm would silently stop working. If you flip JWT here,
 * either drop this prewarm or add a server-side `if (accessToken ===
 * "prewarm") return new Response(...)` short-circuit so the warmup
 * doesn't depend on Spotify's response.
 */
export function prewarmSpotifyTaste(): void {
  // Use invoke() so we inherit the same transport + auth as the real
  // call — otherwise we might warm a different instance.
  supabase.functions
    .invoke("spotify-taste", { body: { accessToken: "prewarm" } })
    .catch(() => {
      // Any error is fine — we're just trying to boot the container.
    });
}

export async function fetchSpotifyTaste(accessToken: string): Promise<{
  topArtists: string[];
  topTracks: string[];
  artistImages: Record<string, string>;
  artistIds: Record<string, string>;
  trackImages: { title: string; artist: string; imageUrl: string; uri?: string }[];
  displayName: string | null;
} | null> {
  const t0 = performance.now();
  const elapsed = () => `${(performance.now() - t0).toFixed(0)}ms`;
  if (import.meta.env.DEV) console.info(`[spotify-taste] fetch started (timeout=${TASTE_FETCH_TIMEOUT_MS}ms)`);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), TASTE_FETCH_TIMEOUT_MS);
  });

  try {
    const invokePromise = supabase.functions.invoke("spotify-taste", {
      body: { accessToken },
    });

    let race: { timedOut: true } | Awaited<typeof invokePromise>;
    try {
      race = await Promise.race([invokePromise, timeoutPromise]);
    } catch (err) {
      // Network-level rejection — the invoke threw before returning
      // the { data, error } shape. Log and return null so the caller
      // surfaces the retry state instead of bubbling an unhandled rej.
      if (import.meta.env.DEV) console.error(`[spotify-taste] invoke threw after ${elapsed()}:`, err);
      return null;
    }

    if ("timedOut" in race) {
      if (import.meta.env.DEV) console.error(`[spotify-taste] timed out after ${TASTE_FETCH_TIMEOUT_MS}ms`);
      return null;
    }

    const { data, error } = race;
    if (error) {
      if (import.meta.env.DEV) console.error(`[spotify-taste] edge function error after ${elapsed()}:`, error);
      return null;
    }
    if (!data) {
      if (import.meta.env.DEV) console.error(`[spotify-taste] empty payload after ${elapsed()}`);
      return null;
    }

    if (import.meta.env.DEV) console.info(`[spotify-taste] succeeded in ${elapsed()} — ${data.topArtists?.length ?? 0} artists, ${data.topTracks?.length ?? 0} tracks`);

    return {
      topArtists: data.topArtists || [],
      topTracks: data.topTracks || [],
      artistImages: data.artistImages || {},
      artistIds: data.artistIds || {},
      trackImages: data.trackImages || [],
      displayName: data.displayName || null,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
