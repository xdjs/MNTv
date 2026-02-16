import { motion } from "framer-motion";
import { useMemo } from "react";
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

const kindLabels: Record<string, string> = {
  process: "Behind the Scenes",
  constraint: "Creative Constraint",
  pattern: "Pattern",
  human: "Human Story",
  influence: "Influence",
};

// Pre-defined scatter positions (VH1 Pop Up style) — avoiding edges and bottom playback area
const positions = [
  { top: 25, left: 8 },
  { top: 18, left: 55 },
  { top: 45, left: 12 },
  { top: 35, left: 60 },
  { top: 55, left: 40 },
  { top: 20, left: 30 },
  { top: 50, left: 65 },
  { top: 30, left: 5 },
  { top: 40, left: 45 },
  { top: 15, left: 70 },
  { top: 60, left: 15 },
  { top: 28, left: 48 },
];

/* ── Style A — Glass Slide + Focus Bloom ── */
const styleAOuter = {
  initial: { opacity: 0, x: -30 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
  exit: { opacity: 0, x: 30, transition: { duration: 0.25, ease: "easeIn" as const } },
};
const styleALogo = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.15 } },
};
const styleACard = {
  initial: { opacity: 0, x: -20, filter: "blur(6px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.35, delay: 0.1, ease: [0.4, 0, 0.2, 1] as const } },
  exit: { opacity: 0, x: 20, filter: "blur(4px)", transition: { duration: 0.2 } },
};

/* ── Style B — Border Sweep + Text Mask ── */
const styleBOuter = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};
const styleBLogo = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};
const styleBCard = {
  initial: { opacity: 0, scaleX: 0.3, originX: 0 },
  animate: { opacity: 1, scaleX: 1, transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scaleX: 0.3, transition: { duration: 0.2 } },
};

/* ── Style C — Anchor Dot Expand ── */
const styleCOuter = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};
const styleCLogo = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.15 } },
};
const styleCCard = {
  initial: { opacity: 0, scale: 0, originX: 0, originY: "50%" },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.35, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.2 } },
};

const variants = {
  A: { outer: styleAOuter, logo: styleALogo, card: styleACard },
  B: { outer: styleBOuter, logo: styleBLogo, card: styleBCard },
  C: { outer: styleCOuter, logo: styleCLogo, card: styleCCard },
};

export default function NuggetCard({ nugget, animationStyle, onSourceClick, currentTime, sourceOverride }: Props) {
  const source = sourceOverride !== undefined ? sourceOverride : getSourceById(nugget.sourceId);
  const v = variants[animationStyle];

  // Pick a pseudo-random position based on nugget id hash
  const pos = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < nugget.id.length; i++) {
      hash = ((hash << 5) - hash + nugget.id.charCodeAt(i)) | 0;
    }
    return positions[Math.abs(hash) % positions.length];
  }, [nugget.id]);

  const isStyleC = animationStyle === "C";

  return (
    <motion.div
      className="absolute z-20 flex items-start gap-2"
      style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={v.outer}
    >
      {/* Logo pip */}
      <motion.div variants={v.logo} className="flex-shrink-0 mt-1.5 relative">
        <MusicNerdLogo size={24} glow={isStyleC} />
        {isStyleC && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: "0 0 12px 4px hsl(330 90% 60% / 0.5), 0 0 24px 8px hsl(330 90% 60% / 0.2)",
              pointerEvents: "none",
            }}
          />
        )}
      </motion.div>

      {/* Card */}
      <motion.div
        variants={v.card}
        className="relative max-w-[300px] rounded-xl px-4 py-3 cursor-pointer backdrop-blur-md border border-foreground/10"
        style={{
          background: "hsl(0 0% 8% / 0.75)",
          boxShadow: isStyleC
            ? "0 4px 24px hsl(330 90% 60% / 0.15), 0 1px 3px hsl(0 0% 0% / 0.4)"
            : animationStyle === "A"
            ? "0 0 20px hsl(330 90% 60% / 0.08), 0 4px 16px hsl(0 0% 0% / 0.5)"
            : "0 4px 20px hsl(0 0% 0% / 0.5)",
        }}
        onClick={onSourceClick}
      >
        {/* Kind label + timestamp */}
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary/70">
          <span>{kindLabels[nugget.kind] || nugget.kind}</span>
          {currentTime && (
            <>
              <span className="text-foreground/30">•</span>
              <span className="tabular-nums text-foreground/40">{currentTime}</span>
            </>
          )}
        </div>

        {/* Listen-for badge */}
        {nugget.listenFor && (
          <div className="mb-1 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Listen for this
            </span>
          </div>
        )}

        {/* Nugget text */}
        <p className="text-sm font-semibold leading-snug text-foreground/90">
          {nugget.text}
        </p>

        {/* Source chip */}
        {source && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground/30">
            <span>
              {source.type === "youtube" ? "▶" : source.type === "article" ? "📄" : "🎙"}
            </span>
            <span className="truncate max-w-[180px]">{source.publisher}</span>
          </div>
        )}

        {/* Style A focus bloom glow */}
        {animationStyle === "A" && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              boxShadow: "inset 0 0 20px hsl(330 90% 60% / 0.06)",
            }}
          />
        )}

        {/* Style B top border sweep accent */}
        {animationStyle === "B" && (
          <motion.div
            className="absolute top-0 left-0 h-[2px] rounded-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: "100%", transition: { duration: 0.5, delay: 0.2, ease: "easeOut" } }}
            exit={{ width: "0%", transition: { duration: 0.15 } }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
