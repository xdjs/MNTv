import { useState, useRef, useCallback, useEffect } from "react";
import { useSpotifyToken } from "./useSpotifyToken";

let sdkLoading = false;
let sdkReady = false;
const sdkReadyCallbacks: (() => void)[] = [];

function loadSpotifySDK(): Promise<void> {
  if (sdkReady) return Promise.resolve();
  return new Promise((resolve) => {
    sdkReadyCallbacks.push(resolve);
    if (sdkLoading) return;
    sdkLoading = true;

    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkReady = true;
      sdkReadyCallbacks.forEach((cb) => cb());
      sdkReadyCallbacks.length = 0;
    };

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(script);
  });
}

interface UseSpotifyPlayerOptions {
  onEnded?: () => void;
}

export function useSpotifyPlayer(options?: UseSpotifyPlayerOptions) {
  const { hasSpotifyToken, getValidToken } = useSpotifyToken();

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const playerRef = useRef<Spotify.Player | null>(null);
  const onEndedRef = useRef(options?.onEnded);
  onEndedRef.current = options?.onEnded;
  const pollRef = useRef<number | null>(null);
  const lastUriRef = useRef<string | null>(null);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (!state) return;
      setCurrentTime(state.position / 1000);
      setDuration(state.duration / 1000);
      setIsPlaying(!state.paused);
    }, 250);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Initialize only when user has a Spotify token
  useEffect(() => {
    if (!hasSpotifyToken) return;

    let cancelled = false;

    async function init() {
      await loadSpotifySDK();
      if (cancelled) return;

      const player = new Spotify.Player({
        name: "MusicNerd TV",
        getOAuthToken: async (cb) => {
          const token = await getValidToken();
          if (token) cb(token);
        },
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        if (cancelled) return;
        setDeviceId(device_id);
        setIsReady(true);
        console.log("[Spotify] Player ready, device:", device_id);
      });

      player.addListener("not_ready", () => {
        if (cancelled) return;
        setIsReady(false);
        console.warn("[Spotify] Player not ready");
      });

      player.addListener("player_state_changed", (state) => {
        if (cancelled || !state) return;
        setIsPlaying(!state.paused);
        setCurrentTime(state.position / 1000);
        setDuration(state.duration / 1000);

        if (!state.paused) {
          startPolling();
        } else {
          stopPolling();
        }

        // Detect track ended: paused + position 0 + same track
        if (
          state.paused &&
          state.position === 0 &&
          state.track_window.current_track.uri === lastUriRef.current
        ) {
          onEndedRef.current?.();
        }
      });

      player.addListener("initialization_error", ({ message }) => {
        console.error("[Spotify] Init error:", message);
      });

      player.addListener("authentication_error", ({ message }) => {
        console.error("[Spotify] Auth error:", message);
      });

      player.addListener("account_error", ({ message }) => {
        console.error("[Spotify] Account error (Premium required?):", message);
      });

      await player.connect();
      playerRef.current = player;
    }

    init();

    return () => {
      cancelled = true;
      stopPolling();
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSpotifyToken]);

  const play = useCallback(
    async (spotifyUri: string) => {
      if (!deviceId) return;
      lastUriRef.current = spotifyUri;
      const token = await getValidToken();
      if (!token) return;

      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [spotifyUri] }),
      });

      setIsPlaying(true);
      startPolling();
    },
    [deviceId, getValidToken, startPolling]
  );

  const pause = useCallback(async () => {
    await playerRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    await playerRef.current?.resume();
  }, []);

  const seek = useCallback(async (seconds: number) => {
    await playerRef.current?.seek(seconds * 1000);
    setCurrentTime(seconds);
  }, []);

  return {
    isReady,
    isPlaying,
    currentTime,
    duration,
    deviceId,
    play,
    pause,
    resume,
    seek,
  };
}
