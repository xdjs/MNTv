import { useNavigate, useLocation } from "react-router-dom";
import { Play, Pause, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/contexts/PlayerContext";

export default function NowPlayingBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPlaying, currentTrack, currentTime, duration, toggle, externalPlayback, setExternalListenMode } = usePlayer();

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
          {/* Progress line */}
          <div className="h-0.5 bg-foreground/10">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${showExternal ? externalProgress : progress}%` }}
            />
          </div>

          <div className="flex items-center gap-3 bg-background/95 backdrop-blur-xl border-t border-foreground/5 px-4 py-2 md:px-10">
            {showExternal && externalPlayback ? (
              <>
                {/* External playback info — click to go to Listen in external mode */}
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
              </>
            ) : currentTrack ? (
              <>
                {/* Local track info — click to go to Listen */}
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

                {/* Play/Pause */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(); }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary transition-all hover:bg-primary/30"
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
              </>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
