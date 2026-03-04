import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import Onboarding from "./pages/Onboarding";
import Setup from "./pages/Setup";
import Connect from "./pages/Connect";
import Browse from "./pages/Browse";
import ArtistProfile from "./pages/ArtistProfile";
import AlbumDetail from "./pages/AlbumDetail";
import Listen from "./pages/Listen";
import Companion from "./pages/Companion";
import NotFound from "./pages/NotFound";
import { getStoredProfile } from "./hooks/useMusicNerdState";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <>
      <ScrollToTop />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={getStoredProfile() ? <Navigate to="/browse" replace /> : <Onboarding />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/artist/:artistId" element={<ArtistProfile />} />
          <Route path="/album/:albumId" element={<AlbumDetail />} />
          <Route path="/listen/:trackId" element={<Listen />} />
          <Route path="/companion/:trackId" element={<Companion />} />
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
        <AnimatedRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
