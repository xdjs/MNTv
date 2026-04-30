import { describe, it, expect } from "vitest";
import { makeTimestamp } from "@/hooks/useAINuggets";

describe("makeTimestamp", () => {
  it("pins first nugget at earlyStart and spaces the rest evenly across a 300s track", () => {
    // earlyStart=3, endBuffer=15, usable=282, spacing=282/2=141
    const t0 = makeTimestamp(0, 3, 300);
    const t1 = makeTimestamp(1, 3, 300);
    const t2 = makeTimestamp(2, 3, 300);
    expect(t0).toBe(3);   // earlyStart
    expect(t1).toBe(144); // floor(3 + 141*1)
    expect(t2).toBe(285); // floor(3 + 141*2), clamped under durationSec-10=290
  });

  it("spaces 9 nuggets (nerd tier) without piling up at the end", () => {
    const timestamps = Array.from({ length: 9 }, (_, i) => makeTimestamp(i, 9, 300));
    // All timestamps should be unique and ascending
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
    // First nugget pinned at earlyStart so the user sees content quickly
    expect(timestamps[0]).toBe(3);
    // Last nugget should be before track end - 10
    expect(timestamps[8]).toBeLessThanOrEqual(290);
  });

  it("clamps to durationSec - 10 for short tracks", () => {
    // 40s track: earlyStart=3, endBuffer=15, usable=max(22,30)=30
    const t = makeTimestamp(0, 1, 40);
    expect(t).toBeLessThanOrEqual(30); // 40 - 10
  });

  it("handles single nugget by pinning at earlyStart", () => {
    const t = makeTimestamp(0, 1, 300);
    // Single nugget collapses to earlyStart so the user sees it right away
    expect(t).toBe(3);
  });

  it("handles very short track (durationSec < 45)", () => {
    // usable = max(durationSec - 3 - 15, 30) = max(12, 30) = 30
    const t = makeTimestamp(0, 1, 30);
    // floor(3 + 0) = 3, clamped under min(durationSec-10) = 20
    expect(t).toBeLessThanOrEqual(20);
  });
});
