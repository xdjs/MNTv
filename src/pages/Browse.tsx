import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TileRow from "@/components/TileRow";
import SearchOverlay from "@/components/SearchOverlay";
import PageTransition from "@/components/PageTransition";
import { artists as rawArtists, albums, tracks } from "@/mock/tracks";
import { useArtistImages } from "@/hooks/useArtistImages";

export default function Browse() {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const artists = useArtistImages(rawArtists);

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

  // All navigable rows: header(row 0), then tile rows
  // Header items: logo(0), search(1)
  // Row structure: [{items, getHref}]
  const allRows = useMemo(() => {
    const tileRows = [
      { label: "Jump Back In", items: recentTiles },
      { label: "Artists", items: artistTiles },
      { label: "Albums", items: albumTiles },
      ...genreSections.map((gs) => ({ label: gs.genre, items: gs.tiles })),
    ].filter((r) => r.items.length > 0);
    return tileRows;
  }, [recentTiles, artistTiles, albumTiles, genreSections]);

  // Focus state: rowIndex (-1 = header), colIndex
  const [rowIndex, setRowIndex] = useState(-1);
  const [colIndex, setColIndex] = useState(0);

  const HEADER_ITEMS = 2; // logo, search

  const clampCol = useCallback((row: number, col: number) => {
    if (row === -1) return Math.max(0, Math.min(col, HEADER_ITEMS - 1));
    const rowItems = allRows[row]?.items.length || 1;
    return Math.max(0, Math.min(col, rowItems - 1));
  }, [allRows]);

  useEffect(() => {
    if (searchOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setRowIndex((r) => {
          const next = Math.min(r + 1, allRows.length - 1);
          setColIndex((c) => clampCol(next, c));
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setRowIndex((r) => {
          const next = Math.max(r - 1, -1);
          setColIndex((c) => clampCol(next, c));
          return next;
        });
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
          // colIndex 0 = logo, no action
        } else {
          const item = allRows[rowIndex]?.items[colIndex];
          if (item) navigate(item.href);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, rowIndex, colIndex, allRows, clampCol, navigate]);

  const focusGlow = "tv-focus-glow";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-10 pt-8 pb-6">
          <div className={`rounded-full transition-all ${rowIndex === -1 && colIndex === 0 ? focusGlow + " scale-110" : ""}`}>
            <MusicNerdLogo size={36} glow className="opacity-80" />
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className={`flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-5 text-sm text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
              rowIndex === -1 && colIndex === 1 ? focusGlow + " scale-105" : ""
            }`}
          >
            <Search size={16} />
            <span style={{ fontFamily: "'Nunito Sans', sans-serif" }}>Search</span>
          </button>
        </header>

        {/* Hero greeting */}
        <div className="px-10 mb-8">
          <h1
            className="text-4xl font-black text-foreground tracking-tight md:text-5xl"
            style={{ fontFamily: "'Nunito Sans', sans-serif" }}
          >
            Good evening
          </h1>
          <p className="mt-1 text-muted-foreground text-lg">What do you want to listen to?</p>
        </div>

        {/* Rows */}
        {allRows.map((row, i) => (
          <TileRow
            key={row.label}
            label={row.label}
            items={row.items}
            tileSize={row.label === "Artists" ? "lg" : row.label === "Jump Back In" || row.label === "Albums" ? "md" : "sm"}
            focusedIndex={rowIndex === i ? colIndex : null}
          />
        ))}

        {/* Bottom spacing */}
        <div className="h-20" />

        {/* Search overlay */}
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </PageTransition>
  );
}
