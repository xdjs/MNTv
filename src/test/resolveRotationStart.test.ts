import { describe, it, expect, beforeEach } from "vitest";
import { resolveRotationStart } from "@/hooks/useArtistUpdates";

// Storage keys pinned by contract — if these change, every browser
// with an existing rotation cursor loses its progression on next
// load. Hardcoding here so a rename breaks the test loudly.
const LS_KEY = "musicnerd_artist_rotation_cursor";
const SS_KEY = "musicnerd_artist_rotation_resolved";
const POOL_SIZE = 10;

describe("resolveRotationStart", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("returns 0 on a clean storage state", () => {
    expect(resolveRotationStart(3)).toBe(0);
  });

  it("is stable across calls within the same session", () => {
    const first = resolveRotationStart(3);
    const second = resolveRotationStart(3);
    const third = resolveRotationStart(3);
    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(third).toBe(0);
  });

  it("advances the localStorage cursor on first call only", () => {
    resolveRotationStart(3);
    expect(localStorage.getItem(LS_KEY)).toBe("3");
    // Within the same session, subsequent calls re-read the cached
    // sessionStorage value and DON'T advance LS further.
    resolveRotationStart(3);
    expect(localStorage.getItem(LS_KEY)).toBe("3");
  });

  it("returns the prior localStorage cursor on a fresh session", () => {
    localStorage.setItem(LS_KEY, "7");
    // Fresh session = empty sessionStorage. Cursor is the LS value.
    expect(resolveRotationStart(3)).toBe(7);
    // And LS advances by sliceSize for the next session.
    expect(localStorage.getItem(LS_KEY)).toBe("10");
  });

  it("caches the resolved value in sessionStorage", () => {
    resolveRotationStart(3);
    expect(sessionStorage.getItem(SS_KEY)).toBe("0");
  });

  it("returns the sessionStorage cache even when LS has advanced past it", () => {
    sessionStorage.setItem(SS_KEY, "5");
    localStorage.setItem(LS_KEY, "8");
    // SS takes priority: a Browse remount mid-session must not jump
    // the rotation forward.
    expect(resolveRotationStart(3)).toBe(5);
    // And it doesn't double-advance LS.
    expect(localStorage.getItem(LS_KEY)).toBe("8");
  });

  it("ignores a corrupted (non-numeric) sessionStorage cache and falls back to LS", () => {
    sessionStorage.setItem(SS_KEY, "not-a-number");
    localStorage.setItem(LS_KEY, "4");
    expect(resolveRotationStart(3)).toBe(4);
  });

  it("treats a negative cursor as 0", () => {
    localStorage.setItem(LS_KEY, "-5");
    expect(resolveRotationStart(3)).toBe(0);
  });

  it("caps the persisted cursor to keep it well below MAX_SAFE_INTEGER", () => {
    // Set LS just below the cap so the next persisted value wraps.
    const cap = POOL_SIZE * 1000;
    localStorage.setItem(LS_KEY, String(cap - 1));
    resolveRotationStart(3);
    // (cap - 1 + 3) % cap = 2
    expect(localStorage.getItem(LS_KEY)).toBe("2");
  });
});
