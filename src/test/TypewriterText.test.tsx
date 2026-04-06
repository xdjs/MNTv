import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import TypewriterText from "@/components/immersive/TypewriterText";

describe("TypewriterText", () => {
  it("calls onComplete exactly once after the full string is typed", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<TypewriterText text="Hello" speed={10} onComplete={onComplete} />);

    // Advance past all 5 characters + extra ticks
    act(() => { vi.advanceTimersByTime(100); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not call onComplete while paused", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<TypewriterText text="Hi" speed={10} paused onComplete={onComplete} />);

    act(() => { vi.advanceTimersByTime(200); });

    expect(onComplete).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resets on text prop change", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { rerender } = render(
      <TypewriterText text="AB" speed={10} onComplete={onComplete} />
    );

    // Complete first text
    act(() => { vi.advanceTimersByTime(50); });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Change text — should reset and eventually fire again
    onComplete.mockClear();
    rerender(<TypewriterText text="CD" speed={10} onComplete={onComplete} />);
    act(() => { vi.advanceTimersByTime(50); });
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
