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
function baseProps(trackId: string) {
  return {
    aiError: null,
    shortId: null,
    trackId,
    tier: "casual",
    listenCount: 1,
    focusZone: "none",
    topFocusIndex: 0,
    onCompanionClick: () => {},
  };
}

function renderPill(props: {
  hasNuggets: boolean;
  aiLoading?: boolean;
  aiError?: string | null;
  waveLoading?: boolean;
}) {
  const trackId = `track-${seq++}`;
  const view = render(
    <MusicNerdLoadingOrchestrator
      {...baseProps(trackId)}
      aiLoading={props.aiLoading ?? true}
      waveLoading={props.waveLoading ?? false}
      aiError={props.aiError ?? null}
      hasNuggets={props.hasNuggets}
    />,
  );
  return { ...view, trackId };
}

/** "pulsating" = research still in flight; "ready" = settled. */
const logoPhase = () => screen.queryByTestId("nerd-logo")?.getAttribute("data-phase") ?? null;

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
        <MusicNerdLoadingOrchestrator {...baseProps(trackId)} aiLoading hasNuggets />,
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

    act(() => { vi.advanceTimersByTime(101_000); });
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

    act(() => {
      rerender(
        <MusicNerdLoadingOrchestrator
          {...baseProps(trackId)}
          aiLoading={false}
          hasNuggets={false}
        />,
      );
    });
    // Research is done, but nothing was ever revealed — the pill is now
    // lying and must still go at the ceiling.
    expect(pillVisible()).toBe(true);

    act(() => { vi.advanceTimersByTime(101_000); });
    expect(pillVisible()).toBe(false);
  });
});

// ── Wave-2 ────────────────────────────────────────────────────────────
// After the first facts land, aiLoading goes false but research
// continues. The logo keeps pulsing so the user knows more is coming
// rather than assuming the app is done.
describe("pulsating logo through wave-2", () => {
  function settleToLogo(waveLoading: boolean) {
    const view = renderPill({ hasNuggets: true, aiLoading: true, waveLoading });
    act(() => { vi.advanceTimersByTime(400); });   // pill up
    act(() => { vi.advanceTimersByTime(1000); });  // fact arrives -> morph -> logo
    return view;
  }

  it("keeps pulsing while wave-2 is still researching", () => {
    const { rerender, trackId } = settleToLogo(true);

    act(() => {
      rerender(
        <MusicNerdLoadingOrchestrator
          {...baseProps(trackId)}
          aiLoading={false}
          waveLoading={true}
          hasNuggets
        />,
      );
    });

    expect(logoPhase()).toBe("pulsating");
  });

  it("settles once wave-2 finishes", () => {
    const { rerender, trackId } = settleToLogo(true);

    act(() => {
      rerender(
        <MusicNerdLoadingOrchestrator
          {...baseProps(trackId)}
          aiLoading={false}
          waveLoading={false}
          hasNuggets
        />,
      );
    });

    expect(logoPhase()).toBe("ready");
  });

  // Same reasoning as the pill's ceiling: a wave-2 that never resolves
  // must not leave the logo claiming research is in flight forever.
  it("gives up pulsing at the ceiling if wave-2 never resolves", () => {
    const { rerender, trackId } = settleToLogo(true);

    act(() => {
      rerender(
        <MusicNerdLoadingOrchestrator
          {...baseProps(trackId)}
          aiLoading={false}
          waveLoading={true}
          hasNuggets
        />,
      );
    });
    expect(logoPhase()).toBe("pulsating");

    act(() => { vi.advanceTimersByTime(101_000); });
    expect(logoPhase()).toBe("ready");
  });
});

// The ceiling is a backstop against a stalled pipeline, NOT a deadline
// for a working one. It was 45s while generate-nuggets budgets 90s and
// the client waits 95s, so a slow-but-successful generation had the pill
// quit early and leave the user on blank cover art (Pete, on a Years &
// Years / Tove Lo collab). These lock the relationship so the two can't
// drift apart again.
describe("pill ceiling vs the generation budget", () => {
  it("keeps holding at 45s, when research may still legitimately be running", () => {
    renderPill({ hasNuggets: false });
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { vi.advanceTimersByTime(45_000); });
    expect(pillVisible()).toBe(true);
  });

  it("still holds past the server's own 90s deadline", () => {
    renderPill({ hasNuggets: false });
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(pillVisible()).toBe(true);
  });

  it("gives up once the client has stopped waiting for the invoke", () => {
    renderPill({ hasNuggets: false });
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { vi.advanceTimersByTime(101_000); });
    expect(pillVisible()).toBe(false);
  });
});
