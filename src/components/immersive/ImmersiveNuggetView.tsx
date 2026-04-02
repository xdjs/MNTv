import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/integrations/supabase/client";
import type { Nugget, Source } from "@/mock/types";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TypewriterText from "./TypewriterText";
import SwipeableNuggetStack from "./SwipeableNuggetStack";
import MiniPlayer from "./MiniPlayer";

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

// Glow style matching desktop NuggetCard
const GLOW = "0 0 20px 6px hsl(var(--neon-glow) / 0.4), 0 0 50px 12px hsl(var(--neon-glow) / 0.15)";

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

  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [nuggetDismissed, setNuggetDismissed] = useState(false);
  const [deepDiveText, setDeepDiveText] = useState<string | null>(null);
  const [deepDiveFollowUp, setDeepDiveFollowUp] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [typewriterDoneIds, setTypewriterDoneIds] = useState<Set<string>>(new Set());
  const failedImagesRef = useRef<Set<string>>(new Set());
  const prevUnlockedCountRef = useRef(0);
  const prevTrackKeyRef = useRef(`${trackTitle}::${artist}`);

  // ── Reset on track change ──────────────────────────────────────────
  useEffect(() => {
    const key = `${trackTitle}::${artist}`;
    if (key !== prevTrackKeyRef.current) {
      prevTrackKeyRef.current = key;
      setUnlockedIds(new Set());
      setActiveIndex(0);
      setNuggetDismissed(false);
      setDeepDiveText(null);
      setDeepDiveFollowUp(null);
      prevUnlockedCountRef.current = 0;
      setTypewriterDoneIds(new Set());
    }
  }, [trackTitle, artist]);

  // ── Unlock nuggets ─────────────────────────────────────────────────
  useEffect(() => {
    if (nuggets.length === 0) return;
    const newUnlocked = new Set(unlockedIds);
    let changed = false;
    for (const n of nuggets) {
      if (currentTime >= n.timestampSec && !newUnlocked.has(n.id)) {
        newUnlocked.add(n.id);
        changed = true;
      }
    }
    if (changed) setUnlockedIds(newUnlocked);
  }, [currentTime, nuggets]);

  // ── Auto-show new nuggets ──────────────────────────────────────────
  useEffect(() => {
    const count = unlockedIds.size;
    if (count > prevUnlockedCountRef.current && count > 0) {
      const arr = nuggets.filter((n) => unlockedIds.has(n.id));
      const idx = nuggets.indexOf(arr[arr.length - 1]);
      if (idx >= 0) {
        setActiveIndex(idx);
        setNuggetDismissed(false);
        setDeepDiveText(null);
      }
    }
    prevUnlockedCountRef.current = count;
  }, [unlockedIds, nuggets]);

  // ── Initial unlock ─────────────────────────────────────────────────
  useEffect(() => {
    if (nuggets.length > 0 && unlockedIds.size === 0) {
      const initial = new Set<string>();
      for (const n of nuggets) {
        if (currentTime >= n.timestampSec) initial.add(n.id);
      }
      if (initial.size === 0) initial.add(nuggets[0].id);
      setUnlockedIds(initial);
    }
  }, [nuggets]);

  // ── Track end detection ────────────────────────────────────────────
  const trackEndFiredRef = useRef(false);
  useEffect(() => { trackEndFiredRef.current = false; }, [trackTitle, artist]);
  useEffect(() => {
    if (duration > 0 && currentTime > 0 && duration - currentTime < 1.5 && !trackEndFiredRef.current) {
      trackEndFiredRef.current = true;
      onNext?.();
    }
  }, [currentTime, duration, onNext]);

  // ── Media Session ──────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle, artist,
      artwork: artUrl ? [{ src: artUrl, sizes: "512x512", type: "image/jpeg" }] : [],
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

  // ── Derived state ──────────────────────────────────────────────────
  const activeNugget = nuggets[activeIndex];
  const activeSource = activeNugget ? sources.get(activeNugget.sourceId) : undefined;
  const unlockedCount = unlockedIds.size;
  const isTypewriterDone = activeNugget ? typewriterDoneIds.has(activeNugget.id) : false;
  const showCard = activeNugget && !nuggetDismissed;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Handlers ───────────────────────────────────────────────────────
  const handleSwipe = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
    setNuggetDismissed(false);
    setDeepDiveText(null);
    setDeepDiveFollowUp(null);
  }, []);

  const handleTypewriterComplete = useCallback(() => {
    if (activeNugget) setTypewriterDoneIds((prev) => new Set(prev).add(activeNugget.id));
  }, [activeNugget]);

  const handleTellMeMore = useCallback(async () => {
    if (!activeNugget || deepDiveLoading) return;
    setDeepDiveLoading(true);
    try {
      const { data } = await supabase.functions.invoke("generate-nuggets", {
        body: {
          artist, title: trackTitle, deepDive: true,
          context: `${activeNugget.headline}\n${activeNugget.text}`,
          sourceTitle: activeSource?.title, sourcePublisher: activeSource?.publisher,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNugget, activeSource, artist, trackTitle]);

  // ── Get the image URL for the current nugget (with fallbacks) ──────
  const getNuggetImage = useCallback(() => {
    if (activeNugget?.imageUrl && !failedImagesRef.current.has(activeNugget.imageUrl)) {
      return { url: activeNugget.imageUrl, isNuggetImage: true };
    }
    return { url: artUrl, isNuggetImage: false };
  }, [activeNugget, artUrl]);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        {artUrl && (
          <img src={artUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(48px) brightness(0.25) saturate(1.4)", transform: "scale(1.3)" }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>

      {/* Main content area */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 pt-6 min-h-0 mb-1"
        style={{ paddingTop: "max(env(safe-area-inset-top, 16px), 16px)" }}
      >
        <AnimatePresence mode="wait">
          {showCard ? (
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
              >
                {() => {
                  const { url: imgUrl, isNuggetImage } = getNuggetImage();
                  return (
                    <div data-card className="w-full h-full">
                      {/* Glow */}
                      <div className="absolute inset-0 rounded-3xl pointer-events-none"
                        style={{ boxShadow: GLOW, background: "rgba(0,0,0,0.01)" }} />

                      {/* Scrollable card */}
                      <div className="relative w-full h-full apple-glass rounded-3xl overflow-hidden overflow-y-auto glass-scrollbar">
                        {/* Image hero section */}
                        <div className="relative w-full" style={{ minHeight: "50%" }}>
                          {imgUrl && (
                            <img
                              src={imgUrl}
                              alt=""
                              className={`w-full h-full object-cover ${!isNuggetImage ? "scale-110 blur-sm" : ""}`}
                              style={{ minHeight: "300px" }}
                              onError={(e) => {
                                if (isNuggetImage && activeNugget?.imageUrl) {
                                  failedImagesRef.current.add(activeNugget.imageUrl);
                                  (e.target as HTMLImageElement).src = artUrl;
                                  (e.target as HTMLImageElement).classList.add("scale-110", "blur-sm");
                                }
                              }}
                            />
                          )}
                          {/* Gradient overlay + headline pinned to bottom of image */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                          <div className="absolute bottom-0 inset-x-0 px-6 pb-5">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2 block">
                              {activeNugget ? (KIND_LABELS[activeNugget.kind] || activeNugget.kind) : ""}
                            </span>
                            {activeNugget && (
                              isTypewriterDone ? (
                                <h2 className="text-xl font-bold leading-tight text-white drop-shadow-lg">
                                  {activeNugget.headline || activeNugget.text}
                                </h2>
                              ) : (
                                <TypewriterText
                                  text={activeNugget.headline || activeNugget.text}
                                  speed={35}
                                  paused={false}
                                  onComplete={handleTypewriterComplete}
                                  as="h2"
                                  className="text-xl font-bold leading-tight text-white drop-shadow-lg"
                                />
                              )
                            )}
                          </div>
                        </div>

                        {/* Body text + actions — revealed by scrolling up */}
                        <div className="px-6 py-5 bg-black/40 backdrop-blur-sm flex-1">
                          <p className="text-sm leading-relaxed text-foreground/55 mb-4">
                            {activeNugget?.text}
                          </p>

                          {deepDiveText && (
                            <div className="mb-4 pl-3 border-l-2 border-primary/30">
                              <p className="text-sm leading-relaxed text-foreground/65">{deepDiveText}</p>
                              {deepDiveFollowUp && (
                                <p className="text-xs text-primary/60 mt-1.5 italic">{deepDiveFollowUp}</p>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap mb-3">
                            {activeSource?.url && (
                              <a href={activeSource.url} target="_blank" rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-foreground/60 active:scale-95 transition-transform">
                                View Source
                              </a>
                            )}
                            <button
                              className="text-xs px-3 py-1.5 rounded-full bg-primary/20 text-primary active:scale-95 transition-transform flex items-center gap-1.5"
                              onClick={(e) => { e.stopPropagation(); handleTellMeMore(); }}
                              disabled={deepDiveLoading}
                            >
                              {deepDiveLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Thinking...</>
                                : deepDiveText ? "Go deeper" : "Tell me more"}
                            </button>
                          </div>

                          {activeSource && (
                            <p className="text-[10px] text-foreground/25">{activeSource.publisher}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }}
              </SwipeableNuggetStack>

              {/* Counter */}
              {unlockedCount > 1 && (
                <div className="text-center text-xs text-white/20 tabular-nums mt-1">
                  {activeIndex + 1} / {unlockedCount}
                </div>
              )}
            </motion.div>
          ) : (
            /* ── Now-playing screen ─────────────────────────── */
            <motion.div
              key="now-playing"
              className="flex-1 flex flex-col items-center justify-center gap-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              onClick={() => { if (unlockedCount > 0) setNuggetDismissed(false); }}
            >
              {artUrl && (
                <motion.img
                  src={artUrl} alt={`${trackTitle} cover`}
                  className="w-56 h-56 rounded-2xl shadow-2xl object-cover"
                  animate={{ scale: isPlaying ? [1, 1.02, 1] : 1 }}
                  transition={{ repeat: isPlaying ? Infinity : 0, duration: 4, ease: "easeInOut" }}
                />
              )}
              <div className="text-center px-8">
                <p className="text-lg font-semibold text-white/90">{trackTitle}</p>
                <p className="text-sm text-white/40 mt-1">{artist}</p>
              </div>

              {loading && unlockedCount === 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5">
                  <Loader2 className="w-3.5 h-3.5 text-primary/60 animate-spin" />
                  <span className="text-xs text-white/40">Researching...</span>
                </div>
              )}

              {unlockedCount > 0 && (
                <motion.button
                  className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 active:scale-95 transition-transform"
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  onClick={() => setNuggetDismissed(false)}
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

      {/* Mini player */}
      <div className="relative z-20" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 4px), 4px)" }}>
        <MiniPlayer
          artUrl={artUrl}
          trackTitle={trackTitle}
          artist={artist}
          isPlaying={isPlaying}
          progress={progress}
          onToggle={toggle}
          onCollapse={onClose}
        />
      </div>
    </motion.div>
  );
}
