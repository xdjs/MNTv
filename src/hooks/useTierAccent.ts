import { useEffect } from "react";
import { getStoredProfile } from "@/hooks/useMusicNerdState";

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
 * Call this once near the app root (e.g. Browse, Listen) to lock
 * --primary / --neon-glow / --ring to the user's tier color.
 * This overrides any previous accent extraction.
 */
export function useTierAccent() {
  useEffect(() => {
    const profile = getStoredProfile();
    const tier = profile?.calculatedTier ?? "nerd";
    applyTierAccent(TIER_HSL[tier] ?? DEFAULT_TIER_HSL);
  }, []);
}
