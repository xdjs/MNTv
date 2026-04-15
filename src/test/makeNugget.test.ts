import { describe, it, expect } from "vitest";
import { makeNugget, sanitizeNugget, deriveHeadline } from "@/hooks/useAINuggets";
import type { Nugget } from "@/mock/types";

const baseSource = {
  type: "article" as const,
  title: "Test Source",
  publisher: "Pitchfork",
};

const make = (overrides: { headline?: string; text?: string }) => ({
  headline: overrides.headline ?? "",
  text: overrides.text ?? "",
  kind: "artist" as const,
  source: baseSource,
});

describe("makeNugget headline derivation", () => {
  it("passes through a provided headline unchanged", () => {
    const n = make({ headline: "A Great Fact", text: "Some body text." });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("A Great Fact");
  });

  it("derives headline from the first sentence when headline is empty", () => {
    const n = make({ headline: "", text: "He played guitar on the track. The album was released later." });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("He played guitar on the track");
  });

  it("splits on newline-separated sentences (not just space)", () => {
    const n = make({ headline: "", text: "He played guitar.\nThe album dropped in 1975." });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("He played guitar");
  });

  it("falls back to truncated text when first sentence is too short (≤ 10 chars)", () => {
    const longTail = "A".repeat(120);
    const n = make({ headline: "", text: `Hi. ${longTail}` });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe(`Hi. ${longTail}`.slice(0, 77) + "...");
  });

  it("truncates long first sentences with ellipsis", () => {
    const longSentence = "A".repeat(100) + ". Second sentence.";
    const n = make({ headline: "", text: longSentence });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("A".repeat(77) + "...");
    expect(result.headline.length).toBe(80);
  });

  it("truncates short-first-sentence fallback consistently with ellipsis", () => {
    const longTail = "B".repeat(100);
    const n = make({ headline: "", text: `Ok. ${longTail}` });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline.endsWith("...")).toBe(true);
    expect(result.headline.length).toBe(80);
  });

  it("derives headline when server sends whitespace-only headline + valid text", () => {
    const n = make({ headline: "   ", text: "He played guitar on the track. More text." });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("He played guitar on the track");
  });

  it("handles ! and ? sentence endings", () => {
    const exclaim = make({ headline: "", text: "What a solo! This is the key part." });
    expect(makeNugget(exclaim, "nug-1", "src-1", "track-1", 60).headline).toBe("What a solo");

    const question = make({ headline: "", text: "Did you hear that riff? It changed rock music." });
    expect(makeNugget(question, "nug-2", "src-2", "track-1", 60).headline).toBe("Did you hear that riff");
  });

  it("strips trailing punctuation from single-sentence text", () => {
    const n = make({ headline: "", text: "Only sentence." });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("Only sentence");
  });

  it("uses 'Music Fact' placeholder when both headline and text are empty", () => {
    const n = make({ headline: "", text: "" });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("Music Fact");
  });

  it("uses placeholder when both fields are whitespace-only", () => {
    const n = make({ headline: "   ", text: "\n\t " });
    const result = makeNugget(n, "nug-1", "src-1", "track-1", 60);
    expect(result.headline).toBe("Music Fact");
  });

  it("preserves other nugget fields", () => {
    const n = make({ headline: "Hello", text: "Body." });
    const result = makeNugget(n, "nug-42", "src-42", "track-99", 123);
    expect(result.id).toBe("nug-42");
    expect(result.sourceId).toBe("src-42");
    expect(result.trackId).toBe("track-99");
    expect(result.timestampSec).toBe(123);
    expect(result.text).toBe("Body.");
    expect(result.kind).toBe("artist");
  });
});

describe("sanitizeNugget (cache/seed/poll bypass paths)", () => {
  const baseNugget: Nugget = {
    id: "cached-nug-1",
    trackId: "track-1",
    timestampSec: 60,
    durationMs: 7000,
    headline: "",
    text: "",
    kind: "artist",
    listenFor: false,
    sourceId: "src-1",
  };

  it("fills in 'Music Fact' when a cached nugget has empty headline + empty text", () => {
    const result = sanitizeNugget(baseNugget);
    expect(result.headline).toBe("Music Fact");
  });

  it("derives headline from text when a cached nugget has empty headline but valid text", () => {
    const input = { ...baseNugget, text: "She produced the entire album. Released in 2023." };
    const result = sanitizeNugget(input);
    expect(result.headline).toBe("She produced the entire album");
  });

  it("returns the same object (reference equality) when headline is already valid", () => {
    const input = { ...baseNugget, headline: "Real headline", text: "Body." };
    const result = sanitizeNugget(input);
    expect(result).toBe(input);
  });

  it("preserves all other nugget fields when repairing", () => {
    const input = { ...baseNugget, text: "Some fact here.", imageUrl: "x.jpg", imageCaption: "cap" };
    const result = sanitizeNugget(input);
    expect(result.id).toBe(input.id);
    expect(result.trackId).toBe(input.trackId);
    expect(result.timestampSec).toBe(input.timestampSec);
    expect(result.sourceId).toBe(input.sourceId);
    expect(result.imageUrl).toBe("x.jpg");
    expect(result.imageCaption).toBe("cap");
    expect(result.kind).toBe("artist");
  });
});

describe("regression: poisoned nugget_cache row (KIKI / Cherele bug)", () => {
  // Reproduces the production bug: a nugget_cache row written for a
  // lesser-known artist before the server-side headline guard landed. The
  // `.map(sanitizeNugget)` call at the DB cache read site (useAINuggets.ts
  // line 317) must repair every nugget so the UI never renders blank cards.
  it("repairs all nuggets returned from a poisoned nugget_cache row", () => {
    // Shape mirrors what `supabase.from('nugget_cache').select('nuggets')`
    // would hand back for a broken cache entry.
    const poisonedCacheRow = {
      nuggets: [
        { id: "n-0", trackId: "real::Cherele::KIKI", timestampSec: 30, durationMs: 7000, headline: "", text: "Cherele recorded KIKI in late 2024.", kind: "track", listenFor: false, sourceId: "s-0" },
        { id: "n-1", trackId: "real::Cherele::KIKI", timestampSec: 80, durationMs: 7000, headline: "", text: "", kind: "artist", listenFor: false, sourceId: "s-1" },
        { id: "n-2", trackId: "real::Cherele::KIKI", timestampSec: 130, durationMs: 7000, headline: "Pete Rango features on the second verse", text: "Verified via credits.", kind: "discovery", listenFor: false, sourceId: "s-2" },
      ] as Nugget[],
    };

    const repaired = poisonedCacheRow.nuggets.map(sanitizeNugget);

    expect(repaired).toHaveLength(3);
    expect(repaired[0].headline).toBe("Cherele recorded KIKI in late 2024");
    expect(repaired[1].headline).toBe("Music Fact");
    expect(repaired[2].headline).toBe("Pete Rango features on the second verse");

    for (const n of repaired) {
      expect(n.headline.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("deriveHeadline (shared helper)", () => {
  it("tolerates undefined headline + undefined text", () => {
    expect(deriveHeadline(undefined, undefined)).toBe("Music Fact");
  });

  it("tolerates undefined headline + valid text", () => {
    expect(deriveHeadline(undefined, "Only sentence.")).toBe("Only sentence");
  });

  it("returns the provided headline unchanged when non-empty", () => {
    expect(deriveHeadline("Existing", "Body.")).toBe("Existing");
  });
});
