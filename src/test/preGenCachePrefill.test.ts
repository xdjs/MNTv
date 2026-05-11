import { describe, it, expect } from "vitest";
import { preparePreGenCacheEntry } from "@/lib/preGenCachePrefill";

// The pre-gen cache is the trust boundary between the edge function
// response and what Listen.tsx ultimately renders. Anything that
// survives `preparePreGenCacheEntry` is treated as render-safe by
// downstream consumers — so this layer has to drop malformed shapes
// and unsafe URL schemes the same way the JSONB-read path does.

const validNugget = {
  id: "nug-1",
  trackId: "spotify:track:abc",
  timestampSec: 5,
  headline: "Some headline",
  text: "Some body text.",
  kind: "track" as const,
};

const validSource = {
  id: "src-1",
  type: "catalog",
  title: "Source title",
  publisher: "MusicNerd",
  url: "https://example.com/a",
};

describe("preparePreGenCacheEntry", () => {
  it("returns null when response is not an object", () => {
    expect(preparePreGenCacheEntry(null)).toBeNull();
    expect(preparePreGenCacheEntry(undefined)).toBeNull();
    expect(preparePreGenCacheEntry(42)).toBeNull();
    expect(preparePreGenCacheEntry("response")).toBeNull();
  });

  it("returns null when nuggets is missing or empty", () => {
    expect(preparePreGenCacheEntry({})).toBeNull();
    expect(preparePreGenCacheEntry({ nuggets: [] })).toBeNull();
    expect(preparePreGenCacheEntry({ nuggets: null })).toBeNull();
  });

  it("filters out malformed nuggets but keeps valid ones", () => {
    const entry = preparePreGenCacheEntry({
      nuggets: [validNugget, { id: "missing-fields" }, null, 42],
    });
    expect(entry).not.toBeNull();
    expect(entry!.nuggets).toHaveLength(1);
    expect(entry!.nuggets[0].id).toBe("nug-1");
  });

  it("preserves valid sources in the sourcesMap", () => {
    const entry = preparePreGenCacheEntry({
      nuggets: [validNugget],
      sources: { "src-1": validSource },
    });
    expect(entry!.sources.get("src-1")).toEqual(validSource);
  });

  it("EXCLUDES a source with a javascript: URL (XSS guard)", () => {
    const entry = preparePreGenCacheEntry({
      nuggets: [validNugget],
      sources: {
        "src-1": validSource,
        "src-2": { ...validSource, id: "src-2", url: "javascript:alert(1)" },
      },
    });
    expect(entry!.sources.has("src-1")).toBe(true);
    expect(entry!.sources.has("src-2")).toBe(false);
  });

  it("EXCLUDES a source with a data: URL (XSS guard)", () => {
    const entry = preparePreGenCacheEntry({
      nuggets: [validNugget],
      sources: {
        "src-1": { ...validSource, url: "data:text/html,<script>alert(1)</script>" },
      },
    });
    expect(entry!.sources.size).toBe(0);
  });

  it("EXCLUDES sources missing required fields (matches JSONB-read path)", () => {
    const entry = preparePreGenCacheEntry({
      nuggets: [validNugget],
      sources: {
        "src-1": validSource,
        "src-2": { id: "src-2", type: "catalog", title: "x", publisher: "x" }, // no url
        "src-3": { id: "src-3", type: "catalog", title: "x" }, // no publisher, no url
      },
    });
    expect(entry!.sources.size).toBe(1);
    expect(entry!.sources.has("src-1")).toBe(true);
  });

  it("skips underscore-prefixed metadata keys in sources", () => {
    const entry = preparePreGenCacheEntry({
      nuggets: [validNugget],
      sources: { "_meta": { fetchedAt: 1 }, "src-1": validSource },
    });
    expect(entry!.sources.has("_meta")).toBe(false);
    expect(entry!.sources.has("src-1")).toBe(true);
  });

  it("returns an empty sourcesMap when sources field is missing", () => {
    const entry = preparePreGenCacheEntry({ nuggets: [validNugget] });
    expect(entry!.sources.size).toBe(0);
    expect(entry!.nuggets).toHaveLength(1);
  });
});
