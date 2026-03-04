/**
 * Spotify PKCE OAuth utilities
 * - generatePKCE: creates code_verifier + code_challenge
 * - initiateSpotifyAuth: redirects user to Spotify login
 * - exchangeSpotifyCode: exchanges auth code for access token via edge function
 * - fetchSpotifyTaste: fetches top artists + tracks via edge function
 */

import { supabase } from "@/integrations/supabase/client";

const SPOTIFY_SCOPES = [
  "user-top-read",
  "user-read-recently-played",
  "user-read-private",
].join(" ");

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

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(digest);

  return { verifier, challenge };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getSpotifyRedirectUri(): string {
  const { protocol, hostname, port } = window.location;
  // Spotify rejects generic "localhost" — use explicit 127.0.0.1 for local dev
  const host = hostname === "localhost" ? "127.0.0.1" : hostname;
  const portSuffix = port ? `:${port}` : "";
  return `${protocol}//${host}${portSuffix}/spotify-callback`;
}

export async function initiateSpotifyAuth(): Promise<void> {
  // Get client ID from edge function
  const { data, error } = await supabase.functions.invoke("spotify-taste", {
    body: { action: "config" },
  });
  if (error || !data?.clientId) throw new Error("Could not load Spotify config");

  const { verifier, challenge } = await generatePKCE();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)).buffer);

  // Persist for callback
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: data.clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: getSpotifyRedirectUri(),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeSpotifyCode(
  code: string,
  state: string
): Promise<{ accessToken: string } | null> {
  const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  if (!savedState || savedState !== state || !codeVerifier) {
    console.error("PKCE state mismatch or missing verifier");
    return null;
  }

  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  const { data, error } = await supabase.functions.invoke("spotify-taste", {
    body: {
      action: "exchange",
      code,
      codeVerifier,
      redirectUri: getSpotifyRedirectUri(),
    },
  });

  if (error || !data?.access_token) {
    console.error("Token exchange error:", error, data);
    return null;
  }

  return { accessToken: data.access_token };
}

export async function fetchSpotifyTaste(accessToken: string): Promise<{
  topArtists: string[];
  topTracks: string[];
  displayName: string | null;
} | null> {
  const { data, error } = await supabase.functions.invoke("spotify-taste", {
    body: { action: "taste", accessToken },
  });

  if (error || !data) {
    console.error("Taste fetch error:", error);
    return null;
  }

  return {
    topArtists: data.topArtists || [],
    topTracks: data.topTracks || [],
    displayName: data.displayName || null,
  };
}
