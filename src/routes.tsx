/**
 * Route gate components for `/` and anything protected.
 *
 * Extracted out of App.tsx so unit tests (`src/test/AppRoutes.test.tsx`)
 * can exercise the real implementations instead of a local
 * reimplementation. Keep this file small — it should only contain the
 * gate logic itself, not the route table.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import Onboarding from "@/pages/Onboarding";

/** Small fallback shown during lazy-route Suspense + auth hydration. */
export function LazyFallback() {
  return <div className="min-h-screen bg-background" />;
}

/**
 * ProtectedRoute — requires both a Supabase session AND a local
 * profile (tier selected). Two-step triage:
 *
 *   - no session → /connect (sign in first; ?redirect= preserves the
 *     target so the user lands back where they started after OAuth +
 *     tier select)
 *   - session, no profile → /connect (the mid-onboarding state: Apple
 *     Music anonymous session or a Spotify user who closed the tab
 *     before tier pick; same ?redirect= behavior)
 *   - session + profile → render the protected content
 *
 * The session-alone gate was considered and rejected: Browse.tsx and
 * Listen.tsx dereference profile fields (`calculatedTier`, taste data)
 * and would crash on a direct-navigation bookmark from a mid-onboarding
 * user. Enforcing at the route gate closes that class of bug without
 * per-page null checks.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, loading } = useAuth();
  const { profile } = useUserProfile();
  if (loading) return <LazyFallback />;
  if (!session || !profile) {
    const redirect = encodeURIComponent(location.pathname);
    return <Navigate to={`/connect?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

/**
 * RootRoute — triages signed-in users between `/browse` and `/connect`.
 *
 * Reads the profile via `useUserProfile` so the redirect is reactive:
 * when `handleTierSelect` saves the profile and dispatches the updated
 * event, this effect re-evaluates and pulls the user forward to
 * `/browse` on the next render. Prior sync `getStoredProfile()` reads
 * weren't reactive — they relied on Connect.tsx calling `navigate()`
 * explicitly, which was fragile on error paths.
 *
 * Behavior:
 *   - loading    → spinner
 *   - no session → Onboarding
 *   - session + profile → /browse
 *   - session no profile → /connect (tier-less user finishes onboarding)
 */
export function RootRoute() {
  const { session, loading } = useAuth();
  const { profile } = useUserProfile();
  if (loading) return <LazyFallback />;
  if (!session) return <Onboarding />;
  return <Navigate to={profile ? "/browse" : "/connect"} replace />;
}
