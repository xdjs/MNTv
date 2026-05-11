import { memo, useState, useEffect, useRef, useCallback } from "react";
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
// in the memo dep array, easier to read). Takes only the two functions
// it needs from useBookmarks rather than the whole hook return value, so
// the component doesn't re-render on unrelated bookmark state changes.
type BookmarksApi = ReturnType<typeof useBookmarks>;
const BookmarkButton = memo(function BookmarkButton({
  activeNugget,
  activeSource,
  artist,
  trackTitle,
  isBookmarked,
  toggle,
}: {
  activeNugget: Nugget;
  activeSource: Source | null | undefined;
  artist: string;
  trackTitle: string;
  isBookmarked: BookmarksApi["isBookmarked"];
  toggle: BookmarksApi["toggle"];
}) {
  const saved = isBookmarked(
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
        toggle({
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
});

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
  // INVARIANT (Pete's spec, 2026-05-06): the FIRST nugget always
  // unlocks the moment nuggets arrive — no timestamp gating, no
  // isFresh branching. The user just tapped a pink-ring story; they
  // expect content on screen as the song starts. Only nuggets[1..N]
  // gate on `currentTime >= timestampSec` so they pace through the
  // track. Fresh-SSE behavior (unlock everything for swipe parity)
  // still applies to the rest, just not to nugget #0.
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

    setUnlockedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      // Always unlock nuggets[0] on first arrival.
      if (nuggets[0] && !next.has(nuggets[0].id)) {
        next.add(nuggets[0].id);
        changed = true;
      }
      // Pete 2026-05-10: removed the nextUnlockTimeRef shortcut.
      // The previous optimization gated this loop on
      // `currentTime >= nextUnlockTimeRef.current`, which got stuck
      // at Infinity after the first unlock pass with only 1 nugget.
      // When wave 2 landed and added new nuggets to state, the gate
      // had a stale Infinity value and the loop was never re-entered
      // even though the new nuggets had timestamps long since
      // crossed. Just walk all nuggets every tick — there are at
      // most ~9 of them, this is microsecond work.
      for (let i = 1; i < nuggets.length; i++) {
        const n = nuggets[i];
        if (currentTime >= n.timestampSec && !next.has(n.id)) {
          next.add(n.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Find the next timestamp that hasn't been unlocked yet (skip
    // index 0 — already handled above). Used by the cheap-skip
    // guard in the next render.
    const upcoming = nuggets
      .slice(1)
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

  // Keyboard navigation — left/right arrows step between unlocked
  // nuggets. Useful on desktop / DevTools mobile-emulation where
  // touch swipes don't fire on a mouse drag (Pete: "easy way to
  // navigate between nuggets when I'm in inspector view to replicate
  // a phone interface"). Up/Down opens / re-opens the card if the
  // user dismissed it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack typing in any input / textarea / contenteditable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (unlockedCount === 0) return;
      if (e.key === "ArrowRight") {
        const next = activeIndex + 1;
        if (next < unlockedCount) {
          e.preventDefault();
          handleSwipe(next);
        }
      } else if (e.key === "ArrowLeft") {
        const prev = activeIndex - 1;
        if (prev >= 0) {
          e.preventDefault();
          handleSwipe(prev);
        }
      } else if (e.key === "ArrowUp" || e.key === "Enter") {
        // Re-open dismissed card.
        if (nuggetDismissed) {
          e.preventDefault();
          setNuggetDismissed(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, unlockedCount, nuggetDismissed, handleSwipe]);

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
        {/* Pete 2026-05-10 layout spec: hero image fills the entire
            visible viewport with a single bottom-fade gradient. The
            headline overlays the bottom of the image (absolute
            positioned within the image container), so the image
            shows through behind the text — no hard black box, no
            visible seam. Body lives BELOW this h-full container in
            scroll flow, off-screen at scroll=0. */}
        <div className="h-full relative">
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
          {/* Single bottom-fade gradient — image visible at top,
              fading to near-black at the bottom where the headline
              overlays. */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 18%, rgba(0,0,0,0.4) 38%, rgba(0,0,0,0.1) 60%, transparent 80%)",
          }} />
          {/* Headline overlays the bottom of the image — no separate
              background, the gradient above provides the legibility
              backdrop. */}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 z-10">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 mb-2 block" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
              {activeNugget ? (KIND_LABELS[activeNugget.kind] || activeNugget.kind) : ""}
            </span>
            <div className="min-h-[3.5rem]">
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
          </div>
        </div>
        {/* Body section — lives BELOW the h-full hero+headline frame,
            so it's off-screen at scroll=0. User scrolls down to read. */}
        <div className="px-5 pt-6 pb-8 bg-black relative z-10">
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
                isBookmarked={bookmarks.isBookmarked}
                toggle={bookmarks.toggle}
              />
            )}
          </div>

          {activeSource && (
            <p className="text-[10px] text-white/20">{activeSource.publisher}</p>
          )}
        </div>
      </div>
    );
    // Deps intentionally narrow: nuggets.length / activeIndex /
    // unlockedCount are NOT referenced inside this card body — they
    // drive the dots row + nav arrows which are sibling components.
    // Listing them here would invalidate the heavy card-content memo
    // on every pacer unlock and every swipe (4 Hz on cached tracks),
    // re-rendering the image / typewriter / deep-dive button for no
    // visible change.
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
                totalCount={nuggets.length}
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

      {/* Position-indicator dots — own row, never overlaps body text.
          Pete 2026-05-08: "dots right above the mini player ...
          headline and nugget amount counter should never be covered
          by the mini player." Active bright, unlocked dim, locked
          very-dim. Hidden when there's only one nugget. */}
      {nuggets.length > 1 && (
        <div className="relative z-20 bg-black flex justify-center items-center gap-1.5 pt-5 pb-3 pointer-events-none">
          {Array.from({ length: nuggets.length }, (_, i) => {
            const isActive = i === activeIndex;
            const isUnlocked = i < unlockedCount;
            return (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                  isActive ? "bg-white/85" : isUnlocked ? "bg-white/35" : "bg-white/12"
                }`}
              />
            );
          })}
        </div>
      )}

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
