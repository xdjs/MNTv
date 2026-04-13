import { describe, it, expect } from "vitest";
import {
  resolveArtworkUrl,
  safeStorefront,
  normalizeAppleTrack,
  normalizeAppleArtistCompact,
  normalizeAppleAlbumListItem,
  buildAppleSongUri,
  isValidAppleCatalogId,
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

  it("returns empty strings on missing input", () => {
    expect(normalizeAppleArtistCompact(null)).toEqual({ id: "", name: "", imageUrl: "" });
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
});
