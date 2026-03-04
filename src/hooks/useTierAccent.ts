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
 */
export function useTierAccent() {
  const { profile } = useUserProfile();
  useEffect(() => {
    const tier = profile?.calculatedTier ?? "nerd";
    applyTierAccent(TIER_HSL[tier] ?? DEFAULT_TIER_HSL);
  }, [profile?.calculatedTier]);
}
