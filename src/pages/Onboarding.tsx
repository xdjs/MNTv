import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { getStoredProfile } from "@/hooks/useMusicNerdState";
import { useEffect } from "react";

export default function Onboarding() {
  const navigate = useNavigate();

  useEffect(() => {
    if (getStoredProfile()) navigate("/browse", { replace: true });
  }, []);

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden noise-overlay">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

        <div className="relative z-10 flex flex-col items-center gap-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          >
            <MusicNerdLogo size={80} glow />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-7xl">
              MusicNerd <span className="text-primary">TV</span>
            </h1>
            <p className="max-w-md text-center text-lg text-muted-foreground md:text-xl">
              Transform passive listening into engaged discovery.
            </p>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            onClick={() => navigate("/connect")}
            className="mt-4 rounded-xl bg-primary px-10 py-4 text-lg font-semibold text-primary-foreground neon-button tv-focus-visible transition-transform hover:scale-105"
          >
            Get Started
          </motion.button>
        </div>
      </div>
    </PageTransition>
  );
}
