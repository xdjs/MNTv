import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock dependencies before the hook module is imported so the mocks
// are in place when useUserProfile's top-level imports resolve.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, isGuest: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import { useUserProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";

const PROFILE_KEY = "musicnerd_profile";

// Regression: the Apple Music fast path broke because every useUserProfile()
// call created its own independent useState slot. Connect.tsx saved a profile,
// but PlayerProvider's useUserProfile never saw the change — its state stayed
// null, the engine init effect never fired, and Apple Music playback died.
// These tests lock the cross-instance sync via the custom-event pattern.

describe("useUserProfile cross-instance sync", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("syncs profile across two hook instances when one calls saveProfile", async () => {
    const { result: a } = renderHook(() => useUserProfile());
    const { result: b } = renderHook(() => useUserProfile());

    expect(a.current.profile).toBeNull();
    expect(b.current.profile).toBeNull();

    const newProfile: UserProfile = {
      streamingService: "Apple Music",
      calculatedTier: "nerd",
    };

    await act(async () => {
      await a.current.saveProfile(newProfile);
    });

    // Both instances should now report the new profile
    expect(a.current.profile?.streamingService).toBe("Apple Music");
    expect(b.current.profile?.streamingService).toBe("Apple Music");
    expect(a.current.profile?.calculatedTier).toBe("nerd");
    expect(b.current.profile?.calculatedTier).toBe("nerd");
  });

  it("syncs clearProfile across two hook instances", async () => {
    // Seed both instances with a profile
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      streamingService: "Spotify",
      calculatedTier: "casual",
    }));

    const { result: a } = renderHook(() => useUserProfile());
    const { result: b } = renderHook(() => useUserProfile());

    expect(a.current.profile?.streamingService).toBe("Spotify");
    expect(b.current.profile?.streamingService).toBe("Spotify");

    await act(async () => {
      a.current.clearProfile();
    });

    expect(a.current.profile).toBeNull();
    expect(b.current.profile).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("changing streamingService propagates to a second instance", async () => {
    // Starts as Spotify
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      streamingService: "Spotify",
      calculatedTier: "casual",
    }));

    const { result: a } = renderHook(() => useUserProfile());
    const { result: b } = renderHook(() => useUserProfile());

    // Second instance also sees the initial value
    expect(b.current.profile?.streamingService).toBe("Spotify");

    // First instance switches the user to Apple Music
    await act(async () => {
      await a.current.saveProfile({
        streamingService: "Apple Music",
        calculatedTier: "casual",
      });
    });

    // The change must propagate — this is the exact scenario that broke
    // Apple Music playback: PlayerProvider needs to see the new service
    // to create the correct engine.
    expect(b.current.profile?.streamingService).toBe("Apple Music");
  });
});
