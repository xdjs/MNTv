import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Apple Music uses a two-token system:
//   - Developer Token: ES256 JWT, generated server-side, 180-day lifetime.
//     Fetched from our apple-dev-token edge function.
//   - Music User Token: obtained via MusicKit.authorize() popup.
//     No refresh mechanism — if expired/revoked, user must re-authorize.

const STORAGE_KEY = "apple_music_token";
const TOKEN_SAVED_EVENT = "apple-music-token-saved";

interface StoredToken {
  musicUserToken: string;
  developerToken: string;
  devTokenExpiresAt: number;  // ms epoch
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

// In-flight promise dedup — concurrent callers share a single edge function
// invocation rather than firing N parallel requests.
let inFlightFetch: Promise<string | null> | null = null;

/** Fetch a fresh Developer Token from the edge function. */
export async function fetchAppleDeveloperToken(): Promise<string | null> {
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("apple-dev-token", { body: {} });
      if (error || !data?.token) {
        console.error("[AppleMusic] Failed to fetch developer token:", error);
        return null;
      }
      return data.token as string;
    } catch (err) {
      console.error("[AppleMusic] Developer token fetch exception:", err);
      return null;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

/** Persist a newly obtained token pair to localStorage. */
export function saveAppleMusicToken(musicUserToken: string, developerToken: string): void {
  // Developer token lifetime is 180 days server-side, but we refetch every 30 days
  // from the client to reduce staleness risk from key rotations.
  const devTokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  writeToken({ musicUserToken, developerToken, devTokenExpiresAt });
  // Notify same-tab listeners — the `storage` event only fires cross-tab.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOKEN_SAVED_EVENT));
  }
}

export function useAppleMusicToken() {
  const [hasMusicToken, setHasMusicToken] = useState(() => !!readToken());

  // Sync hasMusicToken with localStorage writes from outside this hook —
  //  • same tab: saveAppleMusicToken dispatches TOKEN_SAVED_EVENT
  //  • cross-tab: the native `storage` event fires when localStorage changes
  //    in another tab (add, update, or remove the key)
  // Event-driven instead of polling so we don't burn CPU forever after
  // clearToken() if the user never re-authorizes, and we correctly reflect
  // cross-tab clears (tab B logs out → tab A flips to hasMusicToken=false).
  useEffect(() => {
    const syncFromStorage = () => {
      const present = !!readToken();
      setHasMusicToken((prev) => (prev === present ? prev : present));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TOKEN_SAVED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TOKEN_SAVED_EVENT, syncFromStorage);
    };
  }, []);

  /** Return the stored Music User Token, or null if missing. No refresh — MUT is session-scoped. */
  const getMusicUserToken = useCallback((): string | null => {
    const token = readToken();
    return token?.musicUserToken ?? null;
  }, []);

  /** Return a valid Developer Token, refetching from the edge function if stale. */
  const getDeveloperToken = useCallback(async (): Promise<string | null> => {
    const stored = readToken();
    if (stored && Date.now() < stored.devTokenExpiresAt) {
      return stored.developerToken;
    }

    // Stale or missing — refetch
    const fresh = await fetchAppleDeveloperToken();
    if (!fresh) return null;

    if (stored) {
      // Keep existing MUT, refresh the developer token
      writeToken({
        ...stored,
        developerToken: fresh,
        devTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
    }
    return fresh;
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasMusicToken(false);
  }, []);

  return { hasMusicToken, getMusicUserToken, getDeveloperToken, clearToken };
}
