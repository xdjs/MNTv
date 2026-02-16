import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getArtistById, getAlbumsForArtist, getTracksForArtist, artists } from "@/mock/tracks";
import PageTransition from "@/components/PageTransition";
import TileRow from "@/components/TileRow";

export default function ArtistProfile() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const artist = getArtistById(artistId || "");

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
      <div className="min-h-screen bg-background">
        {/* Hero */}
        <div className="relative h-80 overflow-hidden">
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="h-full w-full object-cover blur-[8px] scale-110 brightness-[0.4]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

          {/* Back button */}
          <button
            onClick={() => navigate("/browse")}
            className="absolute top-8 left-10 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-colors hover:bg-foreground/20"
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
                className="flex w-full items-center gap-4 rounded-xl p-3 transition-colors hover:bg-foreground/5 text-left"
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

        {/* Albums */}
        <TileRow label="Discography" items={albumTiles} tileSize="md" />

        {/* Related artists */}
        {relatedTiles.length > 0 && (
          <TileRow label="Fans Also Like" items={relatedTiles} tileSize="lg" />
        )}

        <div className="h-20" />
      </div>
    </PageTransition>
  );
}
