import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAppleUpdateCatalog } from "../../supabase/functions/_shared/appleUpdateCatalog";
import { enrichAppleListeningArtists, rankAppleArtists, type AppleResource } from "../../supabase/functions/_shared/apple-utils";
import { artistUpdatesCacheKey } from "../../supabase/functions/_shared/artistUpdatesCacheKey";
import { buildListenRoute } from "@/lib/listenRoute";

afterEach(() => vi.unstubAllGlobals());
const artist = (id: string) => ({ id, type: "artists", attributes: { name: "LIL LIL" } });
const song = (artistId: string): AppleResource => ({ id: "22", type: "songs", attributes: { name: "A song", artistName: "LIL LIL" }, relationships: { artists: { data: [artist(artistId)] } } });

describe("Apple listening identity", () => {
  it("uses the artist relationships of the actual catalog songs and albums", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [song("123")] })));
    vi.stubGlobal("fetch", fetchMock);
    const items = await enrichAppleListeningArtists([{ id: "22", type: "songs", attributes: { artistName: "LIL LIL" } }], "token", "gb");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.music.apple.com/v1/catalog/gb/songs?ids=22&include=artists");
    expect(rankAppleArtists(items, []).artistIds).toEqual({ "LIL LIL": "123" });
  });
  it("keeps the most-listened identity when two artists share a name", () => {
    expect(rankAppleArtists([song("wrong"), song("right"), song("right")], []).artistIds).toEqual({ "LIL LIL": "right" });
  });
  it("does not manufacture IDs when catalog enrichment fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const items = await enrichAppleListeningArtists([{ id: "22", type: "songs", attributes: { artistName: "LIL LIL" } }], "token", "us");
    expect(rankAppleArtists(items, []).artistIds).toEqual({});
  });
  it("loads Apple release and song targets by ID without name search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ ...artist("123"), views: {
      "top-songs": { data: [{ id: "456", attributes: { name: "Their song", albumName: "Their album" } }] },
      "latest-release": { data: [{ id: "789", attributes: { name: "Their album", releaseDate: "2026-09-01", url: "https://music.apple.com/gb/album/789" } }] },
    } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchAppleUpdateCatalog("token", "gb", "123");
    expect(fetchMock.mock.calls[0][0]).toContain("/catalog/gb/artists/123?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.artist.id).toBe("123");
    expect(result?.tracks[0].uri).toBe("apple:song:456");
    expect(result?.release?.uri).toBe("apple:album:789");
    expect(buildListenRoute({ artist: "LIL LIL", title: "Their song", uri: result?.tracks[0].uri, streamingService: "Apple Music" })).toContain("apple%3Asong%3A456");
  });
  it("never substitutes another artist when the ID is absent or mismatched", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [artist("999")] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAppleUpdateCatalog("token", "us")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fetchAppleUpdateCatalog("token", "us", "123")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("isolates service, storefront and same-name identity caches", () => {
    const key = artistUpdatesCacheKey("LIL LIL", "casual", "123", "apple", "gb");
    expect(key).not.toBe(artistUpdatesCacheKey("LIL LIL", "casual", "123"));
    expect(key).not.toBe(artistUpdatesCacheKey("LIL LIL", "casual", "123", "apple", "us"));
    expect(key).not.toBe(artistUpdatesCacheKey("LIL LIL", "casual", "999", "apple", "gb"));
  });
});
