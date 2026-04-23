import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/useSpotifyAuth", () => ({
  fetchSpotifyTaste: vi.fn(),
}));

import { completeSpotifyConnect } from "@/hooks/completeSpotifyConnect";
import { fetchSpotifyTaste } from "@/hooks/useSpotifyAuth";

const mockedFetch = fetchSpotifyTaste as ReturnType<typeof vi.fn>;

describe("completeSpotifyConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Spotify-shaped profile patch from the access token", async () => {
    mockedFetch.mockResolvedValue({
      topArtists: ["Beach House"],
      topTracks: ["Space Song"],
      artistImages: { "Beach House": "http://img" },
      artistIds: { "Beach House": "abc" },
      trackImages: [],
      displayName: "Jane",
    });

    const patch = await completeSpotifyConnect("access-token");
    expect(patch).toEqual({
      streamingService: "Spotify",
      spotifyDisplayName: "Jane",
      topArtists: ["Beach House"],
      topTracks: ["Space Song"],
      artistImages: { "Beach House": "http://img" },
      artistIds: { "Beach House": "abc" },
      trackImages: [],
    });
  });

  it("returns null when taste fetch fails", async () => {
    mockedFetch.mockResolvedValue(null);
    const patch = await completeSpotifyConnect("access-token");
    expect(patch).toBeNull();
  });

  it("omits displayName when absent", async () => {
    mockedFetch.mockResolvedValue({
      topArtists: [],
      topTracks: [],
      artistImages: {},
      artistIds: {},
      trackImages: [],
      displayName: null,
    });
    const patch = await completeSpotifyConnect("access-token");
    expect(patch?.spotifyDisplayName).toBeUndefined();
  });
});
