import { describe, it, expect } from "vitest";
import { isNuggetOnScreen } from "@/lib/nuggetVisibility";

describe("isNuggetOnScreen", () => {
  // The bug: nuggets land in state but the reveal effect hasn't made one
  // active yet, so the screen is blank while the pill dismisses.
  it("is false when nuggets exist in state but none is active yet", () => {
    expect(
      isNuggetOnScreen({ nerdActive: true, hasActiveNugget: false, trackNuggetCount: 6 }),
    ).toBe(false);
  });

  it("is true once a nugget is actually active", () => {
    expect(
      isNuggetOnScreen({ nerdActive: true, hasActiveNugget: true, trackNuggetCount: 6 }),
    ).toBe(true);
  });

  it("is false when nothing has arrived at all", () => {
    expect(
      isNuggetOnScreen({ nerdActive: true, hasActiveNugget: false, trackNuggetCount: 0 }),
    ).toBe(false);
  });

  // Nerd mode off means the reveal effect returns early and activeNugget
  // is nulled — the pill must not wait forever for something that will
  // never be revealed.
  it("falls back to nuggets-exist when nerd mode is off", () => {
    expect(
      isNuggetOnScreen({ nerdActive: false, hasActiveNugget: false, trackNuggetCount: 6 }),
    ).toBe(true);
  });

  it("stays false with nerd mode off and no nuggets", () => {
    expect(
      isNuggetOnScreen({ nerdActive: false, hasActiveNugget: false, trackNuggetCount: 0 }),
    ).toBe(false);
  });
});
