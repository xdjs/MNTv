import { describe, it, expect } from "vitest";
import {
  artistFactToNugget,
  isReusableArtistFact,
  selectSeedFacts,
  dropDuplicatedSeeds,
  mergeStreamedNugget,
  buildArtistUpdatesCacheKey,
  ARTIST_FACT_ID_PREFIX,
} from "@/lib/artistFactToNugget";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";
import type { Nugget } from "@/mock/types";

const TRACK_ID = "real::Pete%20Rango::crying%20on%20the%20floor";

function update(over: Partial<ArtistUpdate> = {}): ArtistUpdate {
  return {
    artistId: "a1",
    artistName: "Pete Rango",
    artistImageUrl: "https://example.com/artist.jpg",
    kind: "fact",
    headline: "Pete Rango's career began in Fort Myers.",
    body: "After his first semester at VCU he found the PayUp Game collective.",
    source: {
      type: "article",
      title: "Meet Pete Rango",
      publisher: "Voyage MIA",
      url: "https://voyagemia.com/pete",
    },
    nuggetId: "fact-1",
    ...over,
  };
}

function nugget(over: Partial<Nugget> = {}): Nugget {
  return {
    id: "gen-1",
    trackId: TRACK_ID,
    timestampSec: 30,
    durationMs: 7000,
    headline: "Something else entirely.",
    text: "Body.",
    kind: "track",
    sourceId: "s1",
    ...over,
  };
}

describe("isReusableArtistFact", () => {
  it("accepts a fact with both headline and body", () => {
    expect(isReusableArtistFact(update())).toBe(true);
  });

  // A "new single out" card is a Browse surface concept, not a fact
  // about the music — showing it mid-listen would read as an ad.
  it.each(["new-release", "collab", "track"] as const)("rejects %s kinds", (kind) => {
    expect(isReusableArtistFact(update({ kind }))).toBe(false);
  });

  it("rejects a fact with no body", () => {
    expect(isReusableArtistFact(update({ body: "   " }))).toBe(false);
  });

  it("rejects a fact with no headline", () => {
    expect(isReusableArtistFact(update({ headline: "" }))).toBe(false);
  });
});

describe("artistFactToNugget", () => {
  it("maps the fact onto a nugget bound to the current track", () => {
    const result = artistFactToNugget(update(), TRACK_ID)!;
    expect(result.nugget.trackId).toBe(TRACK_ID);
    expect(result.nugget.headline).toBe("Pete Rango's career began in Fort Myers.");
    expect(result.nugget.text).toContain("PayUp Game");
  });

  // Renders as "The Artist" in the immersive view, which is what it is.
  it("marks it as an artist nugget", () => {
    expect(artistFactToNugget(update(), TRACK_ID)!.nugget.kind).toBe("artist");
  });

  // Pinned like the sparse fallback so it opens the listen.
  it("pins it to the start of the track", () => {
    expect(artistFactToNugget(update(), TRACK_ID)!.nugget.timestampSec).toBe(0);
  });

  it("prefixes ids so they can never collide with generated nuggets", () => {
    const result = artistFactToNugget(update(), TRACK_ID)!;
    expect(result.nugget.id.startsWith(ARTIST_FACT_ID_PREFIX)).toBe(true);
    expect(result.nugget.sourceId).toBe(result.source.id);
  });

  it("carries the citation through", () => {
    const { source } = artistFactToNugget(update(), TRACK_ID)!;
    expect(source.publisher).toBe("Voyage MIA");
    expect(source.url).toBe("https://voyagemia.com/pete");
  });

  // The URL is rendered as a link, and the copy originates from Exa /
  // Gemini — an unsafe scheme would be a navigable XSS vector.
  it("strips an unsafe source URL but keeps the fact", () => {
    const result = artistFactToNugget(
      update({ source: { type: "article", title: "t", publisher: "p", url: "javascript:alert(1)" } }),
      TRACK_ID,
    )!;
    expect(result.source.url).toBe("");
    expect(result.nugget.headline).toBeTruthy();
  });

  it("falls back to the artist as publisher when the update has no source", () => {
    const { source } = artistFactToNugget(update({ source: undefined }), TRACK_ID)!;
    expect(source.publisher).toBe("Pete Rango");
    expect(source.url).toBe("");
  });

  it("returns null for a kind that isn't reusable", () => {
    expect(artistFactToNugget(update({ kind: "new-release" }), TRACK_ID)).toBeNull();
  });
});

describe("selectSeedFacts", () => {
  it("caps the seed so it can't crowd out track-specific research", () => {
    const many = [update({ nuggetId: "a" }), update({ nuggetId: "b" }), update({ nuggetId: "c" })];
    const { nuggets } = selectSeedFacts(many, TRACK_ID);
    expect(nuggets).toHaveLength(1);
  });

  it("skips non-facts while filling the cap", () => {
    const mixed = [
      update({ kind: "new-release", nuggetId: "r" }),
      update({ nuggetId: "f" }),
    ];
    const { nuggets } = selectSeedFacts(mixed, TRACK_ID);
    expect(nuggets).toHaveLength(1);
    expect(nuggets[0].id).toContain("f");
  });

  it("pairs every nugget with its source", () => {
    const { nuggets, sources } = selectSeedFacts([update()], TRACK_ID);
    expect(sources).toHaveLength(nuggets.length);
    expect(nuggets[0].sourceId).toBe(sources[0].id);
  });

  it("handles no updates", () => {
    expect(selectSeedFacts(null, TRACK_ID).nuggets).toEqual([]);
    expect(selectSeedFacts([], TRACK_ID).nuggets).toEqual([]);
  });
});

describe("dropDuplicatedSeeds", () => {
  const seeded = selectSeedFacts([update()], TRACK_ID).nuggets;

  it("keeps the seed when generation produced something different", () => {
    expect(dropDuplicatedSeeds(seeded, [nugget()])).toHaveLength(1);
  });

  // Wave-1 can independently produce the same fact; seeing it twice in
  // one listen is worse than never reusing it.
  it("drops the seed when generation produced the same fact", () => {
    const dupe = nugget({ headline: "Pete Rango's career began in Fort Myers." });
    expect(dropDuplicatedSeeds(seeded, [dupe])).toHaveLength(0);
  });

  it("matches despite casing, spacing and trailing punctuation", () => {
    const dupe = nugget({ headline: "  pete rango's   career began in fort myers  " });
    expect(dropDuplicatedSeeds(seeded, [dupe])).toHaveLength(0);
  });

  it("keeps the seed when nothing has generated yet", () => {
    expect(dropDuplicatedSeeds(seeded, [])).toHaveLength(1);
  });

  // Drops the SEEDED copy, never the generated one — the generated
  // nugget is track-scoped, properly timestamped and carries a citation.
  it("never removes generated nuggets", () => {
    const dupe = nugget({ headline: "Pete Rango's career began in Fort Myers." });
    const result = dropDuplicatedSeeds(seeded, [dupe]);
    expect(result).not.toContain(dupe);
    expect(result).toHaveLength(0);
  });
});

// ── The seam ──────────────────────────────────────────────────────────
// These are the tests that were missing. The unit tests above all passed
// while the SSE handler silently collapsed a six-nugget stream to two,
// because they exercised dropDuplicatedSeeds in isolation and never the
// expression that folds a whole stream together.
describe("mergeStreamedNugget — across a full stream", () => {
  const seedNugget = selectSeedFacts([update()], TRACK_ID).nuggets[0];
  const seedIds = new Set([seedNugget.id]);

  function streamInto(start: Nugget[], count: number, ids: ReadonlySet<string>) {
    let state = start;
    for (let i = 1; i <= count; i++) {
      state = mergeStreamedNugget(
        state,
        nugget({ id: `gen-${i}`, headline: `Generated fact ${i}.` }),
        ids,
      );
    }
    return state;
  }

  // THE REGRESSION. Previously this ended with 2 entries.
  it("accumulates every streamed nugget when a seed is active", () => {
    const final = streamInto([seedNugget], 6, seedIds);
    expect(final).toHaveLength(7);
    expect(final.filter((n) => n.id.startsWith("gen-"))).toHaveLength(6);
  });

  it("accumulates every streamed nugget with no seed active", () => {
    const final = streamInto([], 6, new Set());
    expect(final).toHaveLength(6);
  });

  it("keeps generated nuggets in arrival order", () => {
    const final = streamInto([seedNugget], 4, seedIds);
    expect(final.filter((n) => n.id.startsWith("gen-")).map((n) => n.id))
      .toEqual(["gen-1", "gen-2", "gen-3", "gen-4"]);
  });

  it("keeps a surviving seed in front, where it opens the listen", () => {
    const final = streamInto([seedNugget], 3, seedIds);
    expect(final[0].id).toBe(seedNugget.id);
  });

  it("retires the seed only when generation duplicates it, mid-stream", () => {
    let state: Nugget[] = [seedNugget];
    state = mergeStreamedNugget(state, nugget({ id: "gen-1" }), seedIds);
    expect(state).toHaveLength(2);

    // Wave-1 independently produces the same fact.
    state = mergeStreamedNugget(
      state,
      nugget({ id: "gen-2", headline: "Pete Rango's career began in Fort Myers." }),
      seedIds,
    );
    expect(state.some((n) => n.id === seedNugget.id)).toBe(false);
    // ...and the generated nuggets all survive.
    expect(state.map((n) => n.id)).toEqual(["gen-1", "gen-2"]);
  });

  it("does not re-add a nugget already in state", () => {
    const dupe = nugget({ id: "gen-1" });
    const once = mergeStreamedNugget([seedNugget], dupe, seedIds);
    const twice = mergeStreamedNugget(once, dupe, seedIds);
    expect(twice).toHaveLength(once.length);
  });

  it("never mutates the array it was given", () => {
    const start = [seedNugget];
    mergeStreamedNugget(start, nugget({ id: "gen-1" }), seedIds);
    expect(start).toHaveLength(1);
  });
});

describe("buildArtistUpdatesCacheKey", () => {
  // MUST match cacheKey() in supabase/functions/artist-updates/index.ts:687
  // — `artist::${artistName.trim().toLowerCase()}::${tier}`. Drift here
  // reads nothing and fails silently, with no error anywhere.
  it("matches the edge function's key format exactly", () => {
    expect(buildArtistUpdatesCacheKey("Radiohead", "nerd")).toBe("artist::radiohead::nerd");
  });

  it("lowercases and trims like the edge function does", () => {
    expect(buildArtistUpdatesCacheKey("  Pete Rango  ", "casual"))
      .toBe("artist::pete rango::casual");
  });

  it("scopes by tier", () => {
    expect(buildArtistUpdatesCacheKey("Flozigg", "curious"))
      .toBe("artist::flozigg::curious");
  });
});
