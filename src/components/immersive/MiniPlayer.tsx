import { useRef, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface MiniPlayerProps {
  artUrl: string;
  trackTitle: string;
  artist: string;
  isPlaying: boolean;
  progress: number;
  duration: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function MiniPlayer({
  artUrl,
  trackTitle,
  artist,
  isPlaying,
  progress,
  duration,
  onToggle,
  onSeek,
  onPrev,
  onNext,
}: MiniPlayerProps) {
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const lastSeekRef = useRef(0);
  const displayProgress = scrubProgress !== null ? scrubProgress : progress;

  const scrubToPosition = useCallback((clientX: number, bar: HTMLElement, commit: boolean) => {
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setScrubProgress(pct);
    const now = Date.now();
    if (commit || now - lastSeekRef.current > 150) {
      lastSeekRef.current = now;
      onSeek((pct / 100) * duration);
    }
    if (commit) setScrubProgress(null);
  }, [duration, onSeek]);

  return (
    <div className="relative">
      {/* Scrub bar with draggable thumb */}
      <div
        className="relative h-6 flex items-center cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrubbing(true);
          const bar = e.currentTarget.querySelector("[data-bar]") as HTMLElement;
          if (bar) scrubToPosition(e.clientX, bar, false);
        }}
        onPointerMove={(e) => {
          if (!scrubbing) return;
          const bar = e.currentTarget.querySelector("[data-bar]") as HTMLElement;
          if (bar) scrubToPosition(e.clientX, bar, false);
        }}
        onPointerUp={(e) => {
          if (scrubbing) {
            const bar = e.currentTarget.querySelector("[data-bar]") as HTMLElement;
            if (bar) scrubToPosition(e.clientX, bar, true);
          }
          setScrubbing(false);
        }}
        onPointerCancel={() => { setScrubbing(false); setScrubProgress(null); }}
      >
        <div data-bar className="w-full h-[3px] bg-white/15 rounded-full relative">
          <div className="absolute inset-y-0 left-0 bg-white/50 rounded-full" style={{ width: `${displayProgress}%` }} />
          {/* Draggable thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white transition-all duration-100"
            style={{
              left: `${displayProgress}%`,
              width: scrubbing ? 12 : 8,
              height: scrubbing ? 12 : 8,
            }}
          />
        </div>
      </div>

      {/* Player content */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 backdrop-blur-xl border-t border-white/5">
        {artUrl && (
          <img src={artUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 truncate">{trackTitle}</p>
          <p className="text-xs text-white/40 truncate">{artist}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button className="h-8 w-8 flex items-center justify-center active:scale-90 transition-transform" onClick={onPrev}>
            <SkipBack className="w-3.5 h-3.5 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
          <button className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform" onClick={onToggle}>
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 text-white" fill="white" />
              : <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="white" />
            }
          </button>
          <button className="h-8 w-8 flex items-center justify-center active:scale-90 transition-transform" onClick={onNext}>
            <SkipForward className="w-3.5 h-3.5 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
