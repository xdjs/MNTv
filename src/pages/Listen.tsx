import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import NuggetCard from "@/components/NuggetCard";
import MediaOverlay from "@/components/overlays/MediaOverlay";
import ReadingOverlay from "@/components/overlays/ReadingOverlay";
import DevPanel from "@/components/DevPanel";
import PlaybackBar from "@/components/PlaybackBar";
import { getTrackById, getNuggetsForTrack, getSourceById, getAdjacentTrackIds, getYouTubeSourceForTrack } from "@/mock/tracks";
import { usePlayback } from "@/hooks/usePlayback";
import { useAINuggets } from "@/hooks/useAINuggets";
import PageTransition from "@/components/PageTransition";
import type { Nugget, Source, AnimationStyle } from "@/mock/types";

const HIDE_DELAY = 3000; // ms before bar auto-hides

export default function Listen() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const track = getTrackById(trackId || "");
  const { prev, next } = useMemo(() => getAdjacentTrackIds(trackId || ""), [trackId]);

  const { isPlaying, currentTime, fadingIn, play, pause, seek, toggle, pauseForOverlay, resumeWithFade } =
    usePlayback(track?.durationSec || 300);

  // AI-generated nuggets with real sources
  const { nuggets: aiNuggets, sources: aiSources, loading: aiLoading } = useAINuggets(
    trackId || "",
    track?.artist || "",
    track?.title || "",
    track?.album,
    track?.durationSec || 300
  );

  // Use AI nuggets when available, fall back to mock
  const mockNuggets = useMemo(() => getNuggetsForTrack(trackId || ""), [trackId]);
  const trackNuggets = aiNuggets.length > 0 ? aiNuggets : mockNuggets;


  const [animStyle, setAnimStyle] = useState<AnimationStyle>("A");
  const [activeNugget, setActiveNugget] = useState<Nugget | null>(null);
  const [nuggetQueue, setNuggetQueue] = useState<Nugget[]>([]);
  const [shownNuggetIds, setShownNuggetIds] = useState<Set<string>>(new Set());
  const [mediaOverlay, setMediaOverlay] = useState<Source | null>(null);
  const [readingOverlay, setReadingOverlay] = useState<Source | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [nerdActive, setNerdActive] = useState(true);
  const [backdropMotion, setBackdropMotion] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const ytSource = useMemo(() => getYouTubeSourceForTrack(trackId || ""), [trackId]);

  // --- Auto-hide bar logic ---
  const [barVisible, setBarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBar = useCallback(() => {
    setBarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
  }, []);

  // Show bar initially then auto-hide
  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // Mouse move at bottom 15% of screen shows bar
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight * 0.85) {
        showBar();
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [showBar]);

  // ArrowUp / any key activity shows bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        showBar();
      } else if (e.key === " ") {
        e.preventDefault();
        showBar();
        toggle();
      } else if (e.key === "ArrowRight" && next) {
        navigate(`/listen/${next}`);
      } else if (e.key === "ArrowLeft" && prev) {
        navigate(`/listen/${prev}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBar, toggle, navigate, prev, next]);

  // Auto-play on mount
  useEffect(() => { play(); }, [play]);

  // Reset nugget state when AI nuggets arrive
  useEffect(() => {
    setActiveNugget(null);
    setNuggetQueue([]);
    setShownNuggetIds(new Set());
  }, [aiNuggets]);

  // Clear nuggets when nerd mode is turned off
  useEffect(() => {
    if (!nerdActive) {
      setActiveNugget(null);
      setNuggetQueue([]);
    }
  }, [nerdActive]);

  // Nugget trigger logic
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

  // Auto-dismiss nugget
  useEffect(() => {
    if (!activeNugget) return;
    const timer = setTimeout(() => setActiveNugget(null), activeNugget.durationMs);
    return () => clearTimeout(timer);
  }, [activeNugget]);

  // Process queue
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
      setActiveNugget(null);
      setShownNuggetIds(new Set());
      setNuggetQueue([]);
      seek(n.timestampSec);
      setTimeout(() => {
        setActiveNugget(n);
        setShownNuggetIds(new Set([n.id]));
      }, 100);
    },
    [trackNuggets, seek]
  );

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (!track) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-foreground">Track not found.</p>
        </div>
      </PageTransition>
    );
  }

  const progress = (currentTime / track.durationSec) * 100;

  return (
    <PageTransition>
      <div className="relative flex h-screen flex-col overflow-hidden">
        {/* Background: YouTube motion or cover art */}
        <div className="absolute inset-0">
          {backdropMotion && ytSource?.embedId ? (
            <div className="absolute inset-0 overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${ytSource.embedId}?autoplay=1&mute=1&loop=1&playlist=${ytSource.embedId}&controls=0&showinfo=0&modestbranding=1&rel=0&disablekb=1`}
                title="Backdrop motion"
                allow="autoplay"
                className="absolute inset-0 w-full h-full pointer-events-none scale-[1.3] brightness-[0.35]"
                style={{ border: "none" }}
              />
            </div>
          ) : (
            <img
              src={track.coverArtUrl}
              alt=""
              className="h-full w-full object-cover scale-110 transition-all duration-700 ease-out"
              style={{
                filter: barVisible
                  ? "blur(12px) brightness(0.45)"
                  : "blur(2px) brightness(0.35)",
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>
        <div className="vignette absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />

        {/* Top bar: back button left, pill + logo right */}
        <div className="relative z-10 flex items-center justify-between px-10 pt-8">
          <button
            onClick={() => navigate("/browse")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-colors hover:bg-foreground/20 tv-focus-visible"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => setNerdActive((v) => !v)}
            className="transition-all duration-300 outline-none rounded-full tv-focus-visible"
            aria-label={nerdActive ? "Turn off MusicNerd" : "Turn on MusicNerd"}
            style={{
              filter: nerdActive
                ? "drop-shadow(0 0 8px hsl(330 90% 60% / 0.7)) drop-shadow(0 0 24px hsl(330 90% 60% / 0.35))"
                : "grayscale(1) opacity(0.4)",
              transition: "filter 0.4s ease",
            }}
          >
            <MusicNerdLogo size={40} glow={false} />
          </button>
        </div>

        {/* Track info — hides with playback bar */}
        <motion.div
          className="relative z-10 px-10 mt-4"
          initial={false}
          animate={{ opacity: barVisible ? 1 : 0, y: barVisible ? 0 : -10 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
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

        {/* Main content: VH1 Pop Up style nuggets — random placement */}
        <div className="relative z-10 flex-1 pb-24">
          <AnimatePresence mode="wait">
            {activeNugget && (
              <NuggetCard
                key={activeNugget.id}
                nugget={activeNugget}
                animationStyle={animStyle}
                onSourceClick={() => handleSourceClick(activeNugget)}
                currentTime={formatTime(activeNugget.timestampSec)}
                sourceOverride={getSource(activeNugget.sourceId) || null}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Playback controls — auto-hiding */}
        <PlaybackBar
          isPlaying={isPlaying}
          fadingIn={fadingIn}
          progress={progress}
          currentTimeFormatted={formatTime(currentTime)}
          durationFormatted={formatTime(track.durationSec)}
          visible={barVisible}
          hasPrev={!!prev}
          hasNext={!!next}
          liked={liked}
          nuggetMarkers={trackNuggets.map((n) => (n.timestampSec / track.durationSec) * 100)}
          onToggle={() => { showBar(); toggle(); }}
          onSeek={(pct) => { showBar(); seek(pct * track.durationSec); }}
          onPrev={() => prev && navigate(`/listen/${prev}`)}
          onNext={() => next && navigate(`/listen/${next}`)}
          onLike={() => setLiked((v) => v === true ? null : true)}
          onDislike={() => setLiked((v) => v === false ? null : false)}
        />

        {/* Dev panel toggle */}
        <button
          onClick={() => setDevOpen((o) => !o)}
          className="fixed bottom-4 right-4 z-50 rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/10 transition-colors"
        >
          DEV
        </button>

        <AnimatePresence>
          {devOpen && (
            <DevPanel
              animStyle={animStyle}
              setAnimStyle={setAnimStyle}
              onJumpToNugget={jumpToNugget}
              nuggetCount={trackNuggets.length}
              backdropMotion={backdropMotion}
              setBackdropMotion={setBackdropMotion}
            />
          )}
        </AnimatePresence>

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
      </div>
    </PageTransition>
  );
}
