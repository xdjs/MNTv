import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { useState } from "react";
import spotifyLogo from "@/assets/spotify-logo.png";
import youtubeMusicLogo from "@/assets/youtube-music-logo.png";

const services = [
  { id: "spotify", logo: spotifyLogo, label: "Spotify" },
  { id: "youtube", logo: youtubeMusicLogo, label: "YouTube Music" },
];

export default function Connect() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);

  const toggleService = (s: string) =>
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden noise-overlay px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

        <div className="relative z-10 flex flex-col items-center gap-10">
          <MusicNerdLogo size={48} glow />
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground md:text-5xl">Connect Your Music</h1>
            <p className="mt-2 text-muted-foreground md:text-lg">Link your services to unlock the MusicNerd layer.</p>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row">
            {services.map(({ id, logo, label }) => (
              <motion.button
                key={id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleService(id)}
                className={`apple-glass flex w-64 flex-col items-center gap-5 rounded-2xl p-8 transition-all tv-focus-visible ${
                  selected.includes(id)
                    ? "ring-2 ring-primary"
                    : "ring-1 ring-transparent hover:ring-muted-foreground/30"
                }`}
                style={{
                  boxShadow: selected.includes(id)
                    ? "0 0 20px 6px hsl(330 90% 60% / 0.3), 0 0 50px 12px hsl(330 90% 60% / 0.1)"
                    : undefined,
                }}
              >
                <img src={logo} alt={label} className="h-16 w-16 rounded-xl object-contain" />
                <span className="text-lg font-semibold text-foreground">{label}</span>
                <span className="text-sm text-muted-foreground">
                  {selected.includes(id) ? "Connected ✓" : "Tap to connect"}
                </span>
              </motion.button>
            ))}
          </div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => navigate("/browse")}
            className="rounded-xl bg-primary px-10 py-4 text-lg font-semibold text-primary-foreground neon-button tv-focus-visible transition-transform hover:scale-105"
          >
            Continue
          </motion.button>
        </div>
      </div>
    </PageTransition>
  );
}
