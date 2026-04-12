import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getArtistById, getAlbumsForArtist, getTracksForArtist, artists } from "@/mock/tracks";
import { supabase } from "@/integrations/supabase/client";
import PageTransition from "@/components/PageTransition";
import AppleMusicComingSoon from "@/components/AppleMusicComingSoon";
import TileRow from "@/components/TileRow";
import { useArtistImage } from "@/hooks/useArtistImage";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { isSpotifyPrefix, isRealPrefix, parseSpotifyArtist, parseRealArtist } from "@/lib/routeParsing";

// ── Types for real (Spotify) artist data ─────────────────────────────

interface RealTrack {
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  uri: string;
  durationMs: number;
}

interface RealAlbum {
  name: string;
  imageUrl: string;
  releaseDate: string;
  albumType: string;
  totalTracks: number;
  uri: string;
}

interface RealRelatedArtist {
  id?: string;
  name: string;
  imageUrl: string;
  genres: string[];
}

interface RealArtistData {
  found: boolean;
  artist: {
    id: string;
    name: string;
    imageUrl: string;
    genres: string[];
    followers: number;
    bio?: string;
    bioGrounded?: boolean;
  };
  topTracks: RealTrack[];
  albums: RealAlbum[];
  relatedArtists: RealRelatedArtist[];
}

// ── Main component ───────────────────────────────────────────────────

export default function ArtistProfile() {
  const { artistId: rawArtistId } = useParams<{ artistId: string }>();
  const { profile } = useUserProfile();

  const isSpotifyArtist = isSpotifyPrefix(rawArtistId);
  const isRealArtist = isRealPrefix(rawArtistId);

  const parsedSpotify = useMemo(() => {
    if (!rawArtistId) return null;
    return parseSpotifyArtist(rawArtistId);
  }, [rawArtistId]);

  const realArtistName = useMemo(() => {
    if (!rawArtistId) return null;
    return parseRealArtist(rawArtistId);
  }, [rawArtistId]);

  // Apple Music: artist detail requires the extended spotify-artist edge
  // function (Phase 5). Show a placeholder until that lands.
  // Must be checked AFTER all hook calls to satisfy rules of hooks.
  if (profile?.streamingService === "Apple Music") {
    return (
      <AppleMusicComingSoon
        emoji="🎵"
        title="Artist pages are coming soon"
        description="Artist profiles for Apple Music aren't wired up yet. For now, head back to Browse and explore the demo tracks."
      />
    );
  }

  if (isSpotifyArtist && parsedSpotify?.spotifyId) {
    return (
      <PageTransition>
        <RealArtistProfile artistName={parsedSpotify.artistName} spotifyId={parsedSpotify.spotifyId} />
      </PageTransition>
    );
  }

  if (isRealArtist && realArtistName) {
    return (
      <PageTransition>
        <RealArtistProfile artistName={realArtistName} />
      </PageTransition>
    );
  }

  // Mock artist
  const artist = getArtistById(rawArtistId || "");

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
      <MockArtistProfileInner
        artist={artist}
        tracksData={tracksData}
        albumTiles={albumTiles}
        relatedTiles={relatedTiles}
      />
    </PageTransition>
  );
}

// ── Real Spotify artist ──────────────────────────────────────────────

function RealArtistProfile({ artistName, spotifyId }: { artistName: string; spotifyId?: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<RealArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const body = spotifyId ? { artistId: spotifyId } : { artistName };
    supabase.functions
      .invoke("spotify-artist", { body })
      .then(({ data: d, error: e }) => {
        if (cancelled) return;
        if (e || !d?.found || !d?.artist) {
          setError("Couldn't find this artist on Spotify.");
          setLoading(false);
          return;
        }
        setData(d as RealArtistData);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load artist data.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [artistName, spotifyId]);

  // All hooks must be called unconditionally (Rules of Hooks)
  const artist = data?.artist;
  const topTracks = data?.topTracks || [];
  const albums = data?.albums || [];
  const relatedArtists = data?.relatedArtists || [];
  const stableName = artist?.name || "";
  const stableId = artist?.id || "";

  const trackTiles = useMemo(() => topTracks.map((t, i) => ({
    id: `real-track-${i}`,
    title: t.title,
    artist: t.artist,
    album: t.album,
    imageUrl: t.imageUrl,
    uri: t.uri,
    durationMs: t.durationMs,
  })), [topTracks]);

  const albumTiles = useMemo(() => albums.map((a, i) => {
    const spotifyAlbumId = a.uri?.replace("spotify:album:", "") || "";
    return {
      id: `real-album-${i}`,
      imageUrl: a.imageUrl,
      title: a.name,
      subtitle: a.releaseDate.slice(0, 4),
      href: spotifyAlbumId
        ? `/album/spotify::${spotifyAlbumId}::${encodeURIComponent(stableName)}::${stableId}`
        : "#",
    };
  }), [albums, stableName, stableId]);

  const relatedTiles = useMemo(() => relatedArtists.map((a, i) => ({
    id: `related-${i}`,
    imageUrl: a.imageUrl,
    title: a.name,
    subtitle: a.genres.join(", ") || "Artist",
    href: a.id
      ? `/artist/spotify::${a.id}::${encodeURIComponent(a.name)}`
      : `/artist/real::${encodeURIComponent(a.name)}`,
  })), [relatedArtists]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading artist…</p>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-4">
        <p className="text-foreground">{error || "Artist not found."}</p>
        <button onClick={() => navigate("/browse")} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Browse
        </button>
      </div>
    );
  }

  return (
    <RealArtistProfileInner
      artist={artist}
      trackTiles={trackTiles}
      albumTiles={albumTiles}
      relatedTiles={relatedTiles}
    />
  );
}

// ── Real artist inner (with keyboard nav) ────────────────────────────

interface RealInnerProps {
  artist: RealArtistData["artist"];
  trackTiles: { id: string; title: string; artist: string; album: string; imageUrl: string; uri: string; durationMs: number }[];
  albumTiles: { id: string; imageUrl: string; title: string; subtitle: string; href: string }[];
  relatedTiles: { id: string; imageUrl: string; title: string; subtitle: string; href: string }[];
}

function RealArtistProfileInner({ artist, trackTiles, albumTiles, relatedTiles }: RealInnerProps) {
  const navigate = useNavigate();
  const heroImage = useArtistImage(artist.name, artist.imageUrl);
  const trackRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tileRows = useMemo(() => {
    const rows: { label: string; items: typeof albumTiles; tileSize: "sm" | "md" | "lg" }[] = [];
    if (albumTiles.length > 0) rows.push({ label: "Discography", items: albumTiles, tileSize: "md" });
    if (relatedTiles.length > 0) rows.push({ label: "Fans Also Like", items: relatedTiles, tileSize: "lg" });
    return rows;
  }, [albumTiles, relatedTiles]);

  type ZoneType = 'header' | 'tracks' | number;
  const [zone, setZone] = useState<ZoneType>('header');
  const [colIndex, setColIndex] = useState(0);

  // Scroll focused track into view
  useEffect(() => {
    if (zone === 'tracks' && trackRefs.current[colIndex]) {
      trackRefs.current[colIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [zone, colIndex]);

  const zoneOrder = useMemo((): ZoneType[] => {
    const z: ZoneType[] = ['header'];
    if (trackTiles.length > 0) z.push('tracks');
    tileRows.forEach((_, i) => z.push(i));
    return z;
  }, [trackTiles.length, tileRows]);

  const clampCol = useCallback((z: ZoneType, col: number) => {
    if (z === 'header') return 0;
    if (z === 'tracks') return Math.max(0, Math.min(col, trackTiles.length - 1));
    if (typeof z === 'number') return Math.max(0, Math.min(col, (tileRows[z]?.items.length || 1) - 1));
    return 0;
  }, [trackTiles.length, tileRows]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (zone === 'tracks' && colIndex < trackTiles.length - 1) {
          setColIndex((c) => c + 1);
          return;
        }
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.min(idx + 1, zoneOrder.length - 1);
          setColIndex(0);
          return zoneOrder[next];
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (zone === 'tracks' && colIndex > 0) {
          setColIndex((c) => c - 1);
          return;
        }
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.max(idx - 1, 0);
          const nextZone = zoneOrder[next];
          if (nextZone === 'tracks') setColIndex(trackTiles.length - 1);
          else setColIndex(0);
          return nextZone;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (zone !== 'tracks') setColIndex((c) => Math.max(0, c - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (zone !== 'tracks') setColIndex((c) => clampCol(zone, c + 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (zone === 'header') {
          navigate("/browse");
        } else if (zone === 'tracks') {
          const t = trackTiles[colIndex];
          if (t) {
            const href = `/listen/real::${encodeURIComponent(t.artist)}::${encodeURIComponent(t.title)}::${encodeURIComponent(t.album)}::${encodeURIComponent(t.uri)}`;
            navigate(href);
          }
        } else if (typeof zone === 'number') {
          const item = tileRows[zone]?.items[colIndex];
          if (item) navigate(item.href);
        }
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        navigate("/browse");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zone, colIndex, zoneOrder, clampCol, navigate, trackTiles, tileRows]);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-60 md:h-80 overflow-hidden">
        <img
          src={heroImage}
          alt={artist.name}
          className="h-full w-full object-cover blur-[8px] scale-110 brightness-[0.4]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        <button
          onClick={() => navigate("/browse")}
          className={`absolute top-6 left-4 md:top-8 md:left-10 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
            zone === 'header' ? "tv-focus-glow scale-110" : ""
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="absolute bottom-6 left-4 right-4 md:bottom-8 md:left-10 md:right-10 z-10">
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {artist.genres.join(" · ") || "Artist"}
          </p>
          <h1
            className="text-3xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-foreground leading-none"
            style={{ fontFamily: "'Nunito Sans', sans-serif" }}
          >
            {artist.name}
          </h1>
          {artist.followers > 0 && (
            <p className="mt-2 text-sm text-foreground/40">
              {artist.followers.toLocaleString()} followers
            </p>
          )}
        </div>
      </div>

      {/* Bio */}
      {artist.bio && (
        <div className="px-4 md:px-10 py-6 md:py-8">
          <p className="max-w-2xl text-base leading-relaxed text-foreground/70">{artist.bio}</p>
        </div>
      )}

      {/* Popular tracks */}
      {trackTiles.length > 0 && (
        <section className="px-4 md:px-10 pb-6 md:pb-8 mb-4">
          <h2 className="text-lg font-bold text-foreground/90 mb-4" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            Popular
          </h2>
          <div className="space-y-1">
            {trackTiles.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => { trackRefs.current[i] = el; }}
                onClick={() => {
                  const href = `/listen/real::${encodeURIComponent(t.artist)}::${encodeURIComponent(t.title)}::${encodeURIComponent(t.album)}::${encodeURIComponent(t.uri)}`;
                  navigate(href);
                }}
                className={`flex w-full items-center gap-4 rounded-xl p-3 transition-all hover:bg-foreground/5 text-left ${
                  zone === 'tracks' && colIndex === i ? "tv-focus-glow bg-foreground/5" : ""
                }`}
              >
                <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                {t.imageUrl ? (
                  <img src={t.imageUrl} alt={t.title} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-foreground/10" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.album}</p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDuration(t.durationMs)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

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

// ── Mock artist inner (original, unchanged) ──────────────────────────

interface MockInnerProps {
  artist: ReturnType<typeof getArtistById> & {};
  tracksData: ReturnType<typeof getTracksForArtist>;
  albumTiles: { id: string; imageUrl: string; title: string; subtitle: string; href: string }[];
  relatedTiles: { id: string; imageUrl: string; title: string; subtitle: string; href: string }[];
}

function MockArtistProfileInner({ artist, tracksData, albumTiles, relatedTiles }: MockInnerProps) {
  const navigate = useNavigate();
  const heroImage = useArtistImage(artist.name, artist.imageUrl);
  const trackRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tileRows = useMemo(() => {
    const rows: { label: string; items: typeof albumTiles; tileSize: "sm" | "md" | "lg" }[] = [];
    if (albumTiles.length > 0) rows.push({ label: "Discography", items: albumTiles, tileSize: "md" });
    if (relatedTiles.length > 0) rows.push({ label: "Fans Also Like", items: relatedTiles, tileSize: "lg" });
    return rows;
  }, [albumTiles, relatedTiles]);

  type ZoneType = 'header' | 'tracks' | number;
  const [zone, setZone] = useState<ZoneType>('header');
  const [colIndex, setColIndex] = useState(0);

  // Scroll focused track into view
  useEffect(() => {
    if (zone === 'tracks' && trackRefs.current[colIndex]) {
      trackRefs.current[colIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [zone, colIndex]);

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
        if (zone === 'tracks' && colIndex < tracksData.length - 1) {
          setColIndex((c) => c + 1);
          return;
        }
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.min(idx + 1, zoneOrder.length - 1);
          setColIndex(0);
          return zoneOrder[next];
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (zone === 'tracks' && colIndex > 0) {
          setColIndex((c) => c - 1);
          return;
        }
        setZone((cur) => {
          const idx = zoneOrder.indexOf(cur);
          const next = Math.max(idx - 1, 0);
          const nextZone = zoneOrder[next];
          if (nextZone === 'tracks') setColIndex(tracksData.length - 1);
          else setColIndex(0);
          return nextZone;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (zone !== 'tracks') setColIndex((c) => Math.max(0, c - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (zone !== 'tracks') setColIndex((c) => clampCol(zone, c + 1));
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
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        navigate("/browse");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zone, colIndex, zoneOrder, clampCol, navigate, tracksData, tileRows]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-60 md:h-80 overflow-hidden">
        <img
          src={heroImage}
          alt={artist.name}
          className="h-full w-full object-cover blur-[8px] scale-110 brightness-[0.4]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        <button
          onClick={() => navigate("/browse")}
          className={`absolute top-6 left-4 md:top-8 md:left-10 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
            zone === 'header' ? "tv-focus-glow scale-110" : ""
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="absolute bottom-6 left-4 right-4 md:bottom-8 md:left-10 md:right-10 z-10">
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {artist.genres.join(" · ")}
          </p>
          <h1
            className="text-3xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-foreground leading-none"
            style={{ fontFamily: "'Nunito Sans', sans-serif" }}
          >
            {artist.name}
          </h1>
        </div>
      </div>

      {/* Bio */}
      <div className="px-4 md:px-10 py-6 md:py-8">
        <p className="max-w-2xl text-sm md:text-base leading-relaxed text-foreground/70">{artist.bio}</p>
      </div>

      {/* Popular tracks */}
      <section className="px-4 md:px-10 mb-6 md:mb-8">
        <h2 className="text-lg font-bold text-foreground/90 mb-4" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
          Popular
        </h2>
        <div className="space-y-1">
          {tracksData.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { trackRefs.current[i] = el; }}
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
