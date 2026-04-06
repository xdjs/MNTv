import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import SwipeableNuggetStack from "@/components/immersive/SwipeableNuggetStack";

function renderStack(props: Partial<React.ComponentProps<typeof SwipeableNuggetStack>> = {}) {
  const onSwipe = vi.fn();
  const result = render(
    <SwipeableNuggetStack
      unlockedCount={3}
      activeIndex={1}
      onSwipe={onSwipe}
      {...props}
    >
      {() => <div data-testid="card">Card</div>}
    </SwipeableNuggetStack>
  );
  return { ...result, onSwipe };
}

describe("SwipeableNuggetStack", () => {
  it("renders children", () => {
    const { getByTestId } = renderStack();
    expect(getByTestId("card")).toBeTruthy();
  });

  it("does not call onSwipe for a drag below threshold", () => {
    vi.useFakeTimers();
    const { container, onSwipe } = renderStack();
    const el = container.firstChild as HTMLElement;

    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 120, clientY: 200 }] });

    vi.advanceTimersByTime(300);
    expect(onSwipe).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("canGoLeft is false at index 0", () => {
    vi.useFakeTimers();
    const { container, onSwipe } = renderStack({ activeIndex: 0 });
    const el = container.firstChild as HTMLElement;

    // Swipe right (should not navigate — already at index 0)
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200, clientY: 200 }] });

    vi.advanceTimersByTime(300);
    expect(onSwipe).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("canGoRight is false at last index", () => {
    vi.useFakeTimers();
    const { container, onSwipe } = renderStack({ activeIndex: 2, unlockedCount: 3 });
    const el = container.firstChild as HTMLElement;

    // Swipe left (should not navigate — already at last index)
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: 200 }] });

    vi.advanceTimersByTime(300);
    expect(onSwipe).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
