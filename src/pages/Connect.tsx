import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";
import spotifyLogo from "@/assets/spotify-logo.png";
import { initiateSpotifyAuth } from "@/hooks/useSpotifyAuth";
import { initiateAppleMusicAuth, fetchAppleMusicTaste } from "@/hooks/useAppleMusicAuth";
import { useAppleMusicToken } from "@/hooks/useAppleMusicToken";
import { supabase } from "@/integrations/supabase/client";

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
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [pendingSpotifyArtists, setPendingSpotifyArtists] = useState<string[] | null>(null);
  const [pendingSpotifyTracks, setPendingSpotifyTracks] = useState<string[] | null>(null);
  const [pendingArtistImages, setPendingArtistImages] = useState<Record<string, string>>({});
  const [pendingArtistIds, setPendingArtistIds] = useState<Record<string, string>>({});
  const [pendingTrackImages, setPendingTrackImages] = useState<{ title: string; artist: string; imageUrl: string; uri?: string }[]>([]);
  const [pendingDisplayName, setPendingDisplayName] = useState<string | null>(null);
  // hasMusicToken is live from localStorage so it survives the Spotify OAuth
  // redirect (React state is wiped on remount, but the token persists).
  const { hasMusicToken } = useAppleMusicToken();
  const [appleMusicConnecting, setAppleMusicConnecting] = useState(false);
  const [appleMusicConnected, setAppleMusicConnected] = useState(() => hasMusicToken);
  const [appleMusicError, setAppleMusicError] = useState<string | null>(null);
  // Non-blocking notice when the Apple taste fetch returns null. Shown on
  // the tier picker step so the user understands why Browse will look
  // sparse on first load. Apple's heavy-rotation + recent/played combo is
  // softer than Spotify's explicit top-artists endpoint and more likely
  // to fail on new accounts with little listening history.
  const [appleTasteWarning, setAppleTasteWarning] = useState<string | null>(null);
  // Keep local state in sync when the hook detects a stored token.
  useEffect(() => {
    if (hasMusicToken) setAppleMusicConnected(true);
  }, [hasMusicToken]);
  const [lastFmUsername, setLastFmUsername] = useState("");
  const [lastFmSaved, setLastFmSaved] = useState(false);
  const [showLastFm, setShowLastFm] = useState(false);

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
        setSpotifyConnected(true);
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

  const handleConnectAppleMusic = async () => {
    setAppleMusicConnecting(true);
    setAppleMusicError(null);
    try {
      // The apple-dev-token edge function requires a Supabase session and
      // returns 401 otherwise. Pre-flight the check so we surface an
      // actionable message instead of a generic "couldn't connect" loop.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAppleMusicError("Sign in to MusicNerd before connecting Apple Music.");
        return;
      }

      const musicUserToken = await initiateAppleMusicAuth();
      if (musicUserToken) {
        setAppleMusicConnected(true);

        // Fetch the user's Apple Music taste profile via the apple-taste
        // edge function. Stored under the same pending* state Spotify
        // uses — the legacy field names (pendingSpotifyArtists etc.)
        // carry the active service's taste data. A null return means
        // Apple returned an error, the MUT is invalid, or the user has
        // no listening history yet. In all cases we proceed to the
        // tier picker rather than blocking onboarding — but we set a
        // warning state so the user sees an inline note explaining why
        // Browse will show only demo tracks on first load.
        const taste = await fetchAppleMusicTaste(musicUserToken);
        if (taste) {
          setPendingSpotifyArtists(taste.topArtists);
          setPendingSpotifyTracks(taste.topTracks);
          if (taste.displayName) setPendingDisplayName(taste.displayName);
          setPendingArtistImages(taste.artistImages);
          setPendingArtistIds(taste.artistIds);
          if (taste.trackImages.length) setPendingTrackImages(taste.trackImages);
        } else {
          setAppleTasteWarning(
            "We couldn't pull your Apple Music library yet — Browse will start with demo tracks. Play a few and personalized rows will fill in."
          );
        }
        // Jump to tier picker once the taste fetch resolves — matches
        // the Spotify post-OAuth handler in the sessionStorage useEffect
        // above, which does the same setStep(1) after piping Spotify
        // taste data into the pending state.
        setStep(1);
      } else {
        // Null return = popup cancelled, SDK load failure, or dev token fetch failed.
        // initiateAppleMusicAuth logs the specific cause; surface a generic hint here.
        setAppleMusicError("Couldn't connect to Apple Music. Try again?");
      }
    } catch (e) {
      console.error("Apple Music auth error:", e);
      setAppleMusicError("Apple Music connection failed. Check your connection and try again.");
    } finally {
      setAppleMusicConnecting(false);
    }
  };

  const handleTierSelect = (t: Tier) => {
    // Use explicit connection flags instead of inferring from taste data —
    // a new Spotify account can legitimately return 0 top artists, which
    // previously caused us to fall through to "Apple Music" if that was
    // also tapped. Spotify wins precedence when both are connected.
    const streamingService = spotifyConnected
      ? "Spotify"
      : appleMusicConnected
        ? "Apple Music"
        : "";
    const profile: UserProfile = {
      streamingService,
      spotifyDisplayName: pendingDisplayName || undefined,
      spotifyTopArtists: pendingSpotifyArtists || undefined,
      spotifyTopTracks: pendingSpotifyTracks || undefined,
      spotifyArtistImages: Object.keys(pendingArtistImages).length ? pendingArtistImages : undefined,
      spotifyArtistIds: Object.keys(pendingArtistIds).length ? pendingArtistIds : undefined,
      spotifyTrackImages: pendingTrackImages.length ? pendingTrackImages : undefined,
      lastFmUsername: lastFmUsername.trim() || undefined,
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

        <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-5 md:gap-8">
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <MusicNerdLogo size={48} glow />
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
                <motion.div key="step-0" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-4 md:gap-6">
                  <div className="text-center">
                    <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">Connect your music</h1>
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

                    {/* Last.fm — optional username */}
                    <div className="w-full">
                      <button
                        type="button"
                        onClick={() => setShowLastFm(!showLastFm)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
                      >
                        {showLastFm ? "Hide" : "Have a Last.fm account?"} {showLastFm ? "▲" : "▼"}
                      </button>
                      {showLastFm && (
                        <div className="mt-2 flex items-center gap-3 w-full rounded-2xl border bg-foreground/5 px-5 py-3 border-red-500/30">
                          <span className="text-lg">🎧</span>
                          <input
                            type="text"
                            value={lastFmUsername}
                            onChange={(e) => { setLastFmUsername(e.target.value); setLastFmSaved(false); }}
                            onKeyDown={(e) => { if (e.key === "Enter" && lastFmUsername.trim()) setLastFmSaved(true); }}
                            placeholder="Last.fm username (optional)"
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                          />
                          {lastFmUsername.trim() && (
                            lastFmSaved ? (
                              <span className="text-xs font-semibold text-red-400">✓</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setLastFmSaved(true)}
                                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap"
                              >
                                Save
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Apple Music — connect or show connected */}
                    {!appleMusicConnected ? (
                      <div className="w-full">
                        <button onClick={handleConnectAppleMusic} disabled={appleMusicConnecting} className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 disabled:opacity-70 border-pink-500/40 hover:border-pink-500 hover:shadow-[0_0_20px_rgba(236,72,153,0.3)]">
                          <span className="text-2xl">🎵</span>
                          <span className="flex-1">Apple Music</span>
                          {appleMusicConnecting ? <Spinner className="h-4 w-4 text-pink-400" /> : <span className="text-xs text-muted-foreground">Connect</span>}
                        </button>
                        {appleMusicError && (
                          <p className="mt-1.5 px-1 text-xs text-red-400">{appleMusicError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground border-pink-500/60 ring-1 ring-pink-500/30">
                        <span className="text-2xl">🎵</span>
                        <div className="flex-1 min-w-0">
                          <p>Apple Music</p>
                          <p className="text-xs font-normal text-pink-400 truncate">Connected</p>
                        </div>
                        <span className="text-xs font-semibold text-pink-400">✓</span>
                      </div>
                    )}

                    {/* Continue (shown after any service connected) */}
                    {(spotifyConnected || appleMusicConnected) && (
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
                <motion.div key="step-1" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-4 md:gap-6">
                  <div className="text-center">
                    <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">Choose your vibe</h1>
                    <p className="mt-2 text-muted-foreground">This shapes how deep your music insights go.</p>
                  </div>
                  {appleTasteWarning && (
                    <div className="w-full rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200/90">
                      {appleTasteWarning}
                    </div>
                  )}
                  <div className="flex flex-col gap-3 w-full">
                    {tiers.map((t) => (
                      <button key={t.id} onClick={() => handleTierSelect(t.id)} className={`flex items-start gap-3 md:gap-4 w-full rounded-2xl border bg-foreground/5 px-4 md:px-5 py-3 md:py-4 text-left transition-all duration-200 ${t.color}`}>
                        <span className="text-xl md:text-2xl mt-0.5">{t.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-foreground">{t.label}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.badge}`}>{t.id}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{t.desc}</p>
                          <p className="text-xs text-foreground/40 mt-1">{t.hint}</p>
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
