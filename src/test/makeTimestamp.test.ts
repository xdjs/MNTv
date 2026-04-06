import { describe, it, expect } from "vitest";
import { makeTimestamp } from "@/hooks/useAINuggets";

describe("makeTimestamp", () => {
  it("spaces 3 nuggets evenly across a 300s track", () => {
    // earlyStart=20, endBuffer=15, usable=265, spacing=265/4=66.25
    const t0 = makeTimestamp(0, 3, 300);
    const t1 = makeTimestamp(1, 3, 300);
    const t2 = makeTimestamp(2, 3, 300);
    expect(t0).toBe(86);  // floor(20 + 66.25*1)
    expect(t1).toBe(152); // floor(20 + 66.25*2)
    expect(t2).toBe(218); // floor(20 + 66.25*3)
  });

  it("spaces 9 nuggets (nerd tier) without piling up at the end", () => {
    const timestamps = Array.from({ length: 9 }, (_, i) => makeTimestamp(i, 9, 300));
    // All timestamps should be unique and ascending
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
    // Last nugget should be before track end - 10
    expect(timestamps[8]).toBeLessThanOrEqual(290);
  });

  it("clamps to durationSec - 10 for short tracks", () => {
    // 40s track: earlyStart=20, endBuffer=15, usable=max(5,30)=30
    const t = makeTimestamp(0, 1, 40);
    expect(t).toBeLessThanOrEqual(30); // 40 - 10
  });

  it("handles single nugget", () => {
    const t = makeTimestamp(0, 1, 300);
    // earlyStart=20, usable=265, spacing=265/2=132.5 → floor(20+132.5)=152
    expect(t).toBe(152);
  });

  it("handles very short track (durationSec < 45)", () => {
    // usable = max(durationSec - 20 - 15, 30) = max(-5, 30) = 30
    const t = makeTimestamp(0, 1, 30);
    // floor(20 + 30/2 * 1) = floor(35) = 35, clamped to min(35, 20) = 20
    expect(t).toBeLessThanOrEqual(20); // 30 - 10
  });
});
