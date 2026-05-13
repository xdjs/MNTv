// NOTE: Despite the "mock" directory name, these are the canonical shared
// type definitions used across the entire codebase (15+ files). Moving to
// @/types would be a larger rename — tracked for a future cleanup pass.

export type Artist = {
  id: string;
  name: string;
  imageUrl: string;
  bio: string;
  genres: string[];
  relatedArtistIds: string[];
};

export type Album = {
  id: string;
  artistId: string;
  title: string;
  year: number;
  coverArtUrl: string;
  genre: string;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  albumId: string;
  album?: string;
  durationSec: number;
  coverArtUrl: string;
  backdropUrl?: string;
  trackNumber: number;
};

export type Source = {
  id: string;
  type: "youtube" | "article" | "interview";
  title: string;
  publisher: string;
  url: string;
  embedId?: string;
  thumbnailUrl?: string;
  locator?: string;
  quoteSnippet?: string;
  verified?: boolean;
};

export type Nugget = {
  id: string;
  trackId: string;
  timestampSec: number;
  durationMs: number;
  headline?: string;
  text: string;
  kind: "artist" | "track" | "discovery" | "context";
  listenFor?: boolean;
  relatedMomentSec?: number;
  sourceId: string;
  imageUrl?: string;
  imageCaption?: string;
  visualOnly?: boolean;
  /** Optional artist callout — when the nugget recommends or
   *  references a specific artist by name (most common on
   *  `discovery` and `collab` kind nuggets), the server populates
   *  this so the client can render an "Open {Artist}" button. The
   *  spotifyArtistId is set when the server's catalog lookup
   *  found a match; if unset, the client falls back to a
   *  search-by-name navigation. */
  recommendedArtist?: {
    name: string;
    spotifyArtistId?: string;
  };
  /** Optional track callout — same idea for a specific track. */
  recommendedTrack?: {
    artist: string;
    title: string;
    spotifyTrackUri?: string;
  };
};

export type AnimationStyle = "A" | "B" | "C";

// ── RAG / Companion system types ──────────────────────────────────────────────

export interface CompanionNugget {
  id: string;
  timestamp: number; // ms epoch — used for reverse-chronological sorting
  text: string;
  headline?: string;
  imageUrl?: string;
  imageCaption?: string;
  sourceName: string;     // e.g. "Pitchfork", "Discogs", "Reddit"
  sourceUrl: string;      // strict direct citation link
  category: "track" | "history" | "explore" | "context";
  listenUnlockLevel: number; // 1, 2, or 3
}

export interface DeepDiveResponse {
  text: string;
  followUp: string;
  source: {
    publisher: string;
    title: string;
    url: string;
  };
}

export interface UserProfile {
  streamingService: "Spotify" | "YouTube Music" | "Apple Music" | "";
  lastFmUsername?: string;
  /** Service-agnostic display name (populated from Spotify or user input for Apple Music) */
  displayName?: string;
  spotifyDisplayName?: string;    // e.g. "Peter Rango" — from Spotify OAuth
  // Service-agnostic taste profile — populated from the active streaming service
  topArtists?: string[];          // e.g. ["Radiohead", "Björk", "Portishead"]
  topTracks?: string[];           // e.g. ["Karma Police", "Hyperballad"]
  // Image maps — artist name → image URL, track "title — artist" → album art URL
  artistImages?: Record<string, string>;
  artistIds?: Record<string, string>;   // artist name → service-specific artist ID
  trackImages?: {
    title: string;
    /** Primary artist (Spotify's first artist for the track). Used as the
     *  research target / cache key. */
    artist: string;
    /** Other artists on the track. Server uses these to anchor nuggets
     *  for sparse primary artists (e.g. "4 U" by Ty Symph feat. Pete
     *  Rango — Ty Symph is sparse, Pete Rango is researchable). Rail
     *  display joins `artist + collaborators` for the visible label. */
    collaborators?: string[];
    imageUrl: string;
    uri?: string;
  }[];
  /** Liked Songs from Spotify's /me/tracks endpoint, sorted by added_at
   *  desc. Drives the Stories rail with a cascade window: 15d → 30d →
   *  60d → 365d → fall back to topTracks/trackImages. Same shape as
   *  trackImages so the rail can treat them interchangeably. `addedAt`
   *  is the user's like timestamp (ISO 8601). Empty array = either the
   *  user hasn't liked anything OR user-library-read scope wasn't
   *  granted (in which case the rail falls back to topTracks). */
  likedTracks?: {
    title: string;
    artist: string;
    collaborators?: string[];
    imageUrl: string;
    uri?: string;
    addedAt?: string | null;
  }[];
  /** ISO timestamp of the last successful Spotify-taste fetch. Drives the
   *  background refresh TTL (`useBackgroundTasteRefresh`). Undefined for
   *  pre-feature profiles → treated as stale and refreshed on next load. */
  tasteRefreshedAt?: string;
  calculatedTier: "casual" | "curious" | "nerd";
}
