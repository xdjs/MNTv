import { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import { useCurrentlyPlaying, type ExternalTrack } from "@/hooks/useCurrentlyPlaying";
import type { Nugget, Source } from "@/mock/types";

// ── In-memory nugget cache (survives navigation, not page refresh) ──
export interface CachedNuggets {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  listenCount: number;
}

// ── Companion nugget shape (session-accumulated per track) ─────────
export interface CompanionNugget {
  id: string;
  timestamp: number;
  headline: string;
  text: string;
  category: string;
  listenUnlockLevel: number;
  sourceName: string;
  sourceUrl: string;
  imageUrl?: string;
  imageCaption?: string;
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

export type ActivePlayer = "spotify" | "none";

export interface TrackMeta {
  trackId: string;
  title: string;
  artist: string;
  coverArtUrl: string;
  album?: string;
  spotifyUri?: string;
}

/** Track info reported by the Spotify Web Playback SDK (from player_state_changed). */
export interface SpotifyStateTrack {
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string;
  spotifyUri: string;
}

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activePlayer: ActivePlayer;
  spotifyReady: boolean;
  currentSpotifyUri: string | null;
  currentTrack: TrackMeta | null;
  /** Previous track route (for "go back" button). Null if no history. */
  prevTrackRoute: string | null;
  /** Track playing on an external Spotify device (phone, etc.) */
  externalPlayback: ExternalTrack | null;
  /** True when user navigated from external playback — skip auto-play */
  isExternalListenMode: boolean;
  /** Track the Spotify SDK reports as currently playing (may differ from what we loaded). */
  spotifyStateTrack: SpotifyStateTrack | null;
}

interface PlayerActions {
  loadTrack: (opts: { spotifyUri?: string }) => void;
  /** Sync state to match an externally-changed track (no pause/restart). */
  syncExternalTrack: (spotifyUri: string) => void;
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
  /** Toggle external listen mode (skip auto-play for external device playback) */
  setExternalListenMode: (mode: boolean) => void;
  /** In-memory nugget cache — survives navigation between pages */
  getNuggetCache: (key: string) => CachedNuggets | undefined;
  setNuggetCache: (key: string, entry: CachedNuggets) => void;
  clearNuggetCache: () => void;
  /** Track completion flags — set when onEnded fires */
  markTrackCompleted: (key: string) => void;
  isTrackCompleted: (key: string) => boolean;
  clearTrackCompleted: (key: string) => void;
  /** Session-scoped listen count per track (persists across navigation) */
  getTrackListenCount: (key: string) => number;
  setTrackListenCount: (key: string, count: number) => void;
  /** Accumulated companion nuggets per track (session-scoped) */
  getCompanionNuggets: (key: string) => CompanionNugget[];
  appendCompanionNuggets: (key: string, nuggets: CompanionNugget[]) => void;
  clearCompanionNuggets: (key: string) => void;
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

  // Spotify state
  const spPlayerRef = useRef<Spotify.Player | null>(null);
  const [spReady, setSpReady] = useState(false);
  const [spPlaying, setSpPlaying] = useState(false);
  const [spTime, setSpTime] = useState(0);
  const [spDuration, setSpDuration] = useState(0);
  const [spDeviceId, setSpDeviceId] = useState<string | null>(null);
  const spPollRef = useRef<number | null>(null);
  const lastSpUriRef = useRef<string | null>(null);
  const spHasPlayedRef = useRef(false); // true once track has been unpaused at least once
  const maxPositionRef = useRef(0); // highest position (ms) reached — prevents false onEnded

  // Active player tracking
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>("none");
  const [currentSpotifyUri, setCurrentSpotifyUri] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<TrackMeta | null>(null);
  const [spotifyStateTrack, setSpotifyStateTrack] = useState<SpotifyStateTrack | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);

  // External playback detection
  const [isExternalListenMode, setIsExternalListenMode] = useState(false);
  const externalTrack = useCurrentlyPlaying({
    suppressPolling: activePlayer !== "none",
    ownDeviceId: spDeviceId,
  });
  const setExternalListenMode = useCallback((mode: boolean) => {
    setIsExternalListenMode(mode);
  }, []);

  // In-memory nugget cache (useRef — no re-renders)
  const nuggetCacheRef = useRef<Map<string, CachedNuggets>>(new Map());
  const getNuggetCache = useCallback((key: string) => nuggetCacheRef.current.get(key), []);
  const setNuggetCache = useCallback((key: string, entry: CachedNuggets) => { nuggetCacheRef.current.set(key, entry); }, []);
  const clearNuggetCache = useCallback(() => { nuggetCacheRef.current.clear(); }, []);

  // Track completion flags (set when onEnded fires, cleared when new nuggets generate)
  const trackCompletedRef = useRef<Set<string>>(new Set());
  const markTrackCompleted = useCallback((key: string) => { trackCompletedRef.current.add(key); }, []);
  const isTrackCompleted = useCallback((key: string) => trackCompletedRef.current.has(key), []);
  const clearTrackCompleted = useCallback((key: string) => { trackCompletedRef.current.delete(key); }, []);

  // Session-scoped listen count per track (persists across navigation within the session)
  const trackListenCountRef = useRef<Map<string, number>>(new Map());
  const getTrackListenCount = useCallback((key: string) => trackListenCountRef.current.get(key) || 0, []);
  const setTrackListenCount = useCallback((key: string, count: number) => { trackListenCountRef.current.set(key, count); }, []);

  // Accumulated companion nuggets per track (session-scoped)
  const companionAccRef = useRef<Map<string, CompanionNugget[]>>(new Map());
  const getCompanionNuggets = useCallback((key: string) => companionAccRef.current.get(key) || [], []);
  const appendCompanionNuggets = useCallback((key: string, nuggets: CompanionNugget[]) => {
    const existing = companionAccRef.current.get(key) || [];
    const existingIds = new Set(existing.map((n: CompanionNugget) => n.id));
    const newOnes = nuggets.filter((n: CompanionNugget) => !existingIds.has(n.id));
    companionAccRef.current.set(key, [...existing, ...newOnes]);
  }, []);
  const clearCompanionNuggets = useCallback((key: string) => { companionAccRef.current.delete(key); }, []);

  // Track history for prev button (persists across Listen re-mounts)
  const trackHistoryRef = useRef<string[]>([]);
  const [prevTrackRoute, setPrevTrackRoute] = useState<string | null>(null);

  const pushTrackHistory = useCallback((route: string) => {
    const history = trackHistoryRef.current;
    if (history[history.length - 1] !== route) {
      history.push(route);
    }
    setPrevTrackRoute(history.length > 1 ? history[history.length - 2] : null);
  }, []);

  const popTrackHistory = useCallback((): string | null => {
    const history = trackHistoryRef.current;
    if (history.length <= 1) return null;
    history.pop();
    const prev = history[history.length - 1] || null;
    setPrevTrackRoute(history.length > 1 ? history[history.length - 2] : null);
    return prev;
  }, []);

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
          spHasPlayedRef.current = true;
          maxPositionRef.current = Math.max(maxPositionRef.current, state.position);
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
        const ct = state.track_window.current_track;
        if (ct?.uri) {
          setSpotifyStateTrack({
            title: ct.name || "",
            artist: ct.artists?.map((a: { name: string }) => a.name).join(", ") || "",
            album: ct.album?.name || "",
            albumArtUrl: ct.album?.images?.[0]?.url || "",
            spotifyUri: ct.uri,
          });
        }
        if (state.paused && state.position === 0 && ct.uri === lastSpUriRef.current && spHasPlayedRef.current && maxPositionRef.current > 5000) {
          lastSpUriRef.current = null;
          spHasPlayedRef.current = false;
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

  const loadTrack = useCallback(({ spotifyUri }: { spotifyUri?: string }) => {
    // Don't reload if already playing this exact URI
    if (spotifyUri && lastSpUriRef.current === spotifyUri) return;

    // Reset playback state
    lastSpUriRef.current = null;
    spHasPlayedRef.current = false;
    hasAutoPlayedRef.current = false;
    maxPositionRef.current = 0;
    spPlayerRef.current?.pause();
    if (spPollRef.current) { clearInterval(spPollRef.current); spPollRef.current = null; }
    setSpTime(0);
    setSpDuration(0);
    setSpPlaying(false);

    setCurrentSpotifyUri(spotifyUri || null);
    setActivePlayer(spReady && spotifyUri ? "spotify" : "none");
  }, [spReady]);

  /** Sync tracking state to match an externally-changed Spotify track.
   *  Unlike loadTrack, this does NOT pause or restart playback — the SDK
   *  is already playing the right track. */
  const syncExternalTrack = useCallback((spotifyUri: string) => {
    setCurrentSpotifyUri(spotifyUri);
    lastSpUriRef.current = spotifyUri;
    spHasPlayedRef.current = true;
    hasAutoPlayedRef.current = true;
    setActivePlayer("spotify");
  }, []);

  // ── Upgrade to Spotify when SDK becomes ready after loadTrack ─────
  useEffect(() => {
    if (spReady && currentSpotifyUri && activePlayer !== "spotify") {
      console.log("[Player] Spotify SDK ready — switching to Spotify");
      setActivePlayer("spotify");
      hasAutoPlayedRef.current = false;
    }
  }, [spReady, currentSpotifyUri, activePlayer]);

  // ── Auto-play when Spotify is active and ready ────────────────────

  const hasAutoPlayedRef = useRef(false);

  useEffect(() => {
    if (activePlayer === "spotify" && spReady && currentSpotifyUri && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      const uriToPlay = currentSpotifyUri; // capture before async gap
      (async () => {
        const token = await getValidToken();
        if (!token || !spDeviceId) return;
        lastSpUriRef.current = uriToPlay;
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spDeviceId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: [uriToPlay] }),
        });
      })();
    }
  }, [activePlayer, spReady, currentSpotifyUri, spDeviceId, getValidToken]);

  // ── Controls ──────────────────────────────────────────────────────

  const play = useCallback(() => {
    spPlayerRef.current?.resume();
  }, []);

  const pause = useCallback(() => {
    spPlayerRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (activePlayer === "none") {
      if (currentSpotifyUri && spReady) {
        setActivePlayer("spotify");
        hasAutoPlayedRef.current = false;
      }
      return;
    }
    if (spPlaying) pause(); else play();
  }, [activePlayer, spPlaying, pause, play, currentSpotifyUri, spReady]);

  const seek = useCallback((seconds: number) => {
    spPlayerRef.current?.seek(seconds * 1000);
    setSpTime(seconds);
  }, []);

  const setOnEnded = useCallback((cb: (() => void) | null) => {
    onEndedRef.current = cb;
  }, []);

  const stop = useCallback(() => {
    spPlayerRef.current?.pause();
    if (spPollRef.current) { clearInterval(spPollRef.current); spPollRef.current = null; }
    setActivePlayer("none");
    setCurrentSpotifyUri(null);
  }, []);

  // ── Unified state ─────────────────────────────────────────────────

  const value: PlayerContextType = useMemo(() => ({
    isPlaying: spPlaying,
    currentTime: spTime,
    duration: spDuration || 0,
    activePlayer,
    spotifyReady: spReady,
    currentSpotifyUri,
    currentTrack,
    prevTrackRoute,
    externalPlayback: externalTrack,
    isExternalListenMode,
    spotifyStateTrack,
    setCurrentTrack,
    setOnEnded,
    pushTrackHistory,
    popTrackHistory,
    loadTrack,
    syncExternalTrack,
    play,
    pause,
    toggle,
    seek,
    stop,
    setExternalListenMode,
    getNuggetCache,
    setNuggetCache,
    clearNuggetCache,
    markTrackCompleted,
    isTrackCompleted,
    clearTrackCompleted,
    getTrackListenCount,
    setTrackListenCount,
    getCompanionNuggets,
    appendCompanionNuggets,
    clearCompanionNuggets,
  }), [
    spPlaying, spTime, spDuration, activePlayer, spReady, currentSpotifyUri,
    currentTrack, prevTrackRoute, externalTrack, isExternalListenMode, spotifyStateTrack,
    setCurrentTrack, setOnEnded, pushTrackHistory, popTrackHistory, loadTrack,
    syncExternalTrack, play, pause, toggle, seek, stop, setExternalListenMode,
    getNuggetCache, setNuggetCache, clearNuggetCache, markTrackCompleted,
    isTrackCompleted, clearTrackCompleted, getTrackListenCount, setTrackListenCount,
    getCompanionNuggets, appendCompanionNuggets, clearCompanionNuggets,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}
