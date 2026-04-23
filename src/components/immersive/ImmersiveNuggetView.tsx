import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Heart } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/integrations/supabase/client";
import type { Nugget, Source } from "@/mock/types";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TypewriterText from "./TypewriterText";
import SwipeableNuggetStack from "./SwipeableNuggetStack";
import MiniPlayer from "./MiniPlayer";
import { useNuggetPacer } from "./useNuggetPacer";
import { useBookmarks } from "@/hooks/useBookmarks";

interface ImmersiveNuggetViewProps {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  coverArtUrl: string;
  spotifyAlbumArt?: string;
  trackTitle: string;
  artist: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  // When true, streamed nuggets are unlocked immediately on arrival instead of
  // waiting for playback to reach each timestampSec — parity with desktop's
  // fresh-SSE bypass so the first headline lands the moment the stream emits it.
  isFresh?: boolean;
}

// Module-level so it persists across unmount/remount cycles (e.g. navigating
// away and back). Prevents bypassing the limit by toggling the immersive view.
// A server-side guard in the edge function would be the robust long-term fix.
let deepDiveSessionCount = 0;
const MAX_DEEP_DIVES_PER_SESSION = 10;

// Pulled out of the nugget-card JSX so the saved-state computation isn't
// an IIFE inside useCallback's return value (fewer closures to reason about
// in the memo dep array, easier to read, no perf difference either way).
function BookmarkButton({
  activeNugget,
  activeSource,
  artist,
  trackTitle,
  bookmarks,
}: {
  activeNugget: Nugget;
  activeSource: Source | null | undefined;
  artist: string;
  trackTitle: string;
  bookmarks: ReturnType<typeof useBookmarks>;
}) {
  const saved = bookmarks.isBookmarked(
    activeNugget.headline || activeNugget.text,
    activeNugget.trackId,
    activeNugget.kind,
  );
  return (
    <button
      aria-label={saved ? "Remove bookmark" : "Save nugget"}
      className={`text-xs px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1.5 ${
        saved ? "bg-rose-500/20 text-rose-400" : "bg-white/10 text-white/60"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        bookmarks.toggle({
          trackId: activeNugget.trackId,
          artist,
          title: trackTitle,
          kind: activeNugget.kind,
          headline: activeNugget.headline || activeNugget.text,
          body: activeNugget.text,
          source: activeSource ?? null,
          imageUrl: activeNugget.imageUrl ?? undefined,
        });
      }}
    >
      <Heart className="w-3 h-3" fill={saved ? "currentColor" : "none"} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}

// Minimum time a nugget stays on-screen before auto-advance can swap it out.
// Tuning knob for the streaming pacing — keeps freshly-streamed nuggets
// readable without yanking the user mid-sentence.
const MIN_DISPLAY_MS = 10_000;

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
  onClose,
  onPrev,
  onNext,
  spotifyAlbumArt,
  isFresh = false,
}: ImmersiveNuggetViewProps) {
  const { isPlaying, currentTime, duration, toggle, seek } = usePlayer();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const artUrl = coverArtUrl || spotifyAlbumArt || "";

  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [nuggetDismissed, setNuggetDismissed] = useState(false);
  const userDismissedRef = useRef(false); // true when user manually dismissed via chevron
  const [deepDiveText, setDeepDiveText] = useState<string | null>(null);
  const [deepDiveFollowUp, setDeepDiveFollowUp] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  // Ref guards against double-tap (stale closure safe); state drives the UI spinner.
  const deepDiveLoadingRef = useRef(false);
  const [typewriterDoneIds, setTypewriterDoneIds] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [deepDiveRateLimited, setDeepDiveRateLimited] = useState(false);
  // Next nugget timestamp to unlock — avoids running the unlock effect on
  // every ~4 Hz playback tick (only runs when currentTime crosses this threshold).
  const nextUnlockTimeRef = useRef(0);
  const prevTrackKeyRef = useRef(`${trackTitle}::${artist}`);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  const initialUnlockDoneRef = useRef(false);
  const trackKey = `${trackTitle}::${artist}`;

  // Bookmarking — optimistic toggle, server-verified identity via edge fn.
  const bookmarks = useBookmarks();

  // ── Reset on track change ──────────────────────────────────────────
  // Pacer state (queue, timer, prevUnlockedCount) is reset by useNuggetPacer
  // when trackKey changes — not duplicated here.
  useEffect(() => {
    if (trackKey !== prevTrackKeyRef.current) {
      prevTrackKeyRef.current = trackKey;
      setUnlockedIds(new Set());
      setActiveIndex(0);
      setNuggetDismissed(false);
      setDeepDiveText(null);
      setDeepDiveFollowUp(null);
      setDeepDiveLoading(false);
      deepDiveLoadingRef.current = false;
      setTypewriterDoneIds(new Set());
      userDismissedRef.current = false;
      initialUnlockDoneRef.current = false;
      nextUnlockTimeRef.current = 0;
    }
  }, [trackKey]);

  // ── Unlock nuggets ─────────────────────────────────────────────────
  // Fresh SSE: unlock every streamed nugget immediately so swipes work
  // while the stream is still arriving (parity with desktop queue behavior).
  // Cached: only unlock when currentTime crosses each timestamp, not on every
  // ~4 Hz playback tick (~720 skipped invocations per track).
  useEffect(() => {
    if (nuggets.length === 0) return;

    if (isFresh) {
      setUnlockedIds((prev) => {
        if (prev.size === nuggets.length) return prev;
        return new Set(nuggets.map((n) => n.id));
      });
      nextUnlockTimeRef.current = Infinity;
      return;
    }

    if (currentTime < nextUnlockTimeRef.current) return;

    setUnlockedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const n of nuggets) {
        if (currentTime >= n.timestampSec && !next.has(n.id)) {
          next.add(n.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Find the next timestamp that hasn't been unlocked yet
    const upcoming = nuggets
      .filter((n) => n.timestampSec > currentTime)
      .sort((a, b) => a.timestampSec - b.timestampSec);
    nextUnlockTimeRef.current = upcoming.length > 0 ? upcoming[0].timestampSec : Infinity;
  }, [currentTime, nuggets, isFresh]);

  // ── Auto-show new nuggets (via pacer hook) ─────────────────────────
  // See useNuggetPacer for queueing behavior. The hook calls showNugget
  // one index at a time, with at least MIN_DISPLAY_MS between calls.
  const showNugget = useCallback((idx: number) => {
    setActiveIndex(idx);
    if (!userDismissedRef.current) setNuggetDismissed(false);
    setDeepDiveText(null);
  }, []);

  const { cancelPending: cancelPacerQueue } = useNuggetPacer({
    nuggets,
    unlockedIds,
    trackKey,
    onShow: showNugget,
    minDisplayMs: MIN_DISPLAY_MS,
  });

  // ── Initial unlock ─────────────────────────────────────────────────
  // Runs once when nuggets first arrive. Uses currentTimeRef to avoid
  // re-running on every playback tick.
  useEffect(() => {
    if (initialUnlockDoneRef.current || nuggets.length === 0) return;
    initialUnlockDoneRef.current = true;
    const t = currentTimeRef.current;
    const initial = new Set<string>();
    for (const n of nuggets) {
      if (t >= n.timestampSec) initial.add(n.id);
    }
    if (initial.size === 0) initial.add(nuggets[0].id);
    setUnlockedIds(initial);
  }, [nuggets]);

  // Track-end is handled by Listen.tsx's handleTrackEnd via PlayerContext onEnded.
  // No duplicate detection needed here.

  // ── Media Session ──────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle, artist,
      artwork: artUrl ? [{ src: artUrl, sizes: "512x512" }] : [],
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
    // User took manual control — stop the pacer so a pending auto-advance
    // (or a nugget that arrives later) can't yank them off this card.
    cancelPacerQueue();
    setActiveIndex(newIndex);
    setNuggetDismissed(false);
    setDeepDiveText(null);
    setDeepDiveFollowUp(null);
  }, [cancelPacerQueue]);

  const handleTypewriterComplete = useCallback(() => {
    if (activeNugget) setTypewriterDoneIds((prev) => new Set(prev).add(activeNugget.id));
  }, [activeNugget]);

  const handleTellMeMore = useCallback(async () => {
    if (!activeNugget || deepDiveLoadingRef.current) return;
    if (deepDiveSessionCount >= MAX_DEEP_DIVES_PER_SESSION) {
      setDeepDiveRateLimited(true);
      return;
    }
    deepDiveLoadingRef.current = true;
    setDeepDiveLoading(true);
    const requestTrackKey = `${trackTitle}::${artist}`;
    try {
      const { data } = await supabase.functions.invoke("generate-nuggets", {
        body: {
          artist, title: trackTitle, deepDive: true,
          context: `${activeNugget.headline}\n${activeNugget.text}`,
          sourceTitle: activeSource?.title, sourcePublisher: activeSource?.publisher,
        },
      });
      // Discard if unmounted or track changed during the request
      if (!mountedRef.current) return;
      if (prevTrackKeyRef.current !== requestTrackKey) return;
      if (data?.deepDive?.text) {
        deepDiveSessionCount++;
        setDeepDiveText(data.deepDive.text);
        setDeepDiveFollowUp(data.deepDive.followUp || null);
      }
    } catch (e) {
      console.error("[ImmersiveView] Deep dive failed:", e);
    } finally {
      if (!mountedRef.current) return;
      deepDiveLoadingRef.current = false;
      setDeepDiveLoading(false);
    }
  }, [activeNugget, activeSource, artist, trackTitle]);

  // ── Get the image URL for the current nugget (with fallbacks) ──────
  const getNuggetImage = useCallback(() => {
    if (activeNugget?.imageUrl && !failedImages.has(activeNugget.imageUrl)) {
      return { url: activeNugget.imageUrl, isNuggetImage: true };
    }
    return { url: artUrl, isNuggetImage: false };
  }, [activeNugget, artUrl, failedImages]);

  // Memoized render function for SwipeableNuggetStack — prevents
  // re-evaluating during drag renders (image loading, typewriter, etc.).
  // Note: deps include deepDiveLoading so the spinner/label updates, which
  // means the card re-renders when a deep-dive starts/finishes. This is
  // infrequent and acceptable — the main perf win is skipping during drag.
  const renderNuggetCard = useCallback(() => {
    const { url: imgUrl, isNuggetImage } = getNuggetImage();
    return (
      <div className="w-full h-full overflow-y-auto scrollbar-hide">
        {/* Sticky image hero — stays pinned while body text scrolls over it.
            Prevents the gap/overlay break when scrolling up. */}
        <div className="sticky top-0 w-full h-full">
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => {
                if (isNuggetImage && activeNugget?.imageUrl) {
                  setFailedImages((prev) => new Set(prev).add(activeNugget.imageUrl!));
                }
              }}
            />
          )}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 25%, rgba(0,0,0,0.15) 55%, transparent 80%)",
          }} />
        </div>

        {/* Body overlaps the bottom of the sticky image just enough to show
            the headline on initial view — the paragraph stays below the fold
            until the user scrolls. Headline sits at the top of this scrolling
            block so it travels up with the paragraph when scrolling. No
            bg-black — the transparent gradient lets the hero show through. */}
        <div className="px-5 pb-5 -mt-36 relative z-10 pt-16" style={{
          backgroundImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.85) 50%, rgb(0,0,0) 75%)",
        }}>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 mb-2 block" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            {activeNugget ? (KIND_LABELS[activeNugget.kind] || activeNugget.kind) : ""}
          </span>
          <div className="min-h-[3.5rem] mb-4">
          {activeNugget && (
            isTypewriterDone ? (
              <h2 className="text-xl font-bold leading-tight text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)" }}>
                {activeNugget.headline || activeNugget.text}
              </h2>
            ) : (
              <TypewriterText
                text={activeNugget.headline || activeNugget.text}
                speed={35}
                paused={false}
                onComplete={handleTypewriterComplete}
                as="h2"
                className="text-xl font-bold leading-tight text-white block"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)" }}
              />
            )
          )}
          </div>
          <p className="text-sm leading-relaxed text-white/60 mb-4">
            {activeNugget?.text}
          </p>

          {deepDiveText && (
            <div className="mb-4 pl-3 border-l-2 border-primary/30">
              <p className="text-sm leading-relaxed text-white/70">{deepDiveText}</p>
              {deepDiveFollowUp && (
                <p className="text-xs text-primary/60 mt-1.5 italic">{deepDiveFollowUp}</p>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-3">
            {(activeSource?.url?.startsWith("https://") || activeSource?.url?.startsWith("http://")) && (
              <a href={activeSource.url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/60 active:scale-95 transition-transform">
                View Source
              </a>
            )}
            <button
              className="text-xs px-3 py-1.5 rounded-full bg-primary/20 text-primary active:scale-95 transition-transform flex items-center gap-1.5"
              onClick={(e) => { e.stopPropagation(); handleTellMeMore(); }}
              disabled={deepDiveLoading || deepDiveRateLimited}
            >
              {deepDiveLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Thinking...</>
                : deepDiveRateLimited ? "Limit reached"
                : deepDiveText ? "Go deeper" : "Tell me more"}
            </button>
            {activeNugget && bookmarks.signedIn && (
              <BookmarkButton
                activeNugget={activeNugget}
                activeSource={activeSource}
                artist={artist}
                trackTitle={trackTitle}
                bookmarks={bookmarks}
              />
            )}
          </div>

          {activeSource && (
            <p className="text-[10px] text-white/20">{activeSource.publisher}</p>
          )}
        </div>
      </div>
    );
  }, [getNuggetImage, activeNugget, activeSource, isTypewriterDone, handleTypewriterComplete, deepDiveText, deepDiveFollowUp, deepDiveLoading, deepDiveRateLimited, handleTellMeMore, bookmarks, artist, trackTitle]);

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

      {/* Collapse chevron — floats over content */}
      <button
        aria-label="Back to browse"
        className="absolute z-30 left-4 h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
        style={{ top: "max(env(safe-area-inset-top, 12px), 12px)" }}
        onClick={() => { userDismissedRef.current = true; onClose(); }}
      >
        <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Screen-edge glow — tier-colored border effect */}
      <div className="fixed inset-0 z-[51] pointer-events-none"
        style={{
          boxShadow: "inset 0 0 30px 4px hsl(var(--neon-glow) / 0.3), inset 0 0 80px 10px hsl(var(--neon-glow) / 0.1)",
        }}
      />

      {/* Main content area — full bleed, no card */}
      <div className="relative z-10 flex-1 overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {showCard ? (
            <motion.div
              key="nugget-card"
              className="w-full h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SwipeableNuggetStack
                unlockedCount={unlockedCount}
                activeIndex={activeIndex}
                onSwipe={handleSwipe}
              >
                {renderNuggetCard}
              </SwipeableNuggetStack>
            </motion.div>
          ) : (
            /* ── Now-playing — centered cover art ─────────── */
            <motion.div
              key="now-playing"
              className="w-full h-full flex flex-col items-center justify-center gap-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              onClick={() => { if (unlockedCount > 0) setNuggetDismissed(false); }}
            >
              {artUrl && (
                <img
                  src={artUrl} alt={`${trackTitle} cover`}
                  className={`w-64 h-64 rounded-2xl shadow-2xl object-cover ${isPlaying ? "animate-cover-pulse" : ""}`}
                />
              )}
              <div className="text-center px-8">
                <p className="text-xl font-bold text-white/90">{trackTitle}</p>
                <p className="text-sm text-white/40 mt-1">{artist}</p>
              </div>
              {unlockedCount > 0 && (
                <button
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 active:scale-95 transition-transform animate-nudge-pulse"
                  onClick={() => setNuggetDismissed(false)}
                >
                  <MusicNerdLogo size={16} />
                  <span className="text-xs text-white/50">View nuggets</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mini player */}
      <div className="relative z-20 bg-black" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <MiniPlayer
          artUrl={artUrl}
          trackTitle={trackTitle}
          artist={artist}
          isPlaying={isPlaying}
          progress={progress}
          duration={duration}
          onToggle={toggle}
          onSeek={seek}
          onPrev={onPrev}
          onNext={onNext}
        />
      </div>
    </motion.div>
  );
}
