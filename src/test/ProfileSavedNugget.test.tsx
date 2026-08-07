import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Bookmark } from "@/hooks/useBookmarks";

vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock());

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const toggleMock = vi.fn();
let bookmarks: Bookmark[] = [];
vi.mock("@/hooks/useBookmarks", () => ({
  useBookmarks: () => ({
    bookmarks,
    loading: false,
    signedIn: true,
    toggle: toggleMock,
    isBookmarked: () => true,
    findBookmark: () => undefined,
    adding: false,
    removing: false,
  }),
}));

vi.mock("@/hooks/useMusicNerdState", () => ({
  useUserProfile: () => ({ profile: { displayName: "Pete" } }),
}));

import Profile from "@/pages/Profile";

const BOOKMARK: Bookmark = {
  id: "bm-1",
  service: "spotify",
  track_id: "real::Turnover::Humming",
  artist: "Turnover",
  title: "Humming",
  album: null,
  nugget_kind: "artist",
  headline: "Turnover tracked the record with their front-of-house engineer.",
  body: "They brought him into the studio to capture the live sound.",
  source: { url: "https://brooklynvegan.com/turnover" },
  image_url: "https://example.com/art.jpg",
  created_at: new Date().toISOString(),
};

function renderProfile() {
  return render(<MemoryRouter><Profile /></MemoryRouter>);
}

const openDialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  navigateMock.mockReset();
  toggleMock.mockReset();
  bookmarks = [BOOKMARK];
});

describe("Profile — opening a saved nugget", () => {
  // Pete: "when I click on one of my saved nuggets it just goes straight to
  // playing the song. I want to be able to open the card and then make the
  // decision if I want to go to the song or artist."
  it("opens the nugget instead of jumping straight to playback", () => {
    renderProfile();
    expect(openDialog()).toBeNull();

    fireEvent.click(screen.getByText(BOOKMARK.headline));

    expect(openDialog()).not.toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the full saved nugget once open", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    const dialog = openDialog()!;
    expect(within(dialog).getByText(BOOKMARK.body)).toBeTruthy();
  });

  it("closes without navigating anywhere", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(openDialog()).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("Profile — deciding where to go", () => {
  it("plays the track when the play control is used", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));
    fireEvent.click(screen.getByRole("button", { name: /play humming by turnover/i }));

    expect(navigateMock).toHaveBeenCalledWith(
      `/listen/${encodeURIComponent(BOOKMARK.track_id)}`,
    );
  });

  // The other half of the ask — the saved nugget is about an artist, so
  // reaching them has to be a real option, not just the song.
  it("opens the artist when the artist link is used", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    const dialog = openDialog()!;
    fireEvent.click(within(dialog).getByRole("button", { name: /^turnover$/i }));

    expect(navigateMock).toHaveBeenCalledWith("/artist/real::Turnover");
  });

  it("links out to the citation when one was saved", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    const link = within(openDialog()!).getByRole("link", { name: /source/i });
    expect(link.getAttribute("href")).toBe("https://brooklynvegan.com/turnover");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  // The saved body is Exa/Gemini-derived, so the stored URL is untrusted.
  it("omits the source link when the saved URL is unsafe", () => {
    bookmarks = [{ ...BOOKMARK, source: { url: "javascript:alert(1)" } }];
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    expect(within(openDialog()!).queryByRole("link", { name: /source/i })).toBeNull();
  });

  it("omits the source link when nothing was saved", () => {
    bookmarks = [{ ...BOOKMARK, source: null }];
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    expect(within(openDialog()!).queryByRole("link", { name: /source/i })).toBeNull();
  });
});

// ── Keyboard access ───────────────────────────────────────────────────
// Flagged in review: this dialog was written to "match the Browse
// expanded card" but shipped without any of that card's focus
// management, so a keyboard user could Tab through the backdrop into the
// page behind with no way to dismiss. Both now share
// useDialogFocusTrap, and these assert the behaviour rather than the
// sharing.
describe("Profile — saved-nugget dialog keyboard access", () => {
  it("dismisses on Escape", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));
    expect(openDialog()).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(openDialog()).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog on open", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("returns focus to the card that opened it", () => {
    renderProfile();
    // Focus the trigger first — that's the keyboard path, and jsdom's
    // click alone doesn't move focus the way a real browser does.
    const trigger = screen.getByText(BOOKMARK.headline).closest("button")!;
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close/i }));

    fireEvent.keyDown(document, { key: "Escape" });

    // Focus goes back where the user left it, not stranded on the body.
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside the dialog rather than reaching the page behind", () => {
    renderProfile();
    fireEvent.click(screen.getByText(BOOKMARK.headline));

    const dialog = openDialog()!;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusable.length).toBeGreaterThan(1);

    // Tabbing forward off the last element wraps to the first.
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);

    // Shift+Tab off the first wraps to the last.
    focusable[0].focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });
});
