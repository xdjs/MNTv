import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock supabase BEFORE importing AlbumDetail so the component picks up
// the mocked client. AlbumDetail does not use useUserProfile or
// useArtistImage, so the mock surface is even smaller than ArtistProfile.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

import AlbumDetail from "@/pages/AlbumDetail";
import { supabase } from "@/integrations/supabase/client";

const invoke = vi.mocked(supabase.functions.invoke);

function fakeAlbumResponse(id: string, name: string, artistId: string, artistName: string) {
  return {
    data: {
      found: true,
      album: {
        id,
        name,
        imageUrl: "",
        releaseDate: "1997-05-21",
        albumType: "album",
        totalTracks: 12,
        artist: { id: artistId, name: artistName },
        label: "",
      },
      tracks: [],
    },
    error: null,
  } as any;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/album/:albumId" element={<AlbumDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("MusicKit", { getInstance: () => ({ storefrontCountryCode: "us" }) });
  invoke.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Locks the apple::/spotify:: prefix routing to their respective
// `service` param in the spotify-album edge-function call. The
// service param is what the backend branches on — getting it wrong
// silently fetches from the wrong catalog.

describe("AlbumDetail catalog routing", () => {
  it("apple:: prefix invokes spotify-album with service='apple' + storefront", async () => {
    invoke.mockResolvedValueOnce(fakeAlbumResponse("987654321", "OK Computer", "123456789", "Radiohead"));

    renderAt("/album/apple::987654321::Radiohead::123456789");

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("spotify-album", {
      body: {
        albumId: "987654321",
        service: "apple",
        storefront: "us",
      },
    });
  });

  it("spotify:: prefix invokes spotify-album with service='spotify' (no storefront)", async () => {
    invoke.mockResolvedValueOnce(
      fakeAlbumResponse("6dVIqQ8qmQ5GBnJ9shOYGE", "OK Computer", "4Z8W4fKeB5YxbusRsdQVPb", "Radiohead"),
    );

    renderAt("/album/spotify::6dVIqQ8qmQ5GBnJ9shOYGE::Radiohead::4Z8W4fKeB5YxbusRsdQVPb");

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("spotify-album", {
      body: {
        albumId: "6dVIqQ8qmQ5GBnJ9shOYGE",
        service: "spotify",
      },
    });
  });

  it("bare apple:: with empty album id short-circuits before the edge call", async () => {
    renderAt("/album/apple::");

    // Drain pending microtasks/effects deterministically instead of a
    // timer-based wait, which can race on slow CI runners.
    await act(async () => {});
    expect(invoke).not.toHaveBeenCalled();
  });
});
