// Shared Apple Music API helpers for Supabase edge functions.
// Import as: import { ... } from "../_shared/apple-utils.ts";
//
// Keeps normalizers (pure functions over plain objects) separate from the
// fetch wrapper so the normalizers can be unit-tested from Vitest (Node)
// without pulling in Deno globals.

// ── Types ──────────────────────────────────────────────────────────────

export interface AppleArtwork {
  url?: string;
  width?: number;
  height?: number;
  bgColor?: string;
}

export interface AppleResource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  views?: Record<string, unknown>;
}

// Shape helpers that mirror the Spotify edge-function response contracts so
// callers downstream don't have to branch on service.
export interface NormalizedTrack {
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  uri: string;
  durationMs: number;
  trackNumber?: number;
}

export interface NormalizedArtist {
  id: string;
  name: string;
  imageUrl: string;
}

export interface NormalizedAlbumListItem {
  name: string;
  imageUrl: string;
  releaseDate: string;
  albumType: string;
  totalTracks: number;
  uri: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const APPLE_API_BASE = "https://api.music.apple.com/v1";

/** Default artwork resolution. Apple templates are effectively vector —
 *  600px covers the biggest UI slot we render. */
const DEFAULT_ARTWORK_PX = 600;

// ── Pure helpers (safe for Vitest) ─────────────────────────────────────

/** Resolve an Apple Music artwork template URL to a concrete URL.
 *  Templates look like `https://.../{w}x{h}bb.jpg`. Returns "" when the
 *  artwork object is missing or has no URL so callers don't need to null-guard. */
export function resolveArtworkUrl(
  artwork: AppleArtwork | undefined | null,
  width = DEFAULT_ARTWORK_PX,
  height = DEFAULT_ARTWORK_PX,
): string {
  if (!artwork?.url) return "";
  return artwork.url
    .replace("{w}", String(width))
    .replace("{h}", String(height));
}

/** Normalize a storefront code to a 2-letter lowercase country. Invalid
 *  input falls back to "us" — every client sends this through, so an
 *  unexpected value shouldn't blow up the request. */
export function safeStorefront(raw: unknown): string {
  if (typeof raw !== "string") return "us";
  const s = raw.trim().toLowerCase();
  return /^[a-z]{2}$/.test(s) ? s : "us";
}

/** Normalize an Apple song resource to the Spotify-track response shape. */
export function normalizeAppleTrack(song: AppleResource | null | undefined): NormalizedTrack {
  const a = (song?.attributes || {}) as {
    name?: string;
    artistName?: string;
    albumName?: string;
    artwork?: AppleArtwork;
    durationInMillis?: number;
    trackNumber?: number;
  };
  return {
    title: a.name || "",
    artist: a.artistName || "",
    album: a.albumName || "",
    imageUrl: resolveArtworkUrl(a.artwork),
    uri: song?.id ? `apple:song:${song.id}` : "",
    durationMs: a.durationInMillis || 0,
    trackNumber: a.trackNumber,
  };
}

/** Normalize an Apple artist resource to the compact `{ id, name, imageUrl }`
 *  shape used by search results and related-artists lists. */
export function normalizeAppleArtistCompact(
  artist: AppleResource | null | undefined,
): NormalizedArtist {
  const a = (artist?.attributes || {}) as {
    name?: string;
    artwork?: AppleArtwork;
  };
  return {
    id: artist?.id || "",
    name: a.name || "",
    imageUrl: resolveArtworkUrl(a.artwork),
  };
}

/** Normalize an Apple album resource to the album-list-item shape used by
 *  the artist-detail response. Apple flags singles via `isSingle` on
 *  attributes; everything else is treated as a full album. */
export function normalizeAppleAlbumListItem(
  album: AppleResource | null | undefined,
): NormalizedAlbumListItem {
  const a = (album?.attributes || {}) as {
    name?: string;
    artwork?: AppleArtwork;
    releaseDate?: string;
    isSingle?: boolean;
    trackCount?: number;
  };
  return {
    name: a.name || "",
    imageUrl: resolveArtworkUrl(a.artwork),
    releaseDate: a.releaseDate || "",
    albumType: a.isSingle ? "single" : "album",
    totalTracks: a.trackCount || 0,
    uri: album?.id ? `apple:album:${album.id}` : "",
  };
}

/** Build an `apple:song:{id}` URI from an Apple song id. */
export function buildAppleSongUri(id: string | undefined | null): string {
  return id ? `apple:song:${id}` : "";
}

/** Validate an Apple Music catalog ID (numeric). Empty / non-numeric
 *  inputs return false so edge functions can reject bad IDs with a 400. */
export function isValidAppleCatalogId(id: unknown): id is string {
  return typeof id === "string" && /^\d+$/.test(id);
}

// ── Fetch wrapper (uses global fetch — works in Deno and Node 18+) ─────

/** Wrapper for Apple Music API calls. Always attaches the developer token;
 *  attaches the Music User Token when provided (required by `/me/*`
 *  endpoints). Returns parsed JSON on 2xx, null otherwise — callers handle
 *  the null case so a missing artist or stale token doesn't throw. */
export async function appleGet<T = unknown>(
  path: string,
  devToken: string,
  musicUserToken?: string,
): Promise<T | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${devToken}`,
  };
  if (musicUserToken) headers["Music-User-Token"] = musicUserToken;

  const url = path.startsWith("http") ? path : `${APPLE_API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    console.warn(`[apple-utils] fetch failed for ${path}:`, err);
    return null;
  }
  if (!res.ok) {
    console.warn(`[apple-utils] ${path} -> ${res.status}`);
    return null;
  }
  return res.json() as Promise<T>;
}
