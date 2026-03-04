import { useNavigate, useLocation } from "react-router-dom";
import { Play, Pause } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/contexts/PlayerContext";

export default function NowPlayingBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPlaying, currentTrack, currentTime, duration, toggle, activePlayer } = usePlayer();

  // Don't show on the Listen page (it has its own full playback bar)
  const isListenPage = location.pathname.startsWith("/listen/");

  // Show if there's a loaded track (even if paused/stopped — user can resume)
  const visible = !isListenPage && !!currentTrack;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <AnimatePresence>
      {visible && currentTrack && (
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
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-3 bg-background/95 backdrop-blur-xl border-t border-foreground/5 px-4 py-2 md:px-10">
            {/* Track info — click to go to Listen */}
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
