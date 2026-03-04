import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import type { Nugget, Source } from "@/mock/types";

// ── In-memory nugget cache (survives navigation, not page refresh) ──
export interface CachedNuggets {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  listenCount: number;
}

// ── YouTube API singleton loader ──────────────────────────────────────

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

// ── Spotify SDK singleton loader ──────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────

export type ActivePlayer = "spotify" | "youtube" | "none";

export interface TrackMeta {
  trackId: string;
  title: string;
  artist: string;
  coverArtUrl: string;
  album?: string;
  spotifyUri?: string;
}

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activePlayer: ActivePlayer;
  ytReady: boolean;
  spotifyReady: boolean;
  currentVideoId: string | null;
  currentSpotifyUri: string | null;
  currentTrack: TrackMeta | null;
  /** Previous track route (for "go back" button). Null if no history. */
  prevTrackRoute: string | null;
}

interface PlayerActions {
  loadTrack: (opts: { videoId?: string; spotifyUri?: string; spotifyAvailable?: boolean }) => void;
  setCurrentTrack: (meta: TrackMeta | null) => void;
  setOnEnded: (cb: (() => void) | null) => void;
  /** Push current route to history so prev button works across navigations. */
  pushTrackHistory: (route: string) => void;
  /** Pop and return the previous track route. */
  popTrackHistory: () => string | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
  /** Ref to attach the YT player container div. Render this in the Listen page. */
  playerContainerRef: React.RefObject<HTMLDivElement>;
  /** In-memory nugget cache — survives navigation between pages */
  getNuggetCache: (key: string) => CachedNuggets | undefined;
  setNuggetCache: (key: string, entry: CachedNuggets) => void;
  clearNuggetCache: () => void;
}

type PlayerContextType = PlayerState & PlayerActions;

const PlayerContext = createContext<PlayerContextType | null>(null);

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { hasSpotifyToken, getValidToken } = useSpotifyToken();

  // YouTube state
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null!);
  const [ytReady, setYtReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytTime, setYtTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const ytPollRef = useRef<number | null>(null);

  // Spotify state
  const spPlayerRef = useRef<Spotify.Player | null>(null);
  const [spReady, setSpReady] = useState(false);
  const [spPlaying, setSpPlaying] = useState(false);
  const [spTime, setSpTime] = useState(0);
  const [spDuration, setSpDuration] = useState(0);
  const [spDeviceId, setSpDeviceId] = useState<string | null>(null);
  const spPollRef = useRef<number | null>(null);
  const lastSpUriRef = useRef<string | null>(null);

  // Active player tracking
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>("none");
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentSpotifyUri, setCurrentSpotifyUri] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<TrackMeta | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);

  // In-memory nugget cache (useRef — no re-renders)
  const nuggetCacheRef = useRef<Map<string, CachedNuggets>>(new Map());
  const getNuggetCache = useCallback((key: string) => nuggetCacheRef.current.get(key), []);
  const setNuggetCache = useCallback((key: string, entry: CachedNuggets) => { nuggetCacheRef.current.set(key, entry); }, []);
  const clearNuggetCache = useCallback(() => { nuggetCacheRef.current.clear(); }, []);

  // Track history for prev button (persists across Listen re-mounts)
  const trackHistoryRef = useRef<string[]>([]);
  const [prevTrackRoute, setPrevTrackRoute] = useState<string | null>(null);

  const pushTrackHistory = useCallback((route: string) => {
    const history = trackHistoryRef.current;
    // Don't push duplicates (same track)
    if (history[history.length - 1] !== route) {
      history.push(route);
    }
    // Update prevTrackRoute state for reactivity
    setPrevTrackRoute(history.length > 1 ? history[history.length - 2] : null);
  }, []);

  const popTrackHistory = useCallback((): string | null => {
    const history = trackHistoryRef.current;
    if (history.length <= 1) return null;
    history.pop(); // remove current
    const prev = history[history.length - 1] || null;
    setPrevTrackRoute(history.length > 1 ? history[history.length - 2] : null);
    return prev;
  }, []);

  // ── YouTube helpers ────────────────────────────────────────────────

  const startYtPoll = useCallback(() => {
    if (ytPollRef.current) return;
    ytPollRef.current = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      setYtTime(p.getCurrentTime());
      const d = p.getDuration();
      if (d > 0) setYtDuration(d);
    }, 250);
  }, []);

  const stopYtPoll = useCallback(() => {
    if (ytPollRef.current) { clearInterval(ytPollRef.current); ytPollRef.current = null; }
  }, []);

  const initYtPlayer = useCallback(async (videoId: string) => {
    await loadYouTubeAPI();
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch { /* */ }
      ytPlayerRef.current = null;
    }
    const container = ytContainerRef.current;
    if (!container) return;

    const div = document.createElement("div");
    div.id = "yt-global-" + Date.now();
    container.innerHTML = "";
    container.appendChild(div);

    ytPlayerRef.current = new YT.Player(div.id, {
      height: "100%",
      width: "100%",
      videoId,
      playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, showinfo: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1 },
      events: {
        onReady: () => {
          setYtReady(true);
          const d = ytPlayerRef.current?.getDuration() || 0;
          if (d > 0) setYtDuration(d);
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) { setYtPlaying(true); startYtPoll(); }
          else if (event.data === YT.PlayerState.PAUSED) { setYtPlaying(false); stopYtPoll(); }
          else if (event.data === YT.PlayerState.ENDED) { setYtPlaying(false); stopYtPoll(); onEndedRef.current?.(); }
        },
      },
    });
  }, [startYtPoll, stopYtPoll]);

  // ── Spotify init (once, on mount if token available) ───────────────

  useEffect(() => {
    if (!hasSpotifyToken) return;
    let cancelled = false;

    async function init() {
      await loadSpotifySDK();
      if (cancelled) return;

      const player = new Spotify.Player({
        name: "MusicNerd TV",
        getOAuthToken: async (cb) => { const t = await getValidToken(); if (t) cb(t); },
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        if (cancelled) return;
        setSpDeviceId(device_id);
        setSpReady(true);
      });
      player.addListener("not_ready", () => { if (!cancelled) setSpReady(false); });
      player.addListener("player_state_changed", (state) => {
        if (cancelled || !state) return;
        setSpPlaying(!state.paused);
        setSpTime(state.position / 1000);
        setSpDuration(state.duration / 1000);
        if (!state.paused) {
          if (!spPollRef.current) {
            spPollRef.current = window.setInterval(async () => {
              const s = await spPlayerRef.current?.getCurrentState();
              if (!s) return;
              setSpTime(s.position / 1000);
              setSpDuration(s.duration / 1000);
              setSpPlaying(!s.paused);
            }, 250);
          }
        } else if (spPollRef.current) {
          clearInterval(spPollRef.current);
          spPollRef.current = null;
        }
        if (state.paused && state.position === 0 && state.track_window.current_track.uri === lastSpUriRef.current) {
          onEndedRef.current?.();
        }
      });
      player.addListener("initialization_error", ({ message }) => console.error("[Spotify] Init error:", message));
      player.addListener("authentication_error", ({ message }) => console.error("[Spotify] Auth error:", message));
      player.addListener("account_error", ({ message }) => console.error("[Spotify] Account error:", message));

      await player.connect();
      spPlayerRef.current = player;
    }

    init();
    return () => {
      cancelled = true;
      if (spPollRef.current) clearInterval(spPollRef.current);
      if (spPlayerRef.current) { spPlayerRef.current.disconnect(); spPlayerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSpotifyToken]);

  // ── loadTrack ─────────────────────────────────────────────────────

  // Track whether user wants Spotify (persists across spReady changes)
  const wantsSpotifyRef = useRef(false);

  const loadTrack = useCallback(({ videoId, spotifyUri, spotifyAvailable }: { videoId?: string; spotifyUri?: string; spotifyAvailable?: boolean }) => {
    // Stop existing playback
    ytPlayerRef.current?.pauseVideo();
    spPlayerRef.current?.pause();
    stopYtPoll();
    setYtTime(0);
    setYtDuration(0);
    setSpTime(0);
    setSpDuration(0);
    setYtReady(false);
    setYtPlaying(false);
    setSpPlaying(false);

    setCurrentVideoId(videoId || null);
    setCurrentSpotifyUri(spotifyUri || null);
    wantsSpotifyRef.current = !!(spotifyAvailable && spotifyUri);

    // Determine which player to use right now
    if (spotifyAvailable && spReady && spotifyUri) {
      setActivePlayer("spotify");
    } else if (videoId) {
      setActivePlayer("youtube");
    } else {
      setActivePlayer("none");
    }

    // Load YouTube (always, for backdrop)
    if (videoId) {
      initYtPlayer(videoId);
    }
  }, [spReady, initYtPlayer, stopYtPoll]);

  // ── Upgrade to Spotify when SDK becomes ready after loadTrack ─────
  // If we wanted Spotify but it wasn't ready, switch when it connects.
  useEffect(() => {
    if (spReady && wantsSpotifyRef.current && currentSpotifyUri && activePlayer !== "spotify") {
      console.log("[Player] Spotify SDK ready — upgrading to Spotify from", activePlayer);
      setActivePlayer("spotify");
      hasAutoPlayedRef.current = false; // trigger auto-play for Spotify
    }
  }, [spReady, currentSpotifyUri, activePlayer]);

  // ── YouTube fallback when stuck on "none" ──────────────────────────
  // If activePlayer is "none" and YouTube is ready, fall back to YouTube.
  // If Spotify SDK connects later, the upgrade effect above will switch.
  useEffect(() => {
    if (activePlayer === "none" && currentVideoId && ytReady) {
      console.log("[Player] Falling back to YouTube audio");
      setActivePlayer("youtube");
      hasAutoPlayedRef.current = false;
    }
  }, [activePlayer, currentVideoId, ytReady]);

  // ── Auto-play when players become ready after loadTrack ───────────

  const hasAutoPlayedRef = useRef(false);

  useEffect(() => {
    if (activePlayer === "youtube" && ytReady && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      ytPlayerRef.current?.unMute();
      ytPlayerRef.current?.playVideo();
    }
  }, [activePlayer, ytReady]);

  useEffect(() => {
    if (activePlayer === "spotify" && spReady && currentSpotifyUri && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      // Mute YT for backdrop only
      ytPlayerRef.current?.mute();
      ytPlayerRef.current?.playVideo();
      // Play Spotify
      (async () => {
        const token = await getValidToken();
        if (!token || !spDeviceId) return;
        lastSpUriRef.current = currentSpotifyUri;
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spDeviceId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: [currentSpotifyUri] }),
        });
      })();
    }
  }, [activePlayer, spReady, currentSpotifyUri, spDeviceId, getValidToken]);

  // Reset autoplay flag on loadTrack
  useEffect(() => {
    hasAutoPlayedRef.current = false;
  }, [currentVideoId, currentSpotifyUri]);

  // Mute/unmute YouTube based on active player
  useEffect(() => {
    if (activePlayer === "youtube") ytPlayerRef.current?.unMute();
    else ytPlayerRef.current?.mute();
  }, [activePlayer]);

  // ── Controls ──────────────────────────────────────────────────────

  const play = useCallback(() => {
    if (activePlayer === "spotify") spPlayerRef.current?.resume();
    else if (activePlayer === "youtube") ytPlayerRef.current?.playVideo();
  }, [activePlayer]);

  const pause = useCallback(() => {
    if (activePlayer === "spotify") spPlayerRef.current?.pause();
    else if (activePlayer === "youtube") ytPlayerRef.current?.pauseVideo();
  }, [activePlayer]);

  const toggle = useCallback(() => {
    const playing = activePlayer === "spotify" ? spPlaying : ytPlaying;
    if (playing) pause(); else play();
  }, [activePlayer, spPlaying, ytPlaying, pause, play]);

  const seek = useCallback((seconds: number) => {
    if (activePlayer === "spotify") {
      spPlayerRef.current?.seek(seconds * 1000);
      setSpTime(seconds);
    } else if (activePlayer === "youtube") {
      ytPlayerRef.current?.seekTo(seconds, true);
      setYtTime(seconds);
    }
  }, [activePlayer]);

  const setOnEnded = useCallback((cb: (() => void) | null) => {
    onEndedRef.current = cb;
  }, []);

  const stop = useCallback(() => {
    ytPlayerRef.current?.pauseVideo();
    spPlayerRef.current?.pause();
    stopYtPoll();
    if (spPollRef.current) { clearInterval(spPollRef.current); spPollRef.current = null; }
    setActivePlayer("none");
    setCurrentVideoId(null);
    setCurrentSpotifyUri(null);
  }, [stopYtPoll]);

  // ── Unified state ─────────────────────────────────────────────────

  const isPlaying = activePlayer === "spotify" ? spPlaying : activePlayer === "youtube" ? ytPlaying : false;
  const currentTime = activePlayer === "spotify" ? spTime : activePlayer === "youtube" ? ytTime : 0;
  const duration = activePlayer === "spotify" ? (spDuration || 0) : activePlayer === "youtube" ? (ytDuration || 0) : 0;

  const value: PlayerContextType = {
    isPlaying,
    currentTime,
    duration,
    activePlayer,
    ytReady,
    spotifyReady: spReady,
    currentVideoId,
    currentSpotifyUri,
    currentTrack,
    prevTrackRoute,
    setCurrentTrack,
    setOnEnded,
    pushTrackHistory,
    popTrackHistory,
    loadTrack,
    play,
    pause,
    toggle,
    seek,
    stop,
    playerContainerRef: ytContainerRef,
    getNuggetCache,
    setNuggetCache,
    clearNuggetCache,
  };

  return (
    <PlayerContext.Provider value={value}>
      {/* Hidden global YouTube container — portaled into Listen page when visible */}
      <div
        ref={ytContainerRef}
        id="global-yt-player"
        style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none", opacity: 0 }}
      />
      {children}
    </PlayerContext.Provider>
  );
}
