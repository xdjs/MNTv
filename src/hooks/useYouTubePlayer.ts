import { useState, useRef, useCallback, useEffect } from "react";

let ytApiLoading = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve) => {
    ytReadyCallbacks.push(resolve);
    if (ytApiLoading) return;
    ytApiLoading = true;

    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      ytReadyCallbacks.forEach((cb) => cb());
      ytReadyCallbacks.length = 0;
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
}

interface UseYouTubePlayerOptions {
  onEnded?: () => void;
}

export function useYouTubePlayer(options?: UseYouTubePlayerOptions) {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const onEndedRef = useRef(options?.onEnded);
  onEndedRef.current = options?.onEnded;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      setCurrentTime(p.getCurrentTime());
      const d = p.getDuration();
      if (d > 0) setDuration(d);
    }, 250);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const initPlayer = useCallback(
    async (videoId: string) => {
      await loadYouTubeAPI();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }

      const container = containerRef.current;
      if (!container) return;

      const playerDiv = document.createElement("div");
      playerDiv.id = "yt-player-" + Date.now();
      container.innerHTML = "";
      container.appendChild(playerDiv);

      playerRef.current = new YT.Player(playerDiv.id, {
        height: "100%",
        width: "100%",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            setIsReady(true);
            // Start muted by default — audio comes from Spotify or explicit unmute
            playerRef.current?.mute();
            const d = playerRef.current?.getDuration() || 0;
            if (d > 0) setDuration(d);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              startPolling();
            } else if (event.data === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              stopPolling();
            } else if (event.data === YT.PlayerState.ENDED) {
              setIsPlaying(false);
              stopPolling();
              onEndedRef.current?.();
            }
          },
        },
      });
    },
    [startPolling, stopPolling]
  );

  const loadVideo = useCallback(
    (videoId: string) => {
      setIsReady(false);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      stopPolling();
      initPlayer(videoId);
    },
    [initPlayer, stopPolling]
  );

  const play = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    setCurrentTime(seconds);
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    if (muted) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
    };
  }, [stopPolling]);

  return {
    containerRef,
    isReady,
    isPlaying,
    currentTime,
    duration,
    loadVideo,
    play,
    pause,
    seek,
    setMuted,
  };
}
