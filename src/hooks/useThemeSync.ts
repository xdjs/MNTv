import { useAccentColor } from "./useAccentColor";
import { useTierAccent } from "./useTierAccent";

/**
 * Combines useTierAccent (--primary/--neon-glow/--ring from user tier)
 * and useAccentColor (--backdrop-color from cover art) into a single call.
 *
 * Use on pages that display both a player and cover art (e.g. Listen).
 * For pages with no cover art (e.g. Browse), call useTierAccent() directly.
 */
export function useThemeSync(coverArtUrl?: string, tier?: string) {
  useTierAccent(tier);
  useAccentColor(coverArtUrl);
}
