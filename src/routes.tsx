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
 * ProtectedRoute — requires a Supabase session. Profile (tier selected)
 * is deliberately NOT the gate: an anonymous Apple Music user or a
 * mid-onboarding Spotify user both have a session without a profile
 * and must still be allowed past so they can finish onboarding. Cross-
 * device progression works because the session follows the user, not
 * a device's localStorage.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, loading } = useAuth();
  if (loading) return <LazyFallback />;
  if (!session) {
    return <Navigate to={`/connect?redirect=${encodeURIComponent(location.pathname)}`} replace />;
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
