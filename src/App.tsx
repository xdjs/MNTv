import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import Onboarding from "./pages/Onboarding";
import Companion from "./pages/Companion";
import CompanionShortRedirect from "./pages/CompanionShortRedirect";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages (behind auth or heavy; not on critical QR-scan path)
const Connect = lazy(() => import("./pages/Connect"));
const Browse = lazy(() => import("./pages/Browse"));
const ArtistProfile = lazy(() => import("./pages/ArtistProfile"));
const AlbumDetail = lazy(() => import("./pages/AlbumDetail"));
const Listen = lazy(() => import("./pages/Listen"));
const SpotifyCallback = lazy(() => import("./pages/SpotifyCallback"));
import { getStoredProfile } from "./hooks/useMusicNerdState";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import NowPlayingBar from "./components/NowPlayingBar";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Don't scroll to top for track-to-track navigation within Listen
    if (pathname.startsWith("/listen/")) return;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** ProtectedRoute — requires a completed profile (localStorage). */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!getStoredProfile()) {
    return <Navigate to={`/connect?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

/** RootRoute — profile exists → /browse, otherwise → Onboarding. */
function RootRoute() {
  if (getStoredProfile()) return <Navigate to="/browse" replace />;
  return <Onboarding />;
}

function LazyFallback() {
  return <div className="min-h-screen bg-background" />;
}

function AnimatedRoutes() {
  const location = useLocation();
  // Use a stable key for /listen/* routes so track-to-track navigation
  // is a smooth state update, not a full unmount/remount of the component tree.
  const routeKey = location.pathname.startsWith("/listen/") ? "/listen" : location.pathname;
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<LazyFallback />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={routeKey}>
            {/* Public */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/spotify-callback" element={<SpotifyCallback />} />

            {/* Protected — requires completed profile */}
            <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
            <Route path="/artist/:artistId" element={<ProtectedRoute><ArtistProfile /></ProtectedRoute>} />
            <Route path="/album/:albumId" element={<ProtectedRoute><AlbumDetail /></ProtectedRoute>} />
            <Route path="/listen/*" element={<ProtectedRoute><Listen /></ProtectedRoute>} />

            {/* Companion — eagerly loaded (QR-scanned on mobile, must be instant) */}
            <Route path="/companion/:trackId" element={<Companion />} />
            <Route path="/c/:shortId" element={<CompanionShortRedirect />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
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
            <ErrorBoundary fallback={
              <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                  <p className="text-lg font-bold text-foreground">Something went wrong</p>
                  <p className="text-sm text-muted-foreground">Try refreshing the page.</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-2 px-5 py-2 rounded-full bg-primary/20 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            }>
              <AnimatedRoutes />
              <NowPlayingBar />
            </ErrorBoundary>
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
