import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Onboarding from "./pages/Onboarding";
import Connect from "./pages/Connect";
import Browse from "./pages/Browse";
import ArtistProfile from "./pages/ArtistProfile";
import AlbumDetail from "./pages/AlbumDetail";
import Listen from "./pages/Listen";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Onboarding />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/artist/:artistId" element={<ArtistProfile />} />
        <Route path="/album/:albumId" element={<AlbumDetail />} />
        <Route path="/listen/:trackId" element={<Listen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
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
