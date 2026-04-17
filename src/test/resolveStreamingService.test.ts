import { describe, it, expect } from "vitest";
import { resolveStreamingService } from "@/hooks/useMusicNerdState";

// Regression: useMusicNerdState previously force-set streamingService="Spotify"
// whenever dbProfile.topArtists existed, even for Apple Music users.
// This silently downgraded Apple Music users whose row still had legacy
// Spotify taste data. The new logic prefers the explicit service when set.

describe("resolveStreamingService", () => {
  it("returns the explicit service when provided (happy path)", () => {
    expect(resolveStreamingService("Spotify", 20)).toBe("Spotify");
    expect(resolveStreamingService("Apple Music", 20)).toBe("Apple Music");
    expect(resolveStreamingService("YouTube Music", 20)).toBe("YouTube Music");
  });

  it("preserves Apple Music even when topArtists is populated (the bug fix)", () => {
    // Scenario: user first connected Spotify, later switched to Apple Music.
    // Their row still carries Spotify-origin topArtists. The old logic
    // clobbered service back to "Spotify" on the next DB load — this test
    // locks that invariant.
    expect(resolveStreamingService("Apple Music", 20)).toBe("Apple Music");
  });

  it("falls back to Spotify when service is unset but topArtists is populated", () => {
    // Legacy rows from before streaming_service was persisted
    expect(resolveStreamingService(undefined, 15)).toBe("Spotify");
    expect(resolveStreamingService("", 15)).toBe("Spotify");
  });

  it("returns empty string when service is unset and no topArtists", () => {
    expect(resolveStreamingService(undefined, 0)).toBe("");
    expect(resolveStreamingService("", 0)).toBe("");
  });

  it("empty string service with populated artists still falls back to Spotify", () => {
    expect(resolveStreamingService("", 5)).toBe("Spotify");
  });

  it("doesn't downgrade YouTube Music or future services to Spotify even with artists", () => {
    expect(resolveStreamingService("YouTube Music", 100)).toBe("YouTube Music");
  });
});
