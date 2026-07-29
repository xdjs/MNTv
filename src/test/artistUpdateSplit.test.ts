import { describe, it, expect } from "vitest";
import { splitArtistUpdates, resolvePlayTarget, type PlayableTrack } from "@/lib/artistUpdateSplit";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

function update(over: Partial<ArtistUpdate> = {}): ArtistUpdate {
  return {
    artistId: "a1",
    artistName: "lamboverrice",
    artistImageUrl: "https://example.com/a.jpg",
    kind: "fact",
    headline: "A headline.",
    body: "A body.",
    ...over,
  };
}

const RELEASE = update({
  kind: "new-release",
  headline: "New single out.",
  relatedTrackTitle: "Will Kill",
  relatedAlbumName: "ACT I",
  relatedTrackUri: "spotify:track:abc",
});

describe("splitArtistUpdates", () => {
  it("returns empty lanes for no updates", () => {
    expect(splitArtistUpdates([])).toEqual({ facts: [], tracks: [] });
    expect(splitArtistUpdates(null)).toEqual({ facts: [], tracks: [] });
    expect(splitArtistUpdates(undefined)).toEqual({ facts: [], tracks: [] });
  });

  it("treats a resolved release as a playable track", () => {
    const { tracks } = splitArtistUpdates([RELEASE]);
    expect(tracks).toEqual([
      {
        title: "Will Kill",
        album: "ACT I",
        uri: "spotify:track:abc",
        imageUrl: "https://example.com/a.jpg",
      },
    ]);
  });

  // Release/collab updates carry the ALBUM cover in artistImageUrl, which
  // is what lets a track tile look like the rest of the cards instead of
  // a bare text pill.
  it("carries cover art through so tiles can render artwork", () => {
    const { tracks } = splitArtistUpdates([RELEASE]);
    expect(tracks[0].imageUrl).toBe("https://example.com/a.jpg");
  });

  it("leaves imageUrl undefined when the update has no image", () => {
    const noImage = { ...RELEASE, artistImageUrl: "" };
    const { tracks } = splitArtistUpdates([noImage]);
    expect(tracks[0].imageUrl).toBeUndefined();
  });

  it("keeps a release card readable as well as playable", () => {
    const { facts } = splitArtistUpdates([RELEASE]);
    expect(facts).toContain(RELEASE);
  });

  // Server-side album-track lookup can fail. The copy is still worth
  // reading, so the card must not vanish just because it lost its track.
  it("keeps a release whose track never resolved in the fact lane", () => {
    const unresolved = update({ kind: "new-release", relatedTrackTitle: undefined });
    const { facts, tracks } = splitArtistUpdates([unresolved]);
    expect(facts).toContain(unresolved);
    expect(tracks).toEqual([]);
  });

  it("does not treat a plain fact as playable", () => {
    const { tracks } = splitArtistUpdates([update()]);
    expect(tracks).toEqual([]);
  });

  it("appends catalog tracks supplied by the edge function", () => {
    const extra: PlayableTrack[] = [{ title: "Loose End", album: "ACT I", uri: "spotify:track:def" }];
    const { tracks } = splitArtistUpdates([RELEASE], extra);
    expect(tracks.map((t) => t.title)).toEqual(["Will Kill", "Loose End"]);
  });

  it("de-duplicates a catalog track that an update already covers", () => {
    const extra: PlayableTrack[] = [{ title: "will kill", album: "ACT I" }];
    const { tracks } = splitArtistUpdates([RELEASE], extra);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].uri).toBe("spotify:track:abc");
  });

  it("ignores tracks with a blank title", () => {
    const { tracks } = splitArtistUpdates([], [{ title: "   ", album: "" }]);
    expect(tracks).toEqual([]);
  });

  it("works with no catalog tracks supplied, as today", () => {
    const { facts, tracks } = splitArtistUpdates([update(), RELEASE]);
    expect(facts).toHaveLength(2);
    expect(tracks).toHaveLength(1);
  });
});

describe("resolvePlayTarget", () => {
  it("prefers the update's own track", () => {
    const others: PlayableTrack[] = [{ title: "Loose End", album: "ACT I" }];
    expect(resolvePlayTarget(RELEASE, others)?.title).toBe("Will Kill");
  });

  it("falls back to the artist's first track for a plain fact", () => {
    const others: PlayableTrack[] = [{ title: "Loose End", album: "ACT I" }];
    expect(resolvePlayTarget(update(), others)?.title).toBe("Loose End");
  });

  // A fact card with nothing to play must render no control at all.
  // A dead button is worse than no button.
  it("returns null when there is nothing to play", () => {
    expect(resolvePlayTarget(update(), [])).toBeNull();
  });

  it("returns null for an unresolved release with no artist tracks", () => {
    const unresolved = update({ kind: "new-release", relatedTrackTitle: undefined });
    expect(resolvePlayTarget(unresolved, [])).toBeNull();
  });
});
