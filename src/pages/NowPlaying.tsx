import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { tracks } from "@/mock/tracks";
import type { Track } from "@/mock/types";

export default function NowPlaying() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Track>(tracks[0]);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden noise-overlay px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

        <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-2xl">
          <MusicNerdLogo size={40} glow />
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Now Playing</p>

          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="relative overflow-hidden rounded-2xl shadow-2xl">
              <img
                src={current.coverArtUrl}
                alt={current.title}
                className="h-64 w-64 object-cover md:h-80 md:w-80"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
              />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-foreground md:text-4xl">{current.title}</h1>
              <p className="mt-1 text-lg text-muted-foreground">{current.artist}</p>
              {current.album && <p className="text-sm text-muted-foreground/60">{current.album}</p>}
            </div>
          </motion.div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => navigate(`/listen/${current.id}`)}
              className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground neon-button tv-focus-visible transition-transform hover:scale-105"
            >
              Start MusicNerd Layer
            </button>
            <button
              onClick={() => setPickerOpen(!pickerOpen)}
              className="glass-panel rounded-xl px-8 py-4 text-lg font-semibold text-foreground tv-focus-visible transition-transform hover:scale-105"
            >
              Switch Track
            </button>
          </div>

          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 20, height: 0 }}
                className="glass-panel w-full max-h-80 overflow-y-auto rounded-2xl"
              >
                {tracks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setCurrent(t); setPickerOpen(false); }}
                    className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-muted/40 tv-focus-visible ${
                      t.id === current.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <img
                      src={t.coverArtUrl}
                      alt={t.title}
                      className="h-12 w-12 rounded-lg object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                    />
                    <div>
                      <p className="font-semibold text-foreground">{t.title}</p>
                      <p className="text-sm text-muted-foreground">{t.artist}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PageTransition>
  );
}
