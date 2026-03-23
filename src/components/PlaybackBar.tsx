import { Play, Pause, SkipBack, SkipForward, ThumbsUp, ThumbsDown, Shuffle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";

interface NuggetMarkerInfo {
  id: string;
  pct: number;
}

interface DismissedMarker {
  id: string;
  pct: number;
}

interface Props {
  isPlaying: boolean;
  fadingIn: boolean;
  progress: number;
  currentTimeFormatted: string;
  durationFormatted: string;
  visible: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  liked?: boolean | null;
  shuffle?: boolean;
  nuggetMarkers?: NuggetMarkerInfo[];
  focusedIndex?: number | null;
  onToggle: () => void;
  onSeek: (pct: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onLike?: () => void;
  onDislike?: () => void;
  onShuffle?: () => void;
  // Mini-logo props
  dismissedMarkers?: DismissedMarker[];
  onMiniLogoClick?: (id: string) => void;
  // Marker state
  activeNuggetId?: string | null;
  dismissedNuggetIds?: Set<string>;
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
  liked = null,
  shuffle = false,
  nuggetMarkers = [],
  focusedIndex = null,
  onToggle,
  onSeek,
  onPrev,
  onNext,
  onLike,
  onDislike,
  onShuffle,
  dismissedMarkers = [],
  onMiniLogoClick,
  activeNuggetId = null,
  dismissedNuggetIds = new Set(),
}: Props) {
  const isFocused = (idx: number) => focusedIndex === idx;
  const focusGlow = "tv-focus-glow";

  const getMarkerStyle = (marker: NuggetMarkerInfo) => {
    if (marker.id === activeNuggetId) {
      return "h-3 w-3 bg-primary animate-pulse";
    }
    if (dismissedNuggetIds.has(marker.id)) {
      return "h-2.5 w-2.5 bg-primary/50";
    }
    return "h-2 w-2 bg-foreground/20";
  };

  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 80, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 md:px-10 md:pb-8"
    >
      {/* Gradient scrim behind bar */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />

      <div className={`relative flex flex-col gap-3 transition-opacity duration-1000 ${fadingIn ? "opacity-60" : "opacity-100"}`}>

        {/* ── Mini-logo layer for dismissed nuggets ── */}
        {dismissedMarkers.length > 0 && (
          <div className="relative h-8 flex items-center" style={{ marginLeft: "calc(3.5rem + 1rem)", marginRight: "calc(3.5rem + 1rem)" }}>
            <AnimatePresence>
              {dismissedMarkers.map((marker) => (
                <motion.button
                  key={marker.id}
                  initial={{ scale: 0 }}
                  animate={{
                    scale: 1,
                    opacity: [0.5, 0.8, 0.5],
                    transition: {
                      scale: { type: "spring", stiffness: 400, damping: 20 },
                      opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" },
                    },
                  }}
                  exit={{ scale: 0, opacity: 0, transition: { duration: 0.2 } }}
                  whileHover={{ scale: 1.2, opacity: 1 }}
                  className="absolute -translate-x-1/2 cursor-pointer z-10"
                  style={{ left: `${marker.pct}%` }}
                  onClick={() => onMiniLogoClick?.(marker.id)}
                  aria-label="Re-open nugget"
                >
                  <MusicNerdLogo size={20} />
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Progress bar row with timestamps ── */}
        <div className="flex items-center gap-4">
          <span className="w-14 text-right text-sm text-foreground/70 tabular-nums">{currentTimeFormatted}</span>
          <div
            className="relative flex-1 h-1.5 rounded-full bg-primary/20 cursor-pointer group touch-none"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              onSeek(pct);
            }}
            onTouchStart={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
              onSeek(pct);
            }}
            onTouchMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
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
            {nuggetMarkers.map((marker) => (
              <div
                key={marker.id}
                className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all ${getMarkerStyle(marker)}`}
                style={{ left: `${marker.pct}%`, transform: `translateX(-50%) translateY(-50%)` }}
              />
            ))}
          </div>
          <span className="w-14 text-sm text-foreground/70 tabular-nums">{durationFormatted}</span>
        </div>

        {/* Transport controls row */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-3 md:gap-6">
            {/* Invisible spacer to balance Shuffle on the right — keeps Play centered with cover art */}
            <div className="h-9 w-9" aria-hidden="true" />
            {/* Dislike - index 0 */}
            <button
              onClick={onDislike}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                liked === false
                  ? "text-primary bg-primary/20"
                  : "text-foreground/40 hover:text-foreground/70"
              } ${isFocused(0) ? focusGlow + " scale-110" : ""}`}
              aria-label="Dislike"
            >
              <ThumbsDown size={16} />
            </button>

            {/* Prev - index 1 */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-foreground/70 transition-all hover:text-foreground disabled:opacity-30 disabled:cursor-default ${
                isFocused(1) ? focusGlow + " scale-110" : ""
              }`}
              aria-label="Previous track"
            >
              <SkipBack size={20} />
            </button>

            {/* Play/Pause - index 2 */}
            <button
              onClick={onToggle}
              className={`flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-primary backdrop-blur-sm transition-all hover:bg-primary/30 ${
                isFocused(2) ? focusGlow + " scale-110" : ""
              }`}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
            </button>

            {/* Next - index 3 */}
            <button
              onClick={onNext}
              disabled={!hasNext}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-foreground/70 transition-all hover:text-foreground disabled:opacity-30 disabled:cursor-default ${
                isFocused(3) ? focusGlow + " scale-110" : ""
              }`}
              aria-label="Next track"
            >
              <SkipForward size={20} />
            </button>

            {/* Like - index 4 */}
            <button
              onClick={onLike}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                liked === true
                  ? "text-primary bg-primary/20"
                  : "text-foreground/40 hover:text-foreground/70"
              } ${isFocused(4) ? focusGlow + " scale-110" : ""}`}
              aria-label="Like"
            >
              <ThumbsUp size={16} />
            </button>

            {/* Shuffle - index 5 */}
            <button
              onClick={onShuffle}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                shuffle
                  ? "text-primary bg-primary/20"
                  : "text-foreground/40 hover:text-foreground/70"
              } ${isFocused(5) ? focusGlow + " scale-110" : ""}`}
              aria-label="Shuffle"
            >
              <Shuffle size={16} />
            </button>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
