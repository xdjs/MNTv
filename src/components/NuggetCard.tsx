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

// Kind labels
const kindLabels: Record<string, string> = {
  process: "Behind the Scenes",
  constraint: "Creative Constraint",
  pattern: "Pattern",
  human: "Human Story",
  influence: "Influence",
};

// Pre-defined "random" positions to scatter nuggets VH1-style
// Each is { top%, left% } — avoiding edges and bottom playback area
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

// Pop-up animation — scale from 0 like VH1 bubbles
const popVariants = {
  initial: { opacity: 0, scale: 0, y: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.5,
    y: -10,
    transition: { duration: 0.25, ease: "easeIn" as const },
  },
};

const logoVariants = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as const } },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.15 } },
};

export default function NuggetCard({ nugget, animationStyle, onSourceClick, currentTime, sourceOverride }: Props) {
  const source = sourceOverride !== undefined ? sourceOverride : getSourceById(nugget.sourceId);

  // Pick a pseudo-random position based on nugget id hash
  const pos = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < nugget.id.length; i++) {
      hash = ((hash << 5) - hash + nugget.id.charCodeAt(i)) | 0;
    }
    return positions[Math.abs(hash) % positions.length];
  }, [nugget.id]);

  return (
    <motion.div
      className="absolute z-20"
      style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Logo pip — top-left of bubble */}
      <motion.div variants={logoVariants} className="absolute -top-2.5 -left-2.5 z-10">
        <MusicNerdLogo size={20} glow />
      </motion.div>

      {/* VH1-style bubble: compact rectangle */}
      <motion.div
        variants={popVariants}
        className="relative max-w-[320px] rounded-xl px-4 py-3 cursor-pointer"
        style={{
          background: "hsl(60 80% 62% / 0.92)",
          color: "hsl(0 0% 8%)",
          boxShadow: "0 4px 20px hsl(0 0% 0% / 0.5), 0 1px 3px hsl(0 0% 0% / 0.3)",
          transformOrigin: "bottom center",
        }}
        onClick={onSourceClick}
      >
        {/* Small pointer triangle at bottom */}
        <div
          className="absolute -bottom-2 left-6 h-0 w-0"
          style={{
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid hsl(60 80% 62% / 0.92)",
          }}
        />

        {/* Kind label + timestamp */}
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
          <span>{kindLabels[nugget.kind] || nugget.kind}</span>
          {currentTime && (
            <>
              <span>•</span>
              <span className="tabular-nums">{currentTime}</span>
            </>
          )}
        </div>

        {/* Listen-for badge */}
        {nugget.listenFor && (
          <div className="mb-1 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "hsl(330 90% 45%)" }}>
              Listen for this
            </span>
          </div>
        )}

        {/* Nugget text — compact */}
        <p className="text-sm font-semibold leading-snug">
          {nugget.text}
        </p>

        {/* Source chip */}
        {source && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-50">
            <span>
              {source.type === "youtube" ? "▶" : source.type === "article" ? "📄" : "🎙"}
            </span>
            <span className="truncate max-w-[180px]">{source.publisher}</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
