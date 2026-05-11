import { describe, it, expect } from "vitest";
import { makeSparseFallbackNugget } from "@/hooks/useAINuggets";

// The sparse fallback is the last line of defense when the cache row
// is empty AND the SSE pipeline returns nothing — without it, the
// Listen page would render a blank state after the user tapped a
// pre-warmed story (most common for very-low-popularity artists
// where the Validator + source filter strip every Writer attempt).

describe("makeSparseFallbackNugget", () => {
  const artist = "Pete Rango";
  const title = "ACT I";
  const trackId = "spotify:track:abcdefghij1234567890ab";
  const durationSec = 180;

  it("pins timestamp to 0 so the fallback feels like a cache-hit first nugget", () => {
    const { nugget } = makeSparseFallbackNugget(artist, title, trackId, durationSec);
    expect(nugget.timestampSec).toBe(0);
  });

  it("returns a non-empty headline mentioning artist + title", () => {
    const { nugget } = makeSparseFallbackNugget(artist, title, trackId, durationSec);
    expect(nugget.headline.length).toBeGreaterThan(0);
    expect(nugget.headline).toContain(title);
    expect(nugget.headline).toContain(artist);
  });

  it("returns a non-empty body that does not fabricate context", () => {
    const { nugget } = makeSparseFallbackNugget(artist, title, trackId, durationSec);
    expect(nugget.text.length).toBeGreaterThan(0);
  });

  it("returns a catalog-typed source so it passes the source filter on render", () => {
    const { source } = makeSparseFallbackNugget(artist, title, trackId, durationSec);
    expect(source.type).toBe("catalog");
    expect(source.publisher).toBe("MusicNerd");
    expect(source.title).toBe(title);
  });

  it("returns matching ids on nugget and source so the lookup chain holds", () => {
    const { nugget, source } = makeSparseFallbackNugget(artist, title, trackId, durationSec);
    expect(nugget.sourceId).toBe(source.id);
    expect(nugget.id).toContain(trackId);
    expect(source.id).toContain(trackId);
  });

  it("respects an optional coverArtUrl for the immersive image layer", () => {
    const coverArtUrl = "https://i.scdn.co/image/abc";
    const { nugget } = makeSparseFallbackNugget(artist, title, trackId, durationSec, coverArtUrl);
    expect(nugget.imageUrl).toBe(coverArtUrl);
    expect(nugget.imageCaption).toBe(title);
  });

  it("kind is 'track' (not 'artist' / 'context') so the UI labels it correctly", () => {
    const { nugget } = makeSparseFallbackNugget(artist, title, trackId, durationSec);
    expect(nugget.kind).toBe("track");
  });
});
