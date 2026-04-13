import { describe, it, expect } from "vitest";
import { DEMO_TRACKS, getDemoTrackUri, getDemoTrackById, type DemoTrackMeta } from "./seedNuggets";

describe("getDemoTrackUri", () => {
  const withApple: DemoTrackMeta = {
    id: "test-with-apple",
    artist: "Daft Punk",
    title: "Around the World",
    album: "Homework",
    trackUri: "spotify:track:1pKYYY0dkg23sQQXi0Q5zN",
    appleMusicUri: "apple:song:1609438415",
    coverArtUrl: "https://example.com/cover.jpg",
    slug: "daftpunk",
  };

  const withoutApple: DemoTrackMeta = {
    id: "test-no-apple",
    artist: "Radiohead",
    title: "Weird Fishes/Arpeggi",
    album: "In Rainbows",
    trackUri: "spotify:track:4wajJ1o7jWIg62YqpkHC7S",
    coverArtUrl: "https://example.com/cover.jpg",
    slug: "radiohead",
  };

  it("returns appleMusicUri when service is 'Apple Music' and appleMusicUri is set", () => {
    expect(getDemoTrackUri(withApple, "Apple Music")).toBe("apple:song:1609438415");
  });

  it("falls back to trackUri when service is 'Apple Music' but appleMusicUri is missing", () => {
    expect(getDemoTrackUri(withoutApple, "Apple Music")).toBe("spotify:track:4wajJ1o7jWIg62YqpkHC7S");
  });

  it("returns trackUri when service is 'Spotify'", () => {
    expect(getDemoTrackUri(withApple, "Spotify")).toBe("spotify:track:1pKYYY0dkg23sQQXi0Q5zN");
  });

  it("returns trackUri when service is undefined (guest)", () => {
    expect(getDemoTrackUri(withApple, undefined)).toBe("spotify:track:1pKYYY0dkg23sQQXi0Q5zN");
  });

  it("returns trackUri when service is empty string", () => {
    expect(getDemoTrackUri(withApple, "")).toBe("spotify:track:1pKYYY0dkg23sQQXi0Q5zN");
  });

  it("returns trackUri when service is 'YouTube Music' (no handling yet)", () => {
    expect(getDemoTrackUri(withApple, "YouTube Music")).toBe("spotify:track:1pKYYY0dkg23sQQXi0Q5zN");
  });
});

describe("DEMO_TRACKS shape", () => {
  it("every demo track has a valid trackUri", () => {
    for (const demo of DEMO_TRACKS) {
      expect(demo.trackUri).toMatch(/^spotify:track:/);
    }
  });

  it("every demo track has an Apple Music URI (cross-service playability)", () => {
    for (const demo of DEMO_TRACKS) {
      expect(demo.appleMusicUri, `${demo.id} is missing appleMusicUri`).toBeTruthy();
    }
  });

  it("Apple Music URIs follow the apple:song:{id} format", () => {
    for (const demo of DEMO_TRACKS) {
      if (demo.appleMusicUri) {
        expect(demo.appleMusicUri).toMatch(/^apple:song:\d+$/);
      }
    }
  });

  it("Around the World has an appleMusicUri (regression: fast-path testing track)", () => {
    const track = getDemoTrackById("demo-around-the-world");
    expect(track).not.toBeNull();
    expect(track?.appleMusicUri).toBe("apple:song:1609438415");
  });
});

describe("getDemoTrackById", () => {
  it("returns the full metadata for a known id", () => {
    const track = getDemoTrackById("demo-around-the-world");
    expect(track?.artist).toBe("Daft Punk");
    expect(track?.title).toBe("Around the World");
    expect(track?.slug).toBe("daftpunk");
  });

  it("returns null for unknown id", () => {
    expect(getDemoTrackById("demo-nonexistent")).toBeNull();
  });

  it("returns null for empty id", () => {
    expect(getDemoTrackById("")).toBeNull();
  });
});
