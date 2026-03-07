import { useState, useCallback, useEffect } from "react";
import type { UserProfile } from "@/mock/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PROFILE_KEY = "musicnerd_profile";

// ── DB profile sync ───────────────────────────────────────────────────────────
// Accept userId as a param — callers obtain it from AuthContext (no extra getSession() calls).

async function loadProfileFromDB(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  // Parse spotify_taste JSONB column into typed arrays.
  const taste = data.spotify_taste as {
    topArtists?: string[];
    topTracks?: string[];
    artistImages?: Record<string, string>;
    artistIds?: Record<string, string>;
    trackImages?: { title: string; artist: string; imageUrl: string }[];
  } | null;

  return {
    streamingService: (data.streaming_service as UserProfile["streamingService"]) || "",
    lastFmUsername: data.last_fm_username || undefined,
    spotifyTopArtists: taste?.topArtists ?? undefined,
    spotifyTopTracks: taste?.topTracks ?? undefined,
    spotifyArtistImages: taste?.artistImages ?? undefined,
    spotifyArtistIds: taste?.artistIds ?? undefined,
    spotifyTrackImages: taste?.trackImages ?? undefined,
    calculatedTier: (data.tier as UserProfile["calculatedTier"]) || "casual",
  };
}

async function saveProfileToDB(p: UserProfile, userId: string): Promise<void> {
  // Persist all profile fields including Spotify taste arrays and images.
  const spotify_taste =
    p.spotifyTopArtists || p.spotifyTopTracks
      ? {
          topArtists: p.spotifyTopArtists ?? [],
          topTracks: p.spotifyTopTracks ?? [],
          artistImages: p.spotifyArtistImages ?? {},
          artistIds: p.spotifyArtistIds ?? {},
          trackImages: p.spotifyTrackImages ?? [],
        }
      : null;

  await supabase.from("profiles").upsert(
    {
      user_id: userId,
      tier: p.calculatedTier,
      streaming_service: p.streamingService,
      last_fm_username: p.lastFmUsername || null,
      spotify_taste,
    },
    { onConflict: "user_id" }
  );
}

// ── Profile hook ──────────────────────────────────────────────────────────────

export function useUserProfile() {
  const { user } = useAuth();

  const [profile, setProfileState] = useState<UserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Re-load from DB whenever the signed-in user changes.
  // Local (localStorage) data is treated as fresher than DB — it may contain a profile
  // that was just saved but whose async DB write hasn't landed yet.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    loadProfileFromDB(user.id).then((dbProfile) => {
      if (cancelled || !dbProfile) return;
      const local = (() => {
        try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
      })() as UserProfile | null;

      // If local already has Spotify taste data, it's fresher — don't overwrite it with stale DB
      if (local?.spotifyTopArtists?.length && local.spotifyArtistImages
          && Object.keys(local.spotifyArtistImages).length > 0) {
        // Only pull non-Spotify fields from DB (tier, lastFm) if local is missing them
        const merged: UserProfile = {
          ...local,
          calculatedTier: local.calculatedTier || dbProfile.calculatedTier,
          lastFmUsername: local.lastFmUsername || dbProfile.lastFmUsername,
          streamingService: "Spotify",
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
        setProfileState(merged);
        return;
      }

      // No local Spotify data — use DB profile (e.g. new device sign-in)
      const merged: UserProfile = {
        ...dbProfile,
        streamingService: (dbProfile.spotifyTopArtists?.length ?? 0) > 0 ? "Spotify" : dbProfile.streamingService,
        spotifyArtistImages: dbProfile.spotifyArtistImages ?? local?.spotifyArtistImages,
        spotifyArtistIds: dbProfile.spotifyArtistIds ?? local?.spotifyArtistIds,
        spotifyTrackImages: dbProfile.spotifyTrackImages ?? local?.spotifyTrackImages,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      setProfileState(merged);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const saveProfile = useCallback(async (p: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setProfileState(p);
    if (user?.id) await saveProfileToDB(p, user.id);
  }, [user?.id]);

  const clearProfile = useCallback(() => {
    localStorage.removeItem(PROFILE_KEY);
    setProfileState(null);
  }, []);

  return { profile, saveProfile, clearProfile };
}

export function getStoredProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

export function tierLabel(tier: UserProfile["calculatedTier"]): string {
  return tier === "nerd" ? "Nerd" : tier === "curious" ? "Curious Fan" : "Casual Listener";
}

export function tierGreeting(tier: UserProfile["calculatedTier"] | undefined, userName?: string): string {
  const firstName = userName?.trim().split(/\s+/)[0];
  if (firstName) return `Good evening, ${firstName}`;
  return "Good evening";
}

export function tierBadgeLabel(tier: UserProfile["calculatedTier"]): string {
  return tier === "nerd" ? "Nerd Mode" : tier === "curious" ? "Curious" : "Casual";
}

export function tierGlowClass(tier: UserProfile["calculatedTier"] | undefined): string {
  if (tier === "nerd") return "shadow-[inset_0_0_50px_rgba(236,72,153,0.15)]";
  if (tier === "curious") return "shadow-[inset_0_0_50px_rgba(59,130,246,0.15)]";
  return "shadow-[inset_0_0_50px_rgba(34,197,94,0.15)]";
}

export function tierBadgeColor(tier: UserProfile["calculatedTier"] | undefined): string {
  if (tier === "nerd") return "bg-pink-500/20 text-pink-400";
  if (tier === "curious") return "bg-blue-500/20 text-blue-400";
  return "bg-green-500/20 text-green-400";
}
