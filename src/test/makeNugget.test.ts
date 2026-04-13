import { describe, it, expect } from "vitest";
import { makeNugget } from "@/hooks/useAINuggets";

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
