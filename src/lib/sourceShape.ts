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
 * NOTE: URL scheme (`javascript:`, `data:`) is NOT validated here —
 * that's a render-time concern handled by `isSafeUrl` in
 * `./urlSafety.ts`. Every render site that consumes `source.url`
 * MUST gate on that helper independently or it's an XSS vector.
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
