import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock supabase BEFORE importing ArtistProfile so the component picks up
// the mocked client. Also mock useUserProfile + useArtistImage to keep
// the test surface narrow — routing + edge-function invocation only.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/hooks/useMusicNerdState", () => ({
  useUserProfile: () => ({ profile: null, saveProfile: vi.fn(), clearProfile: vi.fn() }),
}));
vi.mock("@/hooks/useArtistLatestFacts", () => ({
  useArtistLatestFacts: () => ({ updates: [], loading: false }),
}));
vi.mock("@/hooks/useArtistImage", () => ({
  useArtistImage: () => null,
}));

import ArtistProfile from "@/pages/ArtistProfile";
import { supabase } from "@/integrations/supabase/client";

const invoke = vi.mocked(supabase.functions.invoke);

function fakeArtistResponse(id: string, name: string) {
  return {
    data: {
      found: true,
      tracksSource: undefined as string | undefined,
      artist: { id, name, imageUrl: "", genres: [], followers: 0 },
      topTracks: [],
      albums: [],
      relatedArtists: [],
    },
    error: null,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/artist/:artistId" element={<ArtistProfile />} />
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
// `service` param in the spotify-artist edge-function call.
// Without this test, a regression that drops the service param (or
// flips the two) would silently send Apple users to the Spotify
// catalog — manifesting as wrong artist data or a 404, not a build
// error.

describe("ArtistProfile catalog routing", () => {
  it("apple:: prefix invokes spotify-artist with service='apple' + storefront", async () => {
    invoke.mockResolvedValueOnce(fakeArtistResponse("123456789", "Radiohead"));

    renderAt("/artist/apple::123456789::Radiohead");

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("spotify-artist", {
      body: {
        service: "apple",
        artistId: "123456789",
        artistName: "Radiohead",
        storefront: "us",
      },
    });
  });

  it("spotify:: prefix invokes spotify-artist with service='spotify' (no storefront)", async () => {
    invoke.mockResolvedValueOnce(fakeArtistResponse("4Z8W4fKeB5YxbusRsdQVPb", "Radiohead"));

    renderAt("/artist/spotify::4Z8W4fKeB5YxbusRsdQVPb::Radiohead");

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("spotify-artist", {
      body: {
        service: "spotify",
        artistId: "4Z8W4fKeB5YxbusRsdQVPb",
        artistName: "Radiohead",
      },
    });
  });

  it("bare apple:: with empty id short-circuits before the edge call", async () => {
    // parseAppleArtist returns null for an empty id bucket, so neither
    // the apple nor spotify branch renders RealArtistProfile — the
    // edge function must not fire at all.
    renderAt("/artist/apple::");

    // Drain pending microtasks/effects deterministically instead of a
    // timer-based wait, which can race on slow CI runners.
    await act(async () => {});
    expect(invoke).not.toHaveBeenCalled();
  });
});

it("distinguishes service failure from an artist missing from the catalog", async () => {
  invoke.mockResolvedValueOnce({ data: null, error: new Error("Service unavailable") } as Awaited<ReturnType<typeof supabase.functions.invoke>>);
  renderAt("/artist/real::Tame%20Impala");
  expect(await screen.findByText("Spotify artist data is temporarily unavailable. Please try again.")).toBeInTheDocument();
  expect(screen.queryByText("Couldn't find this artist on Spotify.")).not.toBeInTheDocument();
});
it("preserves the genuine not-found message", async () => {
  invoke.mockResolvedValueOnce({ data: { found: false }, error: null } as Awaited<ReturnType<typeof supabase.functions.invoke>>);
  renderAt("/artist/real::Unknown");
  expect(await screen.findByText("Couldn't find this artist on Spotify.")).toBeInTheDocument();
});
it("renders fallback songs without describing them as Spotify's popular ranking", async () => {
  const response = fakeArtistResponse("artist", "Dame Atlas");
  response.data.tracksSource = "search";
  response.data.topTracks = [{ title: "Test Song", artist: "Dame Atlas", album: "Album", uri: "spotify:track:test", imageUrl: "", durationMs: 200000 }];
  invoke.mockResolvedValueOnce(response);
  renderAt("/artist/real::Dame%20Atlas");
  expect(await screen.findByText("Test Song")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Songs" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Popular" })).not.toBeInTheDocument();
});
