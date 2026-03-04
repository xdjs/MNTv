import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";
import spotifyLogo from "@/assets/spotify-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { initiateSpotifyAuth } from "@/hooks/useSpotifyAuth";
import { lovable } from "@/integrations/lovable/index";

type Platform = "Spotify" | "YouTube Music" | "Apple Music";
type Tier = "casual" | "curious" | "nerd";
type AuthMode = "choose" | "signup" | "login";

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
  </svg>
);

export default function Connect() {
  const navigate = useNavigate();
  const { saveProfile } = useUserProfile();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [lastFm, setLastFm] = useState("");
  const [lastFmSyncing, setLastFmSyncing] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [youtubeImporting, setYoutubeImporting] = useState(false);
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string } | null>(null);
  const [youtubeTopArtists, setYoutubeTopArtists] = useState<string[] | null>(null);
  const [pendingSpotifyArtists, setPendingSpotifyArtists] = useState<string[] | null>(null);
  const [pendingSpotifyTracks, setPendingSpotifyTracks] = useState<string[] | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (getStoredProfile()) navigate("/browse", { replace: true });
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("spotify_pending_taste");
    if (raw) {
      try {
        const { topArtists, topTracks } = JSON.parse(raw);
        setPendingSpotifyArtists(topArtists);
        setPendingSpotifyTracks(topTracks);
        setPlatform("Spotify");
        sessionStorage.removeItem("spotify_pending_taste");
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.provider_token) {
        const meta = session.user?.user_metadata;
        setGoogleUser({
          name: meta?.full_name ?? meta?.name ?? "Google User",
          email: session.user?.email ?? "",
        });
        setYoutubeImporting(true);
        try {
          const { data } = await supabase.functions.invoke("youtube-taste", {
            body: { provider_token: session.provider_token },
          });
          if (data?.topArtists?.length > 0) setYoutubeTopArtists(data.topArtists);
        } catch (e) {
          console.warn("YouTube taste import failed:", e);
        } finally {
          setYoutubeImporting(false);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const goNext = (delta = 1) => { setDirection(delta); setStep((s) => s + delta); };
  const handlePlatformSelect = (p: Platform) => { setPlatform(p); goNext(); };

  const warmLastFmCache = async (username: string) => {
    setLastFmSyncing(true);
    try { await supabase.functions.invoke("lastfm-sync", { body: { username: username.trim() } }); }
    catch { /* non-blocking */ }
    finally { setLastFmSyncing(false); }
  };

  const handleLastFmContinue = async () => {
    if (lastFm.trim()) warmLastFmCache(lastFm.trim());
    goNext();
  };

  const handleConnectSpotify = async () => {
    setSpotifyConnecting(true);
    try { await initiateSpotifyAuth(); }
    catch (e) { console.error("Spotify auth error:", e); setSpotifyConnecting(false); }
  };

  const handleGoogleSignIn = async () => {
    setGoogleSigningIn(true);
    try {
      await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline",
        },
      });
    } catch (e) { console.error("Google sign-in error:", e); setGoogleSigningIn(false); }
  };

  const handleEmailSignUp = async () => {
    setAuthError("");
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setEmailSent(true);
  };

  const handleEmailLogin = async () => {
    setAuthError("");
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    goNext();
  };

  const handleTierSelect = (t: Tier) => {
    const profile: UserProfile = {
      streamingService: platform as Platform,
      lastFmUsername: lastFm.trim() || undefined,
      spotifyTopArtists: pendingSpotifyArtists ?? youtubeTopArtists ?? undefined,
      spotifyTopTracks: pendingSpotifyTracks || undefined,
      calculatedTier: t,
    };
    saveProfile(profile);
    navigate("/browse");
  };

  const platforms: { name: Platform; logo?: string; color: string }[] = [
    { name: "Spotify", logo: spotifyLogo, color: "border-green-500/40 hover:border-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]" },
    { name: "Apple Music", color: "border-rose-500/40 hover:border-rose-500 hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]" },
  ];

  const tiers = [
    { id: "casual" as Tier, label: "Casual Listener", desc: "Just here for the vibes", emoji: "🎵", color: "border-green-500/40 hover:border-green-500 hover:shadow-[0_0_25px_rgba(34,197,94,0.25)]", badge: "bg-green-500/20 text-green-400", hint: "3 nuggets per listen · accessible language · feel-good discoveries" },
    { id: "curious" as Tier, label: "Curious Fan", desc: "I like knowing the backstory", emoji: "🎼", color: "border-blue-500/40 hover:border-blue-500 hover:shadow-[0_0_25px_rgba(59,130,246,0.25)]", badge: "bg-blue-500/20 text-blue-400", hint: "6 nuggets per listen · production details · cultural context" },
    { id: "nerd" as Tier, label: "Hardcore Nerd", desc: "Give me every detail", emoji: "🎛️", color: "border-pink-500/40 hover:border-pink-500 hover:shadow-[0_0_25px_rgba(236,72,153,0.25)]", badge: "bg-pink-500/20 text-pink-400", hint: "9 nuggets per listen · obscure influences · technical breakdowns" },
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
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/50" : "w-3 bg-foreground/15"}`} />
            ))}
          </div>

          <div className="w-full overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>

              {/* ── Step 0: Account ── */}
              {step === 0 && (
                <motion.div key="step-0" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-6">

                  {googleUser ? (
                    /* Google already connected */
                    <>
                      <div className="text-center">
                        <h1 className="text-3xl font-black text-foreground tracking-tight">Welcome back</h1>
                        <p className="mt-2 text-muted-foreground">Signed in — let's set up your profile.</p>
                      </div>
                      <div className="flex items-center gap-3 w-full rounded-2xl border border-primary/40 bg-foreground/5 px-5 py-4 ring-1 ring-primary/20">
                        <GoogleIcon />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">{googleUser.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {youtubeImporting ? "Importing YouTube taste…" : youtubeTopArtists?.length ? `${youtubeTopArtists.length} artists found · ${youtubeTopArtists.slice(0, 3).join(", ")}…` : googleUser.email}
                          </p>
                        </div>
                        {youtubeImporting ? <Spinner className="h-4 w-4 text-primary flex-shrink-0" /> : <span className="text-xs font-semibold text-primary flex-shrink-0">✓</span>}
                      </div>
                      <button onClick={() => goNext()} className="w-full rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                        Continue →
                      </button>
                    </>

                  ) : authMode === "choose" ? (
                    /* Choose auth method */
                    <>
                      <div className="text-center">
                        <h1 className="text-3xl font-black text-foreground tracking-tight">Create your account</h1>
                        <p className="mt-2 text-muted-foreground">Save your profile and access it from any device.</p>
                      </div>
                      <div className="flex flex-col gap-3 w-full">
                        <button onClick={handleGoogleSignIn} disabled={googleSigningIn} className="flex items-center gap-3 w-full rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-4 font-semibold text-foreground transition-all hover:bg-foreground/10 hover:border-foreground/30 disabled:opacity-60">
                          {googleSigningIn ? <Spinner className="h-6 w-6 text-muted-foreground" /> : <GoogleIcon />}
                          <span className="flex-1">{googleSigningIn ? "Signing in…" : "Continue with Google"}</span>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-foreground/10" />
                          <span className="text-xs text-muted-foreground">or</span>
                          <div className="flex-1 h-px bg-foreground/10" />
                        </div>
                        <button onClick={() => setAuthMode("signup")} className="w-full rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                          Sign up with email
                        </button>
                        <button onClick={() => setAuthMode("login")} className="w-full rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                          Already have an account? Log in
                        </button>
                        <button onClick={() => goNext()} className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                          Continue without an account →
                        </button>
                      </div>
                    </>

                  ) : (
                    /* Email sign-up or login form */
                    <>
                      <div className="text-center">
                        <h1 className="text-3xl font-black text-foreground tracking-tight">
                          {authMode === "signup" ? "Create account" : "Welcome back"}
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                          {authMode === "signup" ? "Enter your email and a password." : "Log in to your MusicNerd account."}
                        </p>
                      </div>

                      {emailSent ? (
                        <div className="w-full rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-center">
                          <p className="font-semibold text-foreground">Check your email ✉️</p>
                          <p className="text-sm text-muted-foreground mt-1">Click the confirmation link, then come back and log in.</p>
                          <button onClick={() => { setEmailSent(false); setAuthMode("login"); }} className="mt-3 text-sm text-primary hover:underline">
                            Log in →
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 w-full">
                          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-4 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors" />
                          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (authMode === "signup" ? handleEmailSignUp() : handleEmailLogin())} className="w-full rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-4 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors" />
                          {authError && <p className="text-sm text-destructive px-1">{authError}</p>}
                          <button onClick={authMode === "signup" ? handleEmailSignUp : handleEmailLogin} disabled={authLoading || !email || !password} className="w-full rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                            {authLoading && <Spinner />}
                            {authMode === "signup" ? "Create account" : "Log in"}
                          </button>
                          <button onClick={() => { setAuthMode("choose"); setAuthError(""); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                            ← Back
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {/* ── Step 1: Platform ── */}
              {step === 1 && (
                <motion.div key="step-1" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-6">
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Choose your platform</h1>
                    <p className="mt-2 text-muted-foreground">Where do you listen to music?</p>
                  </div>
                  <div className="flex flex-col gap-3 w-full">
                    {!pendingSpotifyArtists ? (
                      <button onClick={handleConnectSpotify} disabled={spotifyConnecting} className={`flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 disabled:opacity-70 ${platforms[0].color}`}>
                        <img src={spotifyLogo} alt="Spotify" className="w-8 h-8 object-contain" />
                        <span className="flex-1">Spotify</span>
                        {spotifyConnecting ? <Spinner className="h-4 w-4 text-green-400" /> : <span className="text-xs text-muted-foreground">Connect →</span>}
                      </button>
                    ) : (
                      <button onClick={() => handlePlatformSelect("Spotify")} className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 border-green-500/60 ring-1 ring-green-500/30">
                        <img src={spotifyLogo} alt="Spotify" className="w-8 h-8 object-contain" />
                        <div className="flex-1 min-w-0">
                          <p>Spotify</p>
                          <p className="text-xs font-normal text-green-400 truncate">Connected · {pendingSpotifyArtists.slice(0, 3).join(", ")}{pendingSpotifyArtists.length > 3 ? "…" : ""}</p>
                        </div>
                        <span className="text-xs font-semibold text-green-400">✓</span>
                      </button>
                    )}
                    {platforms.slice(1).map((p) => (
                      <button key={p.name} onClick={() => handlePlatformSelect(p.name)} className={`flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 ${p.color}`}>
                        {p.logo ? <img src={p.logo} alt={p.name} className="w-8 h-8 object-contain" /> : <span className="text-2xl">🎵</span>}
                        <span className="flex-1">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Last.fm ── */}
              {step === 2 && (
                <motion.div key="step-2" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-6">
                  <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Last.fm username</h1>
                    <p className="mt-2 text-muted-foreground">Get personalised listening stats in your insights.</p>
                  </div>
                  <input type="text" placeholder="Your Last.fm username" value={lastFm} onChange={(e) => setLastFm(e.target.value)} className="w-full rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-4 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors" />
                  <div className="flex gap-3 w-full">
                    <button onClick={() => goNext()} className="flex-1 rounded-2xl bg-foreground/5 border border-foreground/15 px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Skip</button>
                    <button onClick={handleLastFmContinue} className="flex-1 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                      {lastFmSyncing && <Spinner />}
                      {lastFmSyncing ? "Syncing…" : "Continue"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3: Tier ── */}
              {step === 3 && (
                <motion.div key="step-3" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-6">
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
              ← Back
            </button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
