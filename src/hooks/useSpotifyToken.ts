import { useCallback, useState, useEffect } from "react";
import { refreshSpotifyToken } from "./useSpotifyAuth";

const STORAGE_KEY = "spotify_playback_token";

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

function writeToken(token: StoredToken) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

/** Clear the Spotify playback token from localStorage. Top-level helper
 *  so `useSignOut` and other callers outside a React tree can invalidate
 *  the token without mounting the `useSpotifyToken` hook. */
export function clearSpotifyToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function useSpotifyToken() {
  const [hasSpotifyToken, setHasSpotifyToken] = useState(() => !!readToken());

  // Keep checking until the token appears (covers OAuth redirect storing token after mount)
  useEffect(() => {
    if (hasSpotifyToken) return;
    const id = setInterval(() => {
      if (readToken()) {
        setHasSpotifyToken(true);
        clearInterval(id);
      }
    }, 500);
    return () => clearInterval(id);
  }, [hasSpotifyToken]);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    const token = readToken();
    if (!token) return null;

    // Still valid (with 60s buffer)
    if (Date.now() < token.expiresAt - 60_000) {
      return token.accessToken;
    }

    // Need to refresh
    const refreshed = await refreshSpotifyToken(token.refreshToken);
    if (!refreshed) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const updated: StoredToken = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000,
    };
    writeToken(updated);
    return updated.accessToken;
  }, []);

  const clearToken = useCallback(() => {
    clearSpotifyToken();
    setHasSpotifyToken(false);
  }, []);

  return { hasSpotifyToken, getValidToken, clearToken };
}
