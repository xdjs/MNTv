import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getArtistById, getAlbumsForArtist, getTracksForArtist, artists } from "@/mock/tracks";
import PageTransition from "@/components/PageTransition";
import TileRow from "@/components/TileRow";
import { useArtistImage } from "@/hooks/useArtistImage";

export default function ArtistProfile() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const artist = getArtistById(artistId || "");
  const heroImage = useArtistImage(artist?.name || "", artist?.imageUrl || "");

  if (!artist) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-foreground">Artist not found.</p>
        </div>
      </PageTransition>
    );
  }

  const albumsData = getAlbumsForArtist(artist.id);
  const tracksData = getTracksForArtist(artist.id);
  const related = artist.relatedArtistIds
    .map((id) => artists.find((a) => a.id === id))
    .filter(Boolean) as typeof artists;

  const albumTiles = albumsData.map((a) => ({
    id: a.id,
    imageUrl: a.coverArtUrl,
    title: a.title,
    subtitle: String(a.year),
    href: `/album/${a.id}`,
  }));

  const relatedTiles = related.map((a) => ({
    id: a.id,
    imageUrl: a.imageUrl,
    title: a.name,
    subtitle: a.genres[0],
    href: `/artist/${a.id}`,
  }));

  return (
    <PageTransition>
      <ArtistProfileInner
        artist={artist}
        heroImage={heroImage}
        tracksData={tracksData}
        albumTiles={albumTiles}
        relatedTiles={relatedTiles}
        navigate={navigate}
      />
    </PageTransition>
  );
}

interface InnerProps {
  artist: ReturnType<typeof getArtistById> & {};
  heroImage: string;
  tracksData: ReturnType<typeof getTracksForArtist>;
  albumTiles: { id: string; imageUrl: string; title: string; subtitle: string; href: string }[];
  relatedTiles: { id: string; imageUrl: string; title: string; subtitle: string; href: string }[];
  navigate: ReturnType<typeof useNavigate>;
}

function ArtistProfileInner({ artist, heroImage, tracksData, albumTiles, relatedTiles, navigate }: InnerProps) {
  // Zones: header(back button), tracks, discography tiles, related tiles
  // header has 1 item (back)
  // tracks has tracksData.length items
  // discography/related are tile rows

  const tileRows = useMemo(() => {
    const rows: { label: string; items: typeof albumTiles; tileSize: "sm" | "md" | "lg" }[] = [];
    if (albumTiles.length > 0) rows.push({ label: "Discography", items: albumTiles, tileSize: "md" });
    if (relatedTiles.length > 0) rows.push({ label: "Fans Also Like", items: relatedTiles, tileSize: "lg" });
    return rows;
  }, [albumTiles, relatedTiles]);

  // Zone indices: -1 = header (back), 0..tracksData.length-1 = tracks, then tile row zones
  // We simplify: zones = ['header', 'tracks', ...tileRowLabels]
  type ZoneType = 'header' | 'tracks' | number; // number = tileRow index
  const [zone, setZone] = useState<ZoneType>('header');
  const [colIndex, setColIndex] = useState(0);

  const zoneOrder = useMemo((): ZoneType[] => {
    const z: ZoneType[] = ['header'];
    if (tracksData.length > 0) z.push('tracks');
    tileRows.forEach((_, i) => z.push(i));
    return z;
  }, [tracksData.length, tileRows]);

  const clampCol = useCallback((z: ZoneType, col: number) => {
    if (z === 'header') return 0;
    if (z === 'tracks') return Math.max(0, Math.min(col, tracksData.length - 1));
    if (typeof z === 'number') return Math.max(0, Math.min(col, (tileRows[z]?.items.length || 1) - 1));
    return 0;
  }, [tracksData.length, tileRows]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.min(idx + 1, zoneOrder.length - 1);
          const nextZone = zoneOrder[next];
          setColIndex((c) => clampCol(nextZone, c));
          return nextZone;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.max(idx - 1, 0);
          const nextZone = zoneOrder[next];
          setColIndex((c) => clampCol(nextZone, c));
          return nextZone;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setColIndex((c) => Math.max(0, c - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setColIndex((c) => clampCol(zone, c + 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (zone === 'header') {
          navigate("/browse");
        } else if (zone === 'tracks') {
          const track = tracksData[colIndex];
          if (track) navigate(`/listen/${track.id}`);
        } else if (typeof zone === 'number') {
          const item = tileRows[zone]?.items[colIndex];
          if (item) navigate(item.href);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zone, colIndex, zoneOrder, clampCol, navigate, tracksData, tileRows]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-80 overflow-hidden">
        <img
          src={heroImage}
          alt={artist.name}
          className="h-full w-full object-cover blur-[8px] scale-110 brightness-[0.4]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate("/browse")}
          className={`absolute top-8 left-10 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
            zone === 'header' ? "tv-focus-glow scale-110" : ""
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        {/* Artist info */}
        <div className="absolute bottom-8 left-10 right-10 z-10">
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {artist.genres.join(" · ")}
          </p>
          <h1
            className="text-5xl font-black text-foreground leading-none md:text-6xl lg:text-7xl"
            style={{ fontFamily: "'Nunito Sans', sans-serif" }}
          >
            {artist.name}
          </h1>
        </div>
      </div>

      {/* Bio */}
      <div className="px-10 py-8">
        <p className="max-w-2xl text-base leading-relaxed text-foreground/70">{artist.bio}</p>
      </div>

      {/* Popular tracks */}
      <section className="px-10 mb-8">
        <h2 className="text-lg font-bold text-foreground/90 mb-4" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
          Popular
        </h2>
        <div className="space-y-1">
          {tracksData.map((t, i) => (
            <button
              key={t.id}
              onClick={() => navigate(`/listen/${t.id}`)}
              className={`flex w-full items-center gap-4 rounded-xl p-3 transition-all hover:bg-foreground/5 text-left ${
                zone === 'tracks' && colIndex === i ? "tv-focus-glow bg-foreground/5" : ""
              }`}
            >
              <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <img src={t.coverArtUrl} alt={t.title} className="h-10 w-10 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground truncate">{t.album}</p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.floor(t.durationSec / 60)}:{String(t.durationSec % 60).padStart(2, "0")}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Tile rows */}
      {tileRows.map((row, i) => (
        <TileRow
          key={row.label}
          label={row.label}
          items={row.items}
          tileSize={row.tileSize}
          focusedIndex={zone === i ? colIndex : null}
        />
      ))}

      <div className="h-20" />
    </div>
  );
}
