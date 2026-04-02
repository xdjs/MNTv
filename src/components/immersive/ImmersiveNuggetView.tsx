import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Loader2, X } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/integrations/supabase/client";
import type { Nugget, Source } from "@/mock/types";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TypewriterText from "./TypewriterText";
import FlipCard from "./FlipCard";
import SwipeableNuggetStack from "./SwipeableNuggetStack";


interface ImmersiveNuggetViewProps {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  coverArtUrl: string;
  spotifyAlbumArt?: string;
  trackTitle: string;
  artist: string;
  album?: string;
  loading?: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

const KIND_LABELS: Record<string, string> = {
  artist: "The Artist",
  track: "The Track",
  context: "Context",
  discovery: "Discover",
};

export default function ImmersiveNuggetView({
  nuggets,
  sources,
  coverArtUrl,
  trackTitle,
  artist,
  loading = false,
  onClose,
  onPrev,
  onNext,
  spotifyAlbumArt,
}: ImmersiveNuggetViewProps) {
  const { isPlaying, currentTime, duration, toggle, seek } = usePlayer();
  const artUrl = coverArtUrl || spotifyAlbumArt || "";

  // ── Media Session API — lock screen / control center metadata ──────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle,
      artist: artist,
      artwork: artUrl ? [
        { src: artUrl, sizes: "512x512", type: "image/jpeg" },
      ] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler("previoustrack", () => onPrev?.());
    navigator.mediaSession.setActionHandler("nexttrack", () => onNext?.());
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [trackTitle, artist, artUrl, toggle, onPrev, onNext]);

  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [nuggetDismissed, setNuggetDismissed] = useState(false);
  const [deepDiveText, setDeepDiveText] = useState<string | null>(null);
  const [deepDiveFollowUp, setDeepDiveFollowUp] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [typewriterDoneIds, setTypewriterDoneIds] = useState<Set<string>>(new Set());
  const failedImagesRef = useRef<Set<string>>(new Set());
  const prevUnlockedCountRef = useRef(0);
  const prevTrackKeyRef = useRef(`${trackTitle}::${artist}`);

  // ── Reset all state when track changes ─────────────────────────────
  useEffect(() => {
    const key = `${trackTitle}::${artist}`;
    if (key !== prevTrackKeyRef.current) {
      prevTrackKeyRef.current = key;
      setUnlockedIds(new Set());
      setActiveIndex(0);
      setFlipped(false);
      setNuggetDismissed(false);
      setDeepDiveText(null);
      setDeepDiveFollowUp(null);
      prevUnlockedCountRef.current = 0;
      setTypewriterDoneIds(new Set());
    }
  }, [trackTitle, artist]);

  // ── Unlock nuggets based on playback time ──────────────────────────
  useEffect(() => {
    if (nuggets.length === 0) return;
    const newUnlocked = new Set(unlockedIds);
    let changed = false;
    for (let i = 0; i < nuggets.length; i++) {
      if (currentTime >= nuggets[i].timestampSec && !newUnlocked.has(nuggets[i].id)) {
        newUnlocked.add(nuggets[i].id);
        changed = true;
      }
    }
    if (changed) {
      setUnlockedIds(newUnlocked);
    }
  }, [currentTime, nuggets]);

  // ── Auto-show nugget when a NEW one unlocks ────────────────────────
  useEffect(() => {
    const currentCount = unlockedIds.size;
    if (currentCount > prevUnlockedCountRef.current && currentCount > 0) {
      // A new nugget just unlocked — show it automatically
      const unlockedArray = nuggets.filter((n) => unlockedIds.has(n.id));
      const latestIndex = nuggets.indexOf(unlockedArray[unlockedArray.length - 1]);
      if (latestIndex >= 0) {
        setActiveIndex(latestIndex);
        setFlipped(false);
        setNuggetDismissed(false); // auto-show the new nugget
        setDeepDiveText(null);
      }
    }
    prevUnlockedCountRef.current = currentCount;
  }, [unlockedIds, nuggets]);

  // ── Unlock first nugget immediately for seed/cached data ───────────
  useEffect(() => {
    if (nuggets.length > 0 && unlockedIds.size === 0) {
      const initial = new Set<string>();
      // Unlock all nuggets whose timestamp has already passed
      for (const n of nuggets) {
        if (currentTime >= n.timestampSec) {
          initial.add(n.id);
        }
      }
      // Always unlock at least the first one
      if (initial.size === 0) initial.add(nuggets[0].id);
      setUnlockedIds(initial);
      setActiveIndex(0);
    }
  }, [nuggets]);

  const activeNugget = nuggets[activeIndex];
  const activeSource = activeNugget ? sources.get(activeNugget.sourceId) : undefined;
  const unlockedCount = unlockedIds.size;
  const isTypewriterDone = activeNugget ? typewriterDoneIds.has(activeNugget.id) : false;
  const showCard = activeNugget && !nuggetDismissed;

  const handleFlip = useCallback(() => setFlipped((f) => !f), []);
  const handleSwipe = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
    setFlipped(false);
    setDeepDiveText(null);
    setDeepDiveFollowUp(null);
  }, []);
  const handleTypewriterComplete = useCallback(() => {
    if (activeNugget) {
      setTypewriterDoneIds((prev) => new Set(prev).add(activeNugget.id));
    }
  }, [activeNugget]);

  const handleDismissNugget = useCallback(() => {
    setNuggetDismissed(true);
    setFlipped(false);
    setDeepDiveText(null);
  }, []);

  const handleTellMeMore = useCallback(async () => {
    if (!activeNugget || deepDiveLoading) return;
    setDeepDiveLoading(true);
    try {
      const { data } = await supabase.functions.invoke("generate-nuggets", {
        body: {
          artist,
          title: trackTitle,
          deepDive: true,
          context: `${activeNugget.headline}\n${activeNugget.text}`,
          sourceTitle: activeSource?.title,
          sourcePublisher: activeSource?.publisher,
        },
      });
      if (data?.deepDive) {
        setDeepDiveText(data.deepDive.text);
        setDeepDiveFollowUp(data.deepDive.followUp || null);
      }
    } catch (e) {
      console.error("[ImmersiveView] Deep dive failed:", e);
    } finally {
      setDeepDiveLoading(false);
    }
  }, [activeNugget, activeSource, artist, trackTitle, deepDiveLoading]);

  // ── Track end detection — auto-advance to next track ─────────────
  const trackEndFiredRef = useRef(false);
  useEffect(() => {
    // Reset on track change
    trackEndFiredRef.current = false;
  }, [trackTitle, artist]);

  useEffect(() => {
    if (duration > 0 && currentTime > 0 && duration - currentTime < 1.5 && !trackEndFiredRef.current) {
      trackEndFiredRef.current = true;
      onNext?.();
    }
  }, [currentTime, duration, onNext]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const [scrubbing, setScrubbing] = useState(false);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black overflow-hidden flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        {artUrl && (
          <img
            src={artUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(48px) brightness(0.25) saturate(1.4)", transform: "scale(1.3)" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>

      {/* Top bar */}
      <div className="relative z-30 flex items-center gap-3 px-4 pt-3 pb-2" style={{ paddingTop: "max(env(safe-area-inset-top, 12px), 12px)" }}>
        <button
          className="h-9 w-9 flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          onClick={onClose}
        >
          <ArrowLeft className="w-4 h-4 text-white/70" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/80 truncate">{trackTitle}</p>
          <p className="text-xs text-white/40 truncate">{artist}</p>
        </div>
        {showCard && (
          <button
            className="h-9 w-9 flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            onPointerDown={(e) => { e.stopPropagation(); handleDismissNugget(); }}
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 min-h-0 mb-2">
        <AnimatePresence mode="wait">
          {showCard ? (
            /* ── Nugget card — single persistent wrapper, content swaps instantly ── */
            <motion.div
              key="nugget-card"
              className="w-full max-w-md flex-1 min-h-0"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <SwipeableNuggetStack
                count={nuggets.length}
                unlockedCount={unlockedCount}
                activeIndex={activeIndex}
                onSwipe={handleSwipe}
                disabled={flipped}
              >
                {() => (
                  <div data-card className="w-full h-full">
                    <FlipCard
                      flipped={flipped}
                      onFlip={handleFlip}
                      front={
                        <motion.div
                          className="relative flex flex-col justify-end h-full px-7 pb-10 pt-16 text-left"
                          animate={{ y: [0, -2, 0] }}
                          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        >
                          {/* Background image — nugget image, or album art as fallback */}
                          {(() => {
                            const nuggetImg = activeNugget.imageUrl && !failedImagesRef.current.has(activeNugget.imageUrl)
                              ? activeNugget.imageUrl : null;
                            const bgImg = nuggetImg || artUrl;
                            return bgImg ? (
                              <img
                                src={bgImg}
                                alt=""
                                className={`absolute inset-0 w-full h-full object-cover rounded-3xl ${!nuggetImg ? "scale-110 blur-sm" : ""}`}
                                onError={(e) => {
                                  if (nuggetImg) {
                                    failedImagesRef.current.add(nuggetImg);
                                    // Swap to album art fallback
                                    (e.target as HTMLImageElement).src = artUrl;
                                    (e.target as HTMLImageElement).classList.add("scale-110", "blur-sm");
                                  }
                                }}
                              />
                            ) : null;
                          })()}
                          {/* Gradient overlay for readability */}
                          <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

                          {/* Content */}
                          <div className="relative z-10">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-3 block">
                              {KIND_LABELS[activeNugget.kind] || activeNugget.kind}
                            </span>
                            {isTypewriterDone ? (
                              <h2 className="text-2xl font-bold leading-tight text-white drop-shadow-lg">
                                {activeNugget.headline || activeNugget.text}
                              </h2>
                            ) : (
                              <TypewriterText
                                text={activeNugget.headline || activeNugget.text}
                                speed={35}
                                paused={false}
                                onComplete={handleTypewriterComplete}
                                as="h2"
                                className="text-2xl font-bold leading-tight text-white drop-shadow-lg"
                              />
                            )}
                            <motion.p
                              className="text-xs text-white/40 mt-4"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: isTypewriterDone && !flipped ? 0.6 : 0 }}
                              transition={{ delay: 0.5, duration: 0.4 }}
                            >
                              tap to reveal more
                            </motion.p>
                          </div>
                        </motion.div>
                      }
                      back={
                        <div className="h-full rounded-3xl overflow-y-auto overflow-x-hidden glass-scrollbar flex flex-col">
                          {/* Hero image — takes ~45% of card, sticky so it stays visible while scrolling */}
                          {activeNugget.imageUrl && !failedImagesRef.current.has(activeNugget.imageUrl) ? (
                            <div className="relative w-full" style={{ minHeight: "45%" }}>
                              <img
                                src={activeNugget.imageUrl}
                                alt={activeNugget.imageCaption || ""}
                                className="w-full h-full object-cover object-top rounded-t-3xl"
                                style={{ minHeight: "45cqh", maxHeight: "50cqh" }}
                                onError={(e) => {
                                  failedImagesRef.current.add(activeNugget.imageUrl!);
                                  (e.target as HTMLImageElement).parentElement!.style.display = "none";
                                }}
                              />
                              {activeNugget.imageCaption && (
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-2 pt-8">
                                  <p className="text-[10px] text-white/60">{activeNugget.imageCaption}</p>
                                </div>
                              )}
                            </div>
                          ) : null}

                          {/* Text content — scrollable below the image, min-h-full so no glass gap */}
                          <div className="px-5 py-4 bg-black/40 backdrop-blur-sm flex-1">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/40 mb-2 block">
                              {KIND_LABELS[activeNugget.kind] || activeNugget.kind}
                            </span>
                            <h3 className="text-base font-semibold text-foreground/90 mb-2">
                              {activeNugget.headline}
                            </h3>
                            <p className="text-sm leading-relaxed text-foreground/55 mb-4">
                              {activeNugget.text}
                            </p>
                            {deepDiveText && (
                              <div className="mb-4 pl-3 border-l-2 border-primary/30">
                                <p className="text-sm leading-relaxed text-foreground/65">{deepDiveText}</p>
                                {deepDiveFollowUp && (
                                  <p className="text-xs text-primary/60 mt-1.5 italic">{deepDiveFollowUp}</p>
                                )}
                              </div>
                            )}
                            <div className="flex gap-2 flex-wrap mb-2">
                              {activeSource?.url && (
                                <a
                                  href={activeSource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-foreground/60 active:scale-95 transition-transform"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View Source
                                </a>
                              )}
                              <button
                                className="text-xs px-3 py-1.5 rounded-full bg-primary/20 text-primary active:scale-95 transition-transform flex items-center gap-1.5"
                                onClick={(e) => { e.stopPropagation(); handleTellMeMore(); }}
                                disabled={deepDiveLoading}
                              >
                                {deepDiveLoading ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> Thinking...</>
                                ) : deepDiveText ? "Go deeper" : "Tell me more"}
                              </button>
                            </div>
                            {activeSource && (
                              <p className="text-[10px] text-foreground/25">{activeSource.publisher}</p>
                            )}
                          </div>
                        </div>
                      }
                    />
                  </div>
                )}
              </SwipeableNuggetStack>

            </motion.div>
          ) : (
            /* ── Now-playing screen ───────────────────────────── */
            <motion.div
              key="now-playing"
              className="flex-1 flex flex-col items-center justify-center gap-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              {artUrl && (
                <motion.img
                  src={artUrl}
                  alt={`${trackTitle} cover`}
                  className="w-56 h-56 rounded-2xl shadow-2xl object-cover"
                  animate={{ scale: isPlaying ? [1, 1.02, 1] : 1 }}
                  transition={{ repeat: isPlaying ? Infinity : 0, duration: 4, ease: "easeInOut" }}
                />
              )}
              <div className="text-center px-8">
                <p className="text-lg font-semibold text-white/90">{trackTitle}</p>
                <p className="text-sm text-white/40 mt-1">{artist}</p>
              </div>


              {/* Logo CTA to return to nuggets */}
              {unlockedCount > 0 && (
                <motion.button
                  className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 active:scale-95 transition-transform"
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  onClick={() => { setNuggetDismissed(false); setFlipped(false); }}
                >
                  <MusicNerdLogo size={20} />
                  <svg className="w-3 h-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom transport */}
      <div className="relative z-20 px-5 pb-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 8px), 8px)" }}>
        {showCard && unlockedCount > 1 && (
          <div className="text-center text-xs text-white/20 tabular-nums mb-2">
            {activeIndex + 1} / {unlockedCount}
          </div>
        )}
        <div className="flex items-center justify-center gap-7 mb-3">
          <button className="h-9 w-9 flex items-center justify-center active:scale-90 transition-transform" onClick={onPrev}>
            <SkipBack className="w-4 h-4 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
          <button
            className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            onClick={toggle}
          >
            {isPlaying
              ? <Pause className="w-5 h-5 text-white" fill="white" />
              : <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            }
          </button>
          <button className="h-9 w-9 flex items-center justify-center active:scale-90 transition-transform" onClick={onNext}>
            <SkipForward className="w-4 h-4 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
        </div>
        {/* Progress bar + nugget markers */}
        <div className="relative">
          {/* Scrub zone — tall invisible touch target */}
          <div
            className="relative py-3 cursor-pointer touch-none"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("[data-nugget-marker]")) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setScrubbing(true);
              const bar = e.currentTarget.querySelector("[data-bar]") as HTMLElement;
              if (!bar) return;
              const rect = bar.getBoundingClientRect();
              seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 0 && e.pressure === 0) return;
              const bar = e.currentTarget.querySelector("[data-bar]") as HTMLElement;
              if (!bar) return;
              const rect = bar.getBoundingClientRect();
              seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
            }}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
          >
            <div data-bar className="relative h-[3px] bg-white/15 rounded-full">
              <div className="absolute inset-y-0 left-0 bg-white/60 rounded-full" style={{ width: `${progress}%` }} />
              {/* Scrub thumb — appears on touch */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white transition-opacity duration-150"
                style={{ left: `${progress}%`, opacity: scrubbing ? 1 : 0 }}
              />
            </div>
          </div>

          {/* Nugget markers — above scrub zone so they're tappable */}
          {nuggets.map((n) => {
            if (duration <= 0) return null;
            const pct = (n.timestampSec / duration) * 100;
            const isUnlocked = unlockedIds.has(n.id);
            return (
              <button
                key={n.id}
                data-nugget-marker
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 p-2"
                style={{ left: `${pct}%` }}
                onClick={() => {
                  if (isUnlocked) {
                    const idx = nuggets.indexOf(n);
                    if (idx >= 0) {
                      handleSwipe(idx);
                      setNuggetDismissed(false);
                    }
                  } else {
                    seek(n.timestampSec);
                  }
                }}
              >
                <MusicNerdLogo size={14} glow={isUnlocked} />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-white/30 tabular-nums">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </motion.div>
  );
}
