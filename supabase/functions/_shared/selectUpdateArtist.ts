/** An explicit catalog ID wins. Without one, require an unambiguous name. */
export function selectUpdateArtist<T extends { id: string; name: string }>(
  candidates: T[], name: string, spotifyArtistId?: string,
): T | null {
  if (spotifyArtistId) return candidates.find((artist) => artist.id === spotifyArtistId) ?? null;
  const exact = candidates.filter((artist) => artist.name.trim().toLowerCase() === name.trim().toLowerCase());
  const unique = [...new Map(exact.map((artist) => [artist.id, artist])).values()];
  return unique.length === 1 ? unique[0] : null;
}
