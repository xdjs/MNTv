import { describe, it, expect } from "vitest";
import { makeTimestamp } from "@/hooks/useAINuggets";

describe("makeTimestamp", () => {
  it("pins first nugget at 0 and spaces the rest evenly across a 300s track", () => {
    // earlyStart=0, endBuffer=15, usable=285, spacing=285/2=142.5
    const t0 = makeTimestamp(0, 3, 300);
    const t1 = makeTimestamp(1, 3, 300);
    const t2 = makeTimestamp(2, 3, 300);
    expect(t0).toBe(0);   // earlyStart — first nugget displays immediately on tap
    expect(t1).toBe(142); // floor(0 + 142.5*1)
    expect(t2).toBe(285); // floor(0 + 142.5*2), clamped at durationSec-10=290
  });

  it("spaces 9 nuggets (nerd tier) without piling up at the end", () => {
    const timestamps = Array.from({ length: 9 }, (_, i) => makeTimestamp(i, 9, 300));
    // All timestamps should be unique and ascending
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
    // First nugget at 0 so the user sees it the moment the song starts
    expect(timestamps[0]).toBe(0);
    // Last nugget should be before track end - 10
    expect(timestamps[8]).toBeLessThanOrEqual(290);
  });

  it("clamps to durationSec - 10 for short tracks", () => {
    // 40s track: earlyStart=0, endBuffer=15, usable=max(25,30)=30
    const t = makeTimestamp(0, 1, 40);
    expect(t).toBeLessThanOrEqual(30); // 40 - 10
  });

  it("handles single nugget by pinning at 0", () => {
    const t = makeTimestamp(0, 1, 300);
    // Single nugget collapses to earlyStart=0 so the user sees it right away
    expect(t).toBe(0);
  });

  it("handles very short track (durationSec < 45)", () => {
    const t = makeTimestamp(0, 1, 30);
    // floor(0 + 0) = 0, well under durationSec-10=20
    expect(t).toBeLessThanOrEqual(20);
  });
});
