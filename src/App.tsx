import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import Onboarding from "./pages/Onboarding";
import Connect from "./pages/Connect";
import Browse from "./pages/Browse";
import ArtistProfile from "./pages/ArtistProfile";
import AlbumDetail from "./pages/AlbumDetail";
import Listen from "./pages/Listen";
import Companion from "./pages/Companion";
import CompanionShortRedirect from "./pages/CompanionShortRedirect";
import SpotifyCallback from "./pages/SpotifyCallback";
import NotFound from "./pages/NotFound";
import { getStoredProfile } from "./hooks/useMusicNerdState";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import NowPlayingBar from "./components/NowPlayingBar";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * ProtectedRoute — requires a valid Supabase session AND a completed profile.
 *
 * No session  → /connect (sign in first)
 * No profile  → /connect (complete onboarding first)
 * Both ✓      → render children
 *
 * Renders nothing while the initial session check is in flight to avoid
 * a flash of the wrong screen.
 */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  const redirectTo = `/connect?redirect=${encodeURIComponent(location.pathname)}`;

  // Must be signed in
  if (!session) return <Navigate to={redirectTo} replace />;

  // Must have completed onboarding (profile saved)
  if (!getStoredProfile()) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}

/**
 * RootRoute — decides between Onboarding and Browse.
 *
 * Signed-in + profile → /browse (skip onboarding)
 * Signed-in, no profile → /connect (finish setup)
 * Not signed in → Onboarding
 */
function RootRoute() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (session) {
    // Already set up → go straight to Browse
    if (getStoredProfile()) return <Navigate to="/browse" replace />;
    // Signed in but no profile → finish onboarding
    return <Navigate to="/connect" replace />;
  }

  return <Onboarding />;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <>
      <ScrollToTop />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public */}
          <Route path="/" element={<RootRoute />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/spotify-callback" element={<SpotifyCallback />} />

          {/* Protected — requires Supabase session + completed onboarding */}
          <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
          <Route path="/artist/:artistId" element={<ProtectedRoute><ArtistProfile /></ProtectedRoute>} />
          <Route path="/album/:albumId" element={<ProtectedRoute><AlbumDetail /></ProtectedRoute>} />
          <Route path="/listen/:trackId" element={<ProtectedRoute><Listen /></ProtectedRoute>} />

          {/* Companion — public, no login required (scanned on phone via QR) */}
          <Route path="/companion/:trackId" element={<Companion />} />
          <Route path="/c/:shortId" element={<CompanionShortRedirect />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PlayerProvider>
            <AnimatedRoutes />
            <NowPlayingBar />
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
