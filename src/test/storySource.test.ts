import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { selectStorySource } from "@/lib/storySource";
import type { UserProfile } from "@/mock/types";

// Anchor "now" so the date-window math (15d / 30d / 60d / 365d) is
// deterministic. All test fixtures compute liked-track addedAt as
// `NOW - daysAgo * ONE_DAY`.
const NOW = new Date("2026-05-11T12:00:00Z").getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function liked(artist: string, title: string, daysAgo: number) {
  return {
    artist,
    title,
    imageUrl: "",
    uri: `spotify:track:${artist}-${title}`.replace(/\s/g, "_"),
    addedAt: new Date(NOW - daysAgo * ONE_DAY).toISOString(),
  };
}

function profile(opts: {
  liked?: ReturnType<typeof liked>[];
  topTracks?: { artist: string; title: string }[];
} = {}): UserProfile {
  const trackImages = (opts.topTracks ?? []).map((t) => ({
    artist: t.artist,
    title: t.title,
    imageUrl: "",
    uri: `spotify:track:${t.artist}-${t.title}`.replace(/\s/g, "_"),
  }));
  return {
    likedTracks: opts.liked ?? [],
    trackImages,
    topArtists: [],
    topTracks: [],
    artistImages: {},
    calculatedTier: "casual",
  } as unknown as UserProfile;
}

describe("selectStorySource", () => {
  it("returns empty when profile is null", () => {
    const res = selectStorySource(null, 5, new Map());
    expect(res.source).toBe("empty");
    expect(res.tracks).toEqual([]);
  });

  it("returns the freshest 5 from a single dense 15d window", () => {
    const res = selectStorySource(
      profile({
        liked: [
          liked("A", "1", 1),
          liked("B", "2", 2),
          liked("C", "3", 3),
          liked("D", "4", 5),
          liked("E", "5", 10),
          liked("F", "6", 14),
        ],
      }),
      5,
      new Map(),
    );
    expect(res.source).toBe("liked-15d");
    expect(res.tracks).toHaveLength(5);
    expect(res.tracks.map((t) => t.title)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("accumulates across windows: 4 in 15d + 1 in 30d returns the 4 freshest first", () => {
    // Reviewer note: previously this would have skipped the 15d window
    // entirely (only 4 < target 5) and returned 5 tracks from the 30d
    // window, demoting the 4 freshest. New behavior: take the 4 fresh
    // ones and fill remaining slot from 30d.
    const res = selectStorySource(
      profile({
        liked: [
          liked("Fresh1", "f1", 2),
          liked("Fresh2", "f2", 5),
          liked("Fresh3", "f3", 8),
          liked("Fresh4", "f4", 12),
          liked("Older1", "o1", 20),
          liked("Older2", "o2", 25),
          liked("Older3", "o3", 28),
        ],
      }),
      5,
      new Map(),
    );
    expect(res.source).toBe("liked-30d"); // widest window we had to consult
    expect(res.tracks).toHaveLength(5);
    expect(res.tracks.map((t) => t.title)).toEqual(["f1", "f2", "f3", "f4", "o1"]);
  });

  it("falls through to liked-365d when 60d isn't enough", () => {
    const res = selectStorySource(
      profile({
        liked: [
          liked("A", "1", 100),
          liked("B", "2", 200),
          liked("C", "3", 300),
          liked("D", "4", 350),
          liked("E", "5", 360),
        ],
      }),
      5,
      new Map(),
    );
    expect(res.source).toBe("liked-365d");
    expect(res.tracks).toHaveLength(5);
  });

  it("falls back to topTracks when no liked tracks exist", () => {
    const res = selectStorySource(
      profile({
        liked: [],
        topTracks: [
          { artist: "T1", title: "tt1" },
          { artist: "T2", title: "tt2" },
          { artist: "T3", title: "tt3" },
        ],
      }),
      5,
      new Map(),
    );
    expect(res.source).toBe("top-tracks");
    expect(res.tracks).toHaveLength(3); // honors what's available
  });

  it("excludes visited tracks", () => {
    const all = [
      liked("A", "1", 1),
      liked("B", "2", 2),
      liked("C", "3", 3),
      liked("D", "4", 4),
      liked("E", "5", 5),
      liked("F", "6", 6),
    ];
    const visited = new Map([
      ["A::1", Date.now()],
      ["B::2", Date.now()],
    ]);
    const res = selectStorySource(profile({ liked: all }), 5, visited);
    expect(res.tracks.map((t) => `${t.artist}::${t.title}`)).not.toContain("A::1");
    expect(res.tracks.map((t) => `${t.artist}::${t.title}`)).not.toContain("B::2");
  });

  it("returns 'empty' when nothing has a URI", () => {
    const noUri = profile({ liked: [] });
    // Force a profile with no usable data.
    const res = selectStorySource(noUri, 5, new Map());
    expect(res.source).toBe("empty");
  });

  // Regression: targetCount = 0 short-circuits the outer cascade loop
  // at entry (accumulated.length >= 0 is vacuously true), leaving
  // widestWindow at its initial 0. Before the guard, this emitted an
  // undocumented "liked-0d" through a union-type cast. Now the source
  // must fall through to one of the catch-all branches.
  it("never emits liked-0d when targetCount is 0", () => {
    const res = selectStorySource(
      profile({
        liked: [liked("A", "1", 1), liked("B", "2", 5)],
        topTracks: [{ artist: "T", title: "tt" }],
      }),
      0,
      new Map(),
    );
    expect(res.source).not.toMatch(/^liked-\d+d$/);
    // Cascade falls through to one of the catch-all branches —
    // liked-all (any-age unvisited likes exist) is the expected
    // landing spot here.
    expect(res.source).toBe("liked-all");
  });
});
