import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNuggetPacer } from "@/components/immersive/useNuggetPacer";

const mkNugget = (id: string) => ({ id });

describe("useNuggetPacer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the first unlocked nugget immediately", () => {
    const onShow = vi.fn();
    const nuggets = [mkNugget("a"), mkNugget("b"), mkNugget("c")];

    renderHook(({ unlockedIds }) =>
      useNuggetPacer({
        nuggets,
        unlockedIds,
        trackKey: "t1",
        onShow,
        minDisplayMs: 10_000,
      }),
      { initialProps: { unlockedIds: new Set(["a"]) } }
    );

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith(0);
  });

  it("queues subsequent nuggets and dispatches them spaced by minDisplayMs", () => {
    const onShow = vi.fn();
    const nuggets = [mkNugget("a"), mkNugget("b"), mkNugget("c")];

    const { rerender } = renderHook(
      ({ unlockedIds }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey: "t1",
          onShow,
          minDisplayMs: 10_000,
        }),
      { initialProps: { unlockedIds: new Set<string>(["a"]) } }
    );

    // First nugget shown immediately.
    expect(onShow).toHaveBeenLastCalledWith(0);
    expect(onShow).toHaveBeenCalledTimes(1);

    // Second and third arrive before the min display window — both should be
    // queued (neither immediately replaces "a").
    act(() => {
      rerender({ unlockedIds: new Set(["a", "b"]) });
    });
    act(() => {
      rerender({ unlockedIds: new Set(["a", "b", "c"]) });
    });
    expect(onShow).toHaveBeenCalledTimes(1);

    // After 10s, nugget "b" (index 1) dispatches.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(onShow).toHaveBeenLastCalledWith(1);

    // Another 10s later, nugget "c" (index 2) dispatches — no drop.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onShow).toHaveBeenCalledTimes(3);
    expect(onShow).toHaveBeenLastCalledWith(2);
  });

  it("dispatches every nugget in order even when they arrive faster than minDisplayMs", () => {
    const onShow = vi.fn();
    const nuggets = [mkNugget("a"), mkNugget("b"), mkNugget("c")];

    const { rerender } = renderHook(
      ({ unlockedIds }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey: "t1",
          onShow,
          minDisplayMs: 10_000,
        }),
      { initialProps: { unlockedIds: new Set<string>(["a"]) } }
    );

    // 3s later, "b" arrives.
    act(() => {
      vi.advanceTimersByTime(3000);
      rerender({ unlockedIds: new Set(["a", "b"]) });
    });
    // 3s later (6s total since "a"), "c" arrives.
    act(() => {
      vi.advanceTimersByTime(3000);
      rerender({ unlockedIds: new Set(["a", "b", "c"]) });
    });

    expect(onShow.mock.calls.map((c) => c[0])).toEqual([0]);

    // At t=10s since "a", "b" should dispatch.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onShow.mock.calls.map((c) => c[0])).toEqual([0, 1]);

    // At t=10s since "b", "c" should dispatch.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onShow.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
  });

  it("advances immediately when a new nugget arrives after the min display window", () => {
    const onShow = vi.fn();
    const nuggets = [mkNugget("a"), mkNugget("b")];

    const { rerender } = renderHook(
      ({ unlockedIds }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey: "t1",
          onShow,
          minDisplayMs: 10_000,
        }),
      { initialProps: { unlockedIds: new Set<string>(["a"]) } }
    );

    act(() => {
      vi.advanceTimersByTime(12_000);
      rerender({ unlockedIds: new Set(["a", "b"]) });
    });
    // Scheduler sets wait = max(0, minDisplay - elapsed) = 0, so the timer
    // fires on the next tick rather than synchronously. Flush it.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onShow.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it("clears the queue and resets state on track change", () => {
    const onShow = vi.fn();
    const nuggetsT1 = [mkNugget("a"), mkNugget("b"), mkNugget("c")];
    const nuggetsT2 = [mkNugget("x"), mkNugget("y")];

    const { rerender } = renderHook(
      ({ unlockedIds, trackKey, nuggets }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey,
          onShow,
          minDisplayMs: 10_000,
        }),
      {
        initialProps: {
          unlockedIds: new Set<string>(["a", "b"]),
          trackKey: "t1",
          nuggets: nuggetsT1,
        },
      }
    );
    // First call shows index 0 immediately; index 1 is queued.
    expect(onShow.mock.calls.map((c) => c[0])).toEqual([0]);
    onShow.mockClear();

    // Switch track. The queued dispatch for nugget "b" must not leak.
    act(() => {
      rerender({
        unlockedIds: new Set<string>([]),
        trackKey: "t2",
        nuggets: nuggetsT2,
      });
    });
    // Advance past the old scheduled wait — should NOT fire the stale "b".
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onShow).not.toHaveBeenCalled();

    // New track's first nugget unlocks and shows immediately.
    act(() => {
      rerender({
        unlockedIds: new Set(["x"]),
        trackKey: "t2",
        nuggets: nuggetsT2,
      });
    });
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith(0);
  });

  it("cleans up the pending timer on unmount", () => {
    const onShow = vi.fn();
    const nuggets = [mkNugget("a"), mkNugget("b")];

    const { rerender, unmount } = renderHook(
      ({ unlockedIds }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey: "t1",
          onShow,
          minDisplayMs: 10_000,
        }),
      { initialProps: { unlockedIds: new Set<string>(["a"]) } }
    );
    act(() => {
      rerender({ unlockedIds: new Set(["a", "b"]) });
    });
    onShow.mockClear();
    unmount();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onShow).not.toHaveBeenCalled();
  });

  it("cancelPending drops queued nuggets and stops auto-advance for the rest of the track", () => {
    const onShow = vi.fn();
    const nuggets = [{ id: "a" }, { id: "b" }, { id: "c" }];

    const { result, rerender } = renderHook(
      ({ unlockedIds }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey: "t1",
          onShow,
          minDisplayMs: 10_000,
        }),
      { initialProps: { unlockedIds: new Set<string>(["a", "b"]) } }
    );
    // Index 0 shown immediately, index 1 queued.
    expect(onShow.mock.calls.map((c) => c[0])).toEqual([0]);

    // User swipes — cancel the queue.
    act(() => {
      result.current.cancelPending();
    });

    // Pending advance to "b" should never fire.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onShow).toHaveBeenCalledTimes(1);

    // Nugget "c" arrives — pacer should NOT auto-advance now that the user
    // has taken over.
    act(() => {
      rerender({ unlockedIds: new Set(["a", "b", "c"]) });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("cancelPending's takeover resets on track change", () => {
    const onShow = vi.fn();
    const nuggetsT1 = [{ id: "a" }, { id: "b" }];
    const nuggetsT2 = [{ id: "x" }, { id: "y" }];

    const { result, rerender } = renderHook(
      ({ unlockedIds, trackKey, nuggets }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey,
          onShow,
          minDisplayMs: 10_000,
        }),
      {
        initialProps: {
          unlockedIds: new Set<string>(["a"]),
          trackKey: "t1",
          nuggets: nuggetsT1,
        },
      }
    );
    act(() => {
      result.current.cancelPending();
    });

    // Switch track and add nuggets — pacer should resume normally for the
    // new track even though the previous track was paused.
    act(() => {
      rerender({
        unlockedIds: new Set(["x"]),
        trackKey: "t2",
        nuggets: nuggetsT2,
      });
    });
    expect(onShow.mock.calls.filter(([i]) => i === 0).length).toBeGreaterThanOrEqual(1);

    onShow.mockClear();
    act(() => {
      rerender({
        unlockedIds: new Set(["x", "y"]),
        trackKey: "t2",
        nuggets: nuggetsT2,
      });
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onShow).toHaveBeenCalledWith(1);
  });

  it("is idempotent on unlockedIds re-renders that don't grow the set", () => {
    const onShow = vi.fn();
    const nuggets = [mkNugget("a"), mkNugget("b")];

    const { rerender } = renderHook(
      ({ unlockedIds }) =>
        useNuggetPacer({
          nuggets,
          unlockedIds,
          trackKey: "t1",
          onShow,
          minDisplayMs: 10_000,
        }),
      { initialProps: { unlockedIds: new Set<string>(["a"]) } }
    );
    expect(onShow).toHaveBeenCalledTimes(1);

    // Re-render with a new Set instance that has the same contents — should
    // not re-dispatch.
    act(() => {
      rerender({ unlockedIds: new Set(["a"]) });
    });
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});
