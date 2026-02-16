import { motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { getSourceById } from "@/mock/tracks";
import type { Nugget, AnimationStyle } from "@/mock/types";

interface Props {
  nugget: Nugget;
  animationStyle: AnimationStyle;
  onSourceClick: () => void;
}

// Style A: Glass Slide + Focus Bloom
const styleA = {
  initial: { opacity: 0, y: 12, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, scale: 0.96 },
  transition: { duration: 0.35 },
};

// Style B: Border Sweep + Text Mask Reveal
const styleB = {
  initial: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  animate: { opacity: 1, clipPath: "inset(0 0% 0 0)" },
  exit: { opacity: 0, clipPath: "inset(0 0 0 100%)" },
  transition: { duration: 0.4 },
};

// Style C: Anchor Dot Expand (logo is the anchor)
const styleC = {
  initial: { opacity: 0, scale: 0.3, originX: 0, originY: 1 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.3 },
  transition: { duration: 0.35 },
};

const styleMap = { A: styleA, B: styleB, C: styleC };

export default function NuggetCard({ nugget, animationStyle, onSourceClick }: Props) {
  const source = getSourceById(nugget.sourceId);
  const variants = styleMap[animationStyle];

  return (
    <div className="relative">
      {/* Style C anchor: logo dot */}
      {animationStyle === "C" && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute -bottom-2 -left-2 z-10"
        >
          <MusicNerdLogo size={28} glow />
        </motion.div>
      )}

      <motion.div
        {...variants}
        className="glass-panel relative rounded-2xl p-5 max-w-md"
      >
        {/* Style A bloom effect */}
        {animationStyle === "A" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="absolute inset-0 rounded-2xl bg-primary blur-xl -z-10"
          />
        )}

        {/* Style B border sweep */}
        {animationStyle === "B" && (
          <motion.div
            initial={{ backgroundSize: "0% 2px, 2px 0%, 0% 2px, 2px 0%" }}
            animate={{
              backgroundSize: "100% 2px, 2px 100%, 100% 2px, 2px 100%",
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              backgroundImage: `linear-gradient(hsl(330 90% 60%), hsl(330 90% 60%)), linear-gradient(hsl(330 90% 60%), hsl(330 90% 60%)), linear-gradient(hsl(330 90% 60%), hsl(330 90% 60%)), linear-gradient(hsl(330 90% 60%), hsl(330 90% 60%))`,
              backgroundPosition: "0 0, 100% 0, 100% 100%, 0 100%",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}

        {/* Listen-for badge */}
        {nugget.listenFor && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-wider text-primary">Listen for this</span>
          </div>
        )}

        <p className="text-base leading-relaxed text-foreground md:text-lg">{nugget.text}</p>

        {source && (
          <button
            onClick={onSourceClick}
            className="mt-3 flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground tv-focus-visible"
          >
            <span className="uppercase tracking-wider font-medium">
              {source.type === "youtube" ? "▶ Watch" : source.type === "article" ? "📄 Read" : "🎙 Interview"}
            </span>
            <span className="truncate max-w-[200px]">{source.publisher}</span>
          </button>
        )}

        {/* Subtle logo watermark for styles A & B */}
        {animationStyle !== "C" && (
          <div className="absolute -right-1 -top-1 opacity-20">
            <MusicNerdLogo size={20} />
          </div>
        )}
      </motion.div>
    </div>
  );
}
