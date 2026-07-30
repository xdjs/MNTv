// Builds the `/listen/real::…` route used to start playback.
//
// The service-aware URI rule is the reason this is a shared function
// rather than inline string building. Spotify users want the track URI
// baked into the route so Listen plays immediately instead of paying a
// catalog search round trip. Apple Music users must NOT receive it —
// handing Listen a `spotify:track:` URI locks it onto something Apple
// can't play, so the slot is left empty and Listen's findCatalogUri
// effect resolves the Apple equivalent from {artist, title}.
//
// Getting that backwards is silent: Spotify users just get a slower
// transition, Apple users get a track that never plays.

export interface ListenRouteParams {
  artist: string;
  title: string;
  album?: string;
  /** Spotify track URI, when known. */
  uri?: string;
  /** `profile.streamingService` — "Apple Music" suppresses the URI. */
  streamingService?: string | null;
}

export function buildListenRoute({
  artist,
  title,
  album,
  uri,
  streamingService,
}: ListenRouteParams): string {
  const enc = encodeURIComponent;
  const isAppleUser = streamingService === "Apple Music";
  const isSpotifyTrackUri = !!uri && uri.startsWith("spotify:track:");
  const navUri = !isAppleUser && isSpotifyTrackUri ? uri! : "";
  return `/listen/real::${enc(artist)}::${enc(title)}::${enc(album ?? "")}::${enc(navUri)}`;
}
