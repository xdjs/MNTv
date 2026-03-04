import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";
import spotifyLogo from "@/assets/spotify-logo.png";
import youtubeMusicLogo from "@/assets/youtube-music-logo.png";

type Platform = "Spotify" | "YouTube Music" | "Apple Music";
type Tier = "casual" | "curious" | "nerd";

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { saveProfile } = useUserProfile();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [lastFm, setLastFm] = useState("");
  const [tier, setTier] = useState<Tier | null>(null);

  // Skip if profile already exists
  useEffect(() => {
    if (getStoredProfile()) navigate("/browse", { replace: true });
  }, []);

  const goNext = (delta = 1) => {
    setDirection(delta);
    setStep((s) => s + delta);
  };

  const handlePlatformSelect = (p: Platform) => {
    setPlatform(p);
    goNext();
  };

  const handleTierSelect = (t: Tier) => {
    setTier(t);
    const profile: UserProfile = {
      streamingService: platform as Platform,
      lastFmUsername: lastFm.trim() || undefined,
      calculatedTier: t,
    };
    saveProfile(profile);
    navigate("/connect");
  };

  const platforms: { name: Platform; logo?: string; color: string }[] = [
    { name: "Spotify", logo: spotifyLogo, color: "border-green-500/40 hover:border-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]" },
    { name: "YouTube Music", logo: youtubeMusicLogo, color: "border-red-500/40 hover:border-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]" },
    { name: "Apple Music", color: "border-rose-500/40 hover:border-rose-500 hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]" },
  ];

  const tiers = [
    {
      id: "casual" as Tier,
      label: "Casual Listener",
      desc: "Just here for the vibes",
      emoji: "🎵",
      color: "border-green-500/40 hover:border-green-500 hover:shadow-[0_0_25px_rgba(34,197,94,0.25)]",
      badge: "bg-green-500/20 text-green-400",
      hint: "3 nuggets per listen · accessible language · feel-good discoveries",
    },
    {
      id: "curious" as Tier,
      label: "Curious Fan",
      desc: "I like knowing the backstory",
      emoji: "🎼",
      color: "border-blue-500/40 hover:border-blue-500 hover:shadow-[0_0_25px_rgba(59,130,246,0.25)]",
      badge: "bg-blue-500/20 text-blue-400",
      hint: "6 nuggets per listen · production details · cultural context",
    },
    {
      id: "nerd" as Tier,
      label: "Hardcore Nerd",
      desc: "Give me every detail",
      emoji: "🎛️",
      color: "border-pink-500/40 hover:border-pink-500 hover:shadow-[0_0_25px_rgba(236,72,153,0.25)]",
      badge: "bg-pink-500/20 text-pink-400",
      hint: "9 nuggets per listen · obscure influences · technical breakdowns",
    },
  ];

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden noise-overlay px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

        <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8">
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <MusicNerdLogo size={72} glow />
          </motion.div>

          {/* Step indicator */}
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/50" : "w-3 bg-foreground/15"
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="w-full overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              {/* Step 0: Platform */}
              {step === 0 && (
                <motion.div
                  key="step-0"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-6"
                >
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Choose your platform</h1>
                    <p className="mt-2 text-muted-foreground">Where do you listen to music?</p>
                  </div>
                  <div className="flex flex-col gap-3 w-full">
                    {platforms.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => handlePlatformSelect(p.name)}
                        className={`flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 ${p.color}`}
                      >
                        {p.logo ? (
                          <img src={p.logo} alt={p.name} className="w-8 h-8 object-contain" />
                        ) : (
                          <span className="text-2xl">🎵</span>
                        )}
                        {p.name}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 1: Last.fm */}
              {step === 1 && (
                <motion.div
                  key="step-1"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-6"
                >
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Last.fm username</h1>
                    <p className="mt-2 text-muted-foreground">Get personalised listening stats in your insights.</p>
                  </div>
                  <input
                    type="text"
                    placeholder="Your Last.fm username"
                    value={lastFm}
                    onChange={(e) => setLastFm(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-4 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
                  />
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => goNext()}
                      className="flex-1 rounded-2xl bg-foreground/5 border border-foreground/15 px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => goNext()}
                      className="flex-1 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Tier */}
              {step === 2 && (
                <motion.div
                  key="step-2"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-6"
                >
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Choose your vibe</h1>
                    <p className="mt-2 text-muted-foreground">This shapes how deep your music insights go.</p>
                  </div>
                  <div className="flex flex-col gap-3 w-full">
                    {tiers.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleTierSelect(t.id)}
                        className={`flex items-start gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left transition-all duration-200 ${t.color}`}
                      >
                        <span className="text-2xl mt-0.5">{t.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-foreground">{t.label}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.badge}`}>{t.id}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{t.desc}</p>
                          <p className="text-[11px] text-foreground/40 mt-1">{t.hint}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Back button on steps 1+ */}
          {step > 0 && (
            <button
              onClick={() => goNext(-1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
