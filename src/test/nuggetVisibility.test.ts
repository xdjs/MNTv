import { describe, it, expect } from "vitest";
import { isNuggetOnScreen } from "@/lib/nuggetVisibility";

const TRACK_NUGGETS = [{ id: "n-1" }, { id: "n-2" }, { id: "n-3" }];

describe("isNuggetOnScreen", () => {
  // Nuggets land in state before the reveal effect makes one active, so
  // the screen is still blank — the pill has to keep waiting.
  it("is false when nuggets exist but none is active yet", () => {
    expect(
      isNuggetOnScreen({ nerdActive: true, activeNuggetId: null, trackNuggets: TRACK_NUGGETS }),
    ).toBe(false);
  });

  it("is true once one of this track's nuggets is active", () => {
    expect(
      isNuggetOnScreen({ nerdActive: true, activeNuggetId: "n-2", trackNuggets: TRACK_NUGGETS }),
    ).toBe(true);
  });

  it("is false when nothing has arrived at all", () => {
    expect(
      isNuggetOnScreen({ nerdActive: true, activeNuggetId: null, trackNuggets: [] }),
    ).toBe(false);
  });

  // REGRESSION GUARD. On a track change the new track's nugget list is
  // recomputed synchronously (memo) while activeNugget is state that
  // resets an effect-tick later — so the previous track's nugget is
  // briefly still active. Counting it would dismiss the researching pill
  // the moment the new track starts, and the user would never see that
  // research had begun.
  it("does not count a leftover nugget from the previous track", () => {
    expect(
      isNuggetOnScreen({
        nerdActive: true,
        activeNuggetId: "previous-track-nugget",
        trackNuggets: TRACK_NUGGETS,
      }),
    ).toBe(false);
  });

  // The same instant, viewed from the other side: the new track has no
  // nuggets yet and a stale nugget is still active.
  it("is false when the new track has no nuggets and a stale one is active", () => {
    expect(
      isNuggetOnScreen({
        nerdActive: true,
        activeNuggetId: "previous-track-nugget",
        trackNuggets: [],
      }),
    ).toBe(false);
  });

  // Nerd mode off means the reveal effect returns early and activeNugget
  // is nulled — the pill must not wait forever for something that will
  // never be revealed.
  it("falls back to nuggets-exist when nerd mode is off", () => {
    expect(
      isNuggetOnScreen({ nerdActive: false, activeNuggetId: null, trackNuggets: TRACK_NUGGETS }),
    ).toBe(true);
  });

  it("stays false with nerd mode off and no nuggets", () => {
    expect(
      isNuggetOnScreen({ nerdActive: false, activeNuggetId: null, trackNuggets: [] }),
    ).toBe(false);
  });
});
