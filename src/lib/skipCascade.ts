import type { UserProfile } from "@/mock/types";
import { DEMO_TRACKS, getDemoTrackUri } from "@/data/seedNuggets";
import { withAppleStorefront } from "@/lib/appleStorefront";

/** Shape of a track result returned by spotify-search / spotify-artist edge functions. */
export interface SpotifyTrackResult {
  title: string;
  artist: string;
  album?: string;
  uri?: string;
}

export interface SkipPick {
  artist: string;
  title: string;
  album: string;
  uri: string;
}

/** Minimal `supabase.functions.invoke` shape — parameterized so tests can
 *  pass a plain Vitest `vi.fn()` instead of mocking the full client. */
export type InvokeFn = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error?: unknown }>;

export interface SkipCascadeDeps {
  track: { artist: string; title: string };
  trackUri: string | undefined;
  profile: UserProfile | null;
  isAppleMusicUser: boolean;
  spotifyAlbumUri: string | null | undefined;
  isInSessionHistory: (artist: string, title: string) => boolean;
  invoke: InvokeFn;
}

/** Shape of the P1 `spotify-album` tracks response. */
interface AlbumTrack {
  artist: string;
  title: string;
  album?: string;
  uri?: string;
}

/** 5-level priority cascade to pick the next track when the user skips.
 *
 *  P1: Spotify album continuation (skipped for Apple users)
 *  P2: Spotify recommendations, taste-weighted (skipped for Apple users)
 *  P3: Same-artist top tracks via spotify-artist edge function (both services)
 *  P4: User's trackImages catalog (prefer different artist, relax if needed)
 *  P5: Demo track fallback
 *
 *  P1 reads `spotifyAlbumUri` which only the Spotify playback engine populates.
 *  P2 relies on Spotify's seed-based recommendations endpoint — Apple has no
 *  equivalent, so firing it would be a wasted round trip that always returns
 *  `{tracks:[]}`. Gated explicitly on `!isAppleMusicUser` so a future
 *  PlayerContext change can't accidentally route Apple users through the
 *  Spotify catalog.
 *
 *  Returns `null` only when the user has exhausted every candidate in their
 *  session history — extremely rare; callers should just keep the current
 *  track in that case. */
export async function pickNextTrack(deps: SkipCascadeDeps): Promise<SkipPick | null> {
  const {
    track,
    trackUri,
    profile,
    isAppleMusicUser,
    spotifyAlbumUri,
    isInSessionHistory,
    invoke,
  } = deps;

  const titleLower = track.title.toLowerCase();
  const artistLower = track.artist.toLowerCase();
  const notPlayed = (a: string, t: string) => !isInSessionHistory(a, t);
  const service: "apple" | "spotify" = isAppleMusicUser ? "apple" : "spotify";

  if (!isAppleMusicUser) {
    // P1: Album continuation — play next track on the same album.
    if (spotifyAlbumUri) {
      const albumId = spotifyAlbumUri.replace("spotify:album:", "");
      if (/^[a-zA-Z0-9]{20,25}$/.test(albumId)) {
        const { data } = await invoke("spotify-album", {
          body: { albumId, service: "spotify" },
        });
        const albumData = data as { tracks?: AlbumTrack[] } | null;
        if (albumData?.tracks?.length) {
          const currentIdx = albumData.tracks.findIndex((t) => t.uri === trackUri);
          if (currentIdx >= 0 && currentIdx < albumData.tracks.length - 1) {
            const next = albumData.tracks[currentIdx + 1];
            if (notPlayed(next.artist, next.title)) {
              return {
                artist: next.artist,
                title: next.title,
                album: next.album || "",
                uri: next.uri || "",
              };
            }
          }
        }
      }
    }

    // P2: Spotify recommendations (taste-weighted — boost user's top artists).
    if (trackUri) {
      const { data } = await invoke("spotify-search", {
        body: { recommend: trackUri, service: "spotify" },
      });
      const recData = data as { tracks?: SpotifyTrackResult[] } | null;
      const recs = (recData?.tracks || []).filter(
        (t) => t.title.toLowerCase() !== titleLower && notPlayed(t.artist, t.title),
      );
      if (recs.length > 0) {
        const topArtists = new Set((profile?.topArtists || []).map((a) => a.toLowerCase()));
        const boosted = recs.filter((t) => topArtists.has(t.artist.toLowerCase()));
        const pool = boosted.length > 0 ? boosted : recs;
        const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 3))];
        return {
          artist: pick.artist,
          title: pick.title,
          album: pick.album || "",
          uri: pick.uri || "",
        };
      }
    }
  }

  // P3: Same-artist top tracks. Works for both services via `service` + storefront.
  const artistBody = withAppleStorefront({ artistName: track.artist, service }, service);
  const { data: artistInvoke } = await invoke("spotify-artist", { body: artistBody });
  const artistData = artistInvoke as { topTracks?: SpotifyTrackResult[] } | null;
  if (artistData?.topTracks?.length) {
    const candidates = artistData.topTracks.filter(
      (t) => t.title.toLowerCase() !== titleLower && notPlayed(t.artist, t.title),
    );
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
      return {
        artist: pick.artist,
        title: pick.title,
        album: pick.album || "",
        uri: pick.uri || "",
      };
    }
  }

  // P4: User's catalog (prefer different artist, relax if needed). `trackImages`
  // is populated from the active service's taste data (Spotify or Apple via apple-taste).
  const userTracks = (profile?.trackImages || []).filter(
    (t) => t.uri && notPlayed(t.artist, t.title) && t.artist.toLowerCase() !== artistLower,
  );
  const relaxed = userTracks.length > 0
    ? userTracks
    : (profile?.trackImages || []).filter((t) => t.uri && notPlayed(t.artist, t.title));
  if (relaxed.length > 0) {
    const pick = relaxed[Math.floor(Math.random() * relaxed.length)];
    return { artist: pick.artist, title: pick.title, album: "", uri: pick.uri! };
  }

  // P5: Demo track fallback. For Apple users, filter to tracks with an
  // appleMusicUri so we don't navigate to an unplayable URI.
  const playableDemos = DEMO_TRACKS.filter((d) => {
    if (!notPlayed(d.artist, d.title)) return false;
    if (isAppleMusicUser) return !!d.appleMusicUri;
    return true;
  });
  if (playableDemos.length > 0) {
    const pick = playableDemos[Math.floor(Math.random() * playableDemos.length)];
    const uri = getDemoTrackUri(pick, profile?.streamingService);
    return { artist: pick.artist, title: pick.title, album: pick.album, uri };
  }

  return null;
}
