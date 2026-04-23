import { useCallback, useState, useEffect } from "react";
import { refreshSpotifyToken } from "./useSpotifyAuth";

const STORAGE_KEY = "spotify_playback_token";
const TOKEN_CHANGED_EVENT = "spotify-token-changed";

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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
  }
}

/** Save a freshly-exchanged OAuth token. Exported so SpotifyCallback and
 *  other non-React callers can write the token AND notify every mounted
 *  `useSpotifyToken` instance to flip `hasSpotifyToken` → true. Without
 *  this, a raw `localStorage.setItem` would persist the token but leave
 *  the PlayerProvider's token state stale, and the Spotify engine would
 *  never initialize until the next hard refresh. */
export function saveSpotifyToken(token: StoredToken): void {
  writeToken(token);
}

/** Clear the Spotify playback token from localStorage. Top-level helper
 *  so `useSignOut` and other callers outside a React tree can invalidate
 *  the token without mounting the `useSpotifyToken` hook. Dispatches
 *  TOKEN_CHANGED_EVENT so sibling hook instances flip hasSpotifyToken to
 *  false reactively, mirroring useAppleMusicToken's pattern. */
export function clearSpotifyToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
  }
}

export function useSpotifyToken() {
  const [hasSpotifyToken, setHasSpotifyToken] = useState(() => !!readToken());

  // Sync hasSpotifyToken with localStorage writes from outside this hook —
  //  • same tab: writeToken / clearSpotifyToken dispatch TOKEN_CHANGED_EVENT
  //  • cross-tab: the native `storage` event fires when localStorage
  //    changes in another tab (add, update, or remove the key)
  // Event-driven instead of polling so cross-tab sign-out (Tab A signs
  // out → Tab B's Spotify SDK should stop) propagates immediately, and
  // we don't burn CPU forever after a clearSpotifyToken if the user
  // never re-authorizes.
  useEffect(() => {
    const sync = () => {
      const present = !!readToken();
      setHasSpotifyToken((prev) => (prev === present ? prev : present));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TOKEN_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TOKEN_CHANGED_EVENT, sync);
    };
  }, []);

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
