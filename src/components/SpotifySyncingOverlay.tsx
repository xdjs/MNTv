import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";

/**
 * Full-screen takeover shown while the Spotify post-signin taste fetch
 * is in flight. Replaces the Connect screen entirely so the user sees
 * unambiguous progress rather than re-reading "Connect your music".
 *
 * Error surfacing is delegated to the parent — this overlay is "dumb"
 * about failure semantics. When `error` is non-null, show the error
 * state. When `visible` goes false, the overlay unmounts via exit
 * animation. No private watchdog; the hook's fetch timeout (20s) is
 * the single source of truth for when to give up.
 *
 * Progress-bar pacing spans the full fetch window (4% → 95% over 20s)
 * so the bar is always visibly moving, never parked.
 */

const STATUS_STEPS = [
  { threshold: 0, label: "Opening the door to your library" },
  { threshold: 2_000, label: "Tuning into your listening history" },
  { threshold: 6_000, label: "Finding the artists you love most" },
  { threshold: 10_000, label: "Lining up the tracks you know by heart" },
  { threshold: 15_000, label: "Just a moment more" },
];

interface Props {
  visible: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function SpotifySyncingOverlay({ visible, error, onRetry }: Props) {
  const [elapsed, setElapsed] = useState(0);

  // Only run the status-step timer while we're actually loading (no
  // error). On an error → loading transition this effect will re-fire
  // and reset elapsed to 0, so the user sees a fresh run.
  const loading = visible && !error;
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, [loading]);

  const currentStep = STATUS_STEPS.reduce((acc, step) =>
    elapsed >= step.threshold ? step : acc,
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="spotify-sync-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black px-6"
          aria-live="polite"
          role="status"
        >
          {/* Animated aurora background — slow drift so the screen
              never feels frozen while progress ticks. */}
          <motion.div
            className="pointer-events-none absolute -inset-40 opacity-60 blur-3xl"
            initial={{ scale: 1, rotate: 0 }}
            animate={{ scale: [1, 1.08, 1], rotate: [0, 8, 0] }}
            transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
            style={{
              background:
                "radial-gradient(40% 40% at 30% 30%, rgba(34,197,94,0.25), transparent), radial-gradient(40% 40% at 70% 70%, rgba(236,72,153,0.25), transparent)",
            }}
          />

          <motion.div
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              animate={error ? { scale: 1 } : { scale: [1, 1.04, 1] }}
              transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
            >
              <MusicNerdLogo size={72} glow />
            </motion.div>

            {error ? (
              <ErrorState error={error} onRetry={onRetry} />
            ) : (
              // `key` forces the LoadingState subtree (including the
              // progress bar's motion.div) to remount on a retry, so
              // the bar animation restarts from 0 instead of freezing
              // at wherever it was when error fired.
              <LoadingState key={elapsed === 0 ? "fresh" : "continue"} label={currentStep.label} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <>
      <div className="space-y-1.5">
        <h1
          className="text-xl md:text-2xl font-black text-white tracking-tight"
          style={{ fontFamily: "'Nunito Sans', sans-serif" }}
        >
          Reading your music taste
        </h1>
        <div className="relative h-5 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={label}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-sm text-white/70"
            >
              {label}
              <span className="inline-block ml-0.5 animate-pulse">…</span>
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        {/* Bar spans the full 20s fetch-timeout window so the user
            always sees forward motion. Never parks — if the hook
            reports an error the overlay swaps states entirely; on
            success the exit animation snaps to 100%. */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-400 via-emerald-300 to-pink-400"
          initial={{ width: "4%" }}
          animate={{ width: "95%" }}
          exit={{ width: "100%" }}
          transition={{ duration: 20, ease: [0.2, 0.6, 0.3, 1] }}
        />
        <motion.div
          className="absolute inset-y-0 w-24 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
          }}
          animate={{ x: ["-20%", "420%"] }}
          transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
        />
      </div>

      <p className="text-[11px] uppercase tracking-widest text-white/35">
        Sit tight — this only happens once
      </p>
    </>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="space-y-1.5">
        <h1
          className="text-xl md:text-2xl font-black text-white tracking-tight"
          style={{ fontFamily: "'Nunito Sans', sans-serif" }}
        >
          Hmm, that took too long
        </h1>
        <p className="text-sm text-white/70 max-w-xs">{error}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-full bg-white text-black text-sm font-semibold px-6 py-2.5 hover:bg-white/90 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
