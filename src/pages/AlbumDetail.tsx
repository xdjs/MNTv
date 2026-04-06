import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getAlbumById, getTracksForAlbum, getArtistById } from "@/mock/tracks";
import { supabase } from "@/integrations/supabase/client";
import PageTransition from "@/components/PageTransition";
import { isSpotifyPrefix, parseSpotifyAlbum } from "@/lib/routeParsing";

// ── Types for Spotify album data ─────────────────────────────────────

interface SpotifyTrack {
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  uri: string;
  durationMs: number;
  trackNumber: number;
}

interface SpotifyAlbumData {
  found: boolean;
  album: {
    id: string;
    name: string;
    imageUrl: string;
    releaseDate: string;
    albumType: string;
    totalTracks: number;
    artist: { id: string; name: string };
    label: string;
  };
  tracks: SpotifyTrack[];
}

// ── Main component ───────────────────────────────────────────────────

export default function AlbumDetail() {
  const { albumId: rawAlbumId } = useParams<{ albumId: string }>();

  const isSpotifyAlbum = isSpotifyPrefix(rawAlbumId);

  const parsedSpotify = useMemo(() => {
    if (!rawAlbumId) return null;
    return parseSpotifyAlbum(rawAlbumId);
  }, [rawAlbumId]);

  if (isSpotifyAlbum && parsedSpotify?.spotifyAlbumId) {
    return (
      <PageTransition>
        <SpotifyAlbumDetail
          albumId={parsedSpotify.spotifyAlbumId}
          artistName={parsedSpotify.artistName}
          artistSpotifyId={parsedSpotify.artistSpotifyId}
        />
      </PageTransition>
    );
  }

  // Mock album (existing behavior)
  const album = getAlbumById(rawAlbumId || "");
  const artist = album ? getArtistById(album.artistId) : undefined;
  const albumTracks = album ? getTracksForAlbum(album.id) : [];

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
      <MockAlbumInner album={album} artist={artist} albumTracks={albumTracks} />
    </PageTransition>
  );
}

// ── Spotify album detail ─────────────────────────────────────────────

function SpotifyAlbumDetail({
  albumId,
  artistName,
  artistSpotifyId,
}: {
  albumId: string;
  artistName: string;
  artistSpotifyId: string;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<SpotifyAlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase.functions
      .invoke("spotify-album", { body: { albumId } })
      .then(({ data: d, error: e }) => {
        if (cancelled) return;
        if (e || !d?.found) {
          setError("Couldn't load this album from Spotify.");
          setLoading(false);
          return;
        }
        setData(d as SpotifyAlbumData);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load album.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [albumId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading album...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-4">
        <p className="text-foreground">{error || "Album not found."}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground">
          Go back
        </button>
      </div>
    );
  }

  const { album, tracks } = data;
  const resolvedArtistName = album.artist.name || artistName;
  const resolvedArtistId = album.artist.id || artistSpotifyId;

  return (
    <SpotifyAlbumInner
      album={album}
      tracks={tracks}
      artistName={resolvedArtistName}
      artistSpotifyId={resolvedArtistId}
    />
  );
}

// ── Spotify album inner (keyboard nav) ───────────────────────────────

function SpotifyAlbumInner({
  album,
  tracks,
  artistName,
  artistSpotifyId,
}: {
  album: SpotifyAlbumData["album"];
  tracks: SpotifyTrack[];
  artistName: string;
  artistSpotifyId: string;
}) {
  const navigate = useNavigate();
  const trackRefs = useRef<(HTMLButtonElement | null)[]>([]);

  type ZoneType = "back" | "artist" | "tracks";
  const [zone, setZone] = useState<ZoneType>("back");
  const [colIndex, setColIndex] = useState(0);

  const zoneOrder = useMemo((): ZoneType[] => {
    const z: ZoneType[] = ["back"];
    if (artistSpotifyId) z.push("artist");
    if (tracks.length > 0) z.push("tracks");
    return z;
  }, [artistSpotifyId, tracks.length]);

  const clampCol = useCallback(
    (z: ZoneType, col: number) => {
      if (z === "tracks") return Math.max(0, Math.min(col, tracks.length - 1));
      return 0;
    },
    [tracks.length]
  );

  useEffect(() => {
    if (zone === "tracks" && trackRefs.current[colIndex]) {
      trackRefs.current[colIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [zone, colIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (zone === "tracks" && colIndex < tracks.length - 1) {
          setColIndex((c) => c + 1);
          return;
        }
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.min(idx + 1, zoneOrder.length - 1);
          const nextZone = zoneOrder[next];
          setColIndex((c) => clampCol(nextZone, c));
          return nextZone;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (zone === "tracks" && colIndex > 0) {
          setColIndex((c) => c - 1);
          return;
        }
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.max(idx - 1, 0);
          const nextZone = zoneOrder[next];
          if (nextZone === "tracks") setColIndex(tracks.length - 1);
          else setColIndex(0);
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
        } else if (zone === "artist") {
          navigate(`/artist/spotify::${artistSpotifyId}::${encodeURIComponent(artistName)}`);
        } else if (zone === "tracks") {
          const t = tracks[colIndex];
          if (t?.uri) {
            const href = `/listen/real::${encodeURIComponent(t.artist)}::${encodeURIComponent(t.title)}::${encodeURIComponent(t.album)}::${encodeURIComponent(t.uri)}`;
            navigate(href);
          }
        }
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        navigate(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zone, colIndex, zoneOrder, clampCol, navigate, tracks, artistName, artistSpotifyId]);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={album.imageUrl}
            alt=""
            className="h-full w-full object-cover blur-[20px] scale-125 brightness-[0.3]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className={`relative z-10 m-8 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
            zone === "back" ? "tv-focus-glow scale-110" : ""
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8 px-4 md:px-10 pb-6 md:pb-10">
          <img
            src={album.imageUrl}
            alt={album.name}
            className="h-36 w-36 md:h-48 md:w-48 rounded-2xl shadow-2xl object-cover"
          />
          <div className="pb-2 text-center md:text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              {album.albumType} {album.releaseDate ? `\u00b7 ${album.releaseDate.slice(0, 4)}` : ""}
            </p>
            <h1
              className="text-2xl md:text-4xl lg:text-5xl font-black text-foreground leading-tight"
              style={{ fontFamily: "'Nunito Sans', sans-serif" }}
            >
              {album.name}
            </h1>
            {artistSpotifyId && (
              <button
                onClick={() => navigate(`/artist/spotify::${artistSpotifyId}::${encodeURIComponent(artistName)}`)}
                className={`mt-2 text-sm font-bold text-primary transition-all ${
                  zone === "artist" ? "tv-focus-glow underline" : "hover:underline"
                }`}
                style={{ fontFamily: "'Nunito Sans', sans-serif" }}
              >
                {artistName}
              </button>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {tracks.length} tracks{album.label ? ` \u00b7 ${album.label}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="px-4 md:px-10 py-6 md:py-8">
        <div className="space-y-1">
          {tracks.map((t, i) => (
            <button
              key={`${t.uri}-${i}`}
              ref={(el) => { trackRefs.current[i] = el; }}
              onClick={() => {
                if (!t.uri) return;
                const href = `/listen/real::${encodeURIComponent(t.artist)}::${encodeURIComponent(t.title)}::${encodeURIComponent(t.album)}::${encodeURIComponent(t.uri)}`;
                navigate(href);
              }}
              className={`flex w-full items-center gap-4 rounded-xl p-3 transition-all text-left ${
                zone === "tracks" && colIndex === i
                  ? "tv-focus-glow bg-foreground/5"
                  : "hover:bg-foreground/5"
              }`}
            >
              <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">
                {t.trackNumber || i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                {t.artist !== artistName && (
                  <p className="text-xs text-muted-foreground truncate">{t.artist}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(t.durationMs)}
              </span>
            </button>
          ))}
        </div>

        {tracks.length === 0 && (
          <p className="text-muted-foreground">No tracks available for this album.</p>
        )}
      </div>

      <div className="h-20" />
    </div>
  );
}

// ── Mock album inner (original behavior) ─────────────────────────────

function MockAlbumInner({
  album,
  artist,
  albumTracks,
}: {
  album: NonNullable<ReturnType<typeof getAlbumById>>;
  artist: ReturnType<typeof getArtistById>;
  albumTracks: ReturnType<typeof getTracksForAlbum>;
}) {
  const navigate = useNavigate();
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

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={album.coverArtUrl}
            alt=""
            className="h-full w-full object-cover blur-[20px] scale-125 brightness-[0.3]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className={`relative z-10 m-8 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
            zone === "back" ? "tv-focus-glow scale-110" : ""
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8 px-4 md:px-10 pb-6 md:pb-10">
          <img
            src={album.coverArtUrl}
            alt={album.title}
            className="h-36 w-36 md:h-48 md:w-48 rounded-2xl shadow-2xl object-cover"
          />
          <div className="pb-2 text-center md:text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Album {"\u00b7"} {album.year}
            </p>
            <h1
              className="text-2xl md:text-4xl lg:text-5xl font-black text-foreground leading-tight"
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
              {album.genre} {"\u00b7"} {albumTracks.length} tracks
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-10 py-6 md:py-8">
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
  );
}
