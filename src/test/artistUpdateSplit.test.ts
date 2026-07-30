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

  // Catalog tracks ride the same array as facts so they flow through the
  // existing cache, but they carry no body and must never render as a
  // readable card.
  it("routes a catalog track to the play lane only", () => {
    const catalogTrack = update({
      kind: "track",
      headline: "Loose End",
      body: "",
      relatedTrackTitle: "Loose End",
      relatedAlbumName: "ACT I",
      relatedTrackUri: "spotify:track:def",
      artistImageUrl: "https://example.com/cover.jpg",
    });
    const { facts, tracks } = splitArtistUpdates([catalogTrack]);
    expect(facts).toEqual([]);
    expect(tracks).toEqual([
      {
        title: "Loose End",
        album: "ACT I",
        uri: "spotify:track:def",
        imageUrl: "https://example.com/cover.jpg",
      },
    ]);
  });

  it("keeps readable cards while routing catalog tracks aside", () => {
    const catalogTrack = update({
      kind: "track",
      relatedTrackTitle: "Loose End",
      relatedTrackUri: "spotify:track:def",
    });
    const { facts, tracks } = splitArtistUpdates([update(), RELEASE, catalogTrack]);
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.kind !== "track")).toBe(true);
    expect(tracks.map((t) => t.title)).toEqual(["Will Kill", "Loose End"]);
  });

  // The release card and top-tracks can name the same song; showing it
  // twice in one artist's row reads as a bug.
  it("de-duplicates a catalog track against the release track", () => {
    const dupe = update({
      kind: "track",
      relatedTrackTitle: "will kill",
      relatedTrackUri: "spotify:track:zzz",
    });
    const { tracks } = splitArtistUpdates([RELEASE, dupe]);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].uri).toBe("spotify:track:abc");
  });

  it("lets a fact borrow a catalog track as its play target", () => {
    const catalogTrack = update({
      kind: "track",
      relatedTrackTitle: "Loose End",
      relatedTrackUri: "spotify:track:def",
    });
    const { facts, tracks } = splitArtistUpdates([update(), catalogTrack]);
    expect(resolvePlayTarget(facts[0], tracks)?.title).toBe("Loose End");
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

  // Pete: tapped "video radio" on a new-release card and the song never
  // started. When the server can't resolve a release's first track it
  // falls back to the ALBUM's uri and name together, so the card offers
  // an album name as if it were a track — Listen then searches for a
  // track that doesn't exist. Prefer a real catalog track instead.
  it("skips an album-level release target in favour of a real track", () => {
    const albumFallback = update({
      kind: "new-release",
      relatedTrackTitle: "video radio",
      relatedAlbumName: "video radio",
      relatedTrackUri: "spotify:album:xyz",
    });
    const catalogTracks: PlayableTrack[] = [
      { title: "Real Song", album: "LP", uri: "spotify:track:real" },
    ];
    expect(resolvePlayTarget(albumFallback, catalogTracks)?.uri).toBe("spotify:track:real");
  });

  it("still offers the album-level target when no real track exists", () => {
    const albumFallback = update({
      kind: "new-release",
      relatedTrackTitle: "video radio",
      relatedTrackUri: "spotify:album:xyz",
    });
    // Better than nothing: Listen can still try to resolve by name.
    expect(resolvePlayTarget(albumFallback, [])?.title).toBe("video radio");
  });

  // Apple users deliberately get no Spotify URI, so "has a track URI"
  // must not become a requirement for having a play target at all.
  it("keeps a URI-less target rather than dropping the control", () => {
    const noUri = update({
      kind: "new-release",
      relatedTrackTitle: "Will Kill",
      relatedTrackUri: undefined,
    });
    expect(resolvePlayTarget(noUri, [])?.title).toBe("Will Kill");
  });

  it("returns null for an unresolved release with no artist tracks", () => {
    const unresolved = update({ kind: "new-release", relatedTrackTitle: undefined });
    expect(resolvePlayTarget(unresolved, [])).toBeNull();
  });
});
