import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock supabase client before importing the hook so the mocked function
// is in place when useAppleMusicToken's module-level imports resolve.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { useAppleMusicToken, saveAppleMusicToken, fetchAppleDeveloperToken } from "@/hooks/useAppleMusicToken";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "apple_music_token";

describe("saveAppleMusicToken", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists both tokens to localStorage", () => {
    saveAppleMusicToken("user-token", "dev-token");
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const stored = JSON.parse(raw!);
    expect(stored.musicUserToken).toBe("user-token");
    expect(stored.developerToken).toBe("dev-token");
    expect(stored.devTokenExpiresAt).toBeGreaterThan(Date.now());
  });

  it("sets expiry ~30 days in the future", () => {
    const before = Date.now();
    saveAppleMusicToken("u", "d");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(stored.devTokenExpiresAt).toBeGreaterThanOrEqual(before + thirtyDays - 1000);
    expect(stored.devTokenExpiresAt).toBeLessThanOrEqual(before + thirtyDays + 1000);
  });
});

describe("useAppleMusicToken", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("reports no token when localStorage is empty", () => {
    const { result } = renderHook(() => useAppleMusicToken());
    expect(result.current.hasMusicToken).toBe(false);
    expect(result.current.getMusicUserToken()).toBeNull();
  });

  it("reports token when present in localStorage", () => {
    saveAppleMusicToken("user-token-abc", "dev-token-xyz");
    const { result } = renderHook(() => useAppleMusicToken());
    expect(result.current.hasMusicToken).toBe(true);
    expect(result.current.getMusicUserToken()).toBe("user-token-abc");
  });

  it("clearToken removes the stored token and updates state", () => {
    saveAppleMusicToken("u", "d");
    const { result } = renderHook(() => useAppleMusicToken());
    expect(result.current.hasMusicToken).toBe(true);

    act(() => {
      result.current.clearToken();
    });

    expect(result.current.hasMusicToken).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("getDeveloperToken returns cached token when still fresh", async () => {
    saveAppleMusicToken("u", "cached-dev-token");
    const { result } = renderHook(() => useAppleMusicToken());

    const token = await result.current.getDeveloperToken();
    expect(token).toBe("cached-dev-token");
    // Should NOT have called the edge function
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("getDeveloperToken refetches when token is expired", async () => {
    // Write a stale token directly (expiresAt in the past)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      musicUserToken: "u",
      developerToken: "stale-dev-token",
      devTokenExpiresAt: Date.now() - 1000,
    }));

    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { token: "fresh-dev-token" },
      error: null,
    });

    const { result } = renderHook(() => useAppleMusicToken());
    const token = await result.current.getDeveloperToken();

    expect(supabase.functions.invoke).toHaveBeenCalledWith("apple-dev-token");
    expect(token).toBe("fresh-dev-token");

    // The stored token should have been updated
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.developerToken).toBe("fresh-dev-token");
    expect(stored.musicUserToken).toBe("u"); // MUT preserved
  });
});

describe("fetchAppleDeveloperToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns token on success", async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { token: "jwt-token" },
      error: null,
    });

    const token = await fetchAppleDeveloperToken();
    expect(token).toBe("jwt-token");
  });

  it("returns null on edge function error", async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: "server error" },
    });

    const token = await fetchAppleDeveloperToken();
    expect(token).toBeNull();
  });

  it("returns null on network exception", async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));

    const token = await fetchAppleDeveloperToken();
    expect(token).toBeNull();
  });
});
