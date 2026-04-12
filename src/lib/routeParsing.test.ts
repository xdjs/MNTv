import { describe, it, expect } from "vitest";
import {
  isSpotifyPrefix,
  isRealPrefix,
  isApplePrefix,
  parseSpotifyArtist,
  parseRealArtist,
  parseSpotifyAlbum,
  parseAppleArtist,
  parseAppleAlbum,
} from "./routeParsing";

describe("isSpotifyPrefix", () => {
  it("detects raw spotify:: prefix", () => {
    expect(isSpotifyPrefix("spotify::abc123::Radiohead")).toBe(true);
  });

  it("detects URL-encoded spotify:: prefix", () => {
    expect(isSpotifyPrefix("spotify%3A%3Aabc123%3A%3ARadiohead")).toBe(true);
  });

  it("rejects real:: prefix", () => {
    expect(isSpotifyPrefix("real::Radiohead")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isSpotifyPrefix(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSpotifyPrefix("")).toBe(false);
  });
});

describe("isRealPrefix", () => {
  it("detects raw real:: prefix", () => {
    expect(isRealPrefix("real::Radiohead")).toBe(true);
  });

  it("detects URL-encoded real:: prefix", () => {
    expect(isRealPrefix("real%3A%3ARadiohead")).toBe(true);
  });

  it("rejects spotify:: prefix", () => {
    expect(isRealPrefix("spotify::abc123::Radiohead")).toBe(false);
  });
});

describe("parseSpotifyArtist", () => {
  it("parses raw spotify::{id}::{name}", () => {
    const result = parseSpotifyArtist("spotify::4Z8W4fKeB5YxbusRsdQVPb::Radiohead");
    expect(result).toEqual({ spotifyId: "4Z8W4fKeB5YxbusRsdQVPb", artistName: "Radiohead" });
  });

  it("parses URL-encoded input", () => {
    const raw = encodeURIComponent("spotify::4Z8W4fKeB5YxbusRsdQVPb::Radiohead");
    const result = parseSpotifyArtist(raw);
    expect(result).toEqual({ spotifyId: "4Z8W4fKeB5YxbusRsdQVPb", artistName: "Radiohead" });
  });

  it("handles artist names with special characters", () => {
    const result = parseSpotifyArtist("spotify::abc123::Beyoncé");
    expect(result).toEqual({ spotifyId: "abc123", artistName: "Beyoncé" });
  });

  it("handles URL-encoded artist names with special characters", () => {
    const encoded = `spotify%3A%3Aabc123%3A%3A${encodeURIComponent("Beyoncé")}`;
    const result = parseSpotifyArtist(encoded);
    expect(result).toEqual({ spotifyId: "abc123", artistName: "Beyoncé" });
  });

  it("returns null for missing ID", () => {
    expect(parseSpotifyArtist("spotify::::Radiohead")).toBeNull();
  });

  it("returns null for non-spotify prefix", () => {
    expect(parseSpotifyArtist("real::Radiohead")).toBeNull();
  });

  it("returns empty artistName when name segment is missing", () => {
    const result = parseSpotifyArtist("spotify::abc123");
    expect(result).toEqual({ spotifyId: "abc123", artistName: "" });
  });
});

describe("parseRealArtist", () => {
  it("parses raw real::{name}", () => {
    expect(parseRealArtist("real::Radiohead")).toBe("Radiohead");
  });

  it("parses URL-encoded input", () => {
    const raw = encodeURIComponent("real::Radiohead");
    expect(parseRealArtist(raw)).toBe("Radiohead");
  });

  it("handles names with special characters", () => {
    expect(parseRealArtist("real::Sigur Rós")).toBe("Sigur Rós");
  });

  it("returns null for empty name", () => {
    expect(parseRealArtist("real::")).toBeNull();
  });

  it("returns null for non-real prefix", () => {
    expect(parseRealArtist("spotify::abc::name")).toBeNull();
  });
});

describe("parseSpotifyAlbum", () => {
  it("parses spotify::{albumId}::{artistName}::{artistId}", () => {
    const result = parseSpotifyAlbum("spotify::6dVIqQ8qmQ5GBnJ9shOYGE::Radiohead::4Z8W4fKeB5YxbusRsdQVPb");
    expect(result).toEqual({
      spotifyAlbumId: "6dVIqQ8qmQ5GBnJ9shOYGE",
      artistName: "Radiohead",
      artistSpotifyId: "4Z8W4fKeB5YxbusRsdQVPb",
    });
  });

  it("parses URL-encoded input", () => {
    const raw = encodeURIComponent("spotify::6dVIqQ8qmQ5GBnJ9shOYGE::Radiohead::4Z8W4fKeB5YxbusRsdQVPb");
    const result = parseSpotifyAlbum(raw);
    expect(result).toEqual({
      spotifyAlbumId: "6dVIqQ8qmQ5GBnJ9shOYGE",
      artistName: "Radiohead",
      artistSpotifyId: "4Z8W4fKeB5YxbusRsdQVPb",
    });
  });

  it("handles missing artistSpotifyId", () => {
    const result = parseSpotifyAlbum("spotify::albumId123::Some Artist");
    expect(result).toEqual({
      spotifyAlbumId: "albumId123",
      artistName: "Some Artist",
      artistSpotifyId: "",
    });
  });

  it("returns null for missing albumId", () => {
    expect(parseSpotifyAlbum("spotify::::ArtistName::artistId")).toBeNull();
  });

  it("returns null for non-spotify prefix", () => {
    expect(parseSpotifyAlbum("real::something")).toBeNull();
  });

  it("round-trips with encodeURIComponent construction", () => {
    // Simulates how ArtistProfile.tsx constructs album URLs
    const albumId = "6dVIqQ8qmQ5GBnJ9shOYGE";
    const artistName = "Daft Punk";
    const artistId = "4tZwfgrHOc3mvqYlEYSvVi";
    const constructed = `spotify::${albumId}::${encodeURIComponent(artistName)}::${artistId}`;
    const result = parseSpotifyAlbum(constructed);
    expect(result).toEqual({
      spotifyAlbumId: albumId,
      artistName: "Daft Punk",
      artistSpotifyId: artistId,
    });
  });
});

describe("isApplePrefix", () => {
  it("detects raw apple:: prefix", () => {
    expect(isApplePrefix("apple::178834::Radiohead")).toBe(true);
  });

  it("detects URL-encoded apple:: prefix", () => {
    expect(isApplePrefix("apple%3A%3A178834%3A%3ARadiohead")).toBe(true);
  });

  it("rejects spotify:: prefix", () => {
    expect(isApplePrefix("spotify::abc123::Radiohead")).toBe(false);
  });

  it("rejects real:: prefix", () => {
    expect(isApplePrefix("real::Radiohead")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isApplePrefix(undefined)).toBe(false);
  });
});

describe("parseAppleArtist", () => {
  it("parses raw apple::{id}::{name}", () => {
    const result = parseAppleArtist("apple::178834::Radiohead");
    expect(result).toEqual({ appleId: "178834", artistName: "Radiohead" });
  });

  it("parses URL-encoded input", () => {
    const raw = encodeURIComponent("apple::178834::Radiohead");
    const result = parseAppleArtist(raw);
    expect(result).toEqual({ appleId: "178834", artistName: "Radiohead" });
  });

  it("handles names with special characters", () => {
    const result = parseAppleArtist("apple::1234::Beyoncé");
    expect(result).toEqual({ appleId: "1234", artistName: "Beyoncé" });
  });

  it("returns null for missing ID", () => {
    expect(parseAppleArtist("apple::::Radiohead")).toBeNull();
  });

  it("returns null for non-apple prefix", () => {
    expect(parseAppleArtist("spotify::abc::name")).toBeNull();
  });

  it("returns empty artistName when name segment is missing", () => {
    const result = parseAppleArtist("apple::178834");
    expect(result).toEqual({ appleId: "178834", artistName: "" });
  });
});

describe("parseAppleAlbum", () => {
  it("parses apple::{albumId}::{artistName}::{artistId}", () => {
    const result = parseAppleAlbum("apple::1440833060::Radiohead::178834");
    expect(result).toEqual({
      appleAlbumId: "1440833060",
      artistName: "Radiohead",
      artistAppleId: "178834",
    });
  });

  it("parses URL-encoded input", () => {
    const raw = encodeURIComponent("apple::1440833060::Radiohead::178834");
    const result = parseAppleAlbum(raw);
    expect(result).toEqual({
      appleAlbumId: "1440833060",
      artistName: "Radiohead",
      artistAppleId: "178834",
    });
  });

  it("handles missing artistAppleId", () => {
    const result = parseAppleAlbum("apple::1440833060::Some Artist");
    expect(result).toEqual({
      appleAlbumId: "1440833060",
      artistName: "Some Artist",
      artistAppleId: "",
    });
  });

  it("returns null for missing albumId", () => {
    expect(parseAppleAlbum("apple::::ArtistName::artistId")).toBeNull();
  });

  it("returns null for non-apple prefix", () => {
    expect(parseAppleAlbum("spotify::something::artist")).toBeNull();
  });
});
