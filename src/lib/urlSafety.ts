/**
 * XSS guard for any URL we'll render in an `<a href>` or
 * `window.open()`. Source URLs in nugget_cache come from Exa /
 * Gemini and have been observed to contain `javascript:void(0)` —
 * `isValidSourceShape` only checks `typeof url === "string"`, so
 * the scheme check has to live at the render boundary.
 *
 * Every render site that consumes `source.url`, `link.url`, or any
 * other AI-derived URL MUST gate on this helper. Adding a new render
 * site without it = XSS surface.
 */
export function isSafeUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
