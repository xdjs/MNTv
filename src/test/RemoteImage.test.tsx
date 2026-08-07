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

    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByAltText("cover").getAttribute("src")).toBe(`${SRC}?_retry=1`);
  });

  it("cache-busts the retry so the browser cannot replay the failure", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(1100); });

    expect(screen.getByAltText("cover").getAttribute("src")).not.toBe(SRC);
  });

  it("falls back to the placeholder once the retry also fails", () => {
    render(<RemoteImage src={SRC} alt="cover" fallback={<div data-testid="ph" />} />);

    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(1100); });
    fireEvent.error(screen.getByAltText("cover"));

    expect(screen.queryByAltText("cover")).toBeNull();
    expect(screen.getByTestId("ph")).toBeTruthy();
  });

  it("does not retry forever", () => {
    render(<RemoteImage src={SRC} alt="cover" fallback={<div data-testid="ph" />} />);
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(1100); });
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(5000); });

    expect(screen.getByTestId("ph")).toBeTruthy();
  });
});

// ── Jittered backoff ──────────────────────────────────────────────────
// A fixed delay reconvenes everything that failed together into a second
// synchronised burst against the CDN that just throttled it — a smaller
// replay of the original bug. The window is [700, 1000).
describe("RemoteImage — the retry is spread out", () => {
  it("never retries before the base backoff", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));

    act(() => { vi.advanceTimersByTime(699); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(SRC);
  });

  it("has always retried by the top of the jitter window", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));

    act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(`${SRC}?_retry=1`);
  });

  // Same failure, different delays — otherwise the jitter isn't doing
  // anything. Sampled across many renders because two draws can collide.
  it("does not schedule every retry at the same moment", () => {
    const fired: number[] = [];
    for (let i = 0; i < 25; i++) {
      const { unmount } = render(<RemoteImage src={SRC} alt="cover" />);
      fireEvent.error(screen.getByAltText("cover"));
      let ms = 0;
      while (ms < 1000 && screen.getByAltText("cover").getAttribute("src") === SRC) {
        act(() => { vi.advanceTimersByTime(10); });
        ms += 10;
      }
      fired.push(ms);
      unmount();
    }
    expect(new Set(fired).size).toBeGreaterThan(1);
  });
});

// ── Cache-busting only where it is safe ───────────────────────────────
// This component is no longer Spotify-only: ReadingOverlay and
// NuggetDeepDive point it at Exa-derived thumbnails on arbitrary hosts.
// A signed URL's signature usually covers the query string, so appending
// to one turns a transient failure into a guaranteed 403.
describe("RemoteImage — retrying a URL that carries its own query", () => {
  const SIGNED = "https://cdn.example.com/img.jpg?Expires=123&Signature=abc";

  it("retries a signed URL untouched rather than breaking its signature", () => {
    render(<RemoteImage src={SIGNED} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));

    act(() => { vi.advanceTimersByTime(1100); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(SIGNED);
  });

  // Caught in review, and the sharpest bug in this PR. The first version
  // "retried" by re-setting the same src. React bails on an identical
  // state value, so the src attribute never changed and the browser
  // issued no request — meaning onError never fired again, `failed` was
  // never reached, and a signed URL sat as a broken <img> forever rather
  // than falling back. That is worse than the naive cache-bust it
  // replaced, which at least reached the fallback.
  //
  // The old test missed it by firing the second error by hand — an event
  // a real browser would never deliver, because nothing was requested.
  // Asserting a NEW element exists is what distinguishes a real second
  // attempt from a no-op re-render.
  it("makes a real second attempt by remounting, not by re-setting state", () => {
    render(<RemoteImage src={SIGNED} alt="cover" />);
    const first = screen.getByAltText("cover");

    fireEvent.error(first);
    act(() => { vi.advanceTimersByTime(1100); });

    const second = screen.getByAltText("cover");
    expect(second).not.toBe(first);
    expect(second.getAttribute("src")).toBe(SIGNED);
  });

  // The guarantee that actually matters to a user: never a permanently
  // broken image. Whatever the retry does, the component must resolve to
  // the fallback once the second attempt fails.
  it("reaches the fallback after the remounted attempt also fails", () => {
    render(<RemoteImage src={SIGNED} alt="cover" fallback={<div data-testid="ph" />} />);

    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(1100); });
    fireEvent.error(screen.getByAltText("cover"));

    expect(screen.queryByAltText("cover")).toBeNull();
    expect(screen.getByTestId("ph")).toBeTruthy();
  });

  it("still cache-busts a bare URL", () => {
    render(<RemoteImage src={SRC} alt="cover" />);
    fireEvent.error(screen.getByAltText("cover"));

    act(() => { vi.advanceTimersByTime(1100); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(`${SRC}?_retry=1`);
  });

  it("still gives up after one retry on a signed URL", () => {
    render(<RemoteImage src={SIGNED} alt="cover" fallback={<div data-testid="ph" />} />);
    fireEvent.error(screen.getByAltText("cover"));
    act(() => { vi.advanceTimersByTime(1100); });
    fireEvent.error(screen.getByAltText("cover"));

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
    act(() => { vi.advanceTimersByTime(1100); });
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
    act(() => { vi.advanceTimersByTime(1100); });

    expect(screen.getByAltText("cover").getAttribute("src")).toBe(`${NEXT}?_retry=1`);
  });
});
