/**
 * Reject non-content destinations from `?redirect=` / `?next=` params
 * so we never loop the user back through the onboarding funnel — and
 * so an attacker can't use the param as an open-redirect to phish.
 *
 * Rejected:
 *   - Anything that isn't a single-leading-slash path. `//evil.com`
 *     and `https://evil.com` are technically "paths" to React Router's
 *     `navigate()` but become external navigations. Only `/foo`-style
 *     in-app paths are accepted.
 *   - `/connect` — the page reading the param; would self-loop.
 *   - `/preparing` — the splash; auto-advances elsewhere, looping
 *     here means the splash hands off to itself after readiness.
 *   - `/` — the root router, which re-routes back to /connect or
 *     /browse, so honoring it as a destination is meaningless.
 *
 * Returns the URL when valid, or `null` for callers to substitute
 * their own default (typically `/browse`).
 *
 * Used by both Connect.tsx (gate redirect) and PreparingExperience.tsx
 * (next= param). Keep them in sync — a divergence here is how the
 * /preparing → /preparing redirect-loop bug was originally introduced.
 */
export function sanitizeRedirect(url: string | null | undefined): string | null {
  if (!url) return null;
  // Must be a single-leading-slash relative path. Rejects:
  //   "//evil.com"     (protocol-relative external)
  //   "https://..."    (absolute external)
  //   "javascript:..." (script URL)
  //   "foo"            (no leading slash)
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  if (url === "/" || url === "/connect" || url.startsWith("/preparing")) return null;
  // Note: `/preparing` is matched as a prefix, so any future
  // `/preparing-room` or `/preparing-artist` routes would also be
  // rejected. That's intentional today — the splash family is the
  // entire onboarding handoff surface and should never be a redirect
  // destination — but if a non-onboarding `/preparing-…` route is
  // ever added, switch this to an exact `=== "/preparing"` check.
  return url;
}
