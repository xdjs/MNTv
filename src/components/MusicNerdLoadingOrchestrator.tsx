import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";

type AnimPhase = "hidden" | "pill" | "morphFly" | "pulsating" | "ready" | "failed";

interface Props {
  aiLoading: boolean;
  /** Wave-2 research, which continues after the first nuggets land and
   *  `aiLoading` has gone false. Keeps the logo pulsing so the user knows
   *  more facts are still coming rather than assuming we're done. */
  waveLoading?: boolean;
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
// PILL_DISPLAY_MS removed — the pill hasn't been on a fixed display
// timer since it started waiting on hasNuggets, and the constant had
// been dead since before this branch. noUnusedLocals is off, so nothing
// flagged it.
/** Duration of the morph-fly animation (s) */
const MORPH_FLY_S = 0.5;
/**
 * Hard ceiling on how long the researching pill may stay up (ms).
 * Generous enough to cover a slow Exa → Gemini round trip; short enough
 * that a stalled pipeline doesn't strand the user under a spinner.
 */
const PILL_MAX_HOLD_MS = 45000;
/**
 * Hard ceiling on the pulsating logo (ms). Same reasoning as the pill's:
 * a stalled wave-2 must not leave the logo pulsing forever, telling the
 * user research is in flight when nothing is coming. Longer than the
 * pill's because by this point the user already has facts to read — the
 * cost of over-waiting is much lower than staring at an empty screen.
 */
const PULSATING_MAX_HOLD_MS = 90000;

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
  waveLoading = false,
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
  // "Still researching" covers both the initial generation and wave-2.
  // Only the pulsating phase uses this — the pill's own timing stays tied
  // to aiLoading alone, since wave-2 by definition hasn't started while
  // the pill is up.
  const researching = aiLoading || waveLoading;

  // Restore cached phase for this track, or start hidden
  const initialPhase = (): AnimPhase => {
    const cached = phaseCache.get(trackId);
    // If we already reached pulsating/ready/morphFly for this track, restore
    // (morphFly → skip to pulsating/ready since we can't resume mid-flight).
    // NOTE: cached === "ready" intentionally returns "ready" regardless of
    // aiLoading. A previous attempt to flip "ready" → "hidden" when
    // aiLoading=true (to surface the pill on track-completed returns)
    // caused the pill to flash on story-tap re-visits — aiLoading is
    // always briefly true on mount until the in-mem cache hit lands, and
    // the trackId-keyed phaseCache treated re-tested tracks the same as
    // mid-flight regenerations. Better to skip the pill on rare
    // regenerate-key returns than to surface it on every cache-hit tap.
    if (cached === "ready") return "ready";
    if (cached === "pulsating") return researching ? "pulsating" : "ready";
    if (cached === "morphFly") return researching ? "pulsating" : "ready";
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
  const researchingRef = useRef(researching);
  researchingRef.current = researching;

  // Cancels every timer registered through addTimer. NOTE: the pill's
  // max-hold ceiling is deliberately NOT registered here — it lives in
  // an effect whose own cleanup covers both phase change and unmount, so
  // routing it through addTimer would let a phase transition cancel the
  // very ceiling that protects against a stuck phase. If you add another
  // timer, register it here unless it has that same self-cleanup.
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
      // Check cache for new track. rapid skip
      // sequences landed on a track whose phaseCache said "ready"
      // (visited before), so we restored straight to ready and the
      // researching pill never showed — even though aiLoading was
      // true because a fresh generation was in flight. The fix:
      // when aiLoading is currently true, drop ANY cached
      // post-hidden phase and let the state machine drive from
      // hidden → pill → ready normally.
      const cached = phaseCache.get(trackId);
      if (cached && cached !== "hidden" && !aiLoadingRef.current) {
        const restored = cached === "ready" ? "ready"
          : cached === "pulsating" ? "ready"
          : cached === "morphFly" ? "ready"
          : cached === "pill" ? "ready"
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

  // ── Pill stays visible until nuggets ACTUALLY arrive ──
  // Previously OR'd on !aiLoading too, which dismissed the pill when
  // generation "finished" even if no nugget had landed in state yet
  // (Pete: "loading state disappeared as if research was done but no
  // nugget popped up, eventually the nugget arrived"). Two real
  // scenarios bit this: (1) SSE completed with empty results and the
  // synthetic fallback hadn't fired yet, leaving a window of
  // aiLoading=false + hasNuggets=false; (2) initial generate errored
  // and the catch-block fallback was still async-resolving. Either
  // way the user sees an empty screen with no indication of state.
  // Now the pill only dismisses when we genuinely have a nugget to
  // morph into. Failures still transition out via the aiError handler
  // below.
  useEffect(() => {
    if (phase !== "pill") return;
    if (hasNuggets) {
      clearTimers();
      startMorphFly();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasNuggets]);

  // ── Safety terminus: the pill must never outlive a plausible research
  // window ──
  // On the success path `hasNuggets` is the ONLY exit from "pill" — the
  // aiError branch below covers failures, and the pulsating / false→true
  // effects don't apply to this phase. Since `hasNuggets` now tracks a
  // nugget being genuinely ON SCREEN (strictly harder to satisfy than
  // "nuggets exist in state"), a stuck upstream leaves the user under a
  // spinner indefinitely. Listen has real paths that do this: seeking to
  // a gap nulls activeNugget while marking nuggets shown, so the reveal
  // effect's `!isPlaying && aiFromCache` guard keeps it null while paused.
  // Hanging is worse than dismissing early, so cap it unconditionally.
  useEffect(() => {
    if (phase !== "pill") return;
    const t = setTimeout(() => {
      if (phaseRef.current === "pill") startMorphFly();
    }, PILL_MAX_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── aiLoading flips false→true mid-track: re-enter the state machine ──
  // when skipping tracks, aiLoading sometimes
  // momentarily lags one tick behind the trackId change. The track
  // -change effect ran with stale aiLoading=false, drove phase to
  // "ready" instantly, and never showed the researching pill — even
  // though aiLoading flipped true a tick later for the new track's
  // generation. Detect the false→true transition and force phase
  // back to "hidden" so the state machine schedules the pill again.
  const prevAiLoadingRef = useRef(aiLoading);
  useEffect(() => {
    const prev = prevAiLoadingRef.current;
    prevAiLoadingRef.current = aiLoading;
    if (!prev && aiLoading && phaseRef.current !== "hidden") {
      clearTimers();
      setPhaseAndRef("hidden");
    }
  }, [aiLoading, clearTimers, setPhaseAndRef]);

  // ── Research finishes during pulsating → ready ──
  // Waits on wave-2 as well as the initial generation, so the logo keeps
  // pulsing while more facts are still being researched.
  useEffect(() => {
    if (!researching && phase === "pulsating") {
      setPhaseAndRef("ready");
    }
  }, [researching, phase, setPhaseAndRef]);

  // ── Safety terminus for the pulsating logo ──
  // Same reasoning as the pill's ceiling: a wave-2 that never resolves
  // must not leave the logo claiming research is in flight forever.
  // Registered outside addTimer for the same reason — the effect's own
  // cleanup handles phase change and unmount, and routing it through
  // clearTimers would let a phase transition cancel the guard.
  useEffect(() => {
    if (phase !== "pulsating") return;
    const t = setTimeout(() => {
      if (phaseRef.current === "pulsating") setPhaseAndRef("ready");
    }, PULSATING_MAX_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase, setPhaseAndRef]);

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
      if (researchingRef.current) {
        setPhaseAndRef("pulsating");
      } else {
        setPhaseAndRef("ready");
      }
    }
  }

  function onMorphComplete() {
    setFlyCoords(null);
    // Use ref for the latest value (closure may be stale)
    if (researchingRef.current) {
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
            data-testid="nerd-logo"
            data-phase={phase}
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
            data-testid="researching-pill"
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
