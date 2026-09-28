import { appleGet, resolveArtworkUrl, type AppleArtwork, type AppleResource } from "./apple-utils.ts";

type Collection = { data?: AppleResource[] };
type Attributes = { name?: string; genreNames?: string[]; artwork?: AppleArtwork; releaseDate?: string; albumName?: string; isSingle?: boolean; url?: string };
const attrs = (r: AppleResource): Attributes => r.attributes ?? {};
const images = (r: AppleResource) => [{ url: resolveArtworkUrl(attrs(r).artwork) }];

/** Resolve only the catalog identity supplied by listening history or the route.
 * An absent/unavailable ID must never substitute a same-name artist. */
export async function fetchAppleUpdateCatalog(token: string, storefront: string, artistId?: string) {
  if (!artistId) return null;
  const prefix = `/catalog/${storefront}`;
  const result = await appleGet<Collection>(`${prefix}/artists/${artistId}?views=top-songs,latest-release`, token);
  if (!result) throw new Error("Apple artist catalog unavailable");
  const resource = result.data?.find((r) => r.id === artistId);
  if (!resource || !attrs(resource).name) return null;
  const artist = { id: artistId, name: attrs(resource).name!, images: images(resource), genres: attrs(resource).genreNames };
  const songs = (resource.views?.["top-songs"] as Collection | undefined)?.data ?? [];
  const tracks = songs.filter((r) => r.id && attrs(r).name).map((r) => ({
    name: attrs(r).name!, uri: `apple:song:${r.id}`,
    album: { name: attrs(r).albumName, release_date: attrs(r).releaseDate, images: images(r) },
  }));
  const latest = (resource.views?.["latest-release"] as Collection | undefined)?.data ?? [];
  const album = latest.filter((r) => r.id && attrs(r).releaseDate && attrs(r).name)
    .sort((a, b) => attrs(b).releaseDate!.localeCompare(attrs(a).releaseDate!))[0];
  const release = album ? {
    id: album.id!, name: attrs(album).name!, release_date: attrs(album).releaseDate!,
    album_type: attrs(album).isSingle ? "single" : "album", uri: `apple:album:${album.id}`,
    artists: [artist], images: images(album), external_urls: { apple: attrs(album).url },
  } : null;
  return { artist, tracks, release };
}
