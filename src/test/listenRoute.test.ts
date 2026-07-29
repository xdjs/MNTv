import { describe, it, expect } from "vitest";
import { buildListenRoute } from "@/lib/listenRoute";

const BASE = { artist: "lamboverrice", title: "Will Kill", album: "ACT I" };

describe("buildListenRoute", () => {
  it("bakes the Spotify URI in for Spotify users so playback starts without a lookup", () => {
    const route = buildListenRoute({
      ...BASE,
      uri: "spotify:track:abc",
      streamingService: "Spotify",
    });
    expect(route).toBe(
      "/listen/real::lamboverrice::Will%20Kill::ACT%20I::spotify%3Atrack%3Aabc",
    );
  });

  // Handing Listen a Spotify URI locks it onto a track Apple can't play.
  it("withholds the Spotify URI from Apple Music users", () => {
    const route = buildListenRoute({
      ...BASE,
      uri: "spotify:track:abc",
      streamingService: "Apple Music",
    });
    expect(route.endsWith("::")).toBe(true);
    expect(route).not.toContain("spotify");
  });

  it("leaves the URI slot empty when there is no URI", () => {
    expect(buildListenRoute({ ...BASE, streamingService: "Spotify" })).toBe(
      "/listen/real::lamboverrice::Will%20Kill::ACT%20I::",
    );
  });

  // Only spotify:track: URIs are playable by Listen. An album or artist
  // URI in that slot would resolve to something the user didn't ask for.
  it("ignores a non-track Spotify URI", () => {
    const route = buildListenRoute({
      ...BASE,
      uri: "spotify:album:xyz",
      streamingService: "Spotify",
    });
    expect(route).not.toContain("album%3Axyz");
    expect(route.endsWith("::")).toBe(true);
  });

  it("treats an unknown service as non-Apple", () => {
    const route = buildListenRoute({ ...BASE, uri: "spotify:track:abc" });
    expect(route).toContain("spotify%3Atrack%3Aabc");
  });

  it("encodes separators in names so the route still parses", () => {
    const route = buildListenRoute({
      artist: "Tyler, the Creator",
      title: "Weird Fishes/Arpeggi",
      album: "A::B",
      streamingService: "Spotify",
    });
    expect(route.split("::")).toHaveLength(5);
    expect(route).toContain("Weird%20Fishes%2FArpeggi");
  });

  it("handles a missing album", () => {
    const route = buildListenRoute({ artist: "A", title: "B", streamingService: "Spotify" });
    expect(route).toBe("/listen/real::A::B::::");
  });
});
