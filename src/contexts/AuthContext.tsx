/**
 * AuthContext — Single source of truth for Supabase auth state.
 *
 * Wraps supabase.auth.onAuthStateChange so every component in the tree
 * gets reactive session/user state without polling localStorage or making
 * ad-hoc getSession() calls.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bridgeSpotifyProviderTokens } from "@/lib/spotifyTokenStore";

interface AuthContextValue {
  /** Current Supabase session (null while loading or signed out) */
  session: Session | null;
  /** Convenience: session?.user ?? null */
  user: User | null;
  /** True while the initial session check is in flight */
  loading: boolean;
  /** True when there is NO active Supabase session (guest/anonymous user) */
  isGuest: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  isGuest: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe FIRST so the INITIAL_SESSION event reaches us. v2's
    // onAuthStateChange fires INITIAL_SESSION exactly once when the
    // subscription is created — with the post-URL-parse session (i.e.
    // AFTER PKCE code → session exchange has run). Using it as the
    // auth-loading-complete signal avoids the race that:
    //
    //   1. Browser lands on /preparing?code=XXX (OAuth callback)
    //   2. Old code called getSession() synchronously — returned null
    //      because the PKCE exchange is still in flight
    //   3. AuthContext flipped loading=false with session=null
    //   4. ProtectedRoute fired <Navigate to="/connect?redirect=..."/>
    //   5. URL changed — `?code=` is gone
    //   6. Supabase's async exchange tried to read the code, saw nothing,
    //      session never created → user sees "sign in again"
    //
    // Slow networks / browsers were the most likely to lose this race;
    // a Pete-on-fast-Mac vs boss-on-different-setup difference matches
    // exactly the symptom report.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        bridgeSpotifyProviderTokens(newSession);
        // First emission flips loading off. Subsequent events (token
        // refresh, sign-in, sign-out) shouldn't touch it — gating
        // here keeps the semantics clean and protects against any
        // future code that re-enables loading=true.
        setLoading((prev) => (prev ? false : prev));
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    isGuest: !session?.user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook: consume reactive auth state anywhere in the tree. */
export function useAuth() {
  return useContext(AuthContext);
}
