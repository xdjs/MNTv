import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";
import spotifyLogo from "@/assets/spotify-logo.png";
import { initiateSpotifyAuth } from "@/hooks/useSpotifyAuth";

type Tier = "casual" | "curious" | "nerd";

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
  </svg>
);

export default function Connect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Persist redirect URL in sessionStorage so it survives OAuth redirects
  const redirectParam = searchParams.get("redirect");
  if (redirectParam) sessionStorage.setItem("musicnerd_redirect", redirectParam);
  const redirectUrl = redirectParam || sessionStorage.getItem("musicnerd_redirect");
  const { saveProfile } = useUserProfile();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [pendingSpotifyArtists, setPendingSpotifyArtists] = useState<string[] | null>(null);
  const [pendingSpotifyTracks, setPendingSpotifyTracks] = useState<string[] | null>(null);
  const [pendingArtistImages, setPendingArtistImages] = useState<Record<string, string>>({});
  const [pendingArtistIds, setPendingArtistIds] = useState<Record<string, string>>({});
  const [pendingTrackImages, setPendingTrackImages] = useState<{ title: string; artist: string; imageUrl: string }[]>([]);
  const [pendingDisplayName, setPendingDisplayName] = useState<string | null>(null);

  // If already onboarded, redirect to browse
  useEffect(() => {
    if (getStoredProfile()) {
      navigate(redirectUrl || "/browse", { replace: true });
    }
  }, []);

  // Pick up Spotify data from sessionStorage (after Spotify OAuth redirect)
  useEffect(() => {
    const raw = sessionStorage.getItem("spotify_pending_taste");
    if (raw) {
      try {
        const { displayName, topArtists, topTracks, artistImages, artistIds, trackImages } = JSON.parse(raw);
        setPendingSpotifyArtists(topArtists);
        setPendingSpotifyTracks(topTracks);
        if (displayName) setPendingDisplayName(displayName);
        if (artistImages) setPendingArtistImages(artistImages);
        if (artistIds) setPendingArtistIds(artistIds);
        if (trackImages) setPendingTrackImages(trackImages);
        sessionStorage.removeItem("spotify_pending_taste");
        // Jump to tier picker
        setStep(1);
      } catch { /* ignore */ }
    }
  }, []);

  const goNext = (delta = 1) => { setDirection(delta); setStep((s) => s + delta); };

  const handleConnectSpotify = async () => {
    setSpotifyConnecting(true);
    try { await initiateSpotifyAuth(); }
    catch (e) { console.error("Spotify auth error:", e); setSpotifyConnecting(false); }
  };

  const handleTierSelect = (t: Tier) => {
    const profile: UserProfile = {
      streamingService: pendingSpotifyArtists?.length ? "Spotify" : "",
      spotifyDisplayName: pendingDisplayName || undefined,
      spotifyTopArtists: pendingSpotifyArtists || undefined,
      spotifyTopTracks: pendingSpotifyTracks || undefined,
      spotifyArtistImages: Object.keys(pendingArtistImages).length ? pendingArtistImages : undefined,
      spotifyArtistIds: Object.keys(pendingArtistIds).length ? pendingArtistIds : undefined,
      spotifyTrackImages: pendingTrackImages.length ? pendingTrackImages : undefined,
      calculatedTier: t,
    };
    saveProfile(profile);
    sessionStorage.removeItem("musicnerd_redirect");
    navigate(redirectUrl || "/browse");
  };

  const tiers = [
    { id: "casual" as Tier, label: "Casual Listener", desc: "Just here for the vibes", emoji: "🎵", color: "border-green-500/40 hover:border-green-500 hover:shadow-[0_0_25px_rgba(34,197,94,0.25)]", badge: "bg-green-500/20 text-green-400", hint: "Accessible language · feel-good discoveries · easy listening facts" },
    { id: "curious" as Tier, label: "Curious Fan", desc: "I like knowing the backstory", emoji: "🎼", color: "border-blue-500/40 hover:border-blue-500 hover:shadow-[0_0_25px_rgba(59,130,246,0.25)]", badge: "bg-blue-500/20 text-blue-400", hint: "Production details · cultural context · deeper backstories" },
    { id: "nerd" as Tier, label: "Hardcore Nerd", desc: "Give me every detail", emoji: "🎛️", color: "border-pink-500/40 hover:border-pink-500 hover:shadow-[0_0_25px_rgba(236,72,153,0.25)]", badge: "bg-pink-500/20 text-pink-400", hint: "Obscure influences · technical breakdowns · full music nerd mode" },
  ];

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden noise-overlay px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

        <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8">
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <MusicNerdLogo size={64} glow />
          </motion.div>

          {/* Step dots */}
          <div className="flex gap-2">
            {[0, 1].map((i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/50" : "w-3 bg-foreground/15"}`} />
            ))}
          </div>

          <div className="w-full overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>

              {/* ── Step 0: Connect Spotify ── */}
              {step === 0 && (
                <motion.div key="step-0" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-6">
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Connect your music</h1>
                    <p className="mt-2 text-muted-foreground">Link Spotify for personalized insights.</p>
                  </div>
                  <div className="flex flex-col gap-3 w-full">

                    {/* Spotify — connect or show connected */}
                    {!pendingSpotifyArtists ? (
                      <button onClick={handleConnectSpotify} disabled={spotifyConnecting} className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 disabled:opacity-70 border-green-500/40 hover:border-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                        <img src={spotifyLogo} alt="Spotify" className="w-8 h-8 object-contain" />
                        <span className="flex-1">Spotify</span>
                        {spotifyConnecting ? <Spinner className="h-4 w-4 text-green-400" /> : <span className="text-xs text-muted-foreground">Connect</span>}
                      </button>
                    ) : (
                      <div className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground border-green-500/60 ring-1 ring-green-500/30">
                        <img src={spotifyLogo} alt="Spotify" className="w-8 h-8 object-contain" />
                        <div className="flex-1 min-w-0">
                          <p>Spotify</p>
                          <p className="text-xs font-normal text-green-400 truncate">Connected · {pendingSpotifyArtists.slice(0, 3).join(", ")}{pendingSpotifyArtists.length > 3 ? "..." : ""}</p>
                        </div>
                        <span className="text-xs font-semibold text-green-400">✓</span>
                      </div>
                    )}

                    {/* Apple Music — coming soon */}
                    <div className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground/40 border-foreground/10 cursor-not-allowed">
                      <span className="text-2xl">🎵</span>
                      <span className="flex-1">Apple Music</span>
                      <span className="text-xs text-muted-foreground/60">Coming soon</span>
                    </div>

                    {/* Continue (only shown after Spotify connected) */}
                    {pendingSpotifyArtists && (
                      <button
                        onClick={() => goNext()}
                        className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        Continue
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── Step 1: Tier ── */}
              {step === 1 && (
                <motion.div key="step-1" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-6">
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Choose your vibe</h1>
                    <p className="mt-2 text-muted-foreground">This shapes how deep your music insights go.</p>
                  </div>
                  <div className="flex flex-col gap-3 w-full">
                    {tiers.map((t) => (
                      <button key={t.id} onClick={() => handleTierSelect(t.id)} className={`flex items-start gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left transition-all duration-200 ${t.color}`}>
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

          {step > 0 && (
            <button onClick={() => goNext(-1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Back
            </button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
