/**
 * XSS guard for any URL we'll render in an `<a href>` or
 * `window.open()`. Source URLs in nugget_cache come from Exa /
 * Gemini and have been observed to contain `javascript:void(0)` —
 * `isValidSourceShape` only checks `typeof url === "string"`, so
 * the scheme check has to live at every cache/render boundary.
 *
 * Applied at three layers (see sourceShape.ts JSDoc for the full
 * picture):
 *   1. preGenCachePrefill — drops unsafe sources before in-mem cache.
 *   2. useAINuggets cache-read paths — drops on JSONB read.
 *   3. Every `<a href={...}>` render site — final fallback.
 * Adding a new boundary without this helper re-opens the surface.
 *
 * No `.trim()` is intentional. A leading-whitespace prefix like
 * `" javascript:alert(1)"` MUST be rejected — historically some
 * browsers stripped whitespace before interpreting `href`, so an
 * unsanitized trim here would silently accept attacker-crafted
 * inputs. The `^` anchor enforces this.
 */
export function isSafeUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
