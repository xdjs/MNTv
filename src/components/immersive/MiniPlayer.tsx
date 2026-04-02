import { useRef, useCallback, useState } from "react";
import { Play, Pause, ChevronDown } from "lucide-react";

interface MiniPlayerProps {
  artUrl: string;
  trackTitle: string;
  artist: string;
  isPlaying: boolean;
  progress: number; // 0-100
  onToggle: () => void;
  onCollapse: () => void;
}

export default function MiniPlayer({
  artUrl,
  trackTitle,
  artist,
  isPlaying,
  progress,
  onToggle,
  onCollapse,
}: MiniPlayerProps) {
  // Swipe down to collapse
  const startYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) setDragY(dy); // only track downward drag
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 60) onCollapse();
    setDragY(0);
  }, [dragY, onCollapse]);

  return (
    <div
      className="relative"
      style={{
        transform: dragY > 0 ? `translateY(${dragY * 0.5}px)` : undefined,
        transition: dragY > 0 ? "none" : "transform 0.2s ease-out",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar — thin line at top of mini player */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-white/10">
        <div
          className="h-full bg-white/50 rounded-full"
          style={{ width: `${progress}%`, transition: "width 0.3s linear" }}
        />
      </div>

      {/* Mini player content */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 backdrop-blur-xl border-t border-white/10">
        {/* Collapse handle */}
        <button
          className="flex-shrink-0 active:scale-90 transition-transform"
          onClick={onCollapse}
        >
          <ChevronDown className="w-5 h-5 text-white/40" />
        </button>

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
