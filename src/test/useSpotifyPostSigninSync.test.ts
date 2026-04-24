import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// vi.mock is hoisted above the file, so factories can't close over regular
// top-level consts. Use vi.hoisted to declare mocks that get hoisted too.
const { getSessionMock, completeSpotifyConnectMock, useAuthMock, useUserProfileMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  completeSpotifyConnectMock: vi.fn(),
  useAuthMock: vi.fn(),
  useUserProfileMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));
vi.mock("@/lib/completeSpotifyConnect", () => ({
  completeSpotifyConnect: completeSpotifyConnectMock,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("@/hooks/useMusicNerdState", () => ({
  useUserProfile: () => useUserProfileMock(),
}));

import { useSpotifyPostSigninSync } from "@/hooks/useSpotifyPostSigninSync";

const PENDING_KEY = "spotify_pending_taste";

beforeEach(() => {
  sessionStorage.clear();
  getSessionMock.mockReset();
  completeSpotifyConnectMock.mockReset();
  useAuthMock.mockReset();
  useUserProfileMock.mockReset();
});
afterEach(() => {
  sessionStorage.clear();
});

function setup({
  user,
  profile,
  session,
  patch,
}: {
  user: unknown;
  profile: unknown;
  session?: unknown;
  patch?: unknown;
}) {
  useAuthMock.mockReturnValue({ user });
  useUserProfileMock.mockReturnValue({ profile });
  getSessionMock.mockResolvedValue({ data: { session: session ?? null } });
  completeSpotifyConnectMock.mockResolvedValue(patch ?? null);
}

describe("useSpotifyPostSigninSync", () => {
  it("does nothing when there is no user", () => {
    setup({ user: null, profile: null });
    renderHook(() => useSpotifyPostSigninSync());
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
  });

  it("does nothing for anonymous sessions (no provider)", () => {
    setup({
      user: { id: "anon", app_metadata: {} },
      profile: null,
    });
    renderHook(() => useSpotifyPostSigninSync());
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("does nothing for non-Spotify providers (e.g. apple)", () => {
    setup({
      user: { id: "u1", app_metadata: { provider: "apple" } },
      profile: null,
    });
    renderHook(() => useSpotifyPostSigninSync());
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
  });

  it("skips fetch when profile already has Spotify taste", () => {
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "Spotify", topArtists: ["a"] },
    });
    renderHook(() => useSpotifyPostSigninSync());
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
  });

  it("fetches taste and writes ephemeral patch to sessionStorage", async () => {
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
      session: { provider_token: "tok-abc" },
      patch: {
        streamingService: "Spotify",
        spotifyDisplayName: "Jane",
        topArtists: ["Beach House"],
        topTracks: ["Space Song"],
        artistImages: {},
        artistIds: {},
        trackImages: [],
      },
    });
    renderHook(() => useSpotifyPostSigninSync());
    await waitFor(() => {
      expect(sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
    });
    const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY)!);
    expect(stored.displayName).toBe("Jane");
    expect(stored.topArtists).toEqual(["Beach House"]);
    expect(completeSpotifyConnectMock).toHaveBeenCalledWith("tok-abc");
  });

  it("does not retry once synced for a given user id", async () => {
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
      session: { provider_token: "tok-abc" },
      patch: {
        streamingService: "Spotify",
        spotifyDisplayName: null,
        topArtists: [],
        topTracks: [],
        artistImages: {},
        artistIds: {},
        trackImages: [],
      },
    });
    const { rerender } = renderHook(() => useSpotifyPostSigninSync());
    await waitFor(() => {
      expect(completeSpotifyConnectMock).toHaveBeenCalledTimes(1);
    });
    rerender();
    rerender();
    expect(completeSpotifyConnectMock).toHaveBeenCalledTimes(1);
  });

  it("does not write to sessionStorage when session has no provider_token", async () => {
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
      session: { provider_token: undefined },
    });
    renderHook(() => useSpotifyPostSigninSync());
    // Let the async flow run
    await new Promise((r) => setTimeout(r, 0));
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });
});
