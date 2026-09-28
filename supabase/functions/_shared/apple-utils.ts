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

/** Single source of truth for detecting the Apple Music service flag on an
 *  edge-function request body. Accepts both "apple" and "apple-music"
 *  because the frontend's getServiceFromUri() returns "apple-music" while
 *  the DB column values use "apple". Keeping both synonyms in one helper
 *  means a future third variant only needs updating here. */
export function isAppleService(service: unknown): boolean {
  return service === "apple" || service === "apple-music";
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

// ── Search match helpers ───────────────────────────────────────────────

/** Pick the best artist candidate for a name match: prefer a case-insensitive
 *  exact match on the trimmed target, fall back to the first candidate in the
 *  list (Apple/Spotify search return popularity-ordered results so the first
 *  is a reasonable default). Shared across spotify-resolve (Apple branch),
 *  spotify-artist (Spotify branch), and spotify-artist (Apple branch) — a
 *  bug here previously would have silently mispicked artists across every
 *  edge function. Generic over candidate shape via the `getName` accessor. */
export function pickBestArtistMatch<T>(
  candidates: T[],
  target: string,
  getName: (candidate: T) => string | undefined,
): T | undefined {
  if (!candidates.length) return undefined;
  const lowered = target.trim().toLowerCase();
  if (!lowered) return candidates[0];
  return candidates.find((c) => (getName(c) || "").toLowerCase() === lowered)
    || candidates[0];
}

// ── apple-taste helpers ────────────────────────────────────────────────

/** Heavy rotation items can be albums, artists, stations, or playlists.
 *  Only the first two map cleanly to an artist name — station/playlist
 *  names (e.g. "Today's Hits") would pollute the artist ranking if
 *  counted. */
const ROTATION_ARTIST_TYPES = new Set(["artists", "albums"]);

export interface ArtistRankSummary {
  topArtists: string[];
  artistImages: Record<string, string>;
  artistIds: Record<string, string>;
}

type AppleListeningAttributes = {
  name?: string;
  artistName?: string;
  artwork?: AppleArtwork;
};

/** Attach artists through the catalog song/album IDs returned by history.
 * No name search: unavailable and library-only resources stay unresolved. */
export async function enrichAppleListeningArtists(items: AppleResource[], token: string, storefront: string): Promise<AppleResource[]> {
  const resolved = new Map<string, AppleResource>();
  await Promise.all(["songs", "albums"].map(async (type) => {
    const ids = [...new Set(items.filter((r) => r.type === type && r.id && /^\d+$/.test(r.id)).map((r) => r.id!))];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await appleGet<{ data?: AppleResource[] }>(
        `/catalog/${storefront}/${type}?ids=${ids.slice(offset, offset + 100).join(",")}&include=artists`, token,
      );
      for (const resource of result?.data ?? []) resolved.set(`${type}:${resource.id}`, resource);
    }
  }));
  return items.map((r) => resolved.get(`${r.type}:${r.id}`) ?? r);
}

/** Rank actual artist identities. The legacy profile maps allow one ID per
 * display name: if names collide, retain the highest-ranked identity rather
 * than combining their listening counts or mixing their images. */
export function rankAppleArtists(
  recentItems: AppleResource[], rotationItems: AppleResource[], maxArtists = 20,
): ArtistRankSummary {
  const ranked = new Map<string, { name: string; id?: string; image: string; score: number }>();
  function add(item: AppleResource, weight: number) {
    const attrs = item.attributes as AppleListeningAttributes | undefined;
    const linked = (item.relationships?.artists as { data?: AppleResource[] } | undefined)?.data ?? [];
    const artists = item.type === "artists" ? [item] : linked;
    const candidates = artists.filter((a) => a.id && typeof a.attributes?.name === "string");
    if (!candidates.length) {
      const name = attrs?.artistName;
      if (!name) return;
      const key = `unresolved:${name}`;
      const previous = ranked.get(key);
      ranked.set(key, { name, image: previous?.image || resolveArtworkUrl(attrs?.artwork), score: (previous?.score ?? 0) + weight });
      return;
    }
    for (const artist of candidates) {
      const name = artist.attributes!.name as string;
      const previous = ranked.get(artist.id!);
      ranked.set(artist.id!, { name, id: artist.id, score: (previous?.score ?? 0) + weight,
        image: previous?.image || resolveArtworkUrl(artist.attributes?.artwork as AppleArtwork) || resolveArtworkUrl(attrs?.artwork) });
    }
  }
  recentItems.forEach((item) => add(item, 1));
  rotationItems.filter((item) => item.type && ROTATION_ARTIST_TYPES.has(item.type)).forEach((item) => add(item, 3));
  const topArtists: string[] = [];
  const artistImages: Record<string, string> = {};
  const artistIds: Record<string, string> = {};
  const knownNames = new Set([...ranked.values()].filter((a) => a.id).map((a) => a.name));
  for (const artist of [...ranked.values()].sort((a, b) => b.score - a.score)) {
    if (topArtists.includes(artist.name) || (!artist.id && knownNames.has(artist.name))) continue;
    topArtists.push(artist.name);
    if (artist.image) artistImages[artist.name] = artist.image;
    if (artist.id) artistIds[artist.name] = artist.id;
    if (topArtists.length >= maxArtists) break;
  }
  return { topArtists, artistImages, artistIds };
}

export interface UniqueAppleTrack {
  title: string;
  artist: string;
  imageUrl: string;
  uri: string;
}

/** Collect up to `limit` unique (title, artist) tracks from recent plays,
 *  preserving the recency order Apple returns. Pure — shared by apple-taste
 *  and its unit tests. */
export function buildUniqueAppleTracks(
  recentItems: AppleResource[],
  limit = 15,
): UniqueAppleTrack[] {
  const seen = new Set<string>();
  const tracks: UniqueAppleTrack[] = [];

  for (const song of recentItems) {
    const attrs = song.attributes as AppleListeningAttributes | undefined;
    const title = attrs?.name;
    const artist = attrs?.artistName;
    if (!title || !artist) continue;
    const key = `${title}::${artist}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      title,
      artist,
      imageUrl: resolveArtworkUrl(attrs?.artwork),
      uri: buildAppleSongUri(song.id),
    });
    if (tracks.length >= limit) break;
  }
  return tracks;
}

// ── Fetch wrapper (uses global fetch — works in Deno and Node 18+) ─────

/** Default request timeout for Apple Music API calls. Lower than Supabase's
 *  function-level wall-clock so a hung Apple endpoint doesn't block the
 *  whole function. Tunable per-call via the `timeoutMs` option. */
const DEFAULT_APPLE_TIMEOUT_MS = 8000;

export interface AppleGetOptions {
  /** Music User Token — required for /me/* endpoints, omitted otherwise. */
  musicUserToken?: string;
  /** Timeout in milliseconds. Defaults to DEFAULT_APPLE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Wrapper for Apple Music API calls. Always attaches the developer token;
 *  attaches the Music User Token when provided (required by `/me/*`
 *  endpoints). Returns parsed JSON on 2xx, null otherwise — callers handle
 *  the null case so a missing artist or stale token doesn't throw.
 *
 *  Rejects absolute URLs: callers must pass relative paths (like
 *  `/catalog/us/artists/123`). This prevents future refactors from turning
 *  the helper into an SSRF vector that would leak the developer token to
 *  an attacker-controlled host. */
export async function appleGet<T = unknown>(
  path: string,
  devToken: string,
  musicUserTokenOrOptions?: string | AppleGetOptions,
): Promise<T | null> {
  // Reject absolute URLs (http:// or https://) AND protocol-relative
  // URLs (//host/path) — both would bypass the APPLE_API_BASE prefix
  // and could leak the developer token to an attacker-controlled host
  // if a future caller misused the helper.
  if (path.startsWith("http") || path.startsWith("//")) {
    console.warn(`[apple-utils] rejecting absolute URL: ${path}`);
    return null;
  }

  const opts: AppleGetOptions =
    typeof musicUserTokenOrOptions === "string"
      ? { musicUserToken: musicUserTokenOrOptions }
      : musicUserTokenOrOptions || {};

  const headers: Record<string, string> = {
    Authorization: `Bearer ${devToken}`,
  };
  if (opts.musicUserToken) headers["Music-User-Token"] = opts.musicUserToken;

  const url = `${APPLE_API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_APPLE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    console.warn(`[apple-utils] fetch failed for ${path} (${name}):`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.warn(`[apple-utils] ${path} -> ${res.status}`);
    return null;
  }
  // Apple occasionally returns a 200 with a non-JSON body during
  // incidents (HTML error pages from upstream CDN layers). Catch the
  // parse error and return null so the contract stays consistent with
  // every other failure mode — callers already handle null gracefully.
  try {
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[apple-utils] JSON parse failed for ${path}:`, err);
    return null;
  }
}
