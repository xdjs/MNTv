import { useState, useCallback, useEffect } from "react";
import type { UserProfile } from "@/mock/types";
import { supabase } from "@/integrations/supabase/client";

const PROFILE_KEY = "musicnerd_profile";
const LISTENS_KEY = "musicnerd_listens";

// ── DB profile sync ───────────────────────────────────────────────────────────

async function loadProfileFromDB(): Promise<UserProfile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    streamingService: (data.streaming_service as UserProfile["streamingService"]) || "",
    lastFmUsername: data.last_fm_username || undefined,
    spotifyTopArtists: (data.spotify_top_artists as string[]) || undefined,
    spotifyTopTracks: (data.spotify_top_tracks as string[]) || undefined,
    calculatedTier: (data.tier as UserProfile["calculatedTier"]) || "casual",
  };
}

async function saveProfileToDB(p: UserProfile): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  await supabase.from("profiles").upsert(
    {
      user_id: session.user.id,
      tier: p.calculatedTier,
      streaming_service: p.streamingService,
      last_fm_username: p.lastFmUsername || null,
      spotify_top_artists: p.spotifyTopArtists || [],
      spotify_top_tracks: p.spotifyTopTracks || [],
      youtube_top_artists: [],
    },
    { onConflict: "user_id" }
  );
}

// ── Profile hook ──────────────────────────────────────────────────────────────

export function useUserProfile() {
  const [profile, setProfileState] = useState<UserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // On mount, try to load from DB (overrides localStorage if signed in)
  useEffect(() => {
    loadProfileFromDB().then((dbProfile) => {
      if (dbProfile) {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(dbProfile));
        setProfileState(dbProfile);
      }
    });
  }, []);

  const saveProfile = useCallback(async (p: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setProfileState(p);
    await saveProfileToDB(p); // no-op if not signed in
  }, []);

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

// ── Per-track listen counts ───────────────────────────────────────────────────

function getListens(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LISTENS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useListenCount(trackId: string) {
  const [count, setCount] = useState<number>(() => {
    return getListens()[trackId] ?? 1;
  });

  const increment = useCallback(() => {
    const listens = getListens();
    const next = (listens[trackId] ?? 1) + 1;
    listens[trackId] = next;
    localStorage.setItem(LISTENS_KEY, JSON.stringify(listens));
    setCount(next);
    return next;
  }, [trackId]);

  return { count, increment };
}

export function getListenCount(trackId: string): number {
  return getListens()[trackId] ?? 1;
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

export function tierLabel(tier: UserProfile["calculatedTier"]): string {
  return tier === "nerd" ? "Nerd" : tier === "curious" ? "Curious Fan" : "Casual Listener";
}

export function tierGreeting(tier: UserProfile["calculatedTier"] | undefined): string {
  if (!tier) return "Good evening";
  if (tier === "nerd") return "Good evening, Nerd";
  if (tier === "curious") return "Good evening, Curious Fan";
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
