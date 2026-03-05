import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { useThemeSync } from "@/hooks/useThemeSync";
import { QRCode } from "react-qrcode-logo";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import NuggetCard from "@/components/NuggetCard";
import MediaOverlay from "@/components/overlays/MediaOverlay";
import ReadingOverlay from "@/components/overlays/ReadingOverlay";
import NuggetDeepDive from "@/components/overlays/NuggetDeepDive";
import DevPanel from "@/components/DevPanel";
import PlaybackBar from "@/components/PlaybackBar";
import { getTrackById, getNuggetsForTrack, getSourceById, getAdjacentTrackIds, getYouTubeSourceForTrack, getArtistById } from "@/mock/tracks";
import { useAINuggets } from "@/hooks/useAINuggets";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import { usePlayer } from "@/contexts/PlayerContext";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import PageTransition from "@/components/PageTransition";
import type { Nugget, Source, AnimationStyle } from "@/mock/types";

const HIDE_DELAY = 3000;

export default function Listen() {
  const { trackId: rawTrackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();

  const { profile } = useUserProfile();

  // ── Real track support ─────────────────────────────────────────────
  // Real tracks are encoded as: real::<artist>::<title>::<album>
  const isRealTrack = rawTrackId?.startsWith("real%3A%3A") || rawTrackId?.startsWith("real::");
  const realTrackMeta = useMemo(() => {
    if (!isRealTrack || !rawTrackId) return null;
    const decoded = decodeURIComponent(rawTrackId);
    const parts = decoded.split("::");
    return {
      artist: decodeURIComponent(parts[1] || ""),
      title: decodeURIComponent(parts[2] || ""),
      album: decodeURIComponent(parts[3] || "") || undefined,
      spotifyUri: decodeURIComponent(parts[4] || "") || undefined,
    };
  }, [isRealTrack, rawTrackId]);

  const trackId = rawTrackId || "";

  const track = useMemo(() => {
    if (isRealTrack && realTrackMeta) {
      // Try to find Spotify album art from the user's profile
      let coverArtUrl = "";
      if (profile?.spotifyTrackImages) {
        const match = profile.spotifyTrackImages.find(
          (t) =>
            t.title.toLowerCase() === realTrackMeta.title.toLowerCase() &&
            t.artist.toLowerCase() === realTrackMeta.artist.toLowerCase()
        );
        if (match?.imageUrl) coverArtUrl = match.imageUrl;
      }
      // Fall back to artist image from Spotify
      if (!coverArtUrl && profile?.spotifyArtistImages?.[realTrackMeta.artist]) {
        coverArtUrl = profile.spotifyArtistImages[realTrackMeta.artist];
      }
      // Final fallback: DiceBear initials
      if (!coverArtUrl) {
        coverArtUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(realTrackMeta.artist + realTrackMeta.title)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
      }

      return {
        id: trackId,
        title: realTrackMeta.title,
        artist: realTrackMeta.artist,
        artistId: "",
        albumId: "",
        album: realTrackMeta.album,
        durationSec: 300,
        coverArtUrl,
        trackNumber: 1,
      };
    }
    return getTrackById(trackId);
  }, [isRealTrack, realTrackMeta, trackId, profile?.spotifyTrackImages, profile?.spotifyArtistImages]);

  // ── Playback source resolution ───────────────────────────────────────
  const { hasSpotifyToken } = useSpotifyToken();
  const ytSource = useMemo(() => getYouTubeSourceForTrack(trackId || ""), [trackId]);
  const [ytVideoId, setYtVideoId] = useState<string | null>(null);
  const [spotifyUri, setSpotifyUri] = useState<string | null>(null);

  // Resolve Spotify URI — from route (real tracks) or by searching Spotify
  useEffect(() => {
    setSpotifyUri(null);

    // Real track with URI baked into the route
    if (realTrackMeta?.spotifyUri) {
      setSpotifyUri(realTrackMeta.spotifyUri);
      return;
    }

    // No Spotify token → skip Spotify search
    if (!hasSpotifyToken || !track) return;

    let cancelled = false;
    async function findSpotifyUri() {
      try {
        // Pass artist + title separately for precise Spotify field filtering
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { artist: track!.artist, title: track!.title },
        });
        if (cancelled) return;
        if (error) { console.error("[Listen] Spotify search error:", error); return; }

        const tracks = data?.tracks || [];
        const titleLower = track!.title.toLowerCase();
        const artistLower = track!.artist.toLowerCase();

        // 1. Exact match (case-insensitive)
        let match = tracks.find((t: any) =>
          t.title.toLowerCase() === titleLower &&
          t.artist.toLowerCase() === artistLower
        );
        // 2. Title contains match + artist match
        if (!match) {
          match = tracks.find((t: any) =>
            t.artist.toLowerCase() === artistLower &&
            (t.title.toLowerCase().includes(titleLower) || titleLower.includes(t.title.toLowerCase()))
          );
        }
        // 3. Partial artist match + exact title
        if (!match) {
          match = tracks.find((t: any) =>
            t.title.toLowerCase() === titleLower &&
            (t.artist.toLowerCase().includes(artistLower) || artistLower.includes(t.artist.toLowerCase()))
          );
        }
        // 4. Only fall back to first result if artist partially matches
        if (!match && tracks.length > 0) {
          const firstTrack = tracks[0];
          if (firstTrack.artist.toLowerCase().includes(artistLower) || artistLower.includes(firstTrack.artist.toLowerCase())) {
            match = firstTrack;
          }
        }

        if (match?.uri) {
          console.log(`[Listen] Spotify match: "${match.artist} - ${match.title}" for "${track!.artist} - ${track!.title}"`);
          setSpotifyUri(match.uri);
        } else {
          console.warn(`[Listen] No Spotify match for "${track!.artist} - ${track!.title}"`);
        }
      } catch (err) {
        console.error("[Listen] Spotify URI search failed:", err);
      }
    }
    findSpotifyUri();
    return () => { cancelled = true; };
  }, [hasSpotifyToken, realTrackMeta?.spotifyUri, track?.artist, track?.title]);

  // Resolve YouTube video ID — for backdrop visuals or audio fallback (no Spotify)
  useEffect(() => {
    setYtVideoId(null);

    // Mock tracks: use existing embedId from mock data
    if (!isRealTrack && ytSource?.embedId) {
      setYtVideoId(ytSource.embedId);
      return;
    }

    // Search YouTube for real tracks (and mock tracks without embedId)
    if (!track) return;
    let cancelled = false;
    async function searchYT() {
      try {
        const { data, error } = await supabase.functions.invoke("youtube-search", {
          body: { query: `${track!.artist} ${track!.title}` },
        });
        if (!cancelled && data?.videoId) setYtVideoId(data.videoId);
        if (error) console.error("[Listen] YouTube search error:", error);
      } catch (err) {
        console.error("[Listen] YouTube search failed:", err);
      }
    }
    searchYT();
    return () => { cancelled = true; };
  }, [isRealTrack, track?.artist, track?.title, ytSource?.embedId]);

  const [shuffleOn, setShuffleOn] = useState(false);
  const [regenerateKey, setRegenerateKey] = useState(0);
  const [skipLoading, setSkipLoading] = useState(false);

  // Mock catalog adjacency
  const { prev: mockPrev, next: mockNext } = useMemo(
    () => isRealTrack ? { prev: null, next: null } : getAdjacentTrackIds(trackId, shuffleOn),
    [isRealTrack, trackId, shuffleOn]
  );

  // Push current track to global history (persists across Listen re-mounts)
  const player = usePlayer();
  useEffect(() => {
    player.pushTrackHistory(`/listen/${rawTrackId}`);
  }, [rawTrackId]);

  // For real tracks: next is always available (we fetch on demand), prev uses global history
  const hasPrev = isRealTrack ? !!player.prevTrackRoute : !!mockPrev;
  const hasNext = isRealTrack ? true : !!mockNext;

  // Fetch a related track from Spotify and navigate to it
  const navigateToRelated = useCallback(async () => {
    if (!track) return;
    setSkipLoading(true);
    try {
      const { data } = await supabase.functions.invoke("spotify-search", {
        body: { query: track.artist },
      });
      const candidates = (data?.tracks || []).filter(
        (t: any) => t.title.toLowerCase() !== track.title.toLowerCase()
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
        navigate(
          `/listen/real::${encodeURIComponent(pick.artist)}::${encodeURIComponent(pick.title)}::${encodeURIComponent(pick.album || "")}::${encodeURIComponent(pick.uri || "")}`
        );
      }
    } catch (err) {
      console.warn("[Listen] Skip next failed:", err);
    } finally {
      setSkipLoading(false);
    }
  }, [track?.artist, track?.title, navigate]);

  const handlePrev = useCallback(() => {
    if (!isRealTrack) {
      if (mockPrev) navigate(`/listen/${mockPrev}`);
      return;
    }
    const prev = player.popTrackHistory();
    if (prev) navigate(prev);
  }, [isRealTrack, mockPrev, navigate, player.popTrackHistory]);

  const handleNext = useCallback(() => {
    if (!isRealTrack) {
      if (mockNext) navigate(`/listen/${mockNext}`);
      return;
    }
    navigateToRelated();
  }, [isRealTrack, mockNext, navigate, navigateToRelated]);

  const handleTrackEnd = useCallback(() => {
    if (!isRealTrack) {
      const { next: nextId } = getAdjacentTrackIds(trackId, shuffleOn);
      if (nextId) navigate(`/listen/${nextId}`);
      return;
    }
    navigateToRelated();
  }, [isRealTrack, trackId, shuffleOn, navigate, navigateToRelated]);

  const {
    isPlaying, currentTime, duration: playerDuration, activePlayer, playerContainerRef,
  } = player;
  const realDuration = playerDuration > 0 ? playerDuration : (track?.durationSec || 300);

  // Register track-end handler on the global player
  useEffect(() => {
    player.setOnEnded(handleTrackEnd);
    return () => player.setOnEnded(null);
  }, [handleTrackEnd]);

  // Fading state for overlay transitions
  const [fadingIn, setFadingIn] = useState(false);

  // Set track metadata on the global player
  useEffect(() => {
    if (!track) return;
    player.setCurrentTrack({
      trackId,
      title: track.title,
      artist: track.artist,
      coverArtUrl: track.coverArtUrl,
      album: track.album,
      spotifyUri: spotifyUri || undefined,
    });
  }, [track?.title, track?.artist, trackId, spotifyUri]);

  // Load track into global player when sources resolve
  // Skip if the same track is already playing (e.g. returning from Browse via mini-player)
  const lastLoadedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ytVideoId && !spotifyUri) return;
    // Already playing this exact track — don't re-load
    const alreadyPlaying =
      (spotifyUri && player.currentSpotifyUri === spotifyUri) ||
      (!spotifyUri && ytVideoId && player.currentVideoId === ytVideoId);
    if (alreadyPlaying) return;
    // Build a key for what we're about to load
    const loadKey = `${ytVideoId || ""}::${spotifyUri || ""}`;
    if (lastLoadedTrackRef.current === loadKey) return;
    lastLoadedTrackRef.current = loadKey;
    player.loadTrack({
      videoId: ytVideoId || undefined,
      spotifyUri: spotifyUri || undefined,
      spotifyAvailable: hasSpotifyToken,
    });
  }, [ytVideoId, spotifyUri, hasSpotifyToken]);

  const play = player.play;
  const seek = player.seek;
  const toggle = player.toggle;
  const pauseForOverlay = player.pause;
  const resumeWithFade = useCallback(() => {
    setFadingIn(true);
    player.play();
    setTimeout(() => setFadingIn(false), 1000);
  }, [player.play]);

  // Get artist's local image for fallback
  const artistData = useMemo(() => getArtistById(track?.artistId || ""), [track?.artistId]);

  // AI-generated nuggets with real sources
  const tier = (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";
  const { nuggets: aiNuggets, sources: aiSources, loading: aiLoading, error: aiError, listenCount } = useAINuggets(
    trackId,
    track?.artist || "",
    track?.title || "",
    track?.album,
    track?.durationSec || 300,
    regenerateKey,
    track?.coverArtUrl,
    artistData?.imageUrl,
    tier
  );

  // Log AI nugget errors for debugging
  useEffect(() => {
    if (aiError) console.error("[Listen] AI nugget error:", aiError);
  }, [aiError]);

  // Pre-generate companion content so QR code only shows when ready
  const [companionReady, setCompanionReady] = useState(false);
  const [shortId, setShortId] = useState<string | null>(null);
  useEffect(() => {
    setCompanionReady(false);
    setShortId(null);
  }, [rawTrackId]);

  useEffect(() => {
    if (aiLoading || aiNuggets.length === 0 || !track) return;
    let cancelled = false;
    (async () => {
      try {
        // Pre-generate companion content so the QR companion page loads instantly.
        // Always use listenCount 1 — the companion page also uses 1 (can't read
        // nugget_history without auth), guaranteeing a cache key match.
        const { error } = await supabase.functions.invoke("generate-companion", {
          body: {
            artist: track.artist,
            title: track.title,
            album: track.album,
            listenCount: 1,
            tier,
          },
        });
        if (cancelled) return;
        if (error) console.warn("[Listen] Companion pre-gen error:", error);

        // Create or reuse a short URL for the QR code (even if pre-gen failed,
        // the companion page will generate on demand)
        try {
          const { data: existing, error: selErr } = await supabase
            .from("companion_links")
            .select("short_id")
            .eq("artist", track.artist)
            .eq("title", track.title)
            .maybeSingle();

          if (cancelled) return;
          if (selErr) console.warn("[Listen] companion_links select error:", selErr);

          if (existing) {
            setShortId(existing.short_id);
          } else {
            const arr = new Uint8Array(6);
            crypto.getRandomValues(arr);
            const newId = Array.from(arr, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62]).join("");
            const { error: insErr } = await supabase.from("companion_links").insert({
              short_id: newId,
              artist: track.artist,
              title: track.title,
              album: track.album || null,
            });
            if (insErr) console.warn("[Listen] companion_links insert error:", insErr);
            if (!cancelled && !insErr) setShortId(newId);
          }
        } catch (linkErr) {
          console.warn("[Listen] Short link creation failed:", linkErr);
        }

        if (!cancelled) setCompanionReady(true);
      } catch {
        // Companion pre-gen failed — QR just won't show
      }
    })();
    return () => { cancelled = true; };
  }, [aiLoading, aiNuggets.length, track?.artist, track?.title, tier]);

  const mockNuggets = useMemo(() => isRealTrack ? [] : getNuggetsForTrack(trackId), [isRealTrack, trackId]);
  const trackNuggets = useMemo(
    () => aiLoading ? [] : (aiNuggets.length > 0 ? aiNuggets : mockNuggets),
    [aiLoading, aiNuggets, mockNuggets]
  );

  const [animStyle, setAnimStyle] = useState<AnimationStyle>("A");
  const [activeNugget, setActiveNugget] = useState<Nugget | null>(null);
  const [nuggetQueue, setNuggetQueue] = useState<Nugget[]>([]);
  const [shownNuggetIds, setShownNuggetIds] = useState<Set<string>>(new Set());
  const [mediaOverlay, setMediaOverlay] = useState<Source | null>(null);
  const [readingOverlay, setReadingOverlay] = useState<Source | null>(null);
  const [deepDiveNugget, setDeepDiveNugget] = useState<Nugget | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [nerdActive, setNerdActive] = useState(true);
  const [backdropMotion, setBackdropMotion] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);

  // --- Auto-hide bar logic ---
  const [barVisible, setBarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBar = useCallback(() => {
    setBarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
  }, []);

  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight * 0.85) showBar();
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [showBar]);

  // Click nugget card to open deep dive
  const handleNuggetClick = useCallback((nugget: Nugget) => {
    setDeepDiveNugget(nugget);
    setNuggetFocused(false);
  }, []);

  const [nuggetFocused, setNuggetFocused] = useState(false);
  const nuggetRef = useRef<HTMLDivElement>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dwelling, setDwelling] = useState(false);

  // Clear dwell timer helper
  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    setDwelling(false);
  }, []);

  // Focus zones: top (back=0, nerd=1), nugget, bar (dislike=0..like=4)
  type FocusZone = 'top' | 'nugget' | 'bar';
  const [focusZone, setFocusZone] = useState<FocusZone>('bar');
  const [barFocusIndex, setBarFocusIndex] = useState(2);
  const [topFocusIndex, setTopFocusIndex] = useState(0); // 0=back, 1=nerd

  const BAR_BUTTON_COUNT = 6;
  const TOP_BUTTON_COUNT = 2;

  const handleBarAction = useCallback((index: number) => {
    switch (index) {
      case 0: setLiked((v) => v === false ? null : false); break;
      case 1: handlePrev(); break;
      case 2: toggle(); break;
      case 3: handleNext(); break;
      case 4: setLiked((v) => v === true ? null : true); break;
      case 5: setShuffleOn((v) => !v); break;
    }
  }, [handlePrev, handleNext, toggle]);

  const handleTopAction = useCallback((index: number) => {
    if (index === 0) navigate("/browse");
    else setNerdActive((v) => !v);
  }, [navigate]);

  // Zone ordering for Up/Down navigation
  const getZonesInOrder = useCallback((): FocusZone[] => {
    const zones: FocusZone[] = ['top'];
    if (activeNugget) zones.push('nugget');
    zones.push('bar');
    return zones;
  }, [activeNugget]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Let overlay handle its own keys when open
      if (deepDiveNugget || mediaOverlay || readingOverlay) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        clearDwell();
        const zones = getZonesInOrder();
        const idx = zones.indexOf(focusZone);
        if (idx > 0) {
          const newZone = zones[idx - 1];
          setFocusZone(newZone);
          setNuggetFocused(newZone === 'nugget');
          if (newZone === 'nugget') {
            nuggetRef.current?.focus();
            // Start dwell timer
            setDwelling(true);
            dwellTimerRef.current = setTimeout(() => {
              if (activeNugget) handleNuggetClick(activeNugget);
              setDwelling(false);
            }, 1500);
          }
          if (newZone !== 'nugget') showBar();
        } else {
          showBar();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        clearDwell();
        const zones = getZonesInOrder();
        const idx = zones.indexOf(focusZone);
        if (idx < zones.length - 1) {
          const newZone = zones[idx + 1];
          setFocusZone(newZone);
          setNuggetFocused(newZone === 'nugget');
          if (newZone === 'nugget') {
            nuggetRef.current?.focus();
            setDwelling(true);
            dwellTimerRef.current = setTimeout(() => {
              if (activeNugget) handleNuggetClick(activeNugget);
              setDwelling(false);
            }, 1500);
          }
          if (newZone === 'bar') showBar();
        } else {
          showBar();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        clearDwell();
        if (focusZone === 'bar') setBarFocusIndex((i) => Math.max(0, i - 1));
        else if (focusZone === 'top') setTopFocusIndex((i) => Math.max(0, i - 1));
        showBar();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        clearDwell();
        if (focusZone === 'bar') setBarFocusIndex((i) => Math.min(BAR_BUTTON_COUNT - 1, i + 1));
        else if (focusZone === 'top') setTopFocusIndex((i) => Math.min(TOP_BUTTON_COUNT - 1, i + 1));
        showBar();
      } else if (e.key === "Enter") {
        e.preventDefault();
        clearDwell();
        if (focusZone === 'nugget' && activeNugget) {
          handleNuggetClick(activeNugget);
          // Don't show bar when entering deep dive
        } else if (focusZone === 'bar') {
          handleBarAction(barFocusIndex);
          showBar();
        } else if (focusZone === 'top') {
          handleTopAction(topFocusIndex);
          showBar();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        showBar();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBar, toggle, focusZone, barFocusIndex, topFocusIndex, activeNugget, handleNuggetClick, handleBarAction, handleTopAction, getZonesInOrder, deepDiveNugget, mediaOverlay, readingOverlay, clearDwell]);

  // Clean up dwell timer on unmount or nugget change
  useEffect(() => {
    return () => clearDwell();
  }, [activeNugget, clearDwell]);

  useEffect(() => { play(); }, [play]);

  useEffect(() => {
    setActiveNugget(null);
    setNuggetQueue([]);
    setShownNuggetIds(new Set());
  }, [aiNuggets]);

  useEffect(() => {
    if (!nerdActive) { setActiveNugget(null); setNuggetQueue([]); }
  }, [nerdActive]);

  const handleSeek = useCallback((t: number) => {
    // Find the nugget whose window contains the seek position
    const targetNugget = trackNuggets.reduce<typeof trackNuggets[0] | null>((best, n) => {
      if (t < n.timestampSec) return best; // haven't reached this nugget yet
      if (!best) return n;
      // Pick the nugget closest to (but not past) the seek time
      return (t - n.timestampSec) < (t - best.timestampSec) ? n : best;
    }, null);

    setNuggetQueue([]);
    seek(t);

    if (targetNugget) {
      // Show only this nugget; mark all nuggets before it as "shown" so they don't re-trigger
      const newShown = new Set<string>();
      for (const n of trackNuggets) {
        if (n.timestampSec <= t) newShown.add(n.id);
      }
      setShownNuggetIds(newShown);
      setActiveNugget(targetNugget);
    } else {
      // Seeked before any nugget — clear active
      setShownNuggetIds(new Set());
      setActiveNugget(null);
    }
  }, [seek, trackNuggets]);

  // Nugget trigger logic — fires on playback tick
  useEffect(() => {
    if (!isPlaying || !nerdActive) return;
    for (const n of trackNuggets) {
      if (shownNuggetIds.has(n.id)) continue;
      if (currentTime >= n.timestampSec) {
        if (activeNugget) {
          setNuggetQueue((q) => (q.find((x) => x.id === n.id) ? q : [...q, n]));
        } else {
          setActiveNugget(n);
          setShownNuggetIds((s) => new Set(s).add(n.id));
        }
      }
    }
  }, [currentTime, isPlaying, nerdActive, trackNuggets, activeNugget, shownNuggetIds]);

  // Auto-dismiss nugget: quick swap if queued, otherwise fade after 8s
  useEffect(() => {
    if (!activeNugget || deepDiveNugget || nuggetFocused) return;
    const delay = nuggetQueue.length > 0 ? 1500 : 8000;
    const timer = setTimeout(() => setActiveNugget(null), delay);
    return () => clearTimeout(timer);
  }, [activeNugget, deepDiveNugget, nuggetFocused, nuggetQueue.length]);

  useEffect(() => {
    if (!activeNugget && nuggetQueue.length > 0) {
      const next = nuggetQueue[0];
      setNuggetQueue((q) => q.slice(1));
      setActiveNugget(next);
      setShownNuggetIds((s) => new Set(s).add(next.id));
    }
  }, [activeNugget, nuggetQueue]);

  const getSource = useCallback((sourceId: string): Source | undefined => {
    return aiSources.get(sourceId) || getSourceById(sourceId);
  }, [aiSources]);

  const handleSourceClick = useCallback(
    (nugget: Nugget) => {
      const source = getSource(nugget.sourceId);
      if (!source) return;
      if (source.type === "youtube") {
        pauseForOverlay();
        setMediaOverlay(source);
      } else {
        setReadingOverlay(source);
      }
    },
    [pauseForOverlay, getSource]
  );


  const jumpToNugget = useCallback(
    (idx: number) => {
      const n = trackNuggets[idx];
      if (!n) return;
      // Directly set the nugget — no setTimeout race condition
      setNuggetQueue([]);
      setShownNuggetIds(new Set([n.id]));
      setActiveNugget(n);
      seek(n.timestampSec);
    },
    [trackNuggets, seek]
  );

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // Must be called unconditionally — before any early returns
  useThemeSync(track?.coverArtUrl ?? "");

  if (!track) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center flex-col gap-4">
          <p className="text-foreground">Track not found.</p>
          <button onClick={() => navigate("/browse")} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Browse
          </button>
        </div>
      </PageTransition>
    );
  }

  const effectiveDuration = realDuration > 0 ? realDuration : track.durationSec;
  const progress = (currentTime / effectiveDuration) * 100;

  return (
    <PageTransition>
      <div className="relative flex h-screen flex-col overflow-hidden">
        {/* Background: YouTube player (visible as backdrop) or cover art */}
        <div className="absolute inset-0">
          {/* Global YouTube player — reposition into view when backdrop is on */}
          <GlobalPlayerBackdrop
            containerRef={playerContainerRef}
            visible={backdropMotion && !!ytVideoId}
            dim={barVisible}
          />
          {/* Cover art fallback — shown when no backdrop motion or no video */}
          {(!backdropMotion || !ytVideoId) && (
            <img
              src={track.coverArtUrl}
              alt=""
              className="h-full w-full object-cover scale-110 transition-all duration-700 ease-out"
              style={{
                filter: barVisible
                  ? "blur(12px) brightness(0.4)"
                  : "blur(2px) brightness(0.85)",
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>
        <div className="vignette absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-10 pt-8">
          <button
            onClick={() => navigate("/browse")}
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
              focusZone === 'top' && topFocusIndex === 0 ? "tv-focus-glow scale-110" : ""
            }`}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          {focusZone === 'top' && (
            <motion.p
              key={topFocusIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute left-1/2 -translate-x-1/2 top-14 text-xs text-muted-foreground"
            >
              {topFocusIndex === 0 ? "Back" : "Open Companion"}
            </motion.p>
          )}
          <button
            onClick={() => {
              if (shortId) {
                window.open(`${window.location.origin}/c/${shortId}`, "_blank");
              }
            }}
            disabled={!shortId}
            className={`transition-all duration-300 outline-none rounded-full ${
              focusZone === 'top' && topFocusIndex === 1 ? "tv-focus-glow scale-110" : ""
            }`}
            aria-label="Open companion page"
            style={{
              filter: shortId
                ? "drop-shadow(0 0 8px hsl(var(--neon-glow) / 0.7)) drop-shadow(0 0 24px hsl(var(--neon-glow) / 0.35))"
                : "grayscale(1) opacity(0.4)",
              transition: "filter 0.4s ease",
            }}
          >
            <MusicNerdLogo size={40} glow={false} />
          </button>
        </div>

        {/* Track info */}
        <motion.div
          className="relative z-10 px-10 mt-4"
          animate={{ opacity: barVisible ? 1 : 0, y: barVisible ? 0 : -10 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1 className="text-2xl font-black text-foreground/80 leading-tight tracking-tight md:text-3xl" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {track.title}
          </h1>
          <p className="mt-0.5 text-base font-bold text-foreground/50 md:text-lg" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {track.artist}
          </p>
          {track.album && (
            <p className="mt-0.5 text-sm text-foreground/25 font-medium" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
              {track.album}
            </p>
          )}
        </motion.div>

        {/* Nugget cards — clickable for deep dive */}
        <div className="relative z-10 flex flex-1 items-center justify-end px-4 pb-24 md:px-10">
          <div className="w-full max-w-[520px] shrink-0">
            <AnimatePresence mode="wait">
              {activeNugget && (
                <motion.div
                  key={activeNugget.id}
                  ref={nuggetRef}
                  tabIndex={0}
                  className="cursor-pointer outline-none"
                  onClick={() => !deepDiveNugget && handleNuggetClick(activeNugget)}
                  onFocus={() => setNuggetFocused(true)}
                  onBlur={() => setNuggetFocused(false)}
                  animate={{ opacity: deepDiveNugget ? 0 : 1, scale: deepDiveNugget ? 0.95 : 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  style={{ pointerEvents: deepDiveNugget ? "none" : "auto" }}
                >
                  <NuggetCard
                    nugget={activeNugget}
                    animationStyle={animStyle}
                    onSourceClick={() => handleSourceClick(activeNugget)}
                    currentTime={formatTime(activeNugget.timestampSec)}
                    sourceOverride={getSource(activeNugget.sourceId) || null}
                    focused={nuggetFocused && !deepDiveNugget}
                  />
                  {nuggetFocused && !deepDiveNugget && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-2 text-center text-xs text-muted-foreground"
                    >
                      {dwelling ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Exploring…
                        </span>
                      ) : (
                        "Press Enter to explore"
                      )}
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Playback controls */}
        <PlaybackBar
          isPlaying={isPlaying}
          fadingIn={fadingIn}
          progress={progress}
          currentTimeFormatted={formatTime(currentTime)}
          durationFormatted={formatTime(effectiveDuration)}
          visible={barVisible}
          hasPrev={hasPrev}
          hasNext={hasNext}
          liked={liked}
          shuffle={shuffleOn}
          nuggetMarkers={trackNuggets.map((n) => (n.timestampSec / effectiveDuration) * 100)}
          focusedIndex={focusZone === 'bar' ? barFocusIndex : null}
          onToggle={() => { showBar(); toggle(); }}
          onSeek={(pct) => { showBar(); handleSeek(pct * effectiveDuration); }}
          onPrev={handlePrev}
          onNext={handleNext}
          onLike={() => setLiked((v) => v === true ? null : true)}
          onDislike={() => setLiked((v) => v === false ? null : false)}
          onShuffle={() => setShuffleOn((v) => !v)}
        />

        {/* QR Code — only shown once companion content is pre-generated */}
        {companionReady && shortId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.85, scale: 1 }}
            className="fixed bottom-6 left-6 z-10 hover:opacity-100 transition-opacity rounded-xl overflow-hidden"
          >
            <QRCode
              value={`${window.location.origin}/c/${shortId}`}
              size={140}
              qrStyle="dots"
              eyeRadius={8}
              fgColor="#ffffff"
              bgColor="transparent"
              ecLevel="H"
              quietZone={8}
            />
          </motion.div>
        )}

        {/* Dev panel — development only */}
        {import.meta.env.DEV && (
        <button
          onClick={() => setDevOpen((o) => !o)}
          className="fixed bottom-4 right-4 z-50 rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/10 transition-colors"
        >
          DEV
        </button>
        )}

        {import.meta.env.DEV && (
        <AnimatePresence>
          {devOpen && (
            <DevPanel
              animStyle={animStyle}
              setAnimStyle={setAnimStyle}
              onJumpToNugget={jumpToNugget}
              nuggetCount={trackNuggets.length}
              backdropMotion={backdropMotion}
              setBackdropMotion={setBackdropMotion}
              listenCount={listenCount}
              trackKey={track ? `${track.artist}::${track.title}` : undefined}
              onResetHistory={async () => {
                if (!track) return;
                const trackKey = `${track.artist}::${track.title}`;
                await supabase.from("nugget_history").delete().eq("track_key", trackKey);
                setRegenerateKey((k) => k + 1);
              }}
              onResetAllHistory={async () => {
                if (!window.confirm("Delete ALL listening history? This cannot be undone.")) return;
                await supabase.from("nugget_history").delete().neq("track_key", "");
                setRegenerateKey((k) => k + 1);
              }}
              activePlayer={activePlayer}
              spotifyUri={spotifyUri}
              ytVideoId={ytVideoId}
              onIncrementListen={async () => {
                if (!track) return;
                const trackKey = `${track.artist}::${track.title}`;
                const { data } = await supabase.from("nugget_history").select("listen_count").eq("track_key", trackKey).maybeSingle();
                if (data) {
                  await supabase.from("nugget_history").update({ listen_count: (data.listen_count || 1) + 1, updated_at: new Date().toISOString() }).eq("track_key", trackKey);
                }
                setRegenerateKey((k) => k + 1);
              }}
            />
          )}
        </AnimatePresence>
        )}

        {/* Overlays */}
        <AnimatePresence>
          {mediaOverlay && (
            <MediaOverlay
              source={mediaOverlay}
              onClose={() => { setMediaOverlay(null); resumeWithFade(); }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {readingOverlay && (
            <ReadingOverlay
              source={readingOverlay}
              onClose={() => setReadingOverlay(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {deepDiveNugget && (
            <NuggetDeepDive
              nugget={deepDiveNugget}
              source={getSource(deepDiveNugget.sourceId) || null}
              artist={track.artist}
              trackTitle={track.title}
              onClose={() => { setDeepDiveNugget(null); setFocusZone('bar'); setNuggetFocused(false); }}
            />
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

/** Moves the global YT player container into view as a backdrop. */
function GlobalPlayerBackdrop({ containerRef, visible, dim }: {
  containerRef: React.RefObject<HTMLDivElement>;
  visible: boolean;
  dim: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Reposition the global player into this wrapper
    el.style.position = "absolute";
    el.style.zIndex = "0";
    el.style.opacity = visible ? "1" : "0";
    el.style.pointerEvents = "none";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.height = "100%";

    const wrapper = wrapperRef.current;
    if (wrapper && el.parentElement !== wrapper) {
      wrapper.appendChild(el);
    }

    return () => {
      // Move back to body-level when leaving Listen page
      el.style.position = "fixed";
      el.style.zIndex = "-1";
      el.style.opacity = "0";
      document.body.appendChild(el);
    };
  }, [containerRef, visible]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.opacity = visible ? "1" : "0";
  }, [containerRef, visible]);

  return (
    <div
      ref={wrapperRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none scale-[1.3] transition-all duration-700 ease-out ${
        visible
          ? dim ? 'brightness-[0.35]' : 'brightness-[0.8]'
          : 'opacity-0'
      }`}
    />
  );
}
