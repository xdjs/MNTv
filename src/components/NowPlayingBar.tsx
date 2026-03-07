import { useNavigate, useLocation } from "react-router-dom";
import { Play, Pause, SkipBack, SkipForward, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/contexts/PlayerContext";

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function NowPlayingBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPlaying, currentTrack, currentTime, duration, toggle, seek, popTrackHistory, externalPlayback, setExternalListenMode } = usePlayer();

  // Don't show on Listen page (has its own bar) or companion pages (phone QR experience)
  const hiddenRoute = location.pathname.startsWith("/listen/")
    || location.pathname.startsWith("/companion/")
    || location.pathname.startsWith("/c/");

  // Show if there's a loaded track OR external playback detected
  const showExternal = !hiddenRoute && !currentTrack && !!externalPlayback;
  const showLocal = !hiddenRoute && !!currentTrack;
  const visible = showLocal || showExternal;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const externalProgress = externalPlayback && externalPlayback.durationMs > 0
    ? (externalPlayback.progressMs / externalPlayback.durationMs) * 100
    : 0;

  const handleExternalClick = () => {
    if (!externalPlayback) return;
    setExternalListenMode(true);
    const id = `real::${encodeURIComponent(externalPlayback.artist)}::${encodeURIComponent(externalPlayback.title)}::${encodeURIComponent(externalPlayback.album)}`;
    navigate(`/listen/${id}`);
  };

  const handlePrev = () => {
    const prev = popTrackHistory();
    if (prev) navigate(prev);
    else seek(0);
  };

  const handleNext = () => {
    if (currentTrack) navigate(`/listen/${currentTrack.trackId}`);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(pct * duration);
  };

  const handleTouchSeek = (e: React.TouchEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    seek(pct * duration);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-0 left-0 right-0 z-40"
        >
          {showExternal && externalPlayback ? (
            <div className="bg-background/95 backdrop-blur-xl border-t border-foreground/5">
              {/* Progress line for external */}
              <div className="h-0.5 bg-foreground/10">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${externalProgress}%` }}
                />
              </div>
              <div className="flex items-center gap-3 px-4 py-2 md:px-10">
                <button
                  onClick={handleExternalClick}
                  className="flex flex-1 items-center gap-3 min-w-0 text-left"
                >
                  {externalPlayback.albumArtUrl ? (
                    <img
                      src={externalPlayback.albumArtUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-foreground/10 shrink-0 flex items-center justify-center">
                      <Smartphone size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{externalPlayback.title}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Smartphone size={10} className="shrink-0" />
                      Playing on {externalPlayback.deviceName}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : currentTrack ? (
            <div className="bg-background/95 backdrop-blur-xl border-t border-foreground/5">
              {/* Row 1: Track info + transport controls */}
              <div className="flex items-center gap-3 px-4 pt-2 md:px-10">
                {/* Album art + track info — click to go to Listen */}
                <button
                  onClick={() => navigate(`/listen/${currentTrack.trackId}`)}
                  className="flex flex-1 items-center gap-3 min-w-0 text-left"
                >
                  <img
                    src={currentTrack.coverArtUrl}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{currentTrack.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
                  </div>
                </button>

                {/* Transport controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handlePrev}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:text-foreground hover:bg-foreground/10"
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(); }}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary transition-all hover:bg-primary/30"
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:text-foreground hover:bg-foreground/10"
                  >
                    <SkipForward size={16} />
                  </button>
                </div>
              </div>

              {/* Row 2: Seekable progress bar + timestamps */}
              <div className="flex items-center gap-2 px-4 pb-2 pt-1 md:px-10">
                <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right shrink-0">
                  {fmt(currentTime)}
                </span>
                <div
                  className="relative flex-1 h-4 flex items-center cursor-pointer group"
                  onClick={handleSeek}
                  onTouchStart={handleTouchSeek}
                  onTouchMove={handleTouchSeek}
                >
                  <div className="w-full h-1 rounded-full bg-foreground/10 group-hover:h-1.5 transition-all">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {/* Seek dot — visible on hover */}
                  <div
                    className="absolute h-3 w-3 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-sm pointer-events-none"
                    style={{ left: `calc(${progress}% - 6px)` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground w-8 shrink-0">
                  {fmt(duration)}
                </span>
              </div>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
