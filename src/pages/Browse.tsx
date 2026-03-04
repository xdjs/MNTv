import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LogOut } from "lucide-react";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TileRow from "@/components/TileRow";
import SearchOverlay from "@/components/SearchOverlay";
import PageTransition from "@/components/PageTransition";
import { useUserProfile, tierGreeting, tierBadgeLabel, tierBadgeColor, tierGlowClass } from "@/hooks/useMusicNerdState";
import { usePersonalizedCatalog } from "@/hooks/usePersonalizedCatalog";
import { useTierAccent } from "@/hooks/useTierAccent";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function Browse() {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { profile, clearProfile } = useUserProfile();
  const tier = profile?.calculatedTier;

  useTierAccent();

  const { rows: allRows } = usePersonalizedCatalog(profile);
  const { isGuest } = useAuth();

  const handleSignOut = async () => {
    // Sign out of Supabase (best-effort — always clear local state afterward)
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase sign-out error (ignored):", err);
    } finally {
      clearProfile();
      navigate("/", { replace: true });
    }
  };

  // Focus state: rowIndex (-1 = header), colIndex
  const [rowIndex, setRowIndex] = useState(-1);
  const [colIndex, setColIndex] = useState(0);

  const HEADER_ITEMS = 2;

  const findClosestColByViewport = useCallback((targetRowLabel: string, currentCenterX: number) => {
    const tiles = document.querySelectorAll<HTMLElement>(`[data-tile-row="${targetRowLabel}"]`);
    let bestCol = 0;
    let bestDist = Infinity;
    tiles.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const dist = Math.abs(cx - currentCenterX);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = parseInt(el.dataset.tileCol || "0", 10);
      }
    });
    return bestCol;
  }, []);

  const getCurrentCenterX = useCallback(() => {
    if (rowIndex === -1) return window.innerWidth / 2;
    const label = allRows[rowIndex]?.label;
    if (!label) return window.innerWidth / 2;
    const el = document.querySelector<HTMLElement>(`[data-tile-row="${label}"][data-tile-col="${colIndex}"]`);
    if (!el) return window.innerWidth / 2;
    const rect = el.getBoundingClientRect();
    return rect.left + rect.width / 2;
  }, [rowIndex, colIndex, allRows]);

  const focusGlow = "tv-focus-glow";
  const glowClass = tier ? tierGlowClass(tier) : "";
  const badgeColor = tier ? tierBadgeColor(tier) : "";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-10 pt-8 pb-6">
          <div className={`rounded-full transition-all ${rowIndex === -1 && colIndex === 0 ? focusGlow + " scale-110" : ""}`}>
            <MusicNerdLogo size={36} glow className="opacity-80" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              className={`flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-5 text-sm text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
                rowIndex === -1 && colIndex === 1 ? focusGlow + " scale-105" : ""
              }`}
            >
              <Search size={16} />
              <span style={{ fontFamily: "'Nunito Sans', sans-serif" }}>Search</span>
            </button>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Hero greeting */}
        <div className={`mx-10 mb-8 px-5 py-4 rounded-2xl ${glowClass}`}>
          <div className="flex items-center gap-3">
            <h1
              className="text-4xl font-black text-foreground tracking-tight md:text-5xl"
              style={{ fontFamily: "'Nunito Sans', sans-serif" }}
            >
              {tierGreeting(tier)}
            </h1>
            {tier && (
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeColor}`}>
                ● {tierBadgeLabel(tier)}
              </span>
            )}
          </div>
          <p className="mt-1 text-muted-foreground text-lg">
            {profile?.streamingService
              ? `Listening via ${profile.streamingService}`
              : "What do you want to listen to?"}
          </p>
        </div>

        {/* Rows */}
        {allRows.map((row, i) => (
          <TileRow
            key={row.label}
            label={row.label}
            items={row.items}
            tileSize={row.size}
            focusedIndex={rowIndex === i ? colIndex : null}
          />
        ))}

        <div className="h-20" />

        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </PageTransition>
  );
}
