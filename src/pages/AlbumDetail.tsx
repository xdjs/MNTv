import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getAlbumById, getTracksForAlbum, getArtistById } from "@/mock/tracks";
import PageTransition from "@/components/PageTransition";

export default function AlbumDetail() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const album = getAlbumById(albumId || "");
  const artist = album ? getArtistById(album.artistId) : undefined;
  const albumTracks = album ? getTracksForAlbum(album.id) : [];

  // Zones: 'back' (back button), 'artist' (artist link), 'tracks' (track list)
  type ZoneType = "back" | "artist" | "tracks";
  const [zone, setZone] = useState<ZoneType>("back");
  const [colIndex, setColIndex] = useState(0);

  const zoneOrder = useMemo((): ZoneType[] => {
    const z: ZoneType[] = ["back"];
    if (artist) z.push("artist");
    if (albumTracks.length > 0) z.push("tracks");
    return z;
  }, [artist, albumTracks.length]);

  const clampCol = useCallback(
    (z: ZoneType, col: number) => {
      if (z === "tracks") return Math.max(0, Math.min(col, albumTracks.length - 1));
      return 0;
    },
    [albumTracks.length]
  );

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
        if (zone === "back") {
          navigate(-1);
        } else if (zone === "artist" && artist) {
          navigate(`/artist/${artist.id}`);
        } else if (zone === "tracks") {
          const track = albumTracks[colIndex];
          if (track) navigate(`/listen/${track.id}`);
        }
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        navigate(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zone, colIndex, zoneOrder, clampCol, navigate, artist, albumTracks]);

  if (!album) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-foreground">Album not found.</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={album.coverArtUrl}
              alt=""
              className="h-full w-full object-cover blur-[20px] scale-125 brightness-[0.3]"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className={`relative z-10 m-8 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
              zone === "back" ? "tv-focus-glow scale-110" : ""
            }`}
          >
            <ArrowLeft size={20} />
          </button>

          {/* Album info */}
          <div className="relative z-10 flex items-end gap-8 px-10 pb-10">
            <img
              src={album.coverArtUrl}
              alt={album.title}
              className="h-48 w-48 rounded-2xl shadow-2xl object-cover"
            />
            <div className="pb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Album · {album.year}
              </p>
              <h1
                className="text-4xl font-black text-foreground leading-tight md:text-5xl"
                style={{ fontFamily: "'Nunito Sans', sans-serif" }}
              >
                {album.title}
              </h1>
              {artist && (
                <button
                  onClick={() => navigate(`/artist/${artist.id}`)}
                  className={`mt-2 text-sm font-bold text-primary transition-all ${
                    zone === "artist" ? "tv-focus-glow underline" : "hover:underline"
                  }`}
                  style={{ fontFamily: "'Nunito Sans', sans-serif" }}
                >
                  {artist.name}
                </button>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {album.genre} · {albumTracks.length} tracks
              </p>
            </div>
          </div>
        </div>

        {/* Track list */}
        <div className="px-10 py-8">
          <div className="space-y-1">
            {albumTracks.map((t, i) => (
              <button
                key={t.id}
                onClick={() => navigate(`/listen/${t.id}`)}
                className={`flex w-full items-center gap-4 rounded-xl p-3 transition-all text-left ${
                  zone === "tracks" && colIndex === i
                    ? "tv-focus-glow bg-foreground/5"
                    : "hover:bg-foreground/5"
                }`}
              >
                <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.floor(t.durationSec / 60)}:
                  {String(t.durationSec % 60).padStart(2, "0")}
                </span>
              </button>
            ))}
          </div>

          {albumTracks.length === 0 && (
            <p className="text-muted-foreground">No tracks available for this album yet.</p>
          )}
        </div>

        <div className="h-20" />
      </div>
    </PageTransition>
  );
}
