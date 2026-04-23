import { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import { useAppleMusicToken } from "@/hooks/useAppleMusicToken";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { useCurrentlyPlaying, type ExternalTrack } from "@/hooks/useCurrentlyPlaying";
import { SpotifyPlaybackEngine, type SpotifyStateTrack } from "@/lib/engines/SpotifyPlaybackEngine";
import { AppleMusicPlaybackEngine } from "@/lib/engines/AppleMusicPlaybackEngine";
import type { PlaybackEngine, ServiceType } from "@/lib/engines/types";
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
  const { hasMusicToken, getDeveloperToken } = useAppleMusicToken();
  const { profile } = useUserProfile();

  // Playback engine ref (Spotify or Apple Music — selected by profile service)
  const engineRef = useRef<PlaybackEngine | null>(null);

  // Playback state (driven by engine callbacks — generic across services)
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

  // External playback detection — Spotify-only (Apple Music has no cross-device API)
  const [isExternalListenMode, setIsExternalListenMode] = useState(false);
  const externalTrack = useCurrentlyPlaying({
    suppressPolling: activePlayer !== "none" || profile?.streamingService !== "Spotify",
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

  // ── Engine init (on profile service change, if token available) ────
  //
  // Two string namespaces at play here — don't confuse them:
  //   • profile.streamingService: display label, "Spotify" | "Apple Music" | ""
  //     (matches the DB `streaming_service` column and onboarding UI)
  //   • engine.service (ServiceType): kebab-case id, "spotify" | "apple-music" | "none"
  //     (used for PlayerContext's activePlayer state and engine dispatch)
  //
  // Profile strings are translated to engine strings below; engine.service is
  // used downstream for setActivePlayer and syncExternalTrack guards.
  const service = profile?.streamingService;

  useEffect(() => {
    // Determine which engine to create based on profile service + token.
    // Apple Music and Spotify are mutually exclusive — only one engine at a time.

    if (service === "Apple Music" && hasMusicToken) {
      let cancelled = false;
      let currentEngine: AppleMusicPlaybackEngine | null = null;
      let unsubState: (() => void) | null = null;
      let unsubEnd: (() => void) | null = null;

      getDeveloperToken().then((devToken) => {
        if (cancelled || !devToken) return;
        const am = new AppleMusicPlaybackEngine({
          developerToken: devToken,
          onReady: () => {
            // Guard against late onReady firing after the effect was cancelled
            if (cancelled) return;
            setSpReady(true);
            setSpDeviceId(null);  // Apple Music has no device ID
          },
        });
        currentEngine = am;

        unsubState = am.onStateChange((state) => {
          setSpPlaying(state.isPlaying);
          setSpTime(state.currentTime);
          if (state.duration != null) setSpDuration(state.duration);
        });
        unsubEnd = am.onTrackEnd(() => {
          onEndedRef.current?.();
        });

        // Assign ref BEFORE init so the upgrade-to-engine effect can read
        // engineRef.current?.service when spReady flips later.
        engineRef.current = am;
        am.init().catch((err) => {
          console.error("[Player] Apple Music engine init failed:", err);
          // Prevent a broken engine from poisoning engineRef — downstream
          // code guards on spReady but this keeps the invariant clean.
          if (engineRef.current === am) engineRef.current = null;
        });
      });

      return () => {
        cancelled = true;
        unsubState?.();
        unsubEnd?.();
        currentEngine?.cleanup();
        if (engineRef.current === currentEngine) engineRef.current = null;
        setSpReady(false);
        setSpDeviceId(null);
      };
    }

    if (service === "Spotify" && hasSpotifyToken) {
      const sp = new SpotifyPlaybackEngine({
        getOAuthToken: getValidToken,
        onReady: (deviceId) => {
          setSpReady(true);
          setSpDeviceId(deviceId);
        },
        onSpotifyStateTrack: (track) => setSpotifyStateTrack(track),
        onDeviceLost: () => setSpPlaying(false),
      });

      const unsubState = sp.onStateChange((state) => {
        setSpPlaying(state.isPlaying);
        setSpTime(state.currentTime);
        if (state.duration != null) setSpDuration(state.duration);
      });
      const unsubEnd = sp.onTrackEnd(() => {
        onEndedRef.current?.();
      });

      // Assign ref BEFORE init so the upgrade-to-engine effect can read
      // engineRef.current?.service when spReady flips later.
      engineRef.current = sp;
      sp.init().catch((err) => {
        console.error("[Player] Spotify engine init failed:", err);
        if (engineRef.current === sp) engineRef.current = null;
      });

      return () => {
        unsubState();
        unsubEnd();
        sp.cleanup();
        // Only null the ref if it still points to THIS engine — prevents
        // clobbering a newer engine created by a rapid service switch.
        if (engineRef.current === sp) engineRef.current = null;
        setSpReady(false);
        setSpDeviceId(null);
      };
    }

    // No engine — user hasn't connected a service yet
    return;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getValidToken and getDeveloperToken are useCallback([])-stable; re-including them would churn the effect on every parent re-render and destroy/recreate engines
  }, [service, hasSpotifyToken, hasMusicToken]);

  // ── Engine-init safety net ─────────────────────────────────────────
  // Rarely the engine-init effect above fires before profile+token have
  // both settled (race on initial mount), leaving service+token both true
  // but no engine created. Symptom: Spotify SDK never loads, "track never
  // started after 4s — retrying play()" logs loop. This poke fires the
  // token-changed event once after mount so the useSpotifyToken hook
  // re-syncs and the effect re-runs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      if (!engineRef.current && (hasSpotifyToken || hasMusicToken)) {
        if (import.meta.env.DEV) console.log("[Player] Engine-init safety-net poking token events");
        window.dispatchEvent(new Event("spotify-token-changed"));
        window.dispatchEvent(new Event("apple-music-token-changed"));
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [hasSpotifyToken, hasMusicToken]);

  // ── loadTrack ─────────────────────────────────────────────────────

  const hasAutoPlayedRef = useRef(false);

  const loadTrack = useCallback(({ trackUri }: { trackUri?: string }) => {
    if (trackUri && currentTrackUriRef.current === trackUri) return;

    // Stop the engine immediately so the old track doesn't keep polling
    // or emitting state while the new track's load effect fires later.
    engineRef.current?.stop();
    hasAutoPlayedRef.current = false;

    // Reset UI state
    setSpTime(0);
    setSpDuration(0);
    setSpPlaying(false);

    const engineService = engineRef.current?.service;
    setCurrentTrackUri(trackUri || null);
    setActivePlayer(spReady && trackUri && engineService ? engineService : "none");
  }, [spReady]);

  /** Sync tracking state to match an externally-changed track.
   *  Spotify-only — Apple Music has no cross-device detection.
   *  Unlike loadTrack, this does NOT pause or restart playback — the SDK
   *  is already playing the right track. */
  const syncExternalTrack = useCallback((trackUri: string) => {
    if (engineRef.current?.service !== "spotify") return;
    setCurrentTrackUri(trackUri);
    currentTrackUriRef.current = trackUri;
    hasAutoPlayedRef.current = true;
    setActivePlayer("spotify");
    // Update engine's lastUri so end-of-track detection works for
    // externally-synced tracks (e.g. user skipped on Spotify app).
    engineRef.current?.syncUri(trackUri);
  }, []);

  // ── Upgrade to active engine when SDK becomes ready after loadTrack ─
  useEffect(() => {
    const engineService = engineRef.current?.service;
    if (spReady && currentTrackUri && engineService && activePlayer !== engineService) {
      console.log(`[Player] ${engineService} SDK ready — switching`);
      setActivePlayer(engineService);
      hasAutoPlayedRef.current = false;
    }
  }, [spReady, currentTrackUri, activePlayer]);

  // ── Auto-play when engine is active and ready ─────────────────────

  useEffect(() => {
    if (activePlayer !== "none" && spReady && currentTrackUri && !hasAutoPlayedRef.current) {
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
      const engineService = engineRef.current?.service;
      if (currentTrackUri && spReady && engineService) {
        setActivePlayer(engineService);
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
