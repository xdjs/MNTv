import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeMock, refreshLegacyMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  refreshLegacyMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

vi.mock("@/hooks/useSpotifyAuth", () => ({
  refreshSpotifyToken: refreshLegacyMock,
}));

import { useSpotifyToken } from "@/hooks/useSpotifyToken";

const STORAGE_KEY = "spotify_playback_token";

function seedExpiredToken() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: "expired-access",
      refreshToken: "stored-refresh",
      expiresAt: Date.now() - 60_000,
    }),
  );
}

describe("useSpotifyToken.getValidToken — refresh fallback chain", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    refreshLegacyMock.mockReset();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("returns the cached accessToken when it's still valid (no refresh call)", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: "fresh-access",
        refreshToken: "stored-refresh",
        expiresAt: Date.now() + 5 * 60_000,
      }),
    );

    const { result } = renderHook(() => useSpotifyToken());
    await act(async () => {
      const token = await result.current.getValidToken();
      expect(token).toBe("fresh-access");
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(refreshLegacyMock).not.toHaveBeenCalled();
  });

  it("prefers the server-side edge function when the stored token is stale", async () => {
    seedExpiredToken();
    invokeMock.mockResolvedValue({
      data: { accessToken: "edge-new", refreshToken: "edge-new-refresh", expiresIn: 3600 },
      error: null,
    });

    const { result } = renderHook(() => useSpotifyToken());
    await act(async () => {
      const token = await result.current.getValidToken();
      expect(token).toBe("edge-new");
    });
    expect(invokeMock).toHaveBeenCalledWith("spotify-refresh", {
      body: { refreshToken: "stored-refresh" },
    });
    // Legacy path is a fallback — never called when edge path succeeds.
    expect(refreshLegacyMock).not.toHaveBeenCalled();
  });

  it("falls back to the legacy client-side path when the edge function errors", async () => {
    seedExpiredToken();
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });
    refreshLegacyMock.mockResolvedValue({
      accessToken: "legacy-new",
      refreshToken: "legacy-new-refresh",
      expiresIn: 3600,
    });

    const { result } = renderHook(() => useSpotifyToken());
    await act(async () => {
      const token = await result.current.getValidToken();
      expect(token).toBe("legacy-new");
    });
    expect(invokeMock).toHaveBeenCalled();
    expect(refreshLegacyMock).toHaveBeenCalledWith("stored-refresh");
  });

  it("clears the stored token and dispatches a reconnect event when both paths fail", async () => {
    seedExpiredToken();
    invokeMock.mockResolvedValue({ data: null, error: { message: "fail" } });
    refreshLegacyMock.mockResolvedValue(null);

    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener("spotify-reconnect-required", listener);

    const { result } = renderHook(() => useSpotifyToken());
    await act(async () => {
      const token = await result.current.getValidToken();
      expect(token).toBeNull();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toContain("spotify-reconnect-required");

    window.removeEventListener("spotify-reconnect-required", listener);
  });
});
