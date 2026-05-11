import type { Source } from "@/mock/types";

/**
 * Narrow-validate a `sources` JSONB value from nugget_cache (or any
 * other untrusted blob) before casting to `Source`. Verifies every
 * REQUIRED field on the Source type (`id`, `type`, `title`,
 * `publisher`, `url`) is a string — downstream consumers commonly
 * call `source.url.startsWith(...)` / `source.title.toLowerCase()`
 * without null-guarding, so a malformed row missing any of those
 * crashes the page rather than being silently dropped.
 *
 * Optional fields (`embedId`, `thumbnailUrl`, etc.) aren't checked
 * here — the type marks them optional, so consumers must already
 * null-guard those reads.
 *
 * NOTE: URL scheme (`javascript:`, `data:`) is NOT validated here.
 * It's gated by `isSafeUrl` in `./urlSafety.ts` at TWO layers:
 *   1. Cache-write/read boundaries — `preparePreGenCacheEntry` and
 *      every `nugget_cache` JSONB read in `useAINuggets` drop
 *      unsafe-scheme sources before they enter the in-memory Map.
 *   2. Render sites — each `<a href={source.url}>` re-checks before
 *      mounting, as defense-in-depth.
 * Both layers are required. Adding a new cache reader OR a new
 * render site without `isSafeUrl` re-opens the XSS surface.
 *
 * Lives in `lib/` (not `hooks/`) so prefill / cache utilities can
 * validate without importing from a React hook module.
 */
export function isValidSourceShape(v: unknown): v is Source {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string"
    && typeof o.type === "string"
    && typeof o.title === "string"
    && typeof o.publisher === "string"
    && typeof o.url === "string";
}
