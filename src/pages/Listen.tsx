import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, ChevronLeft } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import NuggetCard from "@/components/NuggetCard";
import MediaOverlay from "@/components/overlays/MediaOverlay";
import ReadingOverlay from "@/components/overlays/ReadingOverlay";
import DevPanel from "@/components/DevPanel";
import { getTrackById, getNuggetsForTrack, getSourceById } from "@/mock/tracks";
import { usePlayback } from "@/hooks/usePlayback";
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
    const timer = setTimeout(() => {
      setActiveNugget(null);
    }, activeNugget.durationMs);
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
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        {/* Background: blurred cover art */}
        <div className="absolute inset-0">
          <img
            src={track.coverArtUrl}
            alt=""
            className="h-full w-full object-cover blur-[60px] scale-110 brightness-[0.3]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <div className="vignette absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-8 pt-6">
          <button onClick={() => navigate("/now-playing")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors tv-focus-visible rounded-lg p-2">
            <ChevronLeft size={20} />
            <span className="text-sm">Back</span>
          </button>
          <MusicNerdLogo size={32} glow className="opacity-60" />
        </div>

        {/* Main content area */}
        <div className="relative z-10 flex flex-1 flex-col justify-between px-10 pb-8 pt-4">
          {/* Track info - left side */}
          <div className="flex items-start gap-6 mt-8">
            <img
              src={track.coverArtUrl}
              alt={track.title}
              className="h-24 w-24 rounded-xl object-cover shadow-2xl md:h-32 md:w-32"
              onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
            />
            <div>
              <h1 className="text-3xl font-bold text-foreground md:text-5xl">{track.title}</h1>
              <p className="mt-1 text-lg text-muted-foreground md:text-xl">{track.artist}</p>
              {track.album && <p className="text-sm text-muted-foreground/50">{track.album}</p>}
            </div>
          </div>

          {/* Nugget display area - bottom left */}
          <div className="mb-20 mt-auto max-w-lg">
            <AnimatePresence mode="wait">
              {activeNugget && (
                <NuggetCard
                  key={activeNugget.id}
                  nugget={activeNugget}
                  animationStyle={animStyle}
                  onSourceClick={() => handleSourceClick(activeNugget)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Playback controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20 px-10 pb-8">
            <div className={`flex items-center gap-4 transition-opacity duration-1000 ${fadingIn ? "opacity-60" : "opacity-100"}`}>
              <button
                onClick={toggle}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-colors hover:bg-foreground/20 tv-focus-visible"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
              <span className="w-14 text-right text-sm text-muted-foreground tabular-nums">{formatTime(currentTime)}</span>
              <div
                className="relative flex-1 h-1.5 rounded-full bg-foreground/10 cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  seek(pct * track.durationSec);
                }}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${progress}%`, transform: `translateX(-50%) translateY(-50%)` }}
                />
              </div>
              <span className="w-14 text-sm text-muted-foreground tabular-nums">{formatTime(track.durationSec)}</span>
            </div>
          </div>
        </div>

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
