import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock());

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const playbackMocks = vi.hoisted(() => ({ invoke: vi.fn(), service: "Spotify" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: playbackMocks.invoke } } }));
vi.mock("@/hooks/useMusicNerdState", () => ({
  useUserProfile: () => ({ profile: { streamingService: playbackMocks.service } }),
}));

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
  playbackMocks.invoke.mockReset();
  playbackMocks.service = "Spotify";
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

const RELEASE: ArtistUpdate = {
  ...FACT, artistName: "Loathe", kind: "new-release", headline: "Loathe released A Stranger To You",
  relatedTrackTitle: "A Stranger To You", relatedAlbumName: "A Stranger To You",
  relatedTrackUri: "spotify:album:album123", nuggetId: "release-album123",
};
const resolvedAlbum = { data: { tracks: [{ title: "Opening Song", uri: "spotify:track:first", album: "A Stranger To You" }] }, error: null };

describe("artist-page release playback", () => {
  it("plays a resolved song directly from the collapsed card", async () => {
    renderAt("", [{ ...RELEASE, relatedTrackTitle: "Opening Song", relatedTrackUri: "spotify:track:first" }]);
    fireEvent.click(screen.getByRole("button", { name: "Play Opening Song by Loathe" }));
    expect(navigateMock).toHaveBeenCalledWith("/listen/real::Loathe::Opening%20Song::A%20Stranger%20To%20You::spotify%3Atrack%3Afirst");
    expect(dialog()).toBeNull();
    expect(playbackMocks.invoke).not.toHaveBeenCalled();
  });

  it("plays the album's first song from the expanded release and closes it", async () => {
    playbackMocks.invoke.mockResolvedValue(resolvedAlbum);
    renderAt("", [RELEASE]);
    fireEvent.click(screen.getByText(RELEASE.headline));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Play A Stranger To You by Loathe" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/listen/real::Loathe::Opening%20Song::A%20Stranger%20To%20You::spotify%3Atrack%3Afirst"));
    expect(playbackMocks.invoke).toHaveBeenCalledWith("spotify-album", { body: { albumId: "album123", service: "spotify" } });
    expect(dialog()).toBeNull();
  });

  it("keeps an unsuccessful release open with an error and lets the user retry", async () => {
    playbackMocks.invoke.mockResolvedValueOnce({ data: { tracks: [] }, error: null }).mockResolvedValueOnce({ data: { tracks: [] }, error: null }).mockResolvedValueOnce(resolvedAlbum);
    renderAt("", [RELEASE]);
    fireEvent.click(screen.getByText(RELEASE.headline));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Play A Stranger To You by Loathe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this release");
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Play A Stranger To You by Loathe" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledOnce());
    expect(dialog()).toBeNull();
  });

  it("starts the exact Apple release song after resolving its album ID", async () => {
    playbackMocks.service = "Apple Music";
    playbackMocks.invoke.mockResolvedValue({ data: { tracks: [{ title: "Opening Song", uri: "apple:song:456" }] }, error: null });
    renderAt("", [{ ...RELEASE, relatedTrackUri: "apple:album:123" }]);
    fireEvent.click(screen.getByRole("button", { name: "Play A Stranger To You by Loathe" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/listen/real::Loathe::Opening%20Song::A%20Stranger%20To%20You::apple%3Asong%3A456"));
    expect(playbackMocks.invoke).toHaveBeenCalledWith("spotify-album", { body: { albumId: "123", service: "apple", storefront: "us" } });
  });

  it("resolves the Spotify album song by name for Apple Music listeners", async () => {
    playbackMocks.service = "Apple Music";
    playbackMocks.invoke.mockResolvedValue(resolvedAlbum);
    renderAt("", [RELEASE]);
    fireEvent.click(screen.getByRole("button", { name: "Play A Stranger To You by Loathe" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/listen/real::Loathe::Opening%20Song::A%20Stranger%20To%20You::"));
  });
});

it("uses search only for a song from the advertised release when album details fail", async () => {
  playbackMocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("Forbidden") }).mockResolvedValueOnce({
    data: { tracks: [
      { title: "Wrong album", artist: "Loathe", album: "Older Album", uri: "spotify:track:wrong" },
      { title: "Wrong artist", artist: "Someone Else", album: "A Stranger To You", uri: "spotify:track:wrong2" },
      { title: "Release Song", artist: "Loathe", album: "A Stranger To You", uri: "spotify:track:right" },
    ] }, error: null,
  });
  renderAt("", [RELEASE]);
  fireEvent.click(screen.getByRole("button", { name: "Play A Stranger To You by Loathe" }));
  await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/listen/real::Loathe::Release%20Song::A%20Stranger%20To%20You::spotify%3Atrack%3Aright"));
});
