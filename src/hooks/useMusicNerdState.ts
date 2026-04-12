import { useState, useCallback, useEffect } from "react";
import type { UserProfile } from "@/mock/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PROFILE_KEY = "musicnerd_profile";
const PROFILE_UPDATED_EVENT = "musicnerd-profile-updated";

/** Dispatch a custom event so other useUserProfile hook instances re-read
 *  localStorage. Each useState call creates its own state slot — without
 *  this sync, PlayerProvider's profile goes stale when Connect.tsx saves,
 *  and the Apple Music engine never initializes.
 *  Vite SPA — no SSR guard needed. */
function notifyProfileUpdated(): void {
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

// ── DB profile sync ───────────────────────────────────────────────────────────
// Accept userId as a param — callers obtain it from AuthContext (no extra getSession() calls).

interface TasteData {
  topArtists?: string[];
  topTracks?: string[];
  artistImages?: Record<string, string>;
  artistIds?: Record<string, string>;
  trackImages?: { title: string; artist: string; imageUrl: string }[];
}

async function loadProfileFromDB(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const service = (data.streaming_service as UserProfile["streamingService"]) || "";
  const serviceKey = service === "Spotify" ? "spotify" : service === "Apple Music" ? "apple" : null;

  // Read taste from music_taste (new, keyed by service) → fall back to spotify_taste (legacy)
  const musicTaste = data.music_taste as Record<string, TasteData> | null;
  const taste: TasteData | null =
    (serviceKey && musicTaste?.[serviceKey]) ||
    (data.spotify_taste as TasteData | null);

  return {
    streamingService: service,
    lastFmUsername: data.last_fm_username || undefined,
    spotifyTopArtists: taste?.topArtists ?? undefined,
    spotifyTopTracks: taste?.topTracks ?? undefined,
    spotifyArtistImages: taste?.artistImages ?? undefined,
    spotifyArtistIds: taste?.artistIds ?? undefined,
    spotifyTrackImages: taste?.trackImages ?? undefined,
    calculatedTier: (data.tier as UserProfile["calculatedTier"]) || "casual",
  };
}

/**
 * Resolve which streamingService to use when merging a local and DB profile.
 *
 * Priority:
 *  1. Preserve an explicit streamingService on whichever source is the base
 *  2. Fall back to "Spotify" only if spotifyTopArtists is populated (legacy
 *     profile rows from before streaming_service was persisted)
 *  3. Otherwise empty string (guest-like state)
 *
 * Exported for unit testing. Used by useUserProfile's hydrate effect.
 */
export function resolveStreamingService(
  baseService: UserProfile["streamingService"] | undefined,
  spotifyTopArtistsCount: number
): UserProfile["streamingService"] {
  if (baseService) return baseService;
  if (spotifyTopArtistsCount > 0) return "Spotify";
  return "";
}

async function saveProfileToDB(p: UserProfile, userId: string): Promise<void> {
  // Build taste data from profile fields
  const tasteData: TasteData | null =
    p.spotifyTopArtists || p.spotifyTopTracks
      ? {
          topArtists: p.spotifyTopArtists ?? [],
          topTracks: p.spotifyTopTracks ?? [],
          artistImages: p.spotifyArtistImages ?? {},
          artistIds: p.spotifyArtistIds ?? {},
          trackImages: p.spotifyTrackImages ?? [],
        }
      : null;

  // Determine service key for music_taste JSONB
  const serviceKey = p.streamingService === "Spotify" ? "spotify"
    : p.streamingService === "Apple Music" ? "apple" : null;

  // Dual-write: spotify_taste (legacy) + music_taste (new, keyed by service)
  await supabase.from("profiles").upsert(
    {
      user_id: userId,
      tier: p.calculatedTier,
      streaming_service: p.streamingService,
      last_fm_username: p.lastFmUsername || null,
      spotify_taste: tasteData,
      music_taste: serviceKey && tasteData ? { [serviceKey]: tasteData } : null,
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

  // Sync across hook instances: every call to useUserProfile has its own
  // independent useState slot, so when Connect.tsx saves a profile, other
  // instances (like PlayerProvider) never see it. Listen for the custom
  // event fired by saveProfile/clearProfile and re-read from localStorage.
  // Also listens to the native `storage` event for cross-tab sync.
  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(PROFILE_KEY);
        const next = raw ? (JSON.parse(raw) as UserProfile) : null;
        setProfileState(next);
      } catch {
        setProfileState(null);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROFILE_KEY) sync();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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

      // If local already has Spotify taste data, it's fresher — don't overwrite it with stale DB.
      // Preserve local's streamingService if set (handles Apple Music users who previously
      // had Spotify data in the same profile row).
      if (local?.spotifyTopArtists?.length && local.spotifyArtistImages
          && Object.keys(local.spotifyArtistImages).length > 0) {
        // Only pull non-Spotify fields from DB (tier, lastFm) if local is missing them
        const merged: UserProfile = {
          ...local,
          calculatedTier: local.calculatedTier || dbProfile.calculatedTier,
          lastFmUsername: local.lastFmUsername || dbProfile.lastFmUsername,
          streamingService: resolveStreamingService(
            local.streamingService,
            local.spotifyTopArtists?.length ?? 0
          ),
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
        setProfileState(merged);
        notifyProfileUpdated();
        return;
      }

      // No local Spotify data — use DB profile (e.g. new device sign-in).
      const merged: UserProfile = {
        ...dbProfile,
        streamingService: resolveStreamingService(
          dbProfile.streamingService,
          dbProfile.spotifyTopArtists?.length ?? 0
        ),
        spotifyArtistImages: dbProfile.spotifyArtistImages ?? local?.spotifyArtistImages,
        spotifyArtistIds: dbProfile.spotifyArtistIds ?? local?.spotifyArtistIds,
        spotifyTrackImages: dbProfile.spotifyTrackImages ?? local?.spotifyTrackImages,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      setProfileState(merged);
      notifyProfileUpdated();
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const saveProfile = useCallback(async (p: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setProfileState(p);
    notifyProfileUpdated();
    if (user?.id) await saveProfileToDB(p, user.id);
  }, [user?.id]);

  const clearProfile = useCallback(() => {
    localStorage.removeItem(PROFILE_KEY);
    setProfileState(null);
    notifyProfileUpdated();
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
