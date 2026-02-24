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
};

export type Nugget = {
  id: string;
  trackId: string;
  timestampSec: number;
  durationMs: number;
  headline?: string;
  text: string;
  kind: "artist" | "track" | "discovery";
  listenFor?: boolean;
  relatedMomentSec?: number;
  sourceId: string;
  imageUrl?: string;
  imageCaption?: string;
  visualOnly?: boolean;
};

export type AnimationStyle = "A" | "B" | "C";
