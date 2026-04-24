import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import Companion from "./pages/Companion";
import CompanionShortRedirect from "./pages/CompanionShortRedirect";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages (behind auth or heavy; not on critical QR-scan path)
const Connect = lazy(() => import("./pages/Connect"));
const Browse = lazy(() => import("./pages/Browse"));
const ArtistProfile = lazy(() => import("./pages/ArtistProfile"));
const AlbumDetail = lazy(() => import("./pages/AlbumDetail"));
const Listen = lazy(() => import("./pages/Listen"));
const Profile = lazy(() => import("./pages/Profile"));
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import { StoriesProvider } from "./contexts/StoriesContext";
import NowPlayingBar from "./components/NowPlayingBar";
import SpotifyReconnectBanner from "./components/SpotifyReconnectBanner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ProtectedRoute, RootRoute, LazyFallback } from "./routes";

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

// ProtectedRoute, RootRoute, LazyFallback live in `src/routes.tsx` so
// unit tests can import the real implementations.

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

            {/* Protected — requires a Supabase session */}
            <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
            <Route path="/artist/:artistId" element={<ProtectedRoute><ArtistProfile /></ProtectedRoute>} />
            <Route path="/album/:albumId" element={<ProtectedRoute><AlbumDetail /></ProtectedRoute>} />
            <Route path="/listen/*" element={<ProtectedRoute><Listen /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

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
            <StoriesProvider>
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
              <SpotifyReconnectBanner />
            </ErrorBoundary>
            </StoriesProvider>
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
