import { describe, it, expect } from "vitest";
import { getServiceFromUri, getIdFromUri } from "./trackUri";

describe("getServiceFromUri", () => {
  it("detects spotify URIs", () => {
    expect(getServiceFromUri("spotify:track:7KXjTSCq5nL1LoYtL7XAwS")).toBe("spotify");
  });

  it("detects apple URIs", () => {
    expect(getServiceFromUri("apple:song:1440833060")).toBe("apple-music");
  });

  it("returns none for unknown prefix", () => {
    expect(getServiceFromUri("youtube:video:abc")).toBe("none");
  });

  it("returns none for empty string", () => {
    expect(getServiceFromUri("")).toBe("none");
  });
});

describe("getIdFromUri", () => {
  it("extracts Spotify track ID", () => {
    expect(getIdFromUri("spotify:track:7KXjTSCq5nL1LoYtL7XAwS")).toBe("7KXjTSCq5nL1LoYtL7XAwS");
  });

  it("extracts Apple Music catalog ID", () => {
    expect(getIdFromUri("apple:song:1440833060")).toBe("1440833060");
  });

  it("returns last segment for unknown format", () => {
    expect(getIdFromUri("random:foo:bar:baz")).toBe("baz");
  });

  it("returns empty string for empty input", () => {
    expect(getIdFromUri("")).toBe("");
  });
});
