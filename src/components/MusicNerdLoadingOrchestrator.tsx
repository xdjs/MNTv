import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";

type AnimPhase = "hidden" | "pill" | "morphFly" | "pulsating" | "ready" | "failed";

interface Props {
  aiLoading: boolean;
  aiError?: string | null;
  hasNuggets?: boolean;
  shortId: string | null;
  trackId: string;
  tier: string;
  listenCount: number;
  focusZone: string;
  topFocusIndex: number;
  onCompanionClick: () => void;
}

/** Animated dots for "researching..." text */
function AnimatedDots() {
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setDotCount((c) => (c + 1) % 4), 500);
    return () => clearInterval(interval);
  }, []);
  return <span className="inline-block w-4 text-left">{".".repeat(dotCount)}</span>;
}

/** Settle delay before pill appears (ms) */
const SETTLE_MS = 350;
/** How long the pill is visible before morphing (ms) */
const PILL_DISPLAY_MS = 2200;
/** Duration of the morph-fly animation (s) */
const MORPH_FLY_S = 0.5;

/**
 * Module-level cache so that when the user navigates away (Browse) and comes
 * back to the same track, we restore the phase instead of restarting the
 * animation from scratch. Capped to 5 entries to prevent unbounded growth.
 */
const MAX_PHASE_CACHE = 5;
const phaseCache = new Map<string, AnimPhase>();

function setPhaseCached(key: string, value: AnimPhase) {
  phaseCache.set(key, value);
  if (phaseCache.size > MAX_PHASE_CACHE) {
    // Delete oldest entry — Map preserves insertion order, so
    // keys().next().value is always the first (oldest) key.
    const oldest = phaseCache.keys().next().value;
    if (oldest !== undefined) phaseCache.delete(oldest);
  }
}

export default function MusicNerdLoadingOrchestrator({
  aiLoading,
  aiError,
  hasNuggets = false,
  shortId,
  trackId,
  tier,
  listenCount,
  focusZone,
  topFocusIndex,
  onCompanionClick,
}: Props) {
  // Restore cached phase for this track, or start hidden
  const initialPhase = (): AnimPhase => {
    const cached = phaseCache.get(trackId);
    // If we already reached pulsating/ready/morphFly for this track, restore
    // (morphFly → skip to pulsating/ready since we can't resume mid-flight)
    if (cached === "ready") return "ready";
    if (cached === "pulsating") return aiLoading ? "pulsating" : "ready";
    if (cached === "morphFly") return aiLoading ? "pulsating" : "ready";
    if (cached === "pill") return aiLoading ? "pill" : "ready";
    return "hidden";
  };

  const [phase, setPhase] = useState<AnimPhase>(initialPhase);
  const phaseRef = useRef(phase);
  const trackRef = useRef(trackId);
  const aiLoadingRef = useRef(aiLoading);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const [flyCoords, setFlyCoords] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null);
  // Track whether this is the initial mount (skip burst animation on remount)
  const isRestoredRef = useRef(initialPhase() !== "hidden");

  // Keep refs in sync
  aiLoadingRef.current = aiLoading;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const setPhaseAndRef = useCallback((p: AnimPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // Persist phase to module cache on every change
  useEffect(() => {
    setPhaseCached(trackId, phase);
    phaseRef.current = phase;
  }, [phase, trackId]);

  // ── Track change → reset ──
  useEffect(() => {
    if (trackRef.current !== trackId) {
      trackRef.current = trackId;
      clearTimers();
      setFlyCoords(null);
      isRestoredRef.current = false;
      // Check cache for new track
      const cached = phaseCache.get(trackId);
      if (cached && cached !== "hidden") {
        const restored = cached === "ready" ? "ready"
          : cached === "pulsating" ? (aiLoadingRef.current ? "pulsating" : "ready")
          : cached === "morphFly" ? (aiLoadingRef.current ? "pulsating" : "ready")
          : cached === "pill" ? (aiLoadingRef.current ? "pill" : "ready")
          : "hidden";
        isRestoredRef.current = restored !== "hidden";
        setPhaseAndRef(restored);
      } else {
        setPhaseAndRef("hidden");
      }
    }
  }, [trackId, clearTimers, setPhaseAndRef]);

  // ── State machine driver ──
  useEffect(() => {
    // Only drive from hidden — skip if restored to a later phase
    if (phase !== "hidden") return;

    // Cache hit: aiLoading is already false → go straight to ready
    if (!aiLoading) {
      setPhaseAndRef("ready");
      return;
    }

    // Start settle timer
    addTimer(() => {
      if (trackRef.current !== trackId) return;
      // Guard: only advance if still hidden (could have been changed by cache-hit path)
      if (phaseRef.current !== "hidden") return;
      setPhaseAndRef("pill");
    }, SETTLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiLoading, trackId, phase]);

  // ── Pill stays visible until nuggets arrive OR loading finishes ──
  // No timed morph — the pill persists as long as the user has nothing to see.
  useEffect(() => {
    if (phase !== "pill") return;
    if (hasNuggets || !aiLoading) {
      clearTimers();
      startMorphFly();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasNuggets, aiLoading]);

  // ── aiLoading goes false during pulsating → ready ──
  useEffect(() => {
    if (!aiLoading && phase === "pulsating") {
      setPhaseAndRef("ready");
    }
  }, [aiLoading, phase, setPhaseAndRef]);

  // ── Research failed → show error state, auto-dismiss after 4s ──
  // Timing: aiError is set when generation fails, and aiLoading goes
  // false at the same time (in the finally block). On track change,
  // aiLoading goes true and aiError is cleared to null at the start
  // of generate(). So !aiLoading && aiError is only true when the
  // CURRENT track's generation has finished with an error.
  useEffect(() => {
    if (aiError && !aiLoading && phase !== "ready" && phase !== "failed") {
      clearTimers();
      setPhaseAndRef("failed");
    }
  }, [aiError, aiLoading, phase, clearTimers, setPhaseAndRef]);

  useEffect(() => {
    if (phase !== "failed") return;
    const t = setTimeout(() => setPhaseAndRef("hidden"), 4000);
    return () => clearTimeout(t);
  }, [phase, setPhaseAndRef]);

  // ── Cleanup on unmount ──
  useEffect(() => () => clearTimers(), [clearTimers]);

  function startMorphFly() {
    const pillEl = pillRef.current;
    const anchorEl = anchorRef.current;
    // Check if anchor is visible (has non-zero dimensions)
    const anchorRect = anchorEl?.getBoundingClientRect();
    const anchorVisible = anchorRect && anchorRect.width > 0 && anchorRect.height > 0;

    if (pillEl && anchorEl && anchorVisible) {
      const pillRect = pillEl.getBoundingClientRect();
      setFlyCoords({
        startX: pillRect.left + pillRect.width / 2,
        startY: pillRect.top + pillRect.height / 2,
        x: anchorRect.left + anchorRect.width / 2,
        y: anchorRect.top + anchorRect.height / 2,
      });
      setPhaseAndRef("morphFly");
    } else {
      // Anchor not visible (e.g. hidden on mobile) — skip morph, go straight to pulsating/ready
      if (aiLoadingRef.current) {
        setPhaseAndRef("pulsating");
      } else {
        setPhaseAndRef("ready");
      }
    }
  }

  function onMorphComplete() {
    setFlyCoords(null);
    // Use ref for latest aiLoading value (closure may be stale)
    if (aiLoadingRef.current) {
      setPhaseAndRef("pulsating");
    } else {
      setPhaseAndRef("ready");
    }
  }

  const isFocused = focusZone === "top" && topFocusIndex === 1;
  // Don't play burst/spin on restored remount (navigating back to same song)
  const skipEntrance = isRestoredRef.current;

  return (
    <>
      {/* Anchor div in top-right for morph target + final logo */}
      <div ref={anchorRef} className="flex flex-col items-center gap-1.5">
        {/* Final logo button — visible in pulsating + ready phases */}
        {(phase === "pulsating" || phase === "ready") && (
          <motion.button
            onClick={onCompanionClick}
            disabled={phase !== "ready" || !shortId}
            className={`relative transition-all duration-300 outline-none rounded-full ${
              isFocused ? "tv-focus-glow scale-110" : ""
            }`}
            aria-label="Open companion page"
            initial={skipEntrance ? { opacity: 1, scale: 1 } : { opacity: 0.8, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: skipEntrance ? 0 : 0.3, ease: "easeOut" }}
          >
            {/* Burst ring on ready (skip on restored remount) */}
            {phase === "ready" && !skipEntrance && (
              <motion.div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  border: "2px solid hsl(var(--neon-glow) / 0.6)",
                }}
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            )}
            <motion.div
              animate={
                phase === "pulsating"
                  ? { opacity: [0.5, 0.85, 0.5] }
                  : { opacity: 1 }
              }
              transition={
                phase === "pulsating"
                  ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.25 }
              }
            >
              {phase === "ready" && !skipEntrance ? (
                <motion.div
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <MusicNerdLogo size={40} glow={false} />
                </motion.div>
              ) : (
                <MusicNerdLogo size={40} glow={false} />
              )}
            </motion.div>
          </motion.button>
        )}

        {/* Invisible placeholder to keep layout when logo not yet shown */}
        {phase !== "pulsating" && phase !== "ready" && (
          <div className="w-10 h-10 opacity-0 pointer-events-none" aria-hidden />
        )}
      </div>

      {/* ── Glass pill (centered below album art) ──
          TODO: 216px offset is relative to the centered album art layout.
          May need adjustment for smaller phones or when keyboard is open. */}
      <AnimatePresence>
        {phase === "pill" && (
          <motion.div
            ref={pillRef}
            className="fixed left-1/2 z-50 rounded-full px-4 py-2.5 flex items-center gap-2.5 pointer-events-none will-change-transform bg-black/60 border border-white/10"
            style={{
              top: "calc(50% + 216px)",
              translateX: "-50%",
            }}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <MusicNerdLogo size={18} glow={false} />
            <span className="text-sm font-medium text-foreground/70 whitespace-nowrap select-none">
              MusicNerd is researching
              <AnimatedDots />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Failed pill ── */}
      <AnimatePresence>
        {phase === "failed" && (
          <motion.div
            className="fixed left-1/2 z-50 rounded-full px-4 py-2.5 flex items-center gap-2.5 pointer-events-none will-change-transform bg-black/60 border border-red-500/30"
            style={{
              top: "calc(50% + 216px)",
              translateX: "-50%",
            }}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3 } }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <MusicNerdLogo size={18} glow={false} />
            <span className="text-sm font-medium text-red-400/80 whitespace-nowrap select-none">
              Research unavailable
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Morph fly element ── */}
      <AnimatePresence>
        {phase === "morphFly" && flyCoords && (
          <motion.div
            className="fixed z-50 pointer-events-none flex items-center justify-center rounded-full bg-black/40 will-change-transform"
            style={{
              left: flyCoords.startX,
              top: flyCoords.startY,
              width: 48,
              height: 48,
              borderRadius: 24,
              translateX: "-50%",
              translateY: "-50%",
            }}
            initial={{
              scale: 1,
              x: 0,
              y: 0,
              opacity: 1,
            }}
            animate={{
              scale: 1,
              x: flyCoords.x - flyCoords.startX,
              y: flyCoords.y - flyCoords.startY,
              opacity: 1,
            }}
            transition={{
              duration: MORPH_FLY_S,
              ease: [0.25, 1, 0.5, 1],
            }}
            onAnimationComplete={onMorphComplete}
          >
            {/* Text fades quickly */}
            <motion.span
              className="absolute text-sm font-medium text-foreground/70 whitespace-nowrap ml-7"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              MusicNerd is researching...
            </motion.span>
            {/* Logo scales up */}
            <motion.div
              initial={{ scale: 0.45 }}
              animate={{ scale: 1 }}
              transition={{ duration: MORPH_FLY_S, ease: "easeInOut" }}
            >
              <MusicNerdLogo size={32} glow={false} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
