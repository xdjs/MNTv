import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Nugget, Source } from "@/mock/types";

vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock());

// ── Player ────────────────────────────────────────────────────────────
const playerToggle = vi.fn();
const playerSeek = vi.fn();
vi.mock("@/contexts/PlayerContext", () => ({
  usePlayer: () => ({
    isPlaying: true,
    currentTime: 0,
    duration: 200,
    toggle: playerToggle,
    seek: playerSeek,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: null, error: null })) } },
}));

// ── Bookmarks ─────────────────────────────────────────────────────────
// Controllable per test so the Save button can be driven through its
// signed-out, unsaved, and saved states.
const bookmarkToggle = vi.fn();
let bookmarksState = { signedIn: true, saved: false };
vi.mock("@/hooks/useBookmarks", () => ({
  useBookmarks: () => ({
    bookmarks: [],
    loading: false,
    signedIn: bookmarksState.signedIn,
    isBookmarked: () => bookmarksState.saved,
    findBookmark: () => undefined,
    toggle: bookmarkToggle,
    adding: false,
    removing: false,
  }),
}));

import ImmersiveNuggetView from "@/components/immersive/ImmersiveNuggetView";

const SOURCE: Source = {
  id: "src-1",
  type: "article",
  title: "Interview",
  publisher: "Pitchfork",
  url: "https://pitchfork.com/example",
};

// A nugget whose headline and body differ — the normal case.
const RICH: Nugget = {
  id: "n-1",
  trackId: "real::Cherele::KIKI",
  timestampSec: 10,
  durationMs: 7000,
  headline: "Cherele cut the whole vocal in one take.",
  text: "The session ran past midnight and the engineer kept the scratch vocal because the phrasing never landed the same way twice.",
  kind: "artist",
  sourceId: "src-1",
};

// A nugget with no headline — the hero falls back to `text`, so the body
// below repeats it verbatim.
const HEADLINE_LESS: Nugget = {
  id: "n-2",
  trackId: "real::Cherele::KIKI",
  timestampSec: 40,
  durationMs: 7000,
  text: "The bassline was played on a borrowed Fender.",
  kind: "track",
  sourceId: "src-1",
};

function renderView(nuggets: Nugget[] = [RICH], researching = false) {
  return render(
    <ImmersiveNuggetView
      nuggets={nuggets}
      sources={new Map([["src-1", SOURCE]])}
      coverArtUrl="https://example.com/art.jpg"
      trackTitle="KIKI"
      artist="Cherele"
      onClose={() => {}}
      isFresh
      researching={researching}
    />,
  );
}

beforeEach(() => {
  bookmarkToggle.mockReset();
  playerToggle.mockReset();
  bookmarksState = { signedIn: true, saved: false };
});

describe("ImmersiveNuggetView — nugget rendering", () => {
  it("renders the active nugget's body text", () => {
    renderView();
    expect(screen.getByText(/session ran past midnight/i)).toBeTruthy();
  });

  it("renders the source publisher", () => {
    renderView();
    expect(screen.getByText("Pitchfork")).toBeTruthy();
  });

  it("links out to the source when the URL is safe", () => {
    renderView();
    const link = screen.getByRole("link", { name: /view source/i });
    expect(link.getAttribute("href")).toBe("https://pitchfork.com/example");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("ImmersiveNuggetView — save button", () => {
  it("offers Save when the user is signed in", () => {
    renderView();
    expect(screen.getByRole("button", { name: /save nugget/i })).toBeTruthy();
  });

  it("hides the button entirely when signed out", () => {
    bookmarksState = { signedIn: false, saved: false };
    renderView();
    expect(screen.queryByRole("button", { name: /save nugget/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove bookmark/i })).toBeNull();
  });

  // The payload matters: the natural-key lookup that decides whether the
  // heart reads as filled matches on (headline, trackId, kind), so these
  // three fields have to survive the trip exactly.
  it("passes the nugget's identity fields through on tap", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /save nugget/i }));

    expect(bookmarkToggle).toHaveBeenCalledTimes(1);
    expect(bookmarkToggle.mock.calls[0][0]).toMatchObject({
      trackId: RICH.trackId,
      kind: RICH.kind,
      headline: RICH.headline,
      body: RICH.text,
      artist: "Cherele",
      title: "KIKI",
    });
  });

  it("falls back to body text as the headline when a nugget has none", () => {
    renderView([HEADLINE_LESS]);
    fireEvent.click(screen.getByRole("button", { name: /save nugget/i }));
    expect(bookmarkToggle.mock.calls[0][0].headline).toBe(HEADLINE_LESS.text);
  });

  it("reads as saved once the nugget is bookmarked", () => {
    bookmarksState = { signedIn: true, saved: true };
    renderView();
    expect(screen.getByRole("button", { name: /remove bookmark/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save nugget/i })).toBeNull();
  });

});

describe("ImmersiveNuggetView — swipe-up cue", () => {
  it("offers the cue when a nugget is on screen", () => {
    renderView();
    expect(screen.getByRole("button", { name: /scroll down to read the full story/i })).toBeTruthy();
  });

  // Regression guard. The cue was once hidden when the body duplicated
  // the headline — but the below-fold region holds every control, not
  // just prose, so hiding it stranded the Save button on exactly those
  // nuggets. A user who has learned "chevron means scroll" reads its
  // absence as "nothing below".
  it("still offers the cue on a headline-less nugget, where the controls also live below", () => {
    renderView([HEADLINE_LESS]);
    expect(screen.getByRole("button", { name: /scroll down to read the full story/i })).toBeTruthy();
    // The thing the cue is protecting access to.
    expect(screen.getByRole("button", { name: /save nugget/i })).toBeTruthy();
  });

  // ── Behaviour, not just presence ────────────────────────────────────
  // These replace two earlier tests that asserted the Save and cue taps
  // don't toggle playback. Those could never fail: no ancestor of either
  // button carries a playback handler (the collapse chevron is a sibling,
  // and `toggle` reaches only MiniPlayer and the mediaSession handlers),
  // so they claimed a protection nothing enforced.

  it("fades the cue out as the body scrolls into view", () => {
    renderView();
    const cue = screen.getByTestId("scroll-cue");
    const scroller = screen.getByTestId("nugget-scroll");

    // The reset effect sets full opacity on mount.
    expect(cue.style.opacity).toBe("1");

    Object.defineProperty(scroller, "scrollTop", { value: 45, configurable: true });
    fireEvent.scroll(scroller);
    // Half of the 90px fade distance → half opacity.
    expect(Number(cue.style.opacity)).toBeCloseTo(0.5, 2);
  });

  it("makes the faded-out cue untappable so it can't intercept touches", () => {
    renderView();
    const cue = screen.getByTestId("scroll-cue");
    const scroller = screen.getByTestId("nugget-scroll");

    Object.defineProperty(scroller, "scrollTop", { value: 500, configurable: true });
    fireEvent.scroll(scroller);

    expect(Number(cue.style.opacity)).toBe(0);
    expect(cue.style.pointerEvents).toBe("none");
  });

  it("scrolls the body into view when the cue is tapped", () => {
    const scrollToSpy = vi.spyOn(Element.prototype, "scrollTo").mockImplementation(() => {});
    renderView();
    const scroller = screen.getByTestId("nugget-scroll");
    Object.defineProperty(scroller, "clientHeight", { value: 800, configurable: true });

    fireEvent.click(screen.getByRole("button", { name: /scroll down to read the full story/i }));

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 800 * 0.72, behavior: "smooth" }),
    );
    scrollToSpy.mockRestore();
  });

  // Each new fact should open on its headline, not wherever the reader
  // left the previous one.
  it("returns to the top and restores the cue when the nugget changes", () => {
    const { rerender } = renderView();
    const cue = screen.getByTestId("scroll-cue");
    const scroller = screen.getByTestId("nugget-scroll");

    Object.defineProperty(scroller, "scrollTop", { value: 300, writable: true, configurable: true });
    fireEvent.scroll(scroller);
    expect(Number(cue.style.opacity)).toBe(0);

    const NEXT: Nugget = { ...RICH, id: "n-9", headline: "A different fact entirely.", text: "With its own distinct body copy." };
    rerender(
      <ImmersiveNuggetView
        nuggets={[NEXT]}
        sources={new Map([["src-1", SOURCE]])}
        coverArtUrl="https://example.com/art.jpg"
        trackTitle="KIKI"
        artist="Cherele"
        onClose={() => {}}
        isFresh
      />,
    );

    expect(scroller.scrollTop).toBe(0);
    expect(screen.getByTestId("scroll-cue").style.opacity).toBe("1");
  });
});

describe("ImmersiveNuggetView — deep dive", () => {
  it("offers 'Tell me more' on the active nugget", () => {
    renderView();
    expect(screen.getByRole("button", { name: /tell me more/i })).toBeTruthy();
  });

  it("keeps the deep-dive control separate from the save control", () => {
    renderView();
    const save = screen.getByRole("button", { name: /save nugget/i });
    const deeper = screen.getByRole("button", { name: /tell me more/i });
    expect(save).not.toBe(deeper);
    expect(within(save).queryByText(/tell me more/i)).toBeNull();
  });
});


// ── Research glow ─────────────────────────────────────────────────────
// Pete: "can we make the color that shows up around the screen pulse a
// little more so we know that research is being done?" The screen-edge
// glow is visible from anywhere on the card, so it carries the state
// better than the small logo in the corner.
describe("ImmersiveNuggetView — research glow", () => {
  it("breathes the screen edge while research is in flight", () => {
    renderView([RICH], true);
    const glow = screen.getByTestId("screen-glow");
    expect(glow.getAttribute("data-researching")).toBe("true");
    expect(glow.className).toContain("animate-research-glow");
  });

  it("settles to a static glow once research finishes", () => {
    renderView([RICH], false);
    const glow = screen.getByTestId("screen-glow");
    expect(glow.getAttribute("data-researching")).toBe("false");
    expect(glow.className).not.toContain("animate-research-glow");
    // Static state still tints the edges — it just stops moving.
    expect(glow.getAttribute("style") ?? "").toContain("box-shadow");
  });

  it("stops breathing when research completes mid-view", () => {
    const { rerender } = renderView([RICH], true);
    expect(screen.getByTestId("screen-glow").className).toContain("animate-research-glow");

    rerender(
      <ImmersiveNuggetView
        nuggets={[RICH]}
        sources={new Map([["src-1", SOURCE]])}
        coverArtUrl="https://example.com/art.jpg"
        trackTitle="KIKI"
        artist="Cherele"
        onClose={() => {}}
        isFresh
        researching={false}
      />,
    );

    expect(screen.getByTestId("screen-glow").className).not.toContain("animate-research-glow");
  });
});
