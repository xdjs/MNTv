import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LogOut } from "lucide-react";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TileRow from "@/components/TileRow";
import SearchOverlay from "@/components/SearchOverlay";
import PageTransition from "@/components/PageTransition";
import { artists as rawArtists, albums, tracks } from "@/mock/tracks";
import { useArtistImages } from "@/hooks/useArtistImages";
import { useUserProfile, tierGreeting, tierBadgeLabel, tierBadgeColor, tierGlowClass } from "@/hooks/useMusicNerdState";

export default function Browse() {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const artists = useArtistImages(rawArtists);
  const { profile, clearProfile } = useUserProfile();
  const tier = profile?.calculatedTier;

  const handleSignOut = () => {
    clearProfile();
    navigate("/", { replace: true });
  };

  // Build tile data
  const artistTiles = useMemo(() => artists.map((a) => ({
    id: a.id,
    imageUrl: a.imageUrl,
    title: a.name,
    subtitle: a.genres[0],
    href: `/artist/${a.id}`,
  })), [artists]);

  const albumTiles = useMemo(() => albums.map((a) => {
    const artist = artists.find((ar) => ar.id === a.artistId);
    return {
      id: a.id,
      imageUrl: a.coverArtUrl,
      title: a.title,
      subtitle: artist?.name || "",
      href: `/album/${a.id}`,
    };
  }), [artists]);

  const recentTiles = useMemo(() => tracks.slice(0, 8).map((t) => ({
    id: t.id,
    imageUrl: t.coverArtUrl,
    title: t.title,
    subtitle: t.artist,
    href: `/listen/${t.id}`,
  })), []);

  const genreSections = useMemo(() => {
    const genres = [...new Set(albums.map((a) => a.genre))];
    return genres.slice(0, 3).map((genre) => ({
      genre,
      tiles: albums
        .filter((a) => a.genre === genre)
        .map((a) => ({
          id: a.id,
          imageUrl: a.coverArtUrl,
          title: a.title,
          subtitle: artists.find((ar) => ar.id === a.artistId)?.name || "",
          href: `/album/${a.id}`,
        })),
    }));
  }, [artists]);

  // Tier-aware deep cuts: shuffle albums to simulate "hidden gems" row
  const deepCutTiles = useMemo(() => [...albumTiles].sort(() => Math.random() - 0.5).slice(0, 8), [albumTiles]);

  // Build rows based on tier
  const allRows = useMemo(() => {
    const baseRows = [
      { label: "Jump Back In", items: recentTiles, size: "md" as const },
    ];

    if (tier === "nerd") {
      // Nerd: genre rows first, then artists, then deep cuts
      return [
        ...baseRows,
        ...genreSections.map((gs) => ({ label: gs.genre, items: gs.tiles, size: "sm" as const })),
        { label: "Artists", items: artistTiles, size: "lg" as const },
        { label: "Deep Cuts", items: deepCutTiles, size: "md" as const },
      ].filter((r) => r.items.length > 0);
    }

    if (tier === "curious") {
      // Curious: standard + "Dig Deeper" hidden gems row
      return [
        ...baseRows,
        { label: "Artists", items: artistTiles, size: "lg" as const },
        { label: "Albums", items: albumTiles, size: "md" as const },
        { label: "Dig Deeper", items: deepCutTiles, size: "sm" as const },
        ...genreSections.map((gs) => ({ label: gs.genre, items: gs.tiles, size: "sm" as const })),
      ].filter((r) => r.items.length > 0);
    }

    // Casual (default)
    return [
      ...baseRows,
      { label: "Artists", items: artistTiles, size: "lg" as const },
      { label: "Albums", items: albumTiles, size: "md" as const },
      ...genreSections.map((gs) => ({ label: gs.genre, items: gs.tiles, size: "sm" as const })),
    ].filter((r) => r.items.length > 0);
  }, [recentTiles, artistTiles, albumTiles, genreSections, deepCutTiles, tier]);

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

  useEffect(() => {
    if (searchOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(rowIndex + 1, allRows.length - 1);
        if (next !== rowIndex) {
          const cx = getCurrentCenterX();
          const targetLabel = allRows[next]?.label;
          if (targetLabel) setColIndex(findClosestColByViewport(targetLabel, cx));
          setRowIndex(next);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(rowIndex - 1, -1);
        if (next !== rowIndex) {
          if (next === -1) {
            const cx = getCurrentCenterX();
            setColIndex(cx > window.innerWidth / 2 ? 1 : 0);
          } else {
            const cx = getCurrentCenterX();
            const targetLabel = allRows[next]?.label;
            if (targetLabel) setColIndex(findClosestColByViewport(targetLabel, cx));
          }
          setRowIndex(next);
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setColIndex((c) => Math.max(0, c - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setColIndex((c) => {
          const max = rowIndex === -1 ? HEADER_ITEMS - 1 : (allRows[rowIndex]?.items.length || 1) - 1;
          return Math.min(c + 1, max);
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (rowIndex === -1) {
          if (colIndex === 1) setSearchOpen(true);
        } else {
          const item = allRows[rowIndex]?.items[colIndex];
          if (item) navigate(item.href);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, rowIndex, colIndex, allRows, navigate, getCurrentCenterX, findClosestColByViewport]);

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
              title="Reset profile"
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
          <p className="mt-1 text-muted-foreground text-lg">What do you want to listen to?</p>
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
