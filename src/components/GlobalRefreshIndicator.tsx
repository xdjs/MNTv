import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useRefreshIndicator } from "@/contexts/RefreshIndicatorContext";

/**
 * Subtle top-of-screen indicator that surfaces background refresh
 * activity. Two parts:
 *   - 2px progress bar across the top edge (always-visible affordance)
 *   - Hover/tap reveals a label ("Refreshing your library")
 *
 * Hidden when nothing is refreshing — appears for as long as any of the
 * tracked sources (taste / artist-updates) reports loading, then fades
 * out. Pointer-events: none so it doesn't intercept clicks on
 * overlapping UI.
 *
 * Suppressed on `/preparing` because that splash has its own dedicated
 * progress bar + status message; showing both is redundant.
 */
export default function GlobalRefreshIndicator() {
  const { any, label } = useRefreshIndicator();
  const { pathname } = useLocation();
  const suppress = pathname.startsWith("/preparing");
  return (
    <AnimatePresence>
      {any && !suppress && (
        <motion.div
          key="refresh-indicator"
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
          aria-live="polite"
          role="status"
        >
          <div className="relative h-[2px] w-full overflow-hidden bg-white/5">
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-pink-400/80 to-transparent"
              animate={{ x: ["-50%", "150%"] }}
              transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
            />
          </div>
          {label && (
            <div className="flex justify-center pt-1.5 pointer-events-auto">
              <span className="rounded-full bg-black/60 backdrop-blur px-3 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70">
                {label}…
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
