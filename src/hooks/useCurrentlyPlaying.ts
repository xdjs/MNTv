import { useState, useEffect, useRef, useCallback } from "react";
import { useSpotifyToken } from "./useSpotifyToken";

export interface ExternalTrack {
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string;
  spotifyUri: string;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  deviceName: string;
}

interface Options {
  /** Stop polling when our own player is active */
  suppressPolling?: boolean;
  /** Our Web Playback SDK device ID — filter it out */
  ownDeviceId?: string | null;
}

const POLL_INTERVAL = 5000;

export function useCurrentlyPlaying({ suppressPolling, ownDeviceId }: Options = {}) {
  const { hasSpotifyToken, getValidToken } = useSpotifyToken();
  const [externalTrack, setExternalTrack] = useState<ExternalTrack | null>(null);
  const retryAfterRef = useRef<number>(0);

  // Stabilize ownDeviceId so that the effect/callback deps don't fire every render
  // when ownDeviceId is derived from a non-memoized expression. We only want the
  // poll interval to restart when the actual string value changes.
  const ownDeviceIdRef = useRef(ownDeviceId ?? null);
  if (ownDeviceIdRef.current !== (ownDeviceId ?? null)) {
    ownDeviceIdRef.current = ownDeviceId ?? null;
  }

  const poll = useCallback(async () => {
    // Respect rate-limit backoff
    if (Date.now() < retryAfterRef.current) return;

    const token = await getValidToken();
    if (!token) return;

    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 204 = nothing playing
      if (res.status === 204) {
        setExternalTrack(null);
        return;
      }

      // 429 = rate limited
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "10", 10);
        retryAfterRef.current = Date.now() + retryAfter * 1000;
        return;
      }

      // 401 = token expired (will be refreshed next cycle)
      if (res.status === 401) {
        return;
      }

      if (!res.ok) return;

      const data = await res.json();

      // Not a track (could be podcast, ad, etc.)
      if (data.currently_playing_type !== "track" || !data.item) {
        setExternalTrack(null);
        return;
      }

      // Filter out our own Web Playback SDK device (read from ref — stable reference)
      const deviceId = data.device?.id;
      if (ownDeviceIdRef.current && deviceId === ownDeviceIdRef.current) {
        setExternalTrack(null);
        return;
      }

      const track = data.item;
      setExternalTrack({
        title: track.name || "",
        artist: track.artists?.map((a: any) => a.name).join(", ") || "",
        album: track.album?.name || "",
        albumArtUrl: track.album?.images?.[0]?.url || "",
        spotifyUri: track.uri || "",
        isPlaying: data.is_playing ?? false,
        progressMs: data.progress_ms ?? 0,
        durationMs: track.duration_ms ?? 0,
        deviceName: data.device?.name || "External device",
      });
    } catch (err) {
      console.error("[useCurrentlyPlaying] Poll error:", err);
    }
  }, [getValidToken]);
  // NOTE: ownDeviceId intentionally omitted from poll's deps — it's read via
  // ownDeviceIdRef.current so the callback stays stable across renders where
  // ownDeviceId's reference changes but value stays the same.

  useEffect(() => {
    if (!hasSpotifyToken || suppressPolling) {
      setExternalTrack(null);
      return;
    }

    // Poll immediately, then on interval
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [hasSpotifyToken, suppressPolling, poll]);

  return externalTrack;
}
