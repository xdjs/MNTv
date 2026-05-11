import type { Nugget, Source } from "@/mock/types";
import { buildClientNuggetCacheKey } from "./nuggetCacheKey";

/** Hard ceiling per pre-gen invoke. Mirrors the server's
 *  FUNCTION_TIMEOUT_MS=90s with a small superset so anything that
 *  slips past the server watchdog still unblocks the client. Imported
 *  by both usePreGeneratedStories (story rail) and useReleasePreGen
 *  (release / collab pre-gen for "Your artists, lately"). */
export const PREGEN_INVOKE_TIMEOUT_MS = 95_000;

interface PrefillCacheEntry {
  nuggets: Nugget[];
  sources: Map<string, Source>;
  listenCount: number;
}

/**
 * Validate the edge function's response and convert it into a
 * cache-ready entry, OR return null if the response shape is unusable.
 *
 * Both pre-gen sites (stories rail, release/collab cards) want the
 * same thing: prefill PlayerContext.setNuggetCache so a tap on the
 * card is instant, even if the DB cache write silently failed
 * server-side. Keeping the logic here means a single shape contract
 * — change one place, both consumers stay in sync.
 *
 * Returns null when:
 *   - response has no nugget array
 *   - every entry fails the runtime shape guard
 *
 * The caller should still fire `setNuggetCache(memCacheKey, entry)`
 * — we can't import the player context here without coupling this
 * lib to React.
 */
export function preparePreGenCacheEntry(
  responseData: unknown,
): PrefillCacheEntry | null {
  if (!responseData || typeof responseData !== "object") return null;
  const data = responseData as { nuggets?: unknown[]; sources?: Record<string, unknown> };
  const responseNuggets = data.nuggets;
  if (!Array.isArray(responseNuggets) || responseNuggets.length === 0) return null;

  // Runtime-validate the shape. The edge function's response is
  // typed as unknown[], so a missing required field would silently
  // corrupt the cache and crash the Listen page on tap.
  const validNuggets = responseNuggets.filter((n): n is Nugget => {
    if (!n || typeof n !== "object") return false;
    const o = n as Record<string, unknown>;
    return typeof o.id === "string"
      && typeof o.trackId === "string"
      && typeof o.timestampSec === "number"
      && typeof o.headline === "string"
      && typeof o.text === "string";
  });
  if (validNuggets.length === 0) return null;

  const sourcesMap = new Map<string, Source>();
  if (data.sources && typeof data.sources === "object") {
    for (const [k, v] of Object.entries(data.sources)) {
      if (k.startsWith("_") || typeof v !== "object" || v === null || Array.isArray(v)) continue;
      sourcesMap.set(k, v as Source);
    }
  }

  return {
    nuggets: validNuggets,
    sources: sourcesMap,
    listenCount: 1,
  };
}

interface BuildCacheKeyArgs {
  artist: string;
  title: string;
  uri?: string;
  tier: string;
}

/** Convenience: same shape both pre-gen sites pass, returns the key
 *  that useAINuggets will read. */
export function buildPreGenCacheKey({ artist, title, uri, tier }: BuildCacheKeyArgs): string {
  return buildClientNuggetCacheKey({ artist, title, uri, tier, regenerateKey: 0 });
}
