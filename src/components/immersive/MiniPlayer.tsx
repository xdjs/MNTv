import { useRef, useState, useCallback, useEffect } from "react";
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
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  // Ref for scrubbing state — avoids stale-state reads in onPointerMove
  // (setScrubbing is async, so the first few move events after pointerdown
  // would see false and bail if we used useState).
  const scrubbingRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const lastSeekRef = useRef(0);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Force re-render for scrub thumb size — only toggled on down/up, not every move.
  const [scrubActive, setScrubActive] = useState(false);
  const displayProgress = scrubProgress !== null ? scrubProgress : progress;

  const scrubToPosition = useCallback((clientX: number, commit: boolean) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setScrubProgress(pct);
    const now = Date.now();
    if (commit || now - lastSeekRef.current > 150) {
      lastSeekRef.current = now;
      onSeek((pct / 100) * duration);
    }
    if (commit) {
      // Hold the visual position briefly so the progress prop can catch up
      // from the Spotify SDK, preventing a visible snap-back.
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => setScrubProgress(null), 500);
    }
  }, [duration, onSeek]);

  useEffect(() => () => { if (commitTimerRef.current) clearTimeout(commitTimerRef.current); }, []);

  return (
    <div className="relative bg-white/5 backdrop-blur-xl border-t border-white/5">
      {/* Scrub line — thin bar at the very top edge of the mini player */}
      <div
        className="absolute top-0 inset-x-0 h-5 -translate-y-1/2 cursor-pointer touch-none z-10"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubbingRef.current = true;
          setScrubActive(true);
          scrubToPosition(e.clientX, false);
        }}
        onPointerMove={(e) => {
          if (!scrubbingRef.current) return;
          scrubToPosition(e.clientX, false);
        }}
        onPointerUp={(e) => {
          if (scrubbingRef.current) {
            scrubToPosition(e.clientX, true);
          }
          scrubbingRef.current = false;
          setScrubActive(false);
        }}
        onPointerCancel={() => { scrubbingRef.current = false; setScrubActive(false); setScrubProgress(null); }}
      >
        <div ref={barRef} className="absolute top-1/2 inset-x-0 h-[2px] bg-white/15">
          <div className="absolute inset-y-0 left-0 bg-white/50 rounded-full" style={{ width: `${displayProgress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white transition-all duration-100"
            style={{
              left: `${displayProgress}%`,
              width: scrubActive ? 10 : 6,
              height: scrubActive ? 10 : 6,
              opacity: scrubActive ? 1 : 0.7,
            }}
          />
        </div>
      </div>

      {/* Player content */}
      <div className="flex items-center gap-2 px-3 py-2">
        {artUrl && (
          <img src={artUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* ~25 chars fits the mini player at 375px width with controls.
              Approximation — a ref-based overflow check would be more robust. */}
          <div key={trackTitle} className="overflow-hidden">
            {trackTitle.length > 25 ? (
              <p className="text-sm font-medium text-white/90 whitespace-nowrap animate-marquee"
                style={{ animationDuration: `${Math.max(5, Math.round(trackTitle.length * 0.25))}s` }}>
                {/* Two identical copies separated by a fixed gap.
                    translateX(-50%) lands exactly at the start of copy 2. */}
                <span>{trackTitle}</span>
                <span className="inline-block" style={{ width: "3rem" }} />
                <span>{trackTitle}</span>
                <span className="inline-block" style={{ width: "3rem" }} />
              </p>
            ) : (
              <p className="text-sm font-medium text-white/90 whitespace-nowrap truncate">
                {trackTitle}
              </p>
            )}
          </div>
          <p className="text-xs text-white/40 truncate">{artist}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button aria-label="Previous track" disabled={!onPrev} className={`h-8 w-8 flex items-center justify-center transition-transform ${onPrev ? "active:scale-90" : "opacity-30 cursor-not-allowed"}`} onClick={onPrev}>
            <SkipBack className="w-3.5 h-3.5 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
          <button aria-label={isPlaying ? "Pause" : "Play"} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform" onClick={onToggle}>
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 text-white" fill="white" />
              : <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="white" />
            }
          </button>
          <button aria-label="Next track" disabled={!onNext} className={`h-8 w-8 flex items-center justify-center transition-transform ${onNext ? "active:scale-90" : "opacity-30 cursor-not-allowed"}`} onClick={onNext}>
            <SkipForward className="w-3.5 h-3.5 text-white/50" fill="white" fillOpacity={0.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
