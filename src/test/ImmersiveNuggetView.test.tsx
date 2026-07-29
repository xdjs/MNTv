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

function renderView(nuggets: Nugget[] = [RICH]) {
  return render(
    <ImmersiveNuggetView
      nuggets={nuggets}
      sources={new Map([["src-1", SOURCE]])}
      coverArtUrl="https://example.com/art.jpg"
      trackTitle="KIKI"
      artist="Cherele"
      onClose={() => {}}
      isFresh
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

  it("does not let the tap fall through to the card underneath", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /save nugget/i }));
    // A tap that bubbled to the card would toggle playback.
    expect(playerToggle).not.toHaveBeenCalled();
  });
});

describe("ImmersiveNuggetView — swipe-up cue", () => {
  it("offers the cue when the body adds something beyond the headline", () => {
    renderView();
    expect(screen.getByRole("button", { name: /scroll down to read the full story/i })).toBeTruthy();
  });

  // Without a headline the hero shows `text` and the body repeats it —
  // a cue promising "more" would point at duplicate prose.
  it("withholds the cue when the body only repeats the headline", () => {
    renderView([HEADLINE_LESS]);
    expect(screen.queryByRole("button", { name: /scroll down to read the full story/i })).toBeNull();
  });

  it("does not toggle playback when the cue is tapped", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /scroll down to read the full story/i }));
    expect(playerToggle).not.toHaveBeenCalled();
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
