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
import { getTrackById, getNuggetsForTrack, getSourceById, getAdjacentTrackIds } from "@/mock/tracks";
import { usePlayback } from "@/hooks/usePlayback";
import PageTransition from "@/components/PageTransition";
import type { Nugget, Source, AnimationStyle } from "@/mock/types";

const HIDE_DELAY = 3000; // ms before bar auto-hides

export default function Listen() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const track = getTrackById(trackId || "");
  const trackNuggets = useMemo(() => getNuggetsForTrack(trackId || ""), [trackId]);
  const { prev, next } = useMemo(() => getAdjacentTrackIds(trackId || ""), [trackId]);

  const { isPlaying, currentTime, fadingIn, play, pause, seek, toggle, pauseForOverlay, resumeWithFade } =
    usePlayback(track?.durationSec || 300);

  const [animStyle, setAnimStyle] = useState<AnimationStyle>("A");
  const [activeNugget, setActiveNugget] = useState<Nugget | null>(null);
  const [nuggetQueue, setNuggetQueue] = useState<Nugget[]>([]);
  const [shownNuggetIds, setShownNuggetIds] = useState<Set<string>>(new Set());
  const [mediaOverlay, setMediaOverlay] = useState<Source | null>(null);
  const [readingOverlay, setReadingOverlay] = useState<Source | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [nerdActive, setNerdActive] = useState(true);

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
  }, [currentTime, isPlaying, trackNuggets, activeNugget, shownNuggetIds]);

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

  const handleSourceClick = useCallback(
    (nugget: Nugget) => {
      const source = getSourceById(nugget.sourceId);
      if (!source) return;
      if (source.type === "youtube") {
        pauseForOverlay();
        setMediaOverlay(source);
      } else {
        setReadingOverlay(source);
      }
    },
    [pauseForOverlay]
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
        {/* Background: full-bleed cover art */}
        <div className="absolute inset-0">
          <img
            src={track.coverArtUrl}
            alt=""
            className="h-full w-full object-cover blur-[12px] scale-110 brightness-[0.45]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
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

        {/* Main layout: artist info bottom-left, nugget right-center */}
        <div className="relative z-10 flex flex-1 items-end px-10 pb-44">
          {/* Bottom-left: Title > Artist > Album hierarchy */}
          <motion.div
            className="flex-1 max-w-2xl"
            animate={{ y: barVisible ? 0 : 32 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            <h1 className="text-6xl font-black text-foreground leading-[0.95] tracking-tight md:text-7xl lg:text-8xl" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
              {track.title}
            </h1>
            <p className="mt-3 text-2xl font-bold text-foreground/70 md:text-3xl" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
              {track.artist}
            </p>
            {track.album && (
              <p className="mt-1 text-base text-foreground/35 font-medium" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
                {track.album}
              </p>
            )}
          </motion.div>

          {/* Right side: Nugget display area */}
          <div className="w-[380px] shrink-0 ml-8">
            <AnimatePresence mode="wait">
              {activeNugget && (
                <NuggetCard
                  key={activeNugget.id}
                  nugget={activeNugget}
                  animationStyle={animStyle}
                  onSourceClick={() => handleSourceClick(activeNugget)}
                  currentTime={formatTime(activeNugget.timestampSec)}
                />
              )}
            </AnimatePresence>
          </div>
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
          onToggle={() => { showBar(); toggle(); }}
          onSeek={(pct) => { showBar(); seek(pct * track.durationSec); }}
          onPrev={() => prev && navigate(`/listen/${prev}`)}
          onNext={() => next && navigate(`/listen/${next}`)}
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
