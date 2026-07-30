import { motion } from "framer-motion";
import { ReactNode } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      // Per-variant transition — a top-level `transition` prop would be
      // overridden by nothing and an `exitTransition` prop does not exist
      // in framer-motion, so the override has to live inside the variant.
      exit={{ opacity: 0, scale: 0.98, y: -10, transition: { duration: 0.18, ease: "easeIn" } }}
      // App.tsx wraps routes in <AnimatePresence mode="wait">, so the
      // incoming page cannot mount until this exit finishes. At 0.5s the
      // user watched the OLD page for half a second after the URL had
      // already changed — most visible when leaving a full-screen modal,
      // where the card appeared to stay open on the new page (Pete: "it
      // takes me to the artist page but the card stays open so I don't
      // see that I'm in the artist page"). Exits are dead time; only the
      // entrance needs to feel considered.
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="min-h-screen w-full"
    >
      {children}
    </motion.div>
  );
}
