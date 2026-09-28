// Build playback routes with exact song IDs for the listener’s service.
// Cross-service URIs are omitted so Listen can resolve a playable equivalent.

export interface ListenRouteParams {
  artist: string;
  artistId?: string;
  title: string;
  album?: string;
  /** Spotify track or Apple song URI, when known. */
  uri?: string;
  /** Selects which service’s song URIs can be passed to playback. */
  streamingService?: string | null;
}

export function buildListenRoute({
  artist,
  artistId,
  title,
  album,
  uri,
  streamingService,
}: ListenRouteParams): string {
  const enc = encodeURIComponent;
  const isAppleUser = streamingService === "Apple Music";
  const isSpotifyTrackUri = !!uri && uri.startsWith("spotify:track:");
  const navUri = (isAppleUser ? uri?.startsWith("apple:song:") : isSpotifyTrackUri) ? uri! : "";
  const identity = artistId && navUri ? `?artistId=${enc(artistId)}` : "";
  return `/listen/real::${enc(artist)}::${enc(title)}::${enc(album ?? "")}::${enc(navUri)}${identity}`;
}
