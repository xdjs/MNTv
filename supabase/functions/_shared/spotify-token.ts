// Shared Spotify Client Credentials token management.
// Import as: import { getSpotifyAppToken } from "../_shared/spotify-token.ts";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/** Get a Spotify app token via Client Credentials flow. Cached in-memory with 5-min early expiry. */
export async function getSpotifyAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Missing Spotify credentials");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 5 minutes early to avoid edge cases
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

/** Clear the cached token (e.g. on 401 to force re-auth). */
export function clearSpotifyAppToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}
