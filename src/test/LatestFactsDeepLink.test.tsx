import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock());

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import LatestFactsSection from "@/components/LatestFactsSection";

const FACT: ArtistUpdate = {
  artistId: "a1",
  artistName: "Turnover",
  artistImageUrl: "https://example.com/t.jpg",
  kind: "fact",
  headline: "Turnover tracked the record with their live engineer.",
  body: "They brought him into the studio to capture the room.",
  nuggetId: "fact-42",
};

const OTHER: ArtistUpdate = { ...FACT, nuggetId: "fact-99", headline: "A different fact." };

function renderAt(search: string, updates: ArtistUpdate[] = [FACT, OTHER]) {
  return render(
    <MemoryRouter initialEntries={[`/artist/spotify::a1::Turnover${search}`]}>
      <LatestFactsSection updates={updates} loading={false} artistName="Turnover" />
    </MemoryRouter>,
  );
}

const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  navigateMock.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("artist page — arriving from a fact card", () => {
  // Pete: "it takes me to the profile but the fact card stays open or
  // re-opens on top of the artist profile instead of letting me see the
  // artist profile." The card was never lingering — this component was
  // calling setExpandedKey on arrival and opening it again.
  it("does not open the referenced fact over the page", () => {
    renderAt("?nugget=fact-42");
    expect(dialog()).toBeNull();
  });

  // Scrolling is deferred a frame so the card exists before we target it.
  it("scrolls the referenced fact into view instead", async () => {
    renderAt("?nugget=fact-42");
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("leaves the page clear when there is no deep link", () => {
    renderAt("");
    expect(dialog()).toBeNull();
  });

  it("ignores a deep link that matches nothing", () => {
    renderAt("?nugget=does-not-exist");
    expect(dialog()).toBeNull();
  });

  // The card must still be openable — this fixes an unwanted auto-open,
  // not the ability to read a fact on the artist page.
  it("still opens the card when the user taps it", () => {
    renderAt("?nugget=fact-42");
    expect(dialog()).toBeNull();

    fireEvent.click(screen.getByText(FACT.headline));

    expect(dialog()).not.toBeNull();
  });

  it("opens the tapped card, not the deep-linked one", () => {
    renderAt("?nugget=fact-42");
    fireEvent.click(screen.getByText(OTHER.headline));

    const dlg = dialog()!;
    expect(dlg.textContent).toContain(OTHER.headline);
  });
});
