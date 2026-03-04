import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { getStoredProfile } from "@/hooks/useMusicNerdState";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

export default function Onboarding() {
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (getStoredProfile()) navigate("/browse", { replace: true });

    // Listen for OAuth callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/setup", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
    } catch (e) {
      console.error("Google sign-in error:", e);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <PageTransition>
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden noise-overlay">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

        <div className="relative z-10 flex flex-col items-center gap-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          >
            <MusicNerdLogo size={120} glow />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-7xl">
              MusicNerd <span className="text-primary">TV</span>
            </h1>
            <p className="max-w-md text-center text-lg text-muted-foreground md:text-xl">
              Transform passive listening into engaged discovery.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-4 flex flex-col items-center gap-3"
          >
            {/* Google Sign-In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="flex items-center gap-3 rounded-xl border border-foreground/15 bg-foreground/5 px-8 py-4 text-base font-semibold text-foreground transition-all hover:bg-foreground/10 hover:border-foreground/30 disabled:opacity-60 tv-focus-visible"
            >
              {signingIn ? (
                <svg className="animate-spin h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {signingIn ? "Signing in…" : "Continue with Google"}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-foreground/10" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-foreground/10" />
            </div>

            {/* Guest / continue without account */}
            <button
              onClick={() => navigate("/setup")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors tv-focus-visible"
            >
              Continue without signing in →
            </button>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
