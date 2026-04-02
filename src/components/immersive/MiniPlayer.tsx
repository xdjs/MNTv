import { Play, Pause } from "lucide-react";

interface MiniPlayerProps {
  artUrl: string;
  trackTitle: string;
  artist: string;
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
}

export default function MiniPlayer({
  artUrl,
  trackTitle,
  artist,
  isPlaying,
  progress,
  onToggle,
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
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 backdrop-blur-xl border-t border-white/10">
        {/* Cover art */}
        {artUrl && (
          <img
            src={artUrl}
            alt=""
            className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
          />
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 truncate">{trackTitle}</p>
          <p className="text-xs text-white/40 truncate">{artist}</p>
        </div>

        {/* Play/Pause */}
        <button
          className="h-10 w-10 flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          onClick={onToggle}
        >
          {isPlaying
            ? <Pause className="w-4 h-4 text-white" fill="white" />
            : <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
          }
        </button>
      </div>
    </div>
  );
}
