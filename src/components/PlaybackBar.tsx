import { Play, Pause } from "lucide-react";

interface Props {
  isPlaying: boolean;
  fadingIn: boolean;
  progress: number;
  currentTimeFormatted: string;
  durationFormatted: string;
  onToggle: () => void;
  onSeek: (pct: number) => void;
}

export default function PlaybackBar({
  isPlaying,
  fadingIn,
  progress,
  currentTimeFormatted,
  durationFormatted,
  onToggle,
  onSeek,
}: Props) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 px-10 pb-8">
      <div className={`flex items-center gap-4 transition-opacity duration-1000 ${fadingIn ? "opacity-60" : "opacity-100"}`}>
        <button
          onClick={onToggle}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary backdrop-blur-sm transition-colors hover:bg-primary/30 tv-focus-visible"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
        <span className="w-14 text-right text-sm text-foreground/70 tabular-nums">{currentTimeFormatted}</span>
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
    </div>
  );
}
