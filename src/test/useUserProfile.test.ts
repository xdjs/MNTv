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

import { useUserProfile, getStoredProfile } from "@/hooks/useMusicNerdState";
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

// Locks the localStorage read-compat that lets profiles written before the
// spotify* → unprefixed rename (tracked in #51 P3.11) keep working. Drop
// these tests when the compat shim is removed after soak.
describe("getStoredProfile legacy-key migration", () => {
  beforeEach(() => localStorage.clear());

  it("promotes all five legacy spotify* keys to their unprefixed counterparts", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      streamingService: "Apple Music",
      calculatedTier: "nerd",
      spotifyTopArtists: ["Radiohead"],
      spotifyTopTracks: ["Karma Police"],
      spotifyArtistImages: { Radiohead: "radiohead.jpg" },
      spotifyArtistIds: { Radiohead: "sp-1" },
      spotifyTrackImages: [{ title: "Karma Police", artist: "Radiohead", imageUrl: "kp.jpg" }],
    }));

    const profile = getStoredProfile();
    expect(profile?.topArtists).toEqual(["Radiohead"]);
    expect(profile?.topTracks).toEqual(["Karma Police"]);
    expect(profile?.artistImages).toEqual({ Radiohead: "radiohead.jpg" });
    expect(profile?.artistIds).toEqual({ Radiohead: "sp-1" });
    expect(profile?.trackImages).toEqual([{ title: "Karma Police", artist: "Radiohead", imageUrl: "kp.jpg" }]);
    // Legacy keys are dropped from the in-memory profile
    expect((profile as Record<string, unknown>)?.spotifyTopArtists).toBeUndefined();
  });

  it("prefers new keys when both legacy and new are present", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      streamingService: "Spotify",
      calculatedTier: "casual",
      topArtists: ["Björk"],
      spotifyTopArtists: ["Radiohead"],
    }));

    const profile = getStoredProfile();
    expect(profile?.topArtists).toEqual(["Björk"]);
  });

  it("promotes a partial legacy profile, leaving absent fields undefined", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      streamingService: "Apple Music",
      calculatedTier: "casual",
      spotifyTopArtists: ["Beach House"],
      // no topTracks, no image maps, no artist ids
    }));

    const profile = getStoredProfile();
    expect(profile?.topArtists).toEqual(["Beach House"]);
    expect(profile?.topTracks).toBeUndefined();
    expect(profile?.artistImages).toBeUndefined();
    expect(profile?.artistIds).toBeUndefined();
    expect(profile?.trackImages).toBeUndefined();
  });

  it("returns null for missing or malformed payload", () => {
    expect(getStoredProfile()).toBeNull();

    localStorage.setItem(PROFILE_KEY, "{not valid json");
    expect(getStoredProfile()).toBeNull();
  });
});
