import { motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { getSourceById } from "@/mock/tracks";
import type { Nugget, AnimationStyle, Source } from "@/mock/types";

interface Props {
  nugget: Nugget;
  animationStyle: AnimationStyle;
  onSourceClick: () => void;
  currentTime?: string;
  sourceOverride?: Source | null;
}

// Kind labels for the nugget header
const kindLabels: Record<string, string> = {
  process: "Behind the Scenes",
  constraint: "Creative Constraint",
  pattern: "Pattern",
  human: "Human Story",
  influence: "Influence",
};

// Style A — Glass Slide + Focus Bloom
const cardA = {
  initial: { opacity: 0, y: 30, filter: "blur(12px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -16, scale: 0.92, filter: "blur(6px)", transition: { duration: 0.3 } },
};
const logoA = {
  initial: { opacity: 0, scale: 0, rotate: -90 },
  animate: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scale: 0, rotate: 90, transition: { duration: 0.2 } },
};

// Style B — Border Sweep + Text Mask Reveal
const cardB = {
  initial: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  animate: { opacity: 1, clipPath: "inset(0 0% 0 0)", transition: { duration: 0.5, delay: 0.3, ease: [0.25, 1, 0.5, 1] as const } },
  exit: { opacity: 0, clipPath: "inset(0 0 0 100%)", transition: { duration: 0.35 } },
};
const logoB = {
  initial: { opacity: 0, x: -20, scale: 0.5 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" as const } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.2 } },
};

// Style C — Anchor Dot Expand
const cardC = {
  initial: { opacity: 0, scale: 0.1, originX: 0, originY: 1 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.4, delay: 0.45, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scale: 0.1, transition: { duration: 0.3, ease: "easeIn" as const } },
};
const logoC = {
  initial: { opacity: 0, scale: 0, rotate: -180 },
  animate: {
    opacity: 1,
    scale: [0, 1.3, 1],
    rotate: 0,
    transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] as const },
  },
  exit: { opacity: 0, scale: 0, rotate: 180, transition: { duration: 0.25 } },
};

const styleMap = {
  A: { card: cardA, logo: logoA },
  B: { card: cardB, logo: logoB },
  C: { card: cardC, logo: logoC },
};

export default function NuggetCard({ nugget, animationStyle, onSourceClick, currentTime, sourceOverride }: Props) {
  const source = sourceOverride !== undefined ? sourceOverride : getSourceById(nugget.sourceId);
  const { card: cardVariants, logo: logoVariants } = styleMap[animationStyle];

  return (
    <motion.div className="relative" initial="initial" animate="animate" exit="exit">
      {/* Logo — left side, appears FIRST */}
      <motion.div
        variants={logoVariants}
        className={`absolute -left-3 z-10 ${animationStyle === "C" ? "-bottom-3" : "-top-3"}`}
      >
        <MusicNerdLogo size={animationStyle === "C" ? 32 : 22} glow />
      </motion.div>

      {/* Card */}
      <motion.div
        variants={cardVariants}
        className="apple-glass relative rounded-2xl p-5 ml-2"
      >
        {/* Style A bloom */}
        {animationStyle === "A" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.2, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="absolute inset-0 rounded-2xl bg-primary blur-2xl -z-10"
          />
        )}

        {/* Style B border sweep */}
        {animationStyle === "B" && (
          <motion.div
            initial={{ backgroundSize: "0% 2px, 2px 0%, 0% 2px, 2px 0%" }}
            animate={{ backgroundSize: "100% 2px, 2px 100%, 100% 2px, 2px 100%" }}
            transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              backgroundImage: `linear-gradient(hsl(var(--primary)), hsl(var(--primary))), linear-gradient(hsl(var(--primary)), hsl(var(--primary))), linear-gradient(hsl(var(--primary)), hsl(var(--primary))), linear-gradient(hsl(var(--primary)), hsl(var(--primary)))`,
              backgroundPosition: "0 0, 100% 0, 100% 100%, 0 100%",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}

        {/* Style C bloom (same as A) */}
        {animationStyle === "C" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.2, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="absolute inset-0 rounded-2xl bg-primary blur-2xl -z-10"
          />
        )}

        {/* Header: kind label + timestamp */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.35, duration: 0.3 } }}
          className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="uppercase tracking-wider">{kindLabels[nugget.kind] || nugget.kind}</span>
          {currentTime && (
            <>
              <span className="text-foreground/20">•</span>
              <span className="tabular-nums">{currentTime}</span>
            </>
          )}
        </motion.div>

        {/* Listen-for badge */}
        {nugget.listenFor && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, transition: { delay: 0.5 } }}
            className="mb-2 flex items-center gap-1.5"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-wider text-primary">Listen for this</span>
          </motion.div>
        )}

        {/* Nugget text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: animationStyle === "B" ? 0.5 : 0.4, duration: 0.3 } }}
          className="text-sm leading-relaxed text-foreground/90 md:text-base"
        >
          {nugget.text}
        </motion.p>

        {/* Source chip */}
        {source && (
          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.6 } }}
            onClick={onSourceClick}
            className="mt-3 flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground tv-focus-visible"
          >
            <span className="uppercase tracking-wider font-medium">
              {source.type === "youtube" ? "▶ Watch" : source.type === "article" ? "📄 Read" : "🎙 Interview"}
            </span>
            <span className="truncate max-w-[180px]">{source.publisher}</span>
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
