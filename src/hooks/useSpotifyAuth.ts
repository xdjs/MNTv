/**
 * Spotify PKCE OAuth — fully client-side.
 * Client ID is public by spec; stored as VITE_SPOTIFY_CLIENT_ID.
 * Token exchange is done directly with Spotify (no edge function needed for PKCE).
 * Only the taste-profile fetch hits our edge function (backend needs it for RAG).
 */

import { supabase } from "@/integrations/supabase/client";

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const SPOTIFY_SCOPES = "user-top-read user-read-recently-played user-read-private streaming user-read-playback-state user-modify-playback-state";

const PKCE_STATE_KEY = "spotify_pkce_state";
const PKCE_VERIFIER_KEY = "spotify_pkce_verifier";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64UrlEncode(array.buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(digest);
  return { verifier, challenge };
}

// ── Redirect URI ──────────────────────────────────────────────────────────────

export function getSpotifyRedirectUri(): string {
  const { protocol, hostname, port } = window.location;
  // Spotify rejects "localhost" — use explicit 127.0.0.1 for local dev
  const host = hostname === "localhost" ? "127.0.0.1" : hostname;
  const portSuffix = port ? `:${port}` : "";
  return `${protocol}//${host}${portSuffix}/spotify-callback`;
}

// ── Step 1: Kick off OAuth (redirect to Spotify) ──────────────────────────────

export async function initiateSpotifyAuth(): Promise<void> {
  if (!SPOTIFY_CLIENT_ID) throw new Error("VITE_SPOTIFY_CLIENT_ID is not set");

  const { verifier, challenge } = await generatePKCE();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)).buffer);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: getSpotifyRedirectUri(),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

// ── Step 2: Exchange code for token — directly with Spotify (PKCE, no secret) ─

export async function exchangeSpotifyCode(
  code: string,
  state: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  if (!savedState || savedState !== state || !codeVerifier) {
    console.error("PKCE state mismatch or missing verifier");
    return null;
  }

  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getSpotifyRedirectUri(),
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    console.error("Spotify token exchange failed:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.access_token
    ? {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || "",
        expiresIn: data.expires_in || 3600,
      }
    : null;
}

// ── Refresh token ────────────────────────────────────────────────────────────

export async function refreshSpotifyToken(
  refreshToken: string
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
    console.error("Spotify token refresh failed:", await res.text());
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

// ── Step 3: Fetch taste profile — via edge function (backend needs it for RAG) ─

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
