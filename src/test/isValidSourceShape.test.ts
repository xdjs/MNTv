import { describe, it, expect } from "vitest";
import { isValidSourceShape } from "@/hooks/useAINuggets";

// `isValidSourceShape` gates DB → in-memory Map conversion in
// useAINuggets. Source type requires { id, type, title, publisher, url }
// all to be strings. Anything missing causes downstream consumers
// (which call `.startsWith()` / `.toLowerCase()` without null-guarding)
// to crash. Tests below lock the contract.

describe("isValidSourceShape", () => {
  const valid = {
    id: "src-1",
    type: "article",
    title: "Some Article",
    publisher: "MusicNerd",
    url: "https://example.com/x",
  };

  it("returns true for a fully-shaped Source", () => {
    expect(isValidSourceShape(valid)).toBe(true);
  });

  it("returns true even when optional fields are present", () => {
    expect(isValidSourceShape({ ...valid, embedId: "abc", quoteSnippet: "q" })).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidSourceShape(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidSourceShape(undefined)).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isValidSourceShape("string")).toBe(false);
    expect(isValidSourceShape(42)).toBe(false);
    expect(isValidSourceShape(true)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isValidSourceShape([valid])).toBe(false);
    expect(isValidSourceShape([])).toBe(false);
  });

  it("rejects when id is missing", () => {
    const { id, ...rest } = valid;
    void id;
    expect(isValidSourceShape(rest)).toBe(false);
  });

  it("rejects when type is missing", () => {
    const { type, ...rest } = valid;
    void type;
    expect(isValidSourceShape(rest)).toBe(false);
  });

  it("rejects when title is missing", () => {
    const { title, ...rest } = valid;
    void title;
    expect(isValidSourceShape(rest)).toBe(false);
  });

  it("rejects when publisher is missing", () => {
    const { publisher, ...rest } = valid;
    void publisher;
    expect(isValidSourceShape(rest)).toBe(false);
  });

  it("rejects when url is missing — most important case, this is what crashed pages pre-guard", () => {
    const { url, ...rest } = valid;
    void url;
    expect(isValidSourceShape(rest)).toBe(false);
  });

  it("rejects when any required field is not a string (number url)", () => {
    expect(isValidSourceShape({ ...valid, url: 123 })).toBe(false);
  });

  it("rejects when any required field is null", () => {
    expect(isValidSourceShape({ ...valid, title: null })).toBe(false);
  });

  it("doesn't enforce a value-shape for the URL — scheme validation is a downstream concern (XSS guard)", () => {
    // The shape guard is about cache-row sanity, not URL safety.
    // The XSS / scheme check lives at render time (e.g.
    // ExpandedUpdateModal's `/^https?:\/\//` test).
    expect(isValidSourceShape({ ...valid, url: "javascript:void(0)" })).toBe(true);
  });
});
