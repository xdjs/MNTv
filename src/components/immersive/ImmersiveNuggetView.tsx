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
import { isSafeUrl } from "@/lib/urlSafety";
import { RecommendedArtistButton, RecommendedTrackButton } from "./RecommendedButtons";

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
  // Refs for the "swipe up for more" cue: scrollRef is the body scroll
  // container, cueRef is the floating chevron whose opacity we drive
  // directly on scroll (no setState — keeps the memoized card from
  // re-rendering on every scroll tick, matching this file's perf style).
  const scrollRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);

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

  // Defensive clamp: if the nuggets array ever shrinks (a fresh
  // generation after a regenerateKey bump comes back with fewer
  // nuggets than the previous instance had, or the in-memory cache
  // hands back a partial firstNuggetOnly entry) and activeIndex is
  // out of bounds, activeNugget = nuggets[activeIndex] becomes
  // undefined → showCard = false → the user gets the cover-art
  // "View nuggets" branch with a button that doesn't recover.
  // Clamping to 0 forces a real card back on screen.
  useEffect(() => {
    if (nuggets.length > 0 && activeIndex >= nuggets.length) {
      setActiveIndex(0);
    }
  }, [nuggets.length, activeIndex]);

  // Also drop stale ids from unlockedIds when nuggets changes. The
  // unlock effect only ADDS ids; without a prune pass, ids from a
  // previous nuggets list survive when nuggets shrinks. That makes
  // unlockedCount > 0 (so the "View nuggets" button renders) while
  // none of the unlocked ids correspond to a real entry in the
  // current nuggets array.
  useEffect(() => {
    if (nuggets.length === 0) return;
    const currentIds = new Set(nuggets.map((n) => n.id));
    setUnlockedIds((prev) => {
      let drift = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
        else drift = true;
      }
      return drift ? next : prev;
    });
  }, [nuggets]);

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
      // removed the nextUnlockTimeRef shortcut.
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
    let latestIdx = 0;
    for (let i = 0; i < nuggets.length; i++) {
      const n = nuggets[i];
      if (t >= n.timestampSec) {
        initial.add(n.id);
        latestIdx = i;
      }
    }
    if (initial.size === 0) initial.add(nuggets[0].id);
    setUnlockedIds(initial);
    // Pete's UX request: when returning to a track mid-play (e.g.
    // tapping the mini-player from Browse), jump straight to the
    // latest unlocked nugget so the user picks up where the song
    // is — not at nugget #0 — and can swipe back to read earlier
    // ones. First-visit case (currentTime=0) only nugget[0] is
    // unlocked, so latestIdx stays 0 and behavior is unchanged.
    if (latestIdx > 0) setActiveIndex(latestIdx);
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
  // Fallback to nuggets[0] when activeIndex is out of bounds. Without
  // this, returning to a track whose nuggets array shrunk between
  // visits left activeNugget=undefined → showCard=false → user stuck
  // on the cover-art screen with a "View nuggets" button that didn't
  // recover. Now activeNugget is always defined when at least one
  // nugget exists.
  const activeNugget = nuggets[activeIndex] ?? nuggets[0];
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

  // ── "Swipe up for more" cue ────────────────────────────────────────
  // Fade the cue out as the body scrolls into view, then back in at the
  // top. Driven via direct DOM writes (not state) so the memoized card
  // doesn't re-render on every scroll frame. Tied to pointer-events so a
  // faded-out cue isn't tappable.
  const handleBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const o = Math.max(0, 1 - e.currentTarget.scrollTop / 90);
    if (cueRef.current) {
      cueRef.current.style.opacity = String(o);
      cueRef.current.style.pointerEvents = o < 0.05 ? "none" : "";
    }
  }, []);

  // Tap-to-scroll: bring the body into view from the headline hero.
  const scrollBodyIntoView = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.clientHeight * 0.72, behavior: "smooth" });
  }, []);

  // On nugget change, snap back to the headline (top) and restore the cue
  // so each new fact opens on its hook rather than mid-body.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (cueRef.current) {
      cueRef.current.style.opacity = "1";
      cueRef.current.style.pointerEvents = "";
    }
  }, [activeNugget?.id]);

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
    // Only promise "more below" when the body is genuinely distinct prose
    // from the hero headline. When a nugget has no headline, the hero falls
    // back to `text` and the body repeats it — a glowing "more" pointing at
    // a duplicate reads as a bug, so gate it out.
    const hl = activeNugget?.headline?.trim();
    const tx = activeNugget?.text?.trim();
    const hasMoreBelow = !!hl && !!tx && hl !== tx;
    return (
      <div ref={scrollRef} onScroll={handleBodyScroll} className="w-full h-full overflow-y-auto scrollbar-hide">
        {/* Hero image fills the visible viewport with a single
            bottom-fade gradient; headline overlays the bottom of the
            image (no separate-box seam). Body lives below the h-full
            container so it's off-screen at scroll=0. */}
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
          {/* Single bottom-fade gradient — image visible at top, ramping
              to SOLID black at the bottom. The last ~8% is fully opaque
              #000 so the hero's bottom edge matches the body section's
              bg-black exactly; without this the gradient stopped at 0.92
              (image faintly visible) and met pure black at the seam,
              leaving a harsh line where hero meets body. */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(to top, #000 0%, #000 8%, rgba(0,0,0,0.82) 24%, rgba(0,0,0,0.42) 44%, rgba(0,0,0,0.12) 64%, transparent 82%)",
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
                  speed={18}
                  paused={false}
                  onComplete={handleTypewriterComplete}
                  as="h2"
                  className="text-xl font-bold leading-tight text-white block"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)" }}
                />
              )
            )}
            </div>
            {/* Position dots — INSIDE the hero overlay so they sit on
                the bottom-fade gradient instead of on a separate
                bg-black strip between hero and mini-player. Height is
                reserved (always renders the row even with 1 nugget)
                so wave-2 landing doesn't reflow the headline. */}
            <div className="mt-3 h-2 flex justify-center items-center gap-1.5 pointer-events-none">
              <AnimatePresence>
                {nuggets.length > 1 &&
                  Array.from({ length: nuggets.length }, (_, i) => {
                    const isActive = i === activeIndex;
                    const isUnlocked = i < unlockedCount;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                          isActive ? "bg-white/85" : isUnlocked ? "bg-white/35" : "bg-white/12"
                        }`}
                      />
                    );
                  })}
              </AnimatePresence>
            </div>

            {/* Scroll cue — one chevron, nothing else.
                It previously carried a "MORE" label and a neon halo: the
                label said what the chevron already says, the halo didn't
                read at this size against a dark photo, and the stack of
                three elements sat tight under the headline so the arrow
                landed directly beneath the sentence's final period and
                read as punctuation. The generous top margin is the fix —
                it separates the cue from the prose so it reads as
                wayfinding. Fades out as the body scrolls in (see
                handleBodyScroll); tap scrolls the body into view. */}
            {hasMoreBelow && (
              <div ref={cueRef} className="mt-4 flex justify-center">
                <button
                  type="button"
                  aria-label="Scroll down to read the full story"
                  onClick={(e) => { e.stopPropagation(); scrollBodyIntoView(); }}
                  className="p-3 animate-cue-float"
                >
                  <svg
                    width="20" height="12" viewBox="0 0 22 14" fill="none" aria-hidden
                    style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }}
                  >
                    <path
                      d="M2 12 L11 3 L20 12"
                      stroke="rgba(255,255,255,0.75)"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
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
            {isSafeUrl(activeSource?.url) && (
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
            {activeNugget?.recommendedArtist?.name && (
              <RecommendedArtistButton
                recommendedArtist={activeNugget.recommendedArtist}
              />
            )}
            {activeNugget?.recommendedTrack?.title && (
              <RecommendedTrackButton
                recommendedTrack={activeNugget.recommendedTrack}
              />
            )}
          </div>

          {activeSource && (
            <p className="text-[10px] text-white/20">{activeSource.publisher}</p>
          )}
        </div>
      </div>
    );
    // Deps include nuggets.length / activeIndex / unlockedCount now
    // that the dots row lives inside the hero overlay. Re-rendering
    // on those changes is correct (dots need to update on swipe and
    // when wave-2 lands) — and cheap, because the typewriter and
    // image children re-use the same activeNugget identity unless
    // the active nugget itself changes.
  }, [getNuggetImage, activeNugget, activeSource, isTypewriterDone, handleTypewriterComplete, deepDiveText, deepDiveFollowUp, deepDiveLoading, deepDiveRateLimited, handleTellMeMore, bookmarks, artist, trackTitle, nuggets.length, activeIndex, unlockedCount, handleBodyScroll, scrollBodyIntoView]);

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

      {/* Main content area — full bleed, no card. Pete's spec:
          "only our full screen nugget cards should display since
          they're available." Previously the AnimatePresence
          alternated between the nugget card and a centered-cover-art
          "now-playing" screen with a "View nuggets" button. That
          alternate was reached whenever showCard was false (active
          nugget undefined OR dismissed). On a same-session return
          via the mini-player it was firing even though nuggets were
          loaded and the user had not dismissed anything. Killing
          the alternate entirely:
            - When nuggets exist → always render the card (activeNugget
              falls back to nuggets[0], so it's never undefined).
            - When nuggets are still loading → show a minimal blurred
              placeholder so the user sees something but is not
              presented with a "View nuggets" button that does
              nothing for them. */}
      <div className="relative z-10 flex-1 overflow-hidden min-h-0">
        {nuggets.length > 0 ? (
          <motion.div
            key="nugget-card"
            className="w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
          /* Loading placeholder — only ever visible while the first
             nugget is still in flight. No button, no false promise:
             the orchestrator's researching pill provides the loading
             affordance. */
          <motion.div
            key="loading-placeholder"
            className="w-full h-full flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {artUrl && (
              <img
                src={artUrl}
                alt=""
                className={`w-56 h-56 rounded-2xl shadow-2xl object-cover opacity-80 ${
                  isPlaying ? "animate-cover-pulse" : ""
                }`}
              />
            )}
          </motion.div>
        )}
      </div>

      {/* Position dots moved INSIDE the hero overlay (just below the
          headline) so they sit on the bottom-fade gradient instead
          of a separate strip between hero and mini-player. The
          earlier standalone bg-black row had to either show as a
          visible black bar or expose the blurred background; placing
          them in the gradient overlay is the cleanest of both. See
          renderNuggetCard for the dots JSX. */}

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
