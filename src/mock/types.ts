export type Track = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  coverArtUrl: string;
  backdropUrl?: string;
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
  text: string;
  kind: "process" | "constraint" | "pattern" | "human" | "influence";
  listenFor?: boolean;
  relatedMomentSec?: number;
  sourceId: string;
};

export type AnimationStyle = "A" | "B" | "C";
