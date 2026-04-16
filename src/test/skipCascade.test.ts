import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickNextTrack, type InvokeFn } from "@/lib/skipCascade";
import type { UserProfile } from "@/mock/types";

// Stub window.MusicKit so withAppleStorefront doesn't hit a real MusicKit
// instance in the test environment. The storefront attachment is what makes
// the Apple P3 branch observable by the `invoke` assertions.
beforeEach(() => {
  (globalThis as unknown as { window: Window }).window = Object.assign(globalThis.window ?? {}, {
    MusicKit: { getInstance: () => ({ storefrontCountryCode: "us" }) },
  }) as Window;
});

// Lock Math.random to 0 so every "random" pick resolves to index 0. Keeps
// the tests deterministic without having to predict the weighted branches.
let randomSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => randomSpy.mockRestore());

const noHistory = () => false;

const baseDeps = {
  track: { artist: "Radiohead", title: "Karma Police" },
  trackUri: "spotify:track:abc",
  profile: null,
  spotifyAlbumUri: null,
  isInSessionHistory: noHistory,
};

function mockInvoke(map: Record<string, unknown | ((body: Record<string, unknown>) => unknown)>): InvokeFn {
  return vi.fn(async (name: string, options: { body: Record<string, unknown> }) => {
    const entry = map[name];
    if (entry === undefined) return { data: null };
    const data = typeof entry === "function" ? (entry as (b: Record<string, unknown>) => unknown)(options.body) : entry;
    return { data };
  });
}

describe("pickNextTrack skip cascade", () => {
  describe("Spotify user", () => {
    it("P1: returns the next album track when the current track is mid-album", async () => {
      const invoke = mockInvoke({
        "spotify-album": {
          tracks: [
            { artist: "Radiohead", title: "Karma Police", album: "OK Computer", uri: "spotify:track:abc" },
            { artist: "Radiohead", title: "Fitter Happier", album: "OK Computer", uri: "spotify:track:fitter" },
          ],
        },
      });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: false,
        spotifyAlbumUri: "spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE",
        invoke,
      });

      expect(pick).toEqual({
        artist: "Radiohead",
        title: "Fitter Happier",
        album: "OK Computer",
        uri: "spotify:track:fitter",
      });
      expect(invoke).toHaveBeenCalledWith("spotify-album", expect.objectContaining({
        body: expect.objectContaining({ service: "spotify" }),
      }));
    });

    it("P2: falls through to recommendations when no album continuation is available", async () => {
      const invoke = mockInvoke({
        "spotify-search": {
          tracks: [{ artist: "Portishead", title: "Roads", uri: "spotify:track:roads" }],
        },
      });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: false,
        spotifyAlbumUri: null,
        invoke,
      });

      expect(pick?.title).toBe("Roads");
      expect(invoke).toHaveBeenCalledWith("spotify-search", expect.objectContaining({
        body: expect.objectContaining({ recommend: "spotify:track:abc", service: "spotify" }),
      }));
    });

    it("P2: boosts recommendations from the user's top artists when present", async () => {
      const invoke = mockInvoke({
        "spotify-search": {
          tracks: [
            { artist: "Unknown Band", title: "Unranked", uri: "spotify:track:unknown" },
            { artist: "Pink Floyd", title: "Time", uri: "spotify:track:time" },
            { artist: "Random Act", title: "Random Song", uri: "spotify:track:random" },
          ],
        },
      });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: false,
        spotifyAlbumUri: null,
        profile: { topArtists: ["Pink Floyd"] } as UserProfile,
        invoke,
      });

      // Math.random = 0 picks index 0 of the boosted pool. Only Pink Floyd
      // matches the top-artist filter, so the boosted pool has one entry.
      expect(pick?.artist).toBe("Pink Floyd");
      expect(pick?.title).toBe("Time");
    });
  });

  describe("Apple Music user", () => {
    it("skips P1 and P2 entirely, calling spotify-artist with service: 'apple'", async () => {
      const invoke = mockInvoke({
        "spotify-artist": {
          topTracks: [{ artist: "Radiohead", title: "Lucky", uri: "apple:song:lucky", album: "OK Computer" }],
        },
      });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: true,
        spotifyAlbumUri: "spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE",
        invoke,
      });

      expect(pick).toEqual({
        artist: "Radiohead",
        title: "Lucky",
        album: "OK Computer",
        uri: "apple:song:lucky",
      });

      // Only the P3 call should have fired — P1 (spotify-album) and P2
      // (spotify-search) must be completely skipped.
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("spotify-artist", expect.objectContaining({
        body: expect.objectContaining({
          service: "apple",
          artistName: "Radiohead",
          storefront: "us",
        }),
      }));
    });

    it("falls through P3 → P4 using profile.trackImages when artist has no fresh top tracks", async () => {
      const invoke = mockInvoke({ "spotify-artist": { topTracks: [] } });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: true,
        profile: {
          trackImages: [
            { title: "Glory", artist: "Jamie xx", imageUrl: "x.jpg", uri: "apple:song:glory" },
          ],
        } as UserProfile,
        invoke,
      });

      expect(pick).toEqual({
        artist: "Jamie xx",
        title: "Glory",
        album: "",
        uri: "apple:song:glory",
      });
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it("falls through P3 + P4 → P5 demo fallback, filtering to tracks with an appleMusicUri", async () => {
      const invoke = mockInvoke({ "spotify-artist": { topTracks: [] } });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: true,
        profile: { streamingService: "Apple Music", trackImages: [] } as UserProfile,
        invoke,
      });

      // P5 picks a demo track. We only assert it returned one — any demo
      // with an appleMusicUri is valid given Math.random = 0.
      expect(pick).not.toBeNull();
      expect(pick?.uri).toBeTruthy();
    });
  });

  describe("session history", () => {
    it("filters out tracks already in the session history at every level", async () => {
      const history = new Set(["radiohead::lucky"]);
      const invoke = mockInvoke({
        "spotify-artist": {
          topTracks: [
            { artist: "Radiohead", title: "Lucky", uri: "apple:song:lucky" },
            { artist: "Radiohead", title: "Exit Music", uri: "apple:song:exit" },
          ],
        },
      });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: true,
        isInSessionHistory: (a, t) => history.has(`${a.toLowerCase()}::${t.toLowerCase()}`),
        invoke,
      });

      expect(pick?.title).toBe("Exit Music");
    });
  });

  describe("exhausted", () => {
    it("returns null only when every level falls through and all demos are in history", async () => {
      const invoke = mockInvoke({
        "spotify-album": { tracks: [] },
        "spotify-search": { tracks: [] },
        "spotify-artist": { topTracks: [] },
      });

      const pick = await pickNextTrack({
        ...baseDeps,
        isAppleMusicUser: false,
        profile: { trackImages: [] } as UserProfile,
        // Mark every artist/title as played — demos included.
        isInSessionHistory: () => true,
        invoke,
      });

      expect(pick).toBeNull();
    });
  });
});
