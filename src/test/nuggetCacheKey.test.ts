import { describe, it, expect } from "vitest";
import { buildClientNuggetCacheKey } from "@/lib/nuggetCacheKey";

// Parity test: useAINuggets builds the in-mem cache key by concatenating
// React-Router-decoded params directly (`${trackId}::${tier}::${regen}`),
// where trackId arrives URL-encoded from the wildcard route param.
// usePreGeneratedStories must build the same string from raw fields.
// If these drift the "tap pink ring → instant nugget" UX breaks silently.

function buildReadSideKey(rawTrackId: string, tier: string, regenerateKey: number): string {
  // Mirrors the read path in src/hooks/useAINuggets.ts (the `cacheKey`
  // const inside generate()).
  return `${rawTrackId}::${tier}::${regenerateKey}`;
}

function buildStoryHrefTrackId(artist: string, title: string, uri: string): string {
  // The URL-encoded shape React Router hands useAINuggets as `trackId`
  // when a story tile is tapped. Mirrored the now-deleted StoriesRail's
  // `listenHrefForStory`; kept because the encoding contract it pins is
  // still what Listen receives, whichever surface builds the link.
  const enc = encodeURIComponent;
  return `real::${enc(artist)}::${enc(title)}::${enc("")}::${enc(uri)}`;
}

describe("buildClientNuggetCacheKey", () => {
  it("matches the read-side key for a vanilla ASCII story", () => {
    const args = { artist: "Dame Atlas", title: "loved you more", uri: "spotify:track:abc123XYZ" };
    const writeKey = buildClientNuggetCacheKey({ ...args, tier: "casual", regenerateKey: 0 });
    const rawTrackId = buildStoryHrefTrackId(args.artist, args.title, args.uri);
    const readKey = buildReadSideKey(rawTrackId, "casual", 0);
    expect(writeKey).toBe(readKey);
  });

  it("matches for titles with spaces, parens, and quotes", () => {
    const args = {
      artist: "Pete Rango",
      title: 'loved you more (Pete Rango Mix) "remix"',
      uri: "spotify:track:def456ABC",
    };
    const writeKey = buildClientNuggetCacheKey({ ...args, tier: "curious", regenerateKey: 0 });
    const readKey = buildReadSideKey(
      buildStoryHrefTrackId(args.artist, args.title, args.uri),
      "curious",
      0,
    );
    expect(writeKey).toBe(readKey);
  });

  it("matches for Apple Music URIs", () => {
    const args = { artist: "Cherele", title: "KIKI (feat. Pete Rango)", uri: "apple:song:1234567890" };
    const writeKey = buildClientNuggetCacheKey({ ...args, tier: "nerd", regenerateKey: 0 });
    const readKey = buildReadSideKey(
      buildStoryHrefTrackId(args.artist, args.title, args.uri),
      "nerd",
      0,
    );
    expect(writeKey).toBe(readKey);
  });

  it("matches when uri is undefined (Apple users pre-URI-resolve)", () => {
    const args = { artist: "Mavi Taylor", title: "demo" };
    const writeKey = buildClientNuggetCacheKey({ ...args, tier: "casual", regenerateKey: 0 });
    const readKey = buildReadSideKey(buildStoryHrefTrackId(args.artist, args.title, ""), "casual", 0);
    expect(writeKey).toBe(readKey);
  });

  it("varies by regenerateKey so repeat listens get a fresh cache slot", () => {
    const args = { artist: "X", title: "Y", uri: "spotify:track:Z", tier: "casual" };
    expect(buildClientNuggetCacheKey({ ...args, regenerateKey: 0 })).not.toBe(
      buildClientNuggetCacheKey({ ...args, regenerateKey: 1 }),
    );
  });

  it("varies by tier so a curious-tier cache row never serves nerd-tier read", () => {
    const args = { artist: "X", title: "Y", uri: "spotify:track:Z", regenerateKey: 0 };
    expect(buildClientNuggetCacheKey({ ...args, tier: "casual" })).not.toBe(
      buildClientNuggetCacheKey({ ...args, tier: "nerd" }),
    );
  });
});
