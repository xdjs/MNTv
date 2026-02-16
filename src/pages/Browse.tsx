import { useState } from "react";
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
  const artistTiles = artists.map((a) => ({
    id: a.id,
    imageUrl: a.imageUrl,
    title: a.name,
    subtitle: a.genres[0],
    href: `/artist/${a.id}`,
  }));

  const albumTiles = albums.map((a) => {
    const artist = artists.find((ar) => ar.id === a.artistId);
    return {
      id: a.id,
      imageUrl: a.coverArtUrl,
      title: a.title,
      subtitle: artist?.name || "",
      href: `/album/${a.id}`,
    };
  });

  const recentTiles = tracks.slice(0, 8).map((t) => ({
    id: t.id,
    imageUrl: t.coverArtUrl,
    title: t.title,
    subtitle: t.artist,
    href: `/listen/${t.id}`,
  }));

  // Genre grouping
  const genres = [...new Set(albums.map((a) => a.genre))];
  const genreSections = genres.slice(0, 3).map((genre) => ({
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

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-10 pt-8 pb-6">
          <MusicNerdLogo size={36} glow className="opacity-80" />
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-5 text-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground tv-focus-visible"
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
        <TileRow label="Jump Back In" items={recentTiles} tileSize="md" />
        <TileRow label="Artists" items={artistTiles} tileSize="lg" />
        <TileRow label="Albums" items={albumTiles} tileSize="md" />

        {genreSections.map((gs) => (
          <TileRow key={gs.genre} label={gs.genre} items={gs.tiles} tileSize="sm" />
        ))}

        {/* Bottom spacing */}
        <div className="h-20" />

        {/* Search overlay */}
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </PageTransition>
  );
}
