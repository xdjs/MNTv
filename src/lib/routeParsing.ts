// Route URL parsing utilities for spotify:: and real:: prefixed routes.
// CONSTRAINT: "::" is the delimiter — names containing "::" would break parsing.
// Safe for Spotify data (IDs/names don't contain "::"), but not arbitrary user input.

/** Detect if a raw route param has a spotify:: prefix (URL-encoded or raw) */
export function isSpotifyPrefix(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw.startsWith("spotify%3A%3A") || raw.startsWith("spotify::");
}

/** Detect if a raw route param has a real:: prefix (URL-encoded or raw) */
export function isRealPrefix(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw.startsWith("real%3A%3A") || raw.startsWith("real::");
}

/** Parse spotify::{id}::{name} from an artist route param */
export function parseSpotifyArtist(raw: string): { spotifyId: string; artistName: string } | null {
  if (!isSpotifyPrefix(raw)) return null;
  const decoded = decodeURIComponent(raw);
  const parts = decoded.split("::");
  const spotifyId = parts[1] || "";
  if (!spotifyId) return null;
  return { spotifyId, artistName: decodeURIComponent(parts[2] || "") };
}

/** Parse real::{name} from an artist route param */
export function parseRealArtist(raw: string): string | null {
  if (!isRealPrefix(raw)) return null;
  const decoded = decodeURIComponent(raw);
  const parts = decoded.split("::");
  return parts[1] || null;
}

/** Parse spotify::{albumId}::{artistName}::{artistSpotifyId} from an album route param */
export function parseSpotifyAlbum(raw: string): { spotifyAlbumId: string; artistName: string; artistSpotifyId: string } | null {
  if (!isSpotifyPrefix(raw)) return null;
  const decoded = decodeURIComponent(raw);
  const parts = decoded.split("::");
  const spotifyAlbumId = parts[1] || "";
  if (!spotifyAlbumId) return null;
  return {
    spotifyAlbumId,
    artistName: parts[2] || "",
    artistSpotifyId: parts[3] || "",
  };
}
