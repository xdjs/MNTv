import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface MiniPlayerProps {
  artUrl: string;
  trackTitle: string;
  artist: string;
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function MiniPlayer({
  artUrl,
  trackTitle,
  artist,
  isPlaying,
  progress,
  onToggle,
  onPrev,
  onNext,
}: MiniPlayerProps) {
  return (
    <div className="relative">
      {/* Progress bar — thin line at top */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-white/10">
        <div
          className="h-full bg-white/50 rounded-full"
          style={{ width: `${progress}%`, transition: "width 0.3s linear" }}
        />
      </div>

      {/* Player content */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 backdrop-blur-xl border-t border-white/10">
        {/* Cover art */}
        {artUrl && (
          <img
            src={artUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
          />
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 truncate">{trackTitle}</p>
          <p className="text-xs text-white/40 truncate">{artist}</p>
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="h-8 w-8 flex items-center justify-center active:scale-90 transition-transform"
            onClick={onPrev}
          >
            <SkipBack className="w-3.5 h-3.5 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
          <button
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            onClick={onToggle}
          >
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 text-white" fill="white" />
              : <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="white" />
            }
          </button>
          <button
            className="h-8 w-8 flex items-center justify-center active:scale-90 transition-transform"
            onClick={onNext}
          >
            <SkipForward className="w-3.5 h-3.5 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
