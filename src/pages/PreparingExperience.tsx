import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import PageTransition from "@/components/PageTransition";
import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
import { useFirstRunReadiness } from "@/hooks/useFirstRunReadiness";

/**
 * Splash shown between tier-select and Browse on first run. Gives the
 * pre-gen pipeline a visible moment to warm up stories + artist
 * updates so Browse's first paint has content instead of an aisle of
 * skeletons.
 *
 * Guards:
 *   - Landing here without a profile (direct-URL hit, refresh-during-
 *     onboarding) immediately bounces to `/`.
 *   - If `ready` flips true (enough content or the 10s ceiling hit),
 *     auto-navigate to /browse. The hook's MAX_WAIT_MS is the hard
 *     upper bound so no user is trapped waiting for Gemini forever.
 *   - A "Jump to Browse" link appears after 3s for users who don't
 *     want to wait even the normal warmup window.
 */
export default function PreparingExperience() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useUserProfile();
  const {
    ready,
    storiesReady,
    storiesTotal,
    artistsReady,
    artistsTotal,
    skipAvailable,
  } = useFirstRunReadiness();

  // Deep-link support: a user signed in via /connect?redirect=/listen/xxx
  // should land back on that URL after warmup, not /browse.
  const nextUrl = searchParams.get("next") || "/browse";

  // Hard guard: somebody hit /preparing with no profile (bookmark,
  // refresh mid-onboarding, etc). Bounce them back to the entry.
  useEffect(() => {
    if (!profile && !getStoredProfile()) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  // Auto-advance once ready. replace: true so back-button doesn't
  // bring the user back to the splash. `nextUrl` honors ?next= for
  // users who came in via a deep link; defaults to /browse.
  useEffect(() => {
    if (ready) navigate(nextUrl, { replace: true });
  }, [ready, navigate, nextUrl]);

  return (
    <PageTransition>
      <div className="relative min-h-screen bg-background flex flex-col items-center justify-center overflow-hidden px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20 pointer-events-none" />

        <motion.div
          className="relative z-10 flex flex-col items-center gap-8 max-w-md text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <MusicNerdLogo size={64} glow />

          <div className="space-y-2">
            <h1
              className="text-2xl md:text-3xl font-black text-foreground"
              style={{ fontFamily: "'Nunito Sans', sans-serif" }}
            >
              Setting up your music
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Digging up stories and facts about your top artists. Hang tight — this only happens once.
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <ProgressPill
              label="Stories"
              ready={storiesReady}
              total={storiesTotal}
            />
            <ProgressPill
              label="Artist facts"
              ready={artistsReady}
              total={artistsTotal}
            />
          </div>

          {skipAvailable && !ready && (
            <button
              onClick={() => navigate(nextUrl, { replace: true })}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-4"
            >
              Jump in
            </button>
          )}
        </motion.div>
      </div>
    </PageTransition>
  );
}

function ProgressPill({
  label,
  ready,
  total,
}: {
  label: string;
  ready: number;
  total: number;
}) {
  // Cold start: total=0 for ~1 tick before the contexts populate.
  // Show "Loading…" during that window rather than "0 / 0 ready"
  // which looks like a bug.
  const seeded = total > 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-foreground/5 border border-foreground/10">
      <span className="text-xs font-semibold text-foreground/60 w-28 text-left">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
        <motion.div
          className="h-full bg-rose-400/70"
          initial={{ width: 0 }}
          animate={{
            width: seeded ? `${Math.min(100, (ready / total) * 100)}%` : "10%",
          }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-foreground/50 w-14 text-right">
        {seeded ? `${ready} / ${total}` : "Loading…"}
      </span>
    </div>
  );
}
