import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import NuggetCard from "@/components/NuggetCard";
import MediaOverlay from "@/components/overlays/MediaOverlay";
import ReadingOverlay from "@/components/overlays/ReadingOverlay";
import DevPanel from "@/components/DevPanel";
import PlaybackBar from "@/components/PlaybackBar";
import { getTrackById, getNuggetsForTrack, getSourceById } from "@/mock/tracks";
import { usePlayback } from "@/hooks/usePlayback";
import PageTransition from "@/components/PageTransition";
import type { Nugget, Source, AnimationStyle } from "@/mock/types";

export default function Listen() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const track = getTrackById(trackId || "");
  const trackNuggets = useMemo(() => getNuggetsForTrack(trackId || ""), [trackId]);

  const { isPlaying, currentTime, fadingIn, play, pause, seek, toggle, pauseForOverlay, resumeWithFade } =
    usePlayback(track?.durationSec || 300);

  const [animStyle, setAnimStyle] = useState<AnimationStyle>("A");
  const [activeNugget, setActiveNugget] = useState<Nugget | null>(null);
  const [nuggetQueue, setNuggetQueue] = useState<Nugget[]>([]);
  const [shownNuggetIds, setShownNuggetIds] = useState<Set<string>>(new Set());
  const [mediaOverlay, setMediaOverlay] = useState<Source | null>(null);
  const [readingOverlay, setReadingOverlay] = useState<Source | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  // Auto-play on mount
  useEffect(() => { play(); }, [play]);

  // Nugget trigger logic
  useEffect(() => {
    if (!isPlaying) return;
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
        {/* Background: full-bleed cover art with heavy blur */}
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

        {/* Top bar: back button + logo */}
        <div className="relative z-10 flex items-center gap-4 px-10 pt-8">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-colors hover:bg-foreground/20 tv-focus-visible"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <MusicNerdLogo size={36} glow className="opacity-80" />
        </div>

        {/* Main layout: artist info bottom-left, nugget right-center */}
        <div className="relative z-10 flex flex-1 items-end px-10 pb-28">
          {/* Bottom-left: Artist / Track / Album — large cinematic type */}
          <div className="flex-1 max-w-2xl">
            <h1 className="text-6xl font-bold text-foreground leading-none tracking-tight md:text-7xl lg:text-8xl" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
              {track.artist}
            </h1>
            <p className="mt-3 text-2xl text-foreground/80 md:text-3xl">{track.title}</p>
            {track.album && (
              <p className="mt-1 text-lg text-foreground/40">{track.album}</p>
            )}
          </div>

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

        {/* Playback controls */}
        <PlaybackBar
          isPlaying={isPlaying}
          fadingIn={fadingIn}
          progress={progress}
          currentTimeFormatted={formatTime(currentTime)}
          durationFormatted={formatTime(track.durationSec)}
          onToggle={toggle}
          onSeek={(pct) => seek(pct * track.durationSec)}
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
