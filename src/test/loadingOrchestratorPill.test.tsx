import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// AnimatePresence keeps exiting children mounted until an animation that
// never completes under jsdom, so the pill node would linger after the
// phase moved on and "is it dismissed?" would be unanswerable.
vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock());

import MusicNerdLoadingOrchestrator from "@/components/MusicNerdLoadingOrchestrator";

// The pill's phase machine is time-driven (settle delay, display window,
// max-hold ceiling), so these drive fake timers rather than waiting.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// The component caches phase per trackId in a module-level Map, so each
// test needs its own trackId to start from a clean state.
let seq = 0;
function renderPill(props: { hasNuggets: boolean; aiLoading?: boolean; aiError?: string | null }) {
  const trackId = `track-${seq++}`;
  const view = render(
    <MusicNerdLoadingOrchestrator
      aiLoading={props.aiLoading ?? true}
      aiError={props.aiError ?? null}
      hasNuggets={props.hasNuggets}
      shortId={null}
      trackId={trackId}
      tier="casual"
      listenCount={1}
      focusZone="none"
      topFocusIndex={0}
      onCompanionClick={() => {}}
    />,
  );
  return { ...view, trackId };
}

// Match the pill element itself, not its text — the morph-fly and
// pulsating states render "MusicNerd is researching" too, so a text
// matcher can't tell "still waiting" from "already dismissed".
const pillVisible = () => screen.queryByTestId("researching-pill") !== null;

describe("loading pill lifecycle", () => {
  it("raises the pill once the settle delay elapses", () => {
    renderPill({ hasNuggets: false });
    expect(pillVisible()).toBe(false);
    act(() => { vi.advanceTimersByTime(400); });
    expect(pillVisible()).toBe(true);
  });

  // The point of the fix: nuggets existing in state is not enough — the
  // pill holds until a fact is actually on screen.
  it("holds the pill while no fact is on screen yet", () => {
    renderPill({ hasNuggets: false });
    act(() => { vi.advanceTimersByTime(400); });
    expect(pillVisible()).toBe(true);

    // Well past the old PILL_DISPLAY_MS window — still researching.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(pillVisible()).toBe(true);
  });

  it("dismisses the pill once a fact is on screen", () => {
    const { rerender, trackId } = renderPill({ hasNuggets: false });
    act(() => { vi.advanceTimersByTime(400); });
    expect(pillVisible()).toBe(true);

    act(() => {
      rerender(
        <MusicNerdLoadingOrchestrator
          aiLoading={true}
          aiError={null}
          hasNuggets={true}
          shortId={null}
          trackId={trackId}
          tier="casual"
          listenCount={1}
          focusZone="none"
          topFocusIndex={0}
          onCompanionClick={() => {}}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(pillVisible()).toBe(false);
  });

  // REGRESSION GUARD. Tightening hasNuggets to mean "on screen" made it
  // strictly harder to satisfy, and on the success path it is the only
  // exit from the pill phase. Listen can leave activeNugget null
  // indefinitely (e.g. seeking to a gap while paused with cached
  // nuggets), which would strand the user under a spinner forever.
  // Stranding is worse than dismissing early, so there is a hard ceiling.
  it("gives up after the max-hold ceiling even if no fact ever arrives", () => {
    renderPill({ hasNuggets: false });
    act(() => { vi.advanceTimersByTime(400); });
    expect(pillVisible()).toBe(true);

    act(() => { vi.advanceTimersByTime(46_000); });
    expect(pillVisible()).toBe(false);
  });

  // startMorphFly forks on aiLoading: true → "pulsating", false → "ready".
  // The test above always takes the "pulsating" fork because aiLoading
  // never flips. But the scenario the ceiling exists for — research
  // finished yet no nugget was ever revealed (e.g. seeking to a gap while
  // paused on a cached track) — is aiLoading=false with phase still
  // "pill", which takes the OTHER fork. Nothing moves the phase out of
  // "pill" when aiLoading goes true→false, so it is genuinely reachable.
  it("gives up at the ceiling when research already finished", () => {
    const { rerender, trackId } = renderPill({ hasNuggets: false, aiLoading: true });
    act(() => { vi.advanceTimersByTime(400); });
    expect(pillVisible()).toBe(true);

    const props = {
      aiError: null,
      hasNuggets: false,
      shortId: null,
      trackId,
      tier: "casual",
      listenCount: 1,
      focusZone: "none",
      topFocusIndex: 0,
      onCompanionClick: () => {},
    };
    act(() => {
      rerender(<MusicNerdLoadingOrchestrator {...props} aiLoading={false} />);
    });
    // Research is done, but nothing was ever revealed — the pill is now
    // lying and must still be up until the ceiling, then go.
    expect(pillVisible()).toBe(true);

    act(() => { vi.advanceTimersByTime(46_000); });
    expect(pillVisible()).toBe(false);
  });
});
