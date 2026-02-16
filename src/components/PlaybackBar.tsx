import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  isPlaying: boolean;
  fadingIn: boolean;
  progress: number;
  currentTimeFormatted: string;
  durationFormatted: string;
  visible: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onSeek: (pct: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function PlaybackBar({
  isPlaying,
  fadingIn,
  progress,
  currentTimeFormatted,
  durationFormatted,
  visible,
  hasPrev,
  hasNext,
  onToggle,
  onSeek,
  onPrev,
  onNext,
}: Props) {
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 80, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="absolute bottom-0 left-0 right-0 z-20 px-10 pb-8"
    >
      {/* Gradient scrim behind bar */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />

      <div className={`relative flex items-center gap-4 transition-opacity duration-1000 ${fadingIn ? "opacity-60" : "opacity-100"}`}>
        {/* Skip back */}
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-default tv-focus-visible"
          aria-label="Previous track"
        >
          <SkipBack size={18} />
        </button>

        {/* Play / Pause */}
        <button
          onClick={onToggle}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary backdrop-blur-sm transition-colors hover:bg-primary/30 tv-focus-visible"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>

        {/* Skip forward */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-default tv-focus-visible"
          aria-label="Next track"
        >
          <SkipForward size={18} />
        </button>

        <span className="w-14 text-right text-sm text-foreground/70 tabular-nums">{currentTimeFormatted}</span>

        {/* Progress bar */}
        <div
          className="relative flex-1 h-1.5 rounded-full bg-primary/20 cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            onSeek(pct);
          }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%`, transform: `translateX(-50%) translateY(-50%)` }}
          />
        </div>

        <span className="w-14 text-sm text-foreground/70 tabular-nums">{durationFormatted}</span>
      </div>
    </motion.div>
  );
}
