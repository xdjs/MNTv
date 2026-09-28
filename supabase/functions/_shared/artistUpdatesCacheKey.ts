/** Keep same-name Spotify artists in separate cache rows. v4 excludes old
 * name-only rows that may contain a different artist's releases and facts. */
export function artistUpdatesCacheKey(name: string, tier: string, spotifyArtistId?: string, service: "apple" | "spotify" = "spotify", storefront = "us"): string {
  const identity = service === "apple" ? `apple::${storefront}::${spotifyArtistId ?? name.trim().toLowerCase()}` : spotifyArtistId ? `spotify::${spotifyArtistId}` : name.trim().toLowerCase();
  return `artist::${identity}::${tier}::v4`;
}
