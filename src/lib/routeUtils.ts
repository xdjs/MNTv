/**
 * Reject non-content destinations from `?redirect=` / `?next=` params
 * so we never loop the user back through the onboarding funnel.
 *
 * Rejected:
 *   - `/connect` — the page reading the param; would self-loop
 *   - `/preparing` — the splash; auto-advances elsewhere, looping
 *     here means the splash hands off to itself after readiness
 *   - `/` — the root router, which re-routes back to /connect or
 *     /browse, so honoring it as a destination is meaningless
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
  if (url === "/" || url === "/connect" || url.startsWith("/preparing")) return null;
  return url;
}
