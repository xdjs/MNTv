import { motion } from "framer-motion";
import type { AnimationStyle } from "@/mock/types";

interface Props {
  animStyle: AnimationStyle;
  setAnimStyle: (s: AnimationStyle) => void;
  onJumpToNugget: (idx: number) => void;
  nuggetCount: number;
  backdropMotion: boolean;
  setBackdropMotion: (v: boolean) => void;
  listenCount?: number;
  trackKey?: string;
  onResetHistory?: () => void;
  onResetAllHistory?: () => void;
  onIncrementListen?: () => void;
}

export default function DevPanel({ animStyle, setAnimStyle, onJumpToNugget, nuggetCount, backdropMotion, setBackdropMotion, listenCount, trackKey, onResetHistory, onResetAllHistory, onIncrementListen }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass-panel fixed bottom-14 right-4 z-50 rounded-xl p-4 w-56"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dev Panel</p>

      {/* Listen Depth */}
      {listenCount != null && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1.5">Listen Depth</p>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              Listen #{listenCount}
            </span>
            {trackKey && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={trackKey}>
                {trackKey}
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {onIncrementListen && (
              <button
                onClick={onIncrementListen}
                className="rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/10 transition-colors"
              >
                +1
              </button>
            )}
            {onResetHistory && (
              <button
                onClick={onResetHistory}
                className="rounded-lg bg-foreground/5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/10 transition-colors"
              >
                Reset
              </button>
            )}
            {onResetAllHistory && (
              <button
                onClick={onResetAllHistory}
                className="rounded-lg bg-destructive/15 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/25 transition-colors"
              >
                Reset All
              </button>
            )}
          </div>
        </div>
      )}

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
        <div className="flex gap-1.5 flex-wrap">
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="rounded accent-primary"
            checked={backdropMotion}
            onChange={(e) => setBackdropMotion(e.target.checked)}
          />
          Backdrop motion (YouTube)
        </label>
      </div>
    </motion.div>
  );
}
