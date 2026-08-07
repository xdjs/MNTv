import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RemoteImage from "@/components/RemoteImage";

const SRC = "https://i.scdn.co/image/abc123";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RemoteImage — deferring the request", () => {
  // THE ROOT FIX. Browse fired ~53 simultaneous requests at i.scdn.co,
  // Spotify throttled the burst, and most came back 503. Deferring
  // offscreen artwork is what stops that; everything else here is
  // recovery for the few that still fail.
  it("defers loading by default", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    expect(screen.getByAltText("cover").getAttribute("loading")).toBe("lazy");
  });

  it("decodes off the main thread", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    expect(screen.getByAltText("cover").getAttribute("decoding")).toBe("async");
  });

  // Above-the-fold artwork is already being looked at; deferring it only
  // delays what the user can see.
  it("loads eagerly when asked", () => {
    render(<RemoteImage src={SRC} alt="cover" eager />);
    expect(screen.getByAltText("cover").getAttribute("loading")).toBe("eager");
  });
});

describe("RemoteImage — recovering from a throttled request", () => {
  it("retries once after a backoff", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    const img = screen.getByAltText("cover");
    expect(img.getAttribute("src")).toBe(SRC);

    fireEvent.error(img);
    // Immediately retrying would rejoin the burst that caused the throttle.
    expect(screen.getByAltText("cover").getAttribute("src")).toBe(SRC);

    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.getByAltText("cover").getAttribute("src")).toBe(`${SRC}?_retry=1`);
  });

  it("cache-busts the retry so the browser cannot replay the failure", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(800); });

    expect(screen.getByAltText("cover").getAttribute("src")).not.toBe(SRC);
  });

  it("falls back to the placeholder once the retry also fails", () => {
    render(<RemoteImage src={SRC} alt="cover" fallback={<div data-testid="ph" />} />);

    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.error(screen.getByAltText("cover"));

    expect(screen.queryByAltText("cover")).toBeNull();
    expect(screen.getByTestId("ph")).toBeTruthy();
  });

  it("does not retry forever", () => {
    render(<RemoteImage src={SRC} alt="cover" fallback={<div data-testid="ph" />} />);
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(5000); });

    expect(screen.getByTestId("ph")).toBeTruthy();
  });
});

describe("RemoteImage — no artwork", () => {
  it("renders the fallback when src is missing", () => {
    render(<RemoteImage src={undefined} fallback={<div data-testid="ph" />} />);
    expect(screen.getByTestId("ph")).toBeTruthy();
  });

  it("renders the fallback when src is null", () => {
    render(<RemoteImage src={null} fallback={<div data-testid="ph" />} />);
    expect(screen.getByTestId("ph")).toBeTruthy();
  });

  // A failed URL must not poison the next one — artist rows swap images
  // as content resolves.
  it("recovers when a new src replaces a failed one", () => {
    const { rerender } = render(
      <RemoteImage src={SRC} alt="cover" fallback={<div data-testid="ph" />} />,
    );
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.error(screen.getByAltText("cover"));
    expect(screen.getByTestId("ph")).toBeTruthy();

    rerender(
      <RemoteImage src="https://i.scdn.co/image/def456" alt="cover" fallback={<div data-testid="ph" />} />,
    );

    const img = screen.getByAltText("cover");
    expect(img.getAttribute("src")).toBe("https://i.scdn.co/image/def456");
  });
});

// ── src changing mid-backoff ──────────────────────────────────────────
// Flagged in review. A scheduled retry closes over the PREVIOUS src; if
// the prop moves on before it fires, the stale timer writes the old URL
// over the new one ~700ms later. That collision is likeliest during
// exactly the burst this component exists for — several images sit
// mid-backoff while ArtistRow's heroImg recomputes as facts stream in.
describe("RemoteImage — src changes while a retry is pending", () => {
  const NEXT = "https://i.scdn.co/image/def456";

  it("does not let a stale retry clobber the new image", () => {
    const { rerender } = render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));

    // New artwork arrives mid-backoff.
    rerender(<RemoteImage src={NEXT} alt="cover" />);
    expect(screen.getByAltText("cover").getAttribute("src")).toBe(NEXT);

    // The old retry would have fired around here.
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(NEXT);
  });

  it("still shows the new image rather than falling back", () => {
    const { rerender } = render(
      <RemoteImage src={SRC} alt="cover" fallback={<div data-testid="ph" />} />,
    );
    fireEvent.error(screen.getByAltText("cover"));
    rerender(<RemoteImage src={NEXT} alt="cover" fallback={<div data-testid="ph" />} />);
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.queryByTestId("ph")).toBeNull();
    expect(screen.getByAltText("cover")).toBeTruthy();
  });

  // The new image gets its own full retry budget — it must not inherit
  // the previous URL's spent attempt.
  it("gives the new image its own retry", () => {
    const { rerender } = render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));
    rerender(<RemoteImage src={NEXT} alt="cover" />);
    act(() => { vi.advanceTimersByTime(2000); });

    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(800); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(`${NEXT}?_retry=1`);
  });
});
