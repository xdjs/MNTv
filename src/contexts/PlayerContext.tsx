import { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import { useCurrentlyPlaying, type ExternalTrack } from "@/hooks/useCurrentlyPlaying";
import { SpotifyPlaybackEngine, type SpotifyStateTrack } from "@/lib/engines/SpotifyPlaybackEngine";
import type { ServiceType } from "@/lib/engines/types";
import type { Nugget, Source } from "@/mock/types";

// Re-export for consumers that import from PlayerContext
export type { SpotifyStateTrack } from "@/lib/engines/SpotifyPlaybackEngine";

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

// ── Types ─────────────────────────────────────────────────────────────

export type ActivePlayer = ServiceType;

export interface TrackMeta {
  trackId: string;
  title: string;
  artist: string;
  coverArtUrl: string;
  album?: string;
  trackUri?: string;
}

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activePlayer: ActivePlayer;
  spotifyReady: boolean;
  currentTrackUri: string | null;
  currentTrack: TrackMeta | null;
  /** Previous track route (for "go back" button). Null if no history. */
  prevTrackRoute: string | null;
  /** Track playing on an external Spotify device (phone, etc.) */
  externalPlayback: ExternalTrack | null;
  /** True when user navigated from external playback — skip auto-play */
  isExternalListenMode: boolean;
  /** Track the Spotify SDK reports as currently playing (may differ from what we loaded). */
  spotifyStateTrack: SpotifyStateTrack | null;
  /** Whether the NowPlayingBar has d-pad focus (shared between Browse/NowPlayingBar) */
  nowPlayingFocused: boolean;
  /** Which element within NowPlayingBar is focused (0=track-info, 1=prev, 2=play, 3=next) */
  nowPlayingFocusIndex: number;
}

interface PlayerActions {
  loadTrack: (opts: { trackUri?: string }) => void;
  /** Sync state to match an externally-changed track (no pause/restart). */
  syncExternalTrack: (trackUri: string) => void;
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
  /** Session-scoped companion short ID cache — survives navigation */
  getCompanionShortId: (key: string) => string | undefined;
  setCompanionShortId: (key: string, shortId: string) => void;
  /** Session history — track skip-repeat filtering */
  addToSessionHistory: (artist: string, title: string) => void;
  isInSessionHistory: (artist: string, title: string) => boolean;
  /** NowPlayingBar d-pad focus control */
  setNowPlayingFocused: (focused: boolean) => void;
  setNowPlayingFocusIndex: (index: number) => void;
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

  // Playback engine ref
  const engineRef = useRef<SpotifyPlaybackEngine | null>(null);

  // Playback state (driven by engine callbacks)
  const [spReady, setSpReady] = useState(false);
  const [spPlaying, setSpPlaying] = useState(false);
  const [spTime, setSpTime] = useState(0);
  const [spDuration, setSpDuration] = useState(0);
  const [spDeviceId, setSpDeviceId] = useState<string | null>(null);

  // Active player tracking
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>("none");
  const [currentTrackUri, setCurrentTrackUri] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<TrackMeta | null>(null);
  const [spotifyStateTrack, setSpotifyStateTrack] = useState<SpotifyStateTrack | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);

  // Stable ref for track URI (avoids stale closures)
  const currentTrackUriRef = useRef<string | null>(null);
  currentTrackUriRef.current = currentTrackUri;

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

  // Session-scoped companion short ID cache (survives navigation)
  const companionShortIdRef = useRef<Map<string, string>>(new Map());
  const getCompanionShortId = useCallback((key: string) => companionShortIdRef.current.get(key), []);
  const setCompanionShortId = useCallback((key: string, shortId: string) => { companionShortIdRef.current.set(key, shortId); }, []);

  // Session history — tracks played this session (for skip-repeat filtering)
  const sessionHistoryRef = useRef<Set<string>>(new Set());
  const addToSessionHistory = useCallback((artist: string, title: string) => {
    sessionHistoryRef.current.add(`${artist.toLowerCase()}::${title.toLowerCase()}`);
  }, []);
  const isInSessionHistory = useCallback((artist: string, title: string) => {
    return sessionHistoryRef.current.has(`${artist.toLowerCase()}::${title.toLowerCase()}`);
  }, []);

  // NowPlayingBar d-pad focus (shared between Browse and NowPlayingBar)
  const [nowPlayingFocused, setNowPlayingFocused] = useState(false);
  const [nowPlayingFocusIndex, setNowPlayingFocusIndex] = useState(0);

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

  // ── Engine init (once, on mount if token available) ────────────────

  useEffect(() => {
    if (!hasSpotifyToken) return;

    const engine = new SpotifyPlaybackEngine({
      getOAuthToken: getValidToken,
      onReady: (deviceId) => {
        setSpReady(true);
        setSpDeviceId(deviceId);
      },
      onSpotifyStateTrack: (track) => setSpotifyStateTrack(track),
      onDeviceLost: () => setSpPlaying(false),
    });

    const unsubState = engine.onStateChange((state) => {
      setSpPlaying(state.isPlaying);
      setSpTime(state.currentTime);
      // duration is optional on PlaybackState (omitted = "keep current").
      // Use != null to safely handle both undefined and null.
      if (state.duration != null) setSpDuration(state.duration);
    });

    const unsubEnd = engine.onTrackEnd(() => {
      onEndedRef.current?.();
    });

    engine.init();
    engineRef.current = engine;

    return () => {
      unsubState();
      unsubEnd();
      engine.cleanup();
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSpotifyToken]);

  // ── loadTrack ─────────────────────────────────────────────────────

  const hasAutoPlayedRef = useRef(false);

  const loadTrack = useCallback(({ trackUri }: { trackUri?: string }) => {
    if (trackUri && currentTrackUriRef.current === trackUri) return;

    hasAutoPlayedRef.current = false;

    // Reset UI state
    setSpTime(0);
    setSpDuration(0);
    setSpPlaying(false);

    setCurrentTrackUri(trackUri || null);
    setActivePlayer(spReady && trackUri ? "spotify" : "none");
  }, [spReady]);

  /** Sync tracking state to match an externally-changed track.
   *  Unlike loadTrack, this does NOT pause or restart playback — the SDK
   *  is already playing the right track. */
  const syncExternalTrack = useCallback((trackUri: string) => {
    setCurrentTrackUri(trackUri);
    currentTrackUriRef.current = trackUri;
    hasAutoPlayedRef.current = true;
    setActivePlayer("spotify");
    // Update engine's lastUri so end-of-track detection works for
    // externally-synced tracks (e.g. user skipped on Spotify app).
    engineRef.current?.syncUri(trackUri);
  }, []);

  // ── Upgrade to Spotify when SDK becomes ready after loadTrack ─────
  useEffect(() => {
    if (spReady && currentTrackUri && activePlayer !== "spotify") {
      console.log("[Player] Spotify SDK ready — switching to Spotify");
      setActivePlayer("spotify");
      hasAutoPlayedRef.current = false;
    }
  }, [spReady, currentTrackUri, activePlayer]);

  // ── Auto-play when Spotify is active and ready ────────────────────

  useEffect(() => {
    if (activePlayer === "spotify" && spReady && currentTrackUri && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      engineRef.current?.loadTrack(currentTrackUri);
    }
  }, [activePlayer, spReady, currentTrackUri]);

  // ── Controls ──────────────────────────────────────────────────────

  const play = useCallback(async () => {
    await engineRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (activePlayer === "none") {
      if (currentTrackUri && spReady) {
        setActivePlayer("spotify");
        hasAutoPlayedRef.current = false;
      }
      return;
    }
    if (spPlaying) pause(); else play();
  }, [activePlayer, spPlaying, pause, play, currentTrackUri, spReady]);

  const seek = useCallback((seconds: number) => {
    engineRef.current?.seek(seconds);
    setSpTime(seconds);
  }, []);

  const setOnEnded = useCallback((cb: (() => void) | null) => {
    onEndedRef.current = cb;
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setActivePlayer("none");
    setCurrentTrackUri(null);
  }, []);

  // ── Unified state ─────────────────────────────────────────────────

  const value: PlayerContextType = useMemo(() => ({
    isPlaying: spPlaying,
    currentTime: spTime,
    duration: spDuration || 0,
    activePlayer,
    spotifyReady: spReady,
    currentTrackUri,
    currentTrack,
    prevTrackRoute,
    externalPlayback: externalTrack,
    isExternalListenMode,
    spotifyStateTrack,
    nowPlayingFocused,
    nowPlayingFocusIndex,
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
    getCompanionShortId,
    setCompanionShortId,
    addToSessionHistory,
    isInSessionHistory,
    setNowPlayingFocused,
    setNowPlayingFocusIndex,
  }), [
    spPlaying, spTime, spDuration, activePlayer, spReady, currentTrackUri,
    currentTrack, prevTrackRoute, externalTrack, isExternalListenMode, spotifyStateTrack, nowPlayingFocused, nowPlayingFocusIndex,
    setCurrentTrack, setOnEnded, pushTrackHistory, popTrackHistory, loadTrack,
    syncExternalTrack, play, pause, toggle, seek, stop, setExternalListenMode,
    getNuggetCache, setNuggetCache, clearNuggetCache, markTrackCompleted,
    isTrackCompleted, clearTrackCompleted, getTrackListenCount, setTrackListenCount,
    getCompanionNuggets, appendCompanionNuggets, clearCompanionNuggets,
    getCompanionShortId, setCompanionShortId, addToSessionHistory, isInSessionHistory, setNowPlayingFocused, setNowPlayingFocusIndex,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}
