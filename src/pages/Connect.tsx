import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";
import spotifyLogo from "@/assets/spotify-logo.png";
import { signInWithSpotify, prewarmSpotifyTaste, SPOTIFY_OAUTH_PENDING_KEY } from "@/hooks/useSpotifyAuth";
import { sanitizeRedirect } from "@/lib/routeUtils";
import { initiateAppleMusicAuth, fetchAppleMusicTaste } from "@/hooks/useAppleMusicAuth";
import { useAppleMusicToken } from "@/hooks/useAppleMusicToken";
import { useSpotifyPostSigninSync } from "@/hooks/useSpotifyPostSigninSync";
import { ensureSupabaseSession } from "@/lib/ensureSupabaseSession";
import SpotifySyncingOverlay from "@/components/SpotifySyncingOverlay";
import { useTierGate } from "@/contexts/TierGateContext";

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

// sanitizeRedirect lives in src/lib/routeUtils.ts so PreparingExperience
// uses the same logic — see the comment there for why we reject /,
// /connect, and /preparing.

/**
 * Outer gate for /connect. Reads URL/sessionStorage redirect and the
 * stored profile synchronously so a returning user (cached profile) can
 * be sent straight to their destination via <Navigate> without ever
 * mounting Connect's body. This avoids the AnimatePresence transition
 * stall that hit /connect → /preparing|/browse: PageTransition's exit
 * animation didn't propagate up from inside Routes, so AnimatePresence
 * with mode="wait" hung waiting for an exit that never fired, leaving
 * Connect rendered on the new URL.
 */
export default function Connect() {
  const [searchParams] = useSearchParams();
  // Subscribe to profile so this gate re-renders when DB hydration
  // populates it after a fresh sign-in (returning user, signOut cleared
  // local but DB still has the row).
  const { profile } = useUserProfile();
  const redirectParam = sanitizeRedirect(searchParams.get("redirect"));
  // Persist redirect across the OAuth round-trip so the post-callback
  // mount of Connect can still read where to send the user. Side-effect
  // moved into useEffect because writes in the render body run twice
  // under React 18 StrictMode and again on every re-render.
  useEffect(() => {
    if (redirectParam) {
      sessionStorage.setItem("musicnerd_redirect", redirectParam);
    }
  }, [redirectParam]);
  const storedRedirect = sanitizeRedirect(sessionStorage.getItem("musicnerd_redirect"));
  // Evict polluted sessionStorage entries (e.g. stale "/preparing" left
  // over from a pre-fix run). Must also be in an effect — writes during
  // render violate the rendering contract.
  useEffect(() => {
    if (sessionStorage.getItem("musicnerd_redirect") && !storedRedirect) {
      sessionStorage.removeItem("musicnerd_redirect");
    }
  }, [storedRedirect]);
  const redirectUrl = redirectParam || storedRedirect;
  // Need BOTH a session AND a profile to short-circuit past the
  // sign-in UI. Profile-only (e.g. session expired but localStorage
  // is still seeded) used to ping-pong: gate Navigates to /preparing
  // → ProtectedRoute on /preparing fails on missing session →
  // redirects back to /connect → loop. With both checks, an expired
  // session falls through to ConnectInner where the user can
  // re-authenticate.
  const { session, loading: authLoading } = useAuth();
  const hasProfile = !!profile || !!getStoredProfile();
  let oauthPendingFlag = false;
  try { oauthPendingFlag = sessionStorage.getItem(SPOTIFY_OAUTH_PENDING_KEY) === "1"; } catch { /* noop */ }

  // Pete 2026-05-10: returning user short-circuits via <Navigate>
  // BEFORE ConnectInner mounts, so a useEffect inside ConnectInner
  // would never fire. The OAuth-pending reset has to live here at
  // the parent level. Using useLayoutEffect (not useEffect) so the
  // tier-confirmed clear lands BEFORE Navigate's useEffect triggers
  // the route change — otherwise PreparingExperience briefly mounts
  // with stale tierConfirmed=true and flashes the warming spinner
  // before re-rendering with the picker.
  // CRITICAL: this hook MUST run before any early return to satisfy
  // Rules of Hooks (the hook count must match across all renders).
  useLayoutEffect(() => {
    let pending = false;
    try { pending = sessionStorage.getItem(SPOTIFY_OAUTH_PENDING_KEY) === "1"; } catch { /* noop */ }
    if (!pending) return;
    try {
      sessionStorage.removeItem("musicnerd_tier_confirmed");
      // Force fresh artist rotation: drop the per-session resolved
      // cursor so resolveRotationStart() reads + advances localStorage
      // again on the next mount. Net effect — every sign-in shows the
      // next 3 artists in the top-10 pool.
      sessionStorage.removeItem("musicnerd_artist_rotation_resolved");
      // Notify TierGateContext to re-read sessionStorage and update
      // its React state, otherwise PreparingExperience would still
      // see tierConfirmed=true from the previous render and briefly
      // show the warming spinner. Pete 2026-05-11 (review note 8):
      // queueMicrotask defers the dispatch out of the layout-effect
      // synchronous phase so TierGateProvider's setTierConfirmed
      // doesn't fire while Connect is still mid-render — eliminates
      // the dev-time "Cannot update a component while rendering a
      // different component" warning.
      queueMicrotask(() => {
        window.dispatchEvent(new Event("musicnerd:tier-state-changed"));
      });
    } catch { /* noop */ }
  }, []);

  // Pete 2026-05-11: while session is still resolving after OAuth
  // return, hide ConnectInner (and its SpotifySyncingOverlay) by
  // returning a blank screen. The bg-black matches PreparingExperience's
  // background EXACTLY so there's no visible color jump between this
  // fallback and the tier picker that appears next.
  if (oauthPendingFlag && (authLoading || !session)) {
    return <div className="min-h-screen bg-black" />;
  }

  if (session && hasProfile) {
    // Route through /preparing so the artist-updates rail has a window
    // to populate before Browse renders. Without this, returning users
    // land on Browse with an empty rail and watch it fill in — the
    // splash gives the per-artist Gemini call (cold-start 30-60s) time
    // to land. Stories continue loading on Browse via their own state.
    const next = redirectUrl || "/browse";
    return <Navigate to={`/preparing?next=${encodeURIComponent(next)}`} replace />;
  }
  return <ConnectInner redirectUrl={redirectUrl} />;
}

function ConnectInner({ redirectUrl }: { redirectUrl: string | null }) {
  const navigate = useNavigate();
  const { saveProfile } = useUserProfile();
  const { confirmTier } = useTierGate();
  // Synchronous check: are we landing here from a fresh Spotify OAuth?
  // Two signals, OR'd:
  //   1. `signInWithSpotify` set sessionStorage["musicnerd_spotify_oauth_pending"]
  //      right before the redirect. Survives the OAuth round-trip
  //      (sessionStorage persists across the same-origin redirect-back).
  //      Read synchronously here so the overlay is up on the very first
  //      frame, before AuthContext finishes resolving the session.
  //   2. `user.app_metadata.provider === "spotify"` — once auth
  //      resolves, keeps the overlay up until tier-pick advances `step`.
  // The flag is cleared in `handleTierSelect` (success path) and
  // `useSignOut` (sign-out path). `useSpotifyPostSigninSync.onSynced`
  // also clears it as belt-and-suspenders so a user who closes the tab
  // mid-tier-pick doesn't carry the flag into the next sign-in.
  const { user: authUser } = useAuth();
  // Pete 2026-05-11 (review note 2): useMemo with empty deps is NOT a
  // stable initializer — React is free to discard and recompute, which
  // would re-read sessionStorage AFTER the flag has been cleared by
  // handleTierSelect. Using useRef.current pins the value to the first
  // mount.
  const oauthPendingOnMount = useRef<boolean>(
    (() => {
      try {
        return sessionStorage.getItem(SPOTIFY_OAUTH_PENDING_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  ).current;
  const isFreshSpotifyOAuth =
    oauthPendingOnMount ||
    (!!authUser && authUser.app_metadata?.provider === "spotify");

  // Tier-pick reset on fresh OAuth lives at the parent Connect level
  // now (so it fires for returning users who short-circuit via
  // <Navigate> before ConnectInner mounts).

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [pendingTopArtists, setPendingTopArtists] = useState<string[] | null>(null);
  const [pendingTopTracks, setPendingTopTracks] = useState<string[] | null>(null);
  const [pendingArtistImages, setPendingArtistImages] = useState<Record<string, string>>({});
  const [pendingArtistIds, setPendingArtistIds] = useState<Record<string, string>>({});
  const [pendingTrackImages, setPendingTrackImages] = useState<{ title: string; artist: string; collaborators?: string[]; imageUrl: string; uri?: string }[]>([]);
  const [pendingLikedTracks, setPendingLikedTracks] = useState<{ title: string; artist: string; collaborators?: string[]; imageUrl: string; uri?: string; addedAt?: string | null }[]>([]);
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
  // After Supabase's Spotify OAuth lands on /connect, the hook fetches
  // taste data and hands it back via this callback. Previously we went
  // through sessionStorage, but that raced against the reader effect:
  // the reader fired on mount (before auth resolved) and never re-ran,
  // so the async write arrived after nobody was listening. The direct
  // callback is race-free — the setters run the moment the taste fetch
  // resolves.
  const { syncing: spotifySyncing, syncError: spotifySyncError, retrySync } = useSpotifyPostSigninSync({
    onSynced: (patch) => {
      setSpotifyConnected(true);
      setPendingTopArtists(patch.topArtists ?? null);
      setPendingTopTracks(patch.topTracks ?? null);
      if (patch.spotifyDisplayName) setPendingDisplayName(patch.spotifyDisplayName);
      if (patch.artistImages) setPendingArtistImages(patch.artistImages);
      if (patch.artistIds) setPendingArtistIds(patch.artistIds);
      if (patch.trackImages) setPendingTrackImages(patch.trackImages);
      if (patch.likedTracks) setPendingLikedTracks(patch.likedTracks);
      setStep(1);
    },
  });

  // Returning users go through /preparing too — it gives the hoisted
  // ArtistUpdatesContext a window to warm so Browse's "Your artists,
  // lately" rail has content on first paint instead of a skeleton.
  // The splash auto-advances when MIN_ARTISTS (1) artist-update rows
  // resolve, or the MAX_WAIT_MS ceiling fires. Stories pre-gen runs
  // in parallel but is NOT a gating signal — it continues loading on
  // Browse via per-card state. Deep-links survive via ?next=.
  // Warm the spotify-taste edge function on mount so the post-OAuth
  // taste fetch doesn't eat the cold-start latency. The outer Connect
  // gate already short-circuits returning users via <Navigate> before
  // ConnectInner mounts, so anyone reaching here is on the fresh-user
  // path and will need this fetch.
  useEffect(() => {
    prewarmSpotifyTaste();
  }, []);

  const goNext = (delta = 1) => { setDirection(delta); setStep((s) => s + delta); };

  const handleConnectSpotify = async () => {
    setSpotifyConnecting(true);
    setSpotifyError(null);
    try {
      await signInWithSpotify();
    } catch (e) {
      console.error("Spotify auth error:", e);
      // Mirror the Apple Music path: surface a message instead of
      // silently re-enabling the button. Supabase's signInWithOAuth
      // errors here are rare (network, provider misconfiguration) but
      // when they hit, the user needs to know the click did something.
      setSpotifyError("Couldn't connect to Spotify. Try again?");
    } finally {
      // Belt-and-suspenders — on the happy path `signInWithOAuth`
      // redirects the whole tab so this setter runs on a tab that's
      // about to unload. But if the redirect is ever blocked (popup
      // blocker edge cases, SDK change, etc.) the button would stay
      // in a loading state forever without this.
      setSpotifyConnecting(false);
    }
  };

  const handleConnectAppleMusic = async () => {
    setAppleMusicConnecting(true);
    setAppleMusicError(null);
    try {
      // Seed a real Supabase session first. Spotify users get one from
      // signInWithSpotify(); Apple Music users go through
      // signInAnonymously() so every connected user has an auth.uid().
      // Without this, the session-based route gate (src/routes.tsx)
      // would lock Apple Music users out, and nugget_history writes
      // would keep failing RLS silently (auth.uid() null). Idempotent —
      // if the user already has a Supabase session from an earlier
      // connect, this returns it without creating another anon user.
      try {
        await ensureSupabaseSession();
      } catch (sessionErr) {
        console.error("ensureSupabaseSession failed on Apple Music connect:", sessionErr);
        setAppleMusicError("Couldn't start your session. Try again?");
        setAppleMusicConnecting(false);
        return;
      }

      const musicUserToken = await initiateAppleMusicAuth();
      if (musicUserToken) {
        setAppleMusicConnected(true);

        // Fetch the user's Apple Music taste profile. Both services
        // populate the same pending* state. A null return means Apple
        // returned an error, the MUT is invalid, or the user has no
        // listening history yet — in all cases we proceed to the tier
        // picker rather than blocking onboarding, but set a warning
        // state so the user understands why Browse starts sparse.
        const taste = await fetchAppleMusicTaste(musicUserToken);
        if (taste) {
          setPendingTopArtists(taste.topArtists);
          setPendingTopTracks(taste.topTracks);
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
      topArtists: pendingTopArtists || undefined,
      topTracks: pendingTopTracks || undefined,
      artistImages: Object.keys(pendingArtistImages).length ? pendingArtistImages : undefined,
      artistIds: Object.keys(pendingArtistIds).length ? pendingArtistIds : undefined,
      trackImages: pendingTrackImages.length ? pendingTrackImages : undefined,
      likedTracks: pendingLikedTracks.length ? pendingLikedTracks : undefined,
      lastFmUsername: lastFmUsername.trim() || undefined,
      calculatedTier: t,
      // Stamp tasteRefreshedAt explicitly — pendingTop* came from the
      // post-signin sync's fetchSpotifyTaste call moments ago, so the
      // 24h TTL window starts now. saveProfile no longer auto-stamps,
      // so without this the next page load would treat the snapshot
      // as "never refreshed" and trigger an immediate redundant
      // background fetch.
      tasteRefreshedAt: pendingTopArtists ? new Date().toISOString() : undefined,
    };
    saveProfile(profile);
    // Confirm tier for this session — unblocks StoriesProvider /
    // ArtistUpdatesProvider, which were holding pre-gen until the user
    // explicitly picked a tier this login. Without this call /preparing
    // would render its own tier-pick step on top of the user's choice
    // here.
    confirmTier(t);
    sessionStorage.removeItem("musicnerd_redirect");
    // Clear the OAuth-pending flag — we're past the post-signin window.
    try { sessionStorage.removeItem(SPOTIFY_OAUTH_PENDING_KEY); } catch { /* ignore */ }
    // Route through /preparing so artist-updates gets a warmup window
    // before Browse renders. Splash auto-advances when 1 artist-update
    // row lands, or the 45s ceiling fires. Stories pre-gen runs in
    // parallel but doesn't block the splash.
    const next = redirectUrl || "/browse";
    navigate(`/preparing?next=${encodeURIComponent(next)}`);
  };

  const tiers = [
    { id: "casual" as Tier, label: "Casual Listener", desc: "Just here for the vibes", emoji: "🎵", color: "border-green-500/40 hover:border-green-500 hover:shadow-[0_0_25px_rgba(34,197,94,0.25)]", badge: "bg-green-500/20 text-green-400", hint: "Accessible language · feel-good discoveries · easy listening facts" },
    { id: "curious" as Tier, label: "Curious Fan", desc: "I like knowing the backstory", emoji: "🎼", color: "border-blue-500/40 hover:border-blue-500 hover:shadow-[0_0_25px_rgba(59,130,246,0.25)]", badge: "bg-blue-500/20 text-blue-400", hint: "Production details · cultural context · deeper backstories" },
    { id: "nerd" as Tier, label: "Hardcore Nerd", desc: "Give me every detail", emoji: "🎛️", color: "border-pink-500/40 hover:border-pink-500 hover:shadow-[0_0_25px_rgba(236,72,153,0.25)]", badge: "bg-pink-500/20 text-pink-400", hint: "Obscure influences · technical breakdowns · full music nerd mode" },
  ];

  return (
    <PageTransition>
      {/* Full-screen takeover while the post-OAuth taste fetch runs. Keeps
          the user from re-reading the Connect prompts (boring) and from
          double-clicking Sign in with Spotify (confusing). Stays up
          through an error so the user always has a retry path — if we
          just dismissed on failure, they'd land back on step 0 and
          think their click did nothing. */}
      {/* `isFreshSpotifyOAuth` is the synchronous mount-time check that
          paves over the 600ms gap before `spotifySyncing` flips true.
          It stays true until the sync resolves — at which point
          `onSynced` advances `step` to 1, and from there the user is
          past step 0 anyway, so the overlay doesn't need to keep
          gating. We dismiss it once any of:
            - sync flag flipped false (success or short-circuit), AND
            - we're on step 1 or beyond (synced data populated). */}
      <SpotifySyncingOverlay
        visible={
          spotifySyncing ||
          !!spotifySyncError ||
          (isFreshSpotifyOAuth && step === 0)
        }
        error={spotifySyncError}
        onRetry={retrySync}
      />
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
                    {!pendingTopArtists ? (
                      <>
                        <button onClick={handleConnectSpotify} disabled={spotifyConnecting || spotifySyncing} className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed border-green-500/40 hover:border-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                          <img src={spotifyLogo} alt="Spotify" className="w-8 h-8 object-contain" />
                          <span className="flex-1">Spotify</span>
                          {spotifyConnecting ? <Spinner className="h-4 w-4 text-green-400" /> : <span className="text-xs text-muted-foreground">Connect</span>}
                        </button>
                        {spotifyError && (
                          <p className="mt-1.5 px-1 text-xs text-red-400">{spotifyError}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-4 w-full rounded-2xl border bg-foreground/5 px-5 py-4 text-left font-semibold text-foreground border-green-500/60 ring-1 ring-green-500/30">
                        <img src={spotifyLogo} alt="Spotify" className="w-8 h-8 object-contain" />
                        <div className="flex-1 min-w-0">
                          <p>Spotify</p>
                          <p className="text-xs font-normal text-green-400 truncate">Connected · {pendingTopArtists.slice(0, 3).join(", ")}{pendingTopArtists.length > 3 ? "..." : ""}</p>
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
