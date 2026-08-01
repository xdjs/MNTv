import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ArtistUpdateGroup } from "@/hooks/useArtistUpdates";

vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock());

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import ArtistUpdatesSection from "@/components/ArtistUpdatesSection";

const GROUP: ArtistUpdateGroup = {
  artistName: "Turnover",
  updates: [
    {
      artistId: "art-1",
      artistName: "Turnover",
      artistImageUrl: "https://example.com/turnover.jpg",
      kind: "fact",
      headline: "Turnover tracked the record with their live engineer.",
      body: "They brought him into the studio to capture the room.",
      nuggetId: "n-1",
      source: { type: "article", title: "t", publisher: "BrooklynVegan", url: "https://bv.com/x" },
    },
    {
      artistId: "art-1",
      artistName: "Turnover",
      artistImageUrl: "https://example.com/cover.jpg",
      kind: "track",
      headline: "Humming",
      body: "",
      relatedTrackTitle: "Humming",
      relatedAlbumName: "Peripheral Vision",
      relatedTrackUri: "spotify:track:abc123",
    },
  ],
};

function renderSection() {
  return render(
    <MemoryRouter>
      <ArtistUpdatesSection
        groups={[GROUP]}
        profile={{ streamingService: "Spotify" } as never}
        artistIds={{ Turnover: "art-1" }}
        totalCount={1}
        readyCount={1}
      />
    </MemoryRouter>,
  );
}

const dialog = () => screen.queryByRole("dialog");

beforeEach(() => navigateMock.mockReset());

describe("Browse expanded card — leaving it", () => {
  it("opens when a card is tapped", () => {
    renderSection();
    expect(dialog()).toBeNull();

    fireEvent.click(screen.getByText(GROUP.updates![0].headline));

    expect(dialog()).not.toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // Pete: "when I click to go to an artist page from a card in the browse
  // page, it takes me to the artist page but the card stays open so I
  // don't see that I'm in the artist page."
  //
  // The dominant cause was the 500ms page exit under AnimatePresence
  // mode="wait", which held Browse on screen after the URL changed. But
  // the modal must also actually close — if it only navigated, the card
  // would sit over the new page for as long as the transition ran.
  it("closes the card when navigating to the artist", () => {
    renderSection();
    fireEvent.click(screen.getByText(GROUP.updates![0].headline));

    fireEvent.click(within(dialog()!).getByRole("button", { name: /^turnover$/i }));

    expect(dialog()).toBeNull();
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock.mock.calls[0][0]).toContain("/artist/");
  });

  it("closes the card when starting playback", () => {
    renderSection();
    fireEvent.click(screen.getByText(GROUP.updates![0].headline));

    fireEvent.click(within(dialog()!).getByRole("button", { name: /play humming by turnover/i }));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock.mock.calls[0][0]).toContain("/listen/");
  });

  it("closes without navigating when dismissed", () => {
    renderSection();
    fireEvent.click(screen.getByText(GROUP.updates![0].headline));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(dialog()).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
