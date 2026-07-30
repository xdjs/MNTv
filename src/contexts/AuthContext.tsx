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
    // 1. Eagerly hydrate from the persisted session (avoids flash and
    //    avoids the case where onAuthStateChange's INITIAL_SESSION
    //    fails to fire — e.g. Supabase auth endpoint timing out
    //    during PKCE exchange, which leaves the app stuck on a
    //    LazyFallback forever.)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      bridgeSpotifyProviderTokens(data.session);
      setLoading(false);
    });

    // 2. Keep state in sync for token refreshes, sign-in, sign-out.
    //    The OAuth-callback race that the prior revision tried to fix
    //    (getSession returning null before PKCE exchange completes,
    //    ProtectedRoute redirecting away before the real session lands)
    //    is acceptable here because the next auth-state change will
    //    overwrite the null with the real session — at worst the user
    //    bounces through /connect briefly. Trading a rare race for a
    //    bug-free initial load.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        bridgeSpotifyProviderTokens(newSession);
        setLoading(false);
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
