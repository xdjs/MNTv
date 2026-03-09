import { useEffect } from "react";
import { useUserProfile } from "@/hooks/useMusicNerdState";

/**
 * Tier-to-HSL mapping — these are the three fixed accent colors.
 * casual   = green   (142 70% 45%)
 * curious  = blue    (210 80% 55%)
 * nerd     = pink    (330 90% 60%)  ← default
 */
export const TIER_HSL: Record<string, string> = {
  nerd:    "330 90% 60%",
  curious: "210 80% 55%",
  casual:  "142 70% 45%",
};

export const DEFAULT_TIER_HSL = TIER_HSL.nerd;

/** Applies the tier HSL to all primary/glow CSS variables */
export function applyTierAccent(hsl: string) {
  const root = document.documentElement;
  root.style.setProperty("--primary",          hsl);
  root.style.setProperty("--neon-glow",         hsl);
  root.style.setProperty("--ring",              hsl);
  root.style.setProperty("--accent",            hsl);
  root.style.setProperty("--sidebar-primary",   hsl);
  root.style.setProperty("--sidebar-ring",      hsl);
}

/**
 * Reactively locks --primary / --neon-glow / --ring to the user's tier color.
 * Re-runs automatically when the user's tier changes (e.g. after Spotify auth).
 *
 * Pass the caller's `profile?.calculatedTier` to avoid stale state — each
 * useUserProfile() call creates an independent state instance, so relying on
 * an internal call misses updates made by a sibling hook.
 */
export function useTierAccent(callerTier?: string) {
  const { profile } = useUserProfile();
  const tier = callerTier ?? profile?.calculatedTier ?? "nerd";
  useEffect(() => {
    applyTierAccent(TIER_HSL[tier] ?? DEFAULT_TIER_HSL);
  }, [tier]);
}
