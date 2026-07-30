import { describe, it, expect } from "vitest";
import { checkNugget, auditCorpus, type NuggetLike } from "@/lib/constitutionChecks";

const ARTIST = "Billie Eilish";

/** A nugget that passes every mechanical rule — the control. */
const GOOD: NuggetLike = {
  headline: "Billie Eilish's parents gave up their bedroom for her music studio",
  text: "Finneas tracked the vocals for 'Ocean Eyes' in that converted bedroom in 2015, on a mattress pushed against the wall.",
  kind: "artist",
};

function codes(n: NuggetLike, artist = ARTIST) {
  return checkNugget(n, artist).map((v) => v.code);
}

describe("checkNugget — the control", () => {
  it("passes a specific, sourced, sentence-case nugget", () => {
    expect(codes(GOOD)).toEqual([]);
  });
});

describe("headline rules", () => {
  it("flags an empty headline", () => {
    expect(codes({ ...GOOD, headline: "  " })).toContain("empty-headline");
  });

  // Real example from the seed corpus.
  it("flags Title Case", () => {
    expect(codes({
      ...GOOD,
      headline: "The \"Duh!\" Heard 'Round the Internet: How One Word Sparked a Meme Sensation",
    })).toContain("title-case-headline");
  });

  it("does not flag sentence case that begins with a proper noun", () => {
    expect(codes(GOOD)).not.toContain("title-case-headline");
  });

  it("does not flag a short headline for capitalisation", () => {
    expect(codes({ ...GOOD, headline: "Billie Eilish Ocean Eyes" })).not.toContain("title-case-headline");
  });

  it("flags the [Name]'s [Abstract Noun] pattern", () => {
    expect(codes({ ...GOOD, headline: "Billie Eilish's creative evolution takes shape" }))
      .toContain("abstract-noun-headline");
  });
});

describe("voice guard", () => {
  it.each(["likely", "perhaps", "arguably", "reportedly"])("flags hedging: %s", (word) => {
    expect(codes({ ...GOOD, text: `Finneas ${word} tracked the vocals in 2015 at home.` }))
      .toContain("hedging");
  });

  it("flags sound description", () => {
    expect(codes({ ...GOOD, text: "The sonic landscape of the record shifts in 2015 with Finneas." }))
      .toContain("describes-sound");
  });
});

describe("meta-commentary about absence", () => {
  // The copy that actually shipped and had to be rewritten.
  it("flags the sparse-fallback copy that shipped", () => {
    expect(codes({
      headline: '"crying on the floor" by Pete Rango',
      text: "There's not much press out there for this one yet, so we're letting the music do the talking.",
    }, "Pete Rango")).toContain("meta-commentary-on-absence");
  });

  it.each(["the mystery is the story", "a blank slate", "operates as a digital ghost"])(
    "flags: %s", (phrase) => {
      expect(codes({ ...GOOD, text: `In 2015 the artist ${phrase} for listeners.` }))
        .toContain("meta-commentary-on-absence");
    },
  );
});

describe("taste patronizing", () => {
  // Also real shipped copy.
  it("flags the server fallback's taste line", () => {
    expect(codes({
      headline: '"crying on the floor" sits in Pete Rango\'s catalog',
      text: "Pete Rango is one of the artists you keep coming back to.",
    }, "Pete Rango")).toContain("patronizes-taste");
  });

  it("flags 'on rotation'", () => {
    expect(codes({ ...GOOD, text: "An artist you've had on rotation since 2015." }))
      .toContain("patronizes-taste");
  });
});

describe("body-adds-new-fact", () => {
  it("flags a body that only restates the headline", () => {
    expect(codes({
      headline: "Finneas produced the record in a bedroom",
      text: "The record was produced by Finneas in a bedroom.",
    })).toContain("body-restates-headline");
  });

  it("passes a body that introduces a new load-bearing noun", () => {
    expect(codes({
      headline: "Finneas produced the record in a bedroom",
      text: "He tracked 'Ocean Eyes' there in 2015 on a borrowed microphone.",
    })).not.toContain("body-restates-headline");
  });
});

describe("swap test", () => {
  // The seed corpus's weakest discovery nuggets look like this.
  it("flags adjective-soup with no specific anchor", () => {
    expect(codes({
      headline: "A raw and candid edge",
      text: "She crafts pop songs with a direct, unfiltered feel that resonates widely.",
    }, "Olivia Rodrigo")).toContain("fails-swap-test");
  });

  it("passes when a year anchors it", () => {
    expect(codes({ headline: "A raw edge", text: "She released it in 2021." }, "Olivia Rodrigo"))
      .not.toContain("fails-swap-test");
  });

  it("passes when a quoted title anchors it", () => {
    expect(codes({ headline: "A raw edge", text: 'She opened with "drivers license" that night.' }, "Olivia Rodrigo"))
      .not.toContain("fails-swap-test");
  });

  it("does not count the artist's own name as an anchor", () => {
    expect(codes({
      headline: "Olivia Rodrigo writes with a candid edge",
      text: "Olivia Rodrigo keeps the feel direct and unfiltered throughout.",
    }, "Olivia Rodrigo")).toContain("fails-swap-test");
  });
});

describe("brevity", () => {
  it("flags a body past the 120-word ceiling", () => {
    expect(codes({ ...GOOD, text: Array(130).fill("word").join(" ") + " 2015" }))
      .toContain("too-long");
  });

  it("passes a body under the ceiling", () => {
    expect(codes(GOOD)).not.toContain("too-long");
  });
});

describe("auditCorpus", () => {
  it("counts clean nuggets and tallies violations", () => {
    const report = auditCorpus([
      { ...GOOD, artist: ARTIST },
      { headline: "Billie Eilish's creative vision takes shape", text: "It evolves.", artist: ARTIST },
    ]);
    expect(report.total).toBe(2);
    expect(report.clean).toBe(1);
    expect(report.violations["abstract-noun-headline"]).toBe(1);
  });

  it("ranks the worst offenders first", () => {
    const report = auditCorpus([
      { ...GOOD, artist: ARTIST },
      { headline: "Perhaps The Sonic Landscape Of Their Creative Vision", text: "It evolves.", artist: ARTIST },
    ]);
    expect(report.worst[0].codes.length).toBeGreaterThan(1);
  });

  it("handles an empty corpus", () => {
    expect(auditCorpus([])).toMatchObject({ total: 0, clean: 0 });
  });
});
