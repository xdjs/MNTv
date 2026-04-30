import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import PageTransition from "@/components/PageTransition";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import { useFirstRunReadiness, MAX_WAIT_MS } from "@/hooks/useFirstRunReadiness";
import { sanitizeRedirect } from "@/lib/routeUtils";
import { useTierGate } from "@/contexts/TierGateContext";
import type { UserProfile } from "@/mock/types";

/**
 * Splash shown between sign-in and Browse. Waits for the artist-updates
 * rail (the first thing the user sees on /browse) to be ready before
 * handing off, so Browse never opens with an empty "Your artists,
 * lately" rail. Stories continue loading on Browse via their own
 * per-card state — they're not user-blocking.
 *
 * Visual treatment mirrors `SpotifySyncingOverlay` (the post-OAuth
 * spinner) so the entire onboarding/refresh flow feels cohesive: same
 * aurora background, same logo glow + pulse, same gradient progress
 * bar, same status-message cycling.
 *
 * Guards:
 *   - Landing here without a profile (direct-URL hit, refresh-during-
 *     onboarding) immediately bounces to `/`.
 *   - If `ready` flips true (artist-updates ready or 45s ceiling hit),
 *     auto-navigate to /browse.
 *   - A "Jump in" link appears after 3s for users who don't want to
 *     wait the full warmup.
 */

// Status messages cycle through the wait window. Thresholds are
// PERCEIVED-PROGRESS milestones, not actual task durations — they're
// tuned so the copy advances steadily even when the underlying
// generation is silent (Gemini cold-start can be 0-30s of nothing).
// All values are in ms relative to mount; the final step lands at 35s
// (~78% of MAX_WAIT_MS = 45s) so the copy "Just a moment more" still
// has 10s of runway before the auto-advance fires.
const STATUS_STEPS = [
  { threshold: 0,      label: "Tuning into your top artists" },           // immediate
  { threshold: 3_000,  label: "Pulling in their latest releases" },       // 3s — Spotify call expected back
  { threshold: 10_000, label: "Reading the room — what they've been up to" }, // 10s — Gemini grounding warmup
  { threshold: 22_000, label: "Hand-picking facts worth knowing" },        // 22s — fact generation in flight
  { threshold: 35_000, label: "Just a moment more" },                     // 35s — final stretch before timeout
];

type Tier = NonNullable<UserProfile["calculatedTier"]>;

const TIER_PICKER_OPTIONS: Array<{
  id: Tier;
  label: string;
  desc: string;
  emoji: string;
  ringClass: string;
  glowClass: string;
}> = [
  {
    id: "casual",
    label: "Casual Listener",
    desc: "Just here for the vibes",
    emoji: "🎵",
    ringClass: "ring-green-500/30 hover:ring-green-400",
    glowClass: "hover:shadow-[0_0_24px_rgba(34,197,94,0.25)]",
  },
  {
    id: "curious",
    label: "Curious Fan",
    desc: "I like knowing the backstory",
    emoji: "🎼",
    ringClass: "ring-blue-500/30 hover:ring-blue-400",
    glowClass: "hover:shadow-[0_0_24px_rgba(59,130,246,0.25)]",
  },
  {
    id: "nerd",
    label: "Hardcore Nerd",
    desc: "Give me every detail",
    emoji: "🎛️",
    ringClass: "ring-pink-500/30 hover:ring-pink-400",
    glowClass: "hover:shadow-[0_0_24px_rgba(236,72,153,0.25)]",
  },
];

export default function PreparingExperience() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useUserProfile();
  const { tierConfirmed, confirmTier } = useTierGate();
  // useFirstRunReadiness reads artist-updates context state; pre-gen
  // doesn't kick off until tier is confirmed (StoriesContext +
  // ArtistUpdatesContext gate on it). Calling the hook before
  // confirmation is harmless — it just returns ready=false until the
  // post-confirmation effect runs and progress lands.
  const { ready, skipAvailable } = useFirstRunReadiness();

  // Deep-link support: a user signed in via /connect?redirect=/listen/xxx
  // should land back on that URL after warmup, not /browse. sanitizeRedirect
  // rejects self-references and other onboarding paths so a polluted ?next=
  // can't loop the user (a prior bug had ?next=/preparing trap users
  // forever once ready=true).
  const nextUrl = sanitizeRedirect(searchParams.get("next")) ?? "/browse";

  // Hard guard: somebody hit /preparing with no profile (bookmark,
  // refresh mid-onboarding, etc). Bounce them back to the entry.
  useEffect(() => {
    if (!profile && !getStoredProfile()) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  // Auto-advance once ready AND tier-confirmed. The tier-confirmed
  // guard matters because `ready` can fire on stale artist-updates
  // state before confirmation happens (the providers no-op pre-gen
  // until confirmed, so they technically never enter "loading", which
  // useFirstRunReadiness reads as "done"). Without this guard a fresh
  // login would skip the tier picker entirely and land on Browse.
  useEffect(() => {
    if (ready && tierConfirmed) navigate(nextUrl, { replace: true });
  }, [ready, tierConfirmed, navigate, nextUrl]);

  // Status-message timer — same pattern as SpotifySyncingOverlay so the
  // copy advances even when the underlying generation is silent
  // (Gemini cold start). Halts once ready so the last label doesn't
  // flicker through during the navigate-out tick.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (ready) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, [ready]);
  const currentStep = STATUS_STEPS.reduce((acc, step) =>
    elapsed >= step.threshold ? step : acc,
  );

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6">
        {/* Aurora background — slow drift so the screen never feels
            frozen while artist-updates generates. Same gradient stops
            as SpotifySyncingOverlay for visual continuity. */}
        <motion.div
          className="pointer-events-none absolute -inset-40 opacity-60 blur-3xl"
          initial={{ scale: 1, rotate: 0 }}
          animate={{ scale: [1, 1.08, 1], rotate: [0, 8, 0] }}
          transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
          style={{
            background:
              "radial-gradient(40% 40% at 30% 30%, rgba(34,197,94,0.25), transparent), radial-gradient(40% 40% at 70% 70%, rgba(236,72,153,0.25), transparent)",
          }}
        />

        {!tierConfirmed ? (
          // Tier-pick step — required on every login. Pre-gen for stories
          // and artist-updates is gated on `tierConfirmed` (see
          // StoriesContext + ArtistUpdatesContext) so nothing warms up
          // until the user picks a tier here. Returning users with a
          // persisted tier still see this step; the persisted choice is
          // visually marked as "current" so a quick tap keeps it.
          <motion.div
            key="tier-pick"
            className="relative z-10 flex w-full max-w-md flex-col items-center gap-7 text-center"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <MusicNerdLogo size={56} glow />
            <div className="space-y-1.5">
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight font-nunito">
                Pick your nerd level
              </h1>
              <p className="text-sm text-white/60">
                We tune every fact and discovery to your tier — change it any time.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3">
              {TIER_PICKER_OPTIONS.map((opt) => {
                const isCurrent = profile?.calculatedTier === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => confirmTier(opt.id)}
                    className={`flex items-start gap-3 md:gap-4 w-full rounded-2xl bg-white/[0.04] ring-1 px-4 md:px-5 py-3 md:py-4 text-left transition-all duration-200 ${opt.ringClass} ${opt.glowClass}`}
                  >
                    <span className="text-2xl md:text-3xl shrink-0">{opt.emoji}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base md:text-lg font-bold text-white">{opt.label}</p>
                        {isCurrent && (
                          <span className="text-[10px] uppercase tracking-widest text-white/50 px-1.5 py-0.5 rounded-full bg-white/5">
                            current
                          </span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-white/55">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] uppercase tracking-widest text-white/30">
              Tier choice runs every login
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="warming"
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
            >
              <MusicNerdLogo size={72} glow />
            </motion.div>

            <div className="space-y-1.5">
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight font-nunito">
                Setting up your music
              </h1>
              <div className="relative h-5 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentStep.label}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="text-sm text-white/70"
                  >
                    {currentStep.label}
                    <span className="inline-block ml-0.5 animate-pulse">…</span>
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Bar pacing matches SpotifySyncingOverlay (4% → 95% over the
                expected wait window). Duration is 45s — same as
                useFirstRunReadiness's MAX_WAIT_MS so the bar never
                overshoots the auto-advance. On success, exit snaps to
                100%. */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-400 via-emerald-300 to-pink-400"
                initial={{ width: "4%" }}
                animate={{ width: ready ? "100%" : "95%" }}
                transition={{ duration: ready ? 0.3 : MAX_WAIT_MS / 1000, ease: [0.2, 0.6, 0.3, 1] }}
              />
              <motion.div
                className="absolute inset-y-0 w-24 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                }}
                animate={{ x: ["-20%", "420%"] }}
                transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
              />
            </div>

            <p className="text-[11px] uppercase tracking-widest text-white/35">
              Stories will keep loading on Browse
            </p>

            {skipAvailable && !ready && (
              <button
                onClick={() => navigate(nextUrl, { replace: true })}
                className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-4"
              >
                Jump in
              </button>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
