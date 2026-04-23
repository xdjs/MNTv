import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refreshSpotifyToken } from "./useSpotifyAuth";

const STORAGE_KEY = "spotify_playback_token";
const TOKEN_CHANGED_EVENT = "spotify-token-changed";

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Call the server-side spotify-refresh edge function. Returns null if the
// function is missing (not yet deployed) or if Spotify rejected the refresh
// token; caller falls back to the legacy client-side path in that case.
async function refreshViaEdgeFunction(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  try {
    const { data, error } = await supabase.functions.invoke("spotify-refresh", {
      body: { refreshToken },
    });
    if (error) {
      // 404 (function not deployed) and 401 (no Supabase session yet) both
      // land here as soft errors — let the caller try the client-side path.
      return null;
    }
    if (!data?.accessToken) return null;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? refreshToken,
      expiresIn: data.expiresIn ?? 3600,
    };
  } catch {
    return null;
  }
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

// writeToken persists to localStorage AND dispatches TOKEN_CHANGED_EVENT so
// every mounted useSpotifyToken hook instance re-reads and re-sets state. All
// public writers (saveSpotifyToken, the refresh path below, clearSpotifyToken)
// go through this or mirror its dispatch — never raw localStorage.setItem.
function writeToken(token: StoredToken) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
  }
}

/** Save a freshly-exchanged OAuth token. Thin wrapper around writeToken that
 *  guarantees the TOKEN_CHANGED_EVENT dispatch (see writeToken above).
 *  Exported so SpotifyCallback and other non-React callers can persist the
 *  token without mounting the hook. Without the event, a raw
 *  localStorage.setItem would leave PlayerProvider's hasSpotifyToken stale
 *  and the Spotify engine wouldn't initialize until the next hard refresh. */
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

    // Need to refresh. Prefer the server-side spotify-refresh edge fn —
    // Supabase-issued Spotify refresh tokens require client_secret which
    // lives in edge-fn secrets, not the browser. Fall back to the legacy
    // client-side refreshSpotifyToken for tokens that were minted under
    // the old PKCE flow (still in localStorage from before the OAuth
    // migration); those use client_id only, so the browser call works.
    const refreshed = await refreshViaEdgeFunction(token.refreshToken)
      ?? await refreshSpotifyToken(token.refreshToken);
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
