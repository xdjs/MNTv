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
  trackImages?: { title: string; artist: string; imageUrl: string; uri?: string }[];
  calculatedTier: "casual" | "curious" | "nerd";
}
