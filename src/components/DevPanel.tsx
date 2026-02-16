import { motion } from "framer-motion";
import type { AnimationStyle } from "@/mock/types";

interface Props {
  animStyle: AnimationStyle;
  setAnimStyle: (s: AnimationStyle) => void;
  onJumpToNugget: (idx: number) => void;
  nuggetCount: number;
}

export default function DevPanel({ animStyle, setAnimStyle, onJumpToNugget, nuggetCount }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass-panel fixed bottom-14 right-4 z-50 rounded-xl p-4 w-56"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dev Panel</p>

      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-1.5">Animation Style</p>
        <div className="flex gap-1.5">
          {(["A", "B", "C"] as AnimationStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => setAnimStyle(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                animStyle === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-1.5">Jump to Nugget</p>
        <div className="flex gap-1.5">
          {Array.from({ length: nuggetCount }, (_, i) => (
            <button
              key={i}
              onClick={() => onJumpToNugget(i)}
              className="rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/10 transition-colors"
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="rounded" disabled />
          Backdrop motion (placeholder)
        </label>
      </div>
    </motion.div>
  );
}
