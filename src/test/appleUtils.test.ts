import { describe, it, expect } from "vitest";
import {
  resolveArtworkUrl,
  safeStorefront,
  isAppleService,
  normalizeAppleTrack,
  normalizeAppleArtistCompact,
  normalizeAppleAlbumListItem,
  buildAppleSongUri,
  isValidAppleCatalogId,
  pickBestArtistMatch,
  rankAppleArtists,
  buildUniqueAppleTracks,
} from "../../supabase/functions/_shared/apple-utils";

// These tests cover the pure normalizers that edge functions use to
// translate Apple Music API responses into the Spotify-compatible
// response shape. Kept pure (no fetch, no Deno globals) so Vitest runs
// them from Node without spinning up a Deno runtime.

describe("resolveArtworkUrl", () => {
  it("substitutes {w} and {h} in the template", () => {
    expect(
      resolveArtworkUrl({ url: "https://example.com/{w}x{h}bb.jpg" })
    ).toBe("https://example.com/600x600bb.jpg");
  });

  it("accepts custom width/height", () => {
    expect(
      resolveArtworkUrl({ url: "https://example.com/{w}x{h}bb.jpg" }, 300, 200)
    ).toBe("https://example.com/300x200bb.jpg");
  });

  it("returns an empty string when artwork is missing", () => {
    expect(resolveArtworkUrl(undefined)).toBe("");
    expect(resolveArtworkUrl(null)).toBe("");
    expect(resolveArtworkUrl({})).toBe("");
  });

  it("returns the URL unchanged when no placeholders are present", () => {
    expect(resolveArtworkUrl({ url: "https://example.com/static.jpg" }))
      .toBe("https://example.com/static.jpg");
  });

  it("handles templates with only one placeholder", () => {
    expect(resolveArtworkUrl({ url: "https://example.com/{w}bb.jpg" }))
      .toBe("https://example.com/600bb.jpg");
    expect(resolveArtworkUrl({ url: "https://example.com/{h}.jpg" }))
      .toBe("https://example.com/600.jpg");
  });

  it("returns an empty string when artwork has an empty url", () => {
    expect(resolveArtworkUrl({ url: "" })).toBe("");
  });
});

describe("isAppleService", () => {
  it("accepts both 'apple' and 'apple-music'", () => {
    expect(isAppleService("apple")).toBe(true);
    expect(isAppleService("apple-music")).toBe(true);
  });

  it("rejects spotify and unknown values", () => {
    expect(isAppleService("spotify")).toBe(false);
    expect(isAppleService("Apple")).toBe(false);
    expect(isAppleService("")).toBe(false);
    expect(isAppleService(undefined)).toBe(false);
    expect(isAppleService(null)).toBe(false);
    expect(isAppleService(42)).toBe(false);
  });
});

describe("safeStorefront", () => {
  it("lowercases 2-letter country codes", () => {
    expect(safeStorefront("US")).toBe("us");
    expect(safeStorefront("GB")).toBe("gb");
  });

  it("falls back to 'us' for invalid input", () => {
    expect(safeStorefront(undefined)).toBe("us");
    expect(safeStorefront("")).toBe("us");
    expect(safeStorefront("xyz")).toBe("us");
    expect(safeStorefront("u")).toBe("us");
    expect(safeStorefront(42 as unknown as string)).toBe("us");
  });

  it("trims whitespace and lowercases before validating", () => {
    expect(safeStorefront("  us  ")).toBe("us");
    expect(safeStorefront("Gb")).toBe("gb");
    expect(safeStorefront("\tjp\n")).toBe("jp");
  });

  it("rejects numeric or punctuation in the country slot", () => {
    expect(safeStorefront("u1")).toBe("us");
    expect(safeStorefront("u-")).toBe("us");
    expect(safeStorefront(null as unknown as string)).toBe("us");
  });
});

describe("normalizeAppleTrack", () => {
  it("maps a full Apple song resource to the Spotify-track shape", () => {
    const song = {
      id: "1609438415",
      type: "songs",
      attributes: {
        name: "Around the World",
        artistName: "Daft Punk",
        albumName: "Discovery",
        artwork: { url: "https://example.com/{w}x{h}bb.jpg", width: 3000, height: 3000 },
        durationInMillis: 429533,
        trackNumber: 7,
      },
    };

    expect(normalizeAppleTrack(song)).toEqual({
      title: "Around the World",
      artist: "Daft Punk",
      album: "Discovery",
      imageUrl: "https://example.com/600x600bb.jpg",
      uri: "apple:song:1609438415",
      durationMs: 429533,
      trackNumber: 7,
    });
  });

  it("returns safe defaults for missing fields", () => {
    const result = normalizeAppleTrack({ id: "123", attributes: {} });
    expect(result.title).toBe("");
    expect(result.artist).toBe("");
    expect(result.album).toBe("");
    expect(result.imageUrl).toBe("");
    expect(result.uri).toBe("apple:song:123");
    expect(result.durationMs).toBe(0);
    expect(result.trackNumber).toBeUndefined();
  });

  it("handles null input without throwing", () => {
    expect(normalizeAppleTrack(null).uri).toBe("");
  });
});

describe("normalizeAppleArtistCompact", () => {
  it("maps an Apple artist resource to { id, name, imageUrl }", () => {
    expect(normalizeAppleArtistCompact({
      id: "5468295",
      attributes: {
        name: "Daft Punk",
        artwork: { url: "https://example.com/{w}x{h}.jpg" },
      },
    })).toEqual({
      id: "5468295",
      name: "Daft Punk",
      imageUrl: "https://example.com/600x600.jpg",
    });
  });

  it("returns empty strings on null or undefined input", () => {
    expect(normalizeAppleArtistCompact(null)).toEqual({ id: "", name: "", imageUrl: "" });
    expect(normalizeAppleArtistCompact(undefined)).toEqual({ id: "", name: "", imageUrl: "" });
  });
});

describe("normalizeAppleAlbumListItem", () => {
  it("maps a full album to the Spotify album-list shape", () => {
    expect(normalizeAppleAlbumListItem({
      id: "1609438391",
      attributes: {
        name: "Discovery",
        artwork: { url: "https://example.com/{w}x{h}bb.jpg" },
        releaseDate: "2001-03-12",
        isSingle: false,
        trackCount: 14,
      },
    })).toEqual({
      name: "Discovery",
      imageUrl: "https://example.com/600x600bb.jpg",
      releaseDate: "2001-03-12",
      albumType: "album",
      totalTracks: 14,
      uri: "apple:album:1609438391",
    });
  });

  it("marks isSingle albums as albumType 'single'", () => {
    const result = normalizeAppleAlbumListItem({
      id: "1",
      attributes: { name: "x", isSingle: true },
    });
    expect(result.albumType).toBe("single");
  });

  it("returns safe defaults for null or undefined input", () => {
    const empty = { name: "", imageUrl: "", releaseDate: "", albumType: "album", totalTracks: 0, uri: "" };
    expect(normalizeAppleAlbumListItem(null)).toEqual(empty);
    expect(normalizeAppleAlbumListItem(undefined)).toEqual(empty);
  });
});

describe("buildAppleSongUri", () => {
  it("wraps a non-empty id", () => {
    expect(buildAppleSongUri("123")).toBe("apple:song:123");
  });

  it("returns an empty string for missing ids", () => {
    expect(buildAppleSongUri(undefined)).toBe("");
    expect(buildAppleSongUri(null)).toBe("");
    expect(buildAppleSongUri("")).toBe("");
  });
});

describe("isValidAppleCatalogId", () => {
  it("accepts numeric strings", () => {
    expect(isValidAppleCatalogId("1")).toBe(true);
    expect(isValidAppleCatalogId("1609438415")).toBe(true);
  });

  it("rejects non-numeric, empty, or non-string input", () => {
    expect(isValidAppleCatalogId("abc123")).toBe(false);
    expect(isValidAppleCatalogId("")).toBe(false);
    expect(isValidAppleCatalogId(42)).toBe(false);
    expect(isValidAppleCatalogId(undefined)).toBe(false);
  });

  it("rejects whitespace, signs, and floating-point", () => {
    expect(isValidAppleCatalogId(" 123")).toBe(false);
    expect(isValidAppleCatalogId("123 ")).toBe(false);
    expect(isValidAppleCatalogId("-1")).toBe(false);
    expect(isValidAppleCatalogId("+1")).toBe(false);
    expect(isValidAppleCatalogId("1.5")).toBe(false);
    expect(isValidAppleCatalogId("1e9")).toBe(false);
  });

  it("accepts leading zeros and zero itself", () => {
    expect(isValidAppleCatalogId("0")).toBe(true);
    expect(isValidAppleCatalogId("00012345")).toBe(true);
  });
});

describe("pickBestArtistMatch", () => {
  type Candidate = { id: string; name: string };
  const getName = (c: Candidate) => c.name;

  it("returns an exact case-insensitive match when present", () => {
    const candidates: Candidate[] = [
      { id: "1", name: "Daft Punky Similar" },
      { id: "2", name: "Daft Punk" },
      { id: "3", name: "DAFT punk Remix" },
    ];
    expect(pickBestArtistMatch(candidates, "daft punk", getName)).toEqual({ id: "2", name: "Daft Punk" });
    expect(pickBestArtistMatch(candidates, "DAFT PUNK", getName)).toEqual({ id: "2", name: "Daft Punk" });
  });

  it("trims whitespace on the target", () => {
    const candidates: Candidate[] = [{ id: "1", name: "Radiohead" }];
    expect(pickBestArtistMatch(candidates, "  Radiohead  ", getName)).toEqual({ id: "1", name: "Radiohead" });
  });

  it("falls back to first candidate when no exact match", () => {
    const candidates: Candidate[] = [
      { id: "1", name: "First" },
      { id: "2", name: "Second" },
    ];
    expect(pickBestArtistMatch(candidates, "nothing", getName)).toEqual({ id: "1", name: "First" });
  });

  it("returns undefined when candidate list is empty", () => {
    expect(pickBestArtistMatch<Candidate>([], "x", getName)).toBeUndefined();
  });

  it("handles candidates with missing name via accessor", () => {
    const candidates: Candidate[] = [
      { id: "1", name: "" },
      { id: "2", name: "Target" },
    ];
    expect(pickBestArtistMatch(candidates, "target", getName)).toEqual({ id: "2", name: "Target" });
  });

  it("returns first candidate for an empty target", () => {
    const candidates: Candidate[] = [{ id: "1", name: "First" }];
    expect(pickBestArtistMatch(candidates, "  ", getName)).toEqual({ id: "1", name: "First" });
  });
});

describe("rankAppleArtists", () => {
  it("ranks recent plays by frequency", () => {
    const recent = [
      { attributes: { artistName: "Daft Punk" } },
      { attributes: { artistName: "Daft Punk" } },
      { attributes: { artistName: "Radiohead" } },
    ];
    const { topArtists } = rankAppleArtists(recent, []);
    expect(topArtists).toEqual(["Daft Punk", "Radiohead"]);
  });

  it("weighs heavy rotation +3 over recent +1", () => {
    const recent = [
      { attributes: { artistName: "One-off" } },
      { attributes: { artistName: "One-off" } },
    ];
    const rotation = [
      { type: "albums", attributes: { artistName: "Heavy" } },
    ];
    // Heavy has score 3, One-off has score 2 — Heavy wins
    const { topArtists } = rankAppleArtists(recent, rotation);
    expect(topArtists).toEqual(["Heavy", "One-off"]);
  });

  it("skips non-artist/album rotation resources", () => {
    const rotation = [
      { type: "playlists", attributes: { name: "Today's Hits" } },
      { type: "stations", attributes: { name: "Chill Radio" } },
      { type: "albums", attributes: { artistName: "Legit Artist" } },
    ];
    const { topArtists } = rankAppleArtists([], rotation);
    expect(topArtists).toEqual(["Legit Artist"]);
  });

  it("captures artist id when resource type is 'artists'", () => {
    const rotation = [
      { id: "12345", type: "artists", attributes: { name: "Daft Punk" } },
    ];
    const { topArtists, artistIds } = rankAppleArtists([], rotation);
    expect(topArtists).toEqual(["Daft Punk"]);
    expect(artistIds).toEqual({ "Daft Punk": "12345" });
  });

  it("collects artist image URLs from first occurrence", () => {
    const recent = [
      { attributes: { artistName: "A", artwork: { url: "https://x/{w}x{h}.jpg" } } },
      { attributes: { artistName: "A", artwork: { url: "https://y/{w}x{h}.jpg" } } }, // ignored
    ];
    const { artistImages } = rankAppleArtists(recent, []);
    expect(artistImages["A"]).toBe("https://x/600x600.jpg");
  });

  it("caps the result list at maxArtists", () => {
    const recent = Array.from({ length: 30 }, (_, i) => ({
      attributes: { artistName: `Artist ${i}` },
    }));
    const { topArtists } = rankAppleArtists(recent, [], 20);
    expect(topArtists.length).toBe(20);
  });

  it("handles empty inputs gracefully", () => {
    const result = rankAppleArtists([], []);
    expect(result.topArtists).toEqual([]);
    expect(result.artistImages).toEqual({});
    expect(result.artistIds).toEqual({});
  });

  it("skips items missing artistName and name", () => {
    const recent = [{ attributes: {} }];
    const rotation = [{ type: "albums", attributes: {} }];
    expect(rankAppleArtists(recent, rotation).topArtists).toEqual([]);
  });
});

describe("buildUniqueAppleTracks", () => {
  it("builds unique (title, artist) tracks from recent plays", () => {
    const recent = [
      { id: "1", attributes: { name: "Song A", artistName: "Artist X", artwork: { url: "https://a/{w}x{h}.jpg" } } },
      { id: "2", attributes: { name: "Song B", artistName: "Artist Y" } },
    ];
    const tracks = buildUniqueAppleTracks(recent);
    expect(tracks.length).toBe(2);
    expect(tracks[0]).toEqual({
      title: "Song A",
      artist: "Artist X",
      imageUrl: "https://a/600x600.jpg",
      uri: "apple:song:1",
    });
  });

  it("dedupes on (title, artist) keeping the first occurrence", () => {
    const recent = [
      { id: "1", attributes: { name: "Duet", artistName: "X" } },
      { id: "2", attributes: { name: "Duet", artistName: "X" } },
      { id: "3", attributes: { name: "Other", artistName: "X" } },
    ];
    const tracks = buildUniqueAppleTracks(recent);
    expect(tracks.length).toBe(2);
    expect(tracks[0].uri).toBe("apple:song:1");
    expect(tracks[1].uri).toBe("apple:song:3");
  });

  it("respects the limit argument", () => {
    const recent = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      attributes: { name: `T${i}`, artistName: "X" },
    }));
    expect(buildUniqueAppleTracks(recent, 5).length).toBe(5);
  });

  it("skips items missing title or artist", () => {
    const recent = [
      { id: "1", attributes: { name: "", artistName: "X" } },
      { id: "2", attributes: { name: "Y", artistName: "" } },
      { id: "3", attributes: {} },
    ];
    expect(buildUniqueAppleTracks(recent)).toEqual([]);
  });

  it("handles empty input", () => {
    expect(buildUniqueAppleTracks([])).toEqual([]);
  });
});
