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

beforeEach(() => {
  getSessionMock.mockReset();
  completeSpotifyConnectMock.mockReset();
  useAuthMock.mockReset();
  useUserProfileMock.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
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
  getSessionMock.mockResolvedValue({ data: { session: session ?? null }, error: null });
  completeSpotifyConnectMock.mockResolvedValue(patch ?? null);
}

describe("useSpotifyPostSigninSync", () => {
  it("does nothing when there is no user", () => {
    const onSynced = vi.fn();
    setup({ user: null, profile: null });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("does nothing for anonymous sessions (no provider)", () => {
    const onSynced = vi.fn();
    setup({ user: { id: "anon", app_metadata: {} }, profile: null });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("does nothing for non-Spotify providers (e.g. apple)", () => {
    const onSynced = vi.fn();
    setup({
      user: { id: "u1", app_metadata: { provider: "apple" } },
      profile: null,
    });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("skips fetch when profile already has Spotify taste", () => {
    const onSynced = vi.fn();
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "Spotify", topArtists: ["a"] },
    });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("fetches taste and delivers it to onSynced (happy path)", async () => {
    const onSynced = vi.fn();
    const patch = {
      streamingService: "Spotify",
      spotifyDisplayName: "Jane",
      topArtists: ["Beach House"],
      topTracks: ["Space Song"],
      artistImages: {},
      artistIds: {},
      trackImages: [],
    };
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
      session: { provider_token: "tok-abc" },
      patch,
    });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    await waitFor(() => expect(onSynced).toHaveBeenCalledTimes(1));
    expect(onSynced).toHaveBeenCalledWith(patch);
    expect(completeSpotifyConnectMock).toHaveBeenCalledWith("tok-abc");
  });

  it("does not retry once synced for a given user id", async () => {
    const onSynced = vi.fn();
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
    const { rerender } = renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    await waitFor(() => expect(completeSpotifyConnectMock).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(completeSpotifyConnectMock).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onSynced when session has no provider_token", async () => {
    const onSynced = vi.fn();
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
      session: { provider_token: undefined },
    });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    await new Promise((r) => setTimeout(r, 0));
    expect(completeSpotifyConnectMock).not.toHaveBeenCalled();
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("handles getSession errors without invoking onSynced", async () => {
    const onSynced = vi.fn();
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
    });
    getSessionMock.mockResolvedValue({ data: { session: null }, error: { message: "network" } });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("does not invoke onSynced when completeSpotifyConnect returns null", async () => {
    const onSynced = vi.fn();
    setup({
      user: { id: "u1", app_metadata: { provider: "spotify" } },
      profile: { streamingService: "", topArtists: [] },
      session: { provider_token: "tok-abc" },
      patch: null,
    });
    renderHook(() => useSpotifyPostSigninSync({ onSynced }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSynced).not.toHaveBeenCalled();
  });
});
