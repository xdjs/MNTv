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

/** Clear the stored profile from localStorage and notify all
 *  `useUserProfile` hook instances to flip their state to null. Top-level
 *  helper so `useSignOut` can wipe profile state without mounting the
 *  full `useUserProfile` hook (which carries a DB-sync useEffect and
 *  event listeners). Mirrors `clearSpotifyToken` / `clearAppleMusicToken`. */
export function clearStoredProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
  if (typeof window !== "undefined") notifyProfileUpdated();
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

/** Legacy localStorage payload shape. Pre-rename profiles used `spotify*`
 *  prefixed keys even after Apple Music support landed. `parseStoredProfile`
 *  promotes these to the unprefixed keys on read.
 *  @deprecated Drop after soak — tracked in #51 P3.11. */
interface LegacyProfileShape {
  spotifyTopArtists?: string[];
  spotifyTopTracks?: string[];
  spotifyArtistImages?: Record<string, string>;
  spotifyArtistIds?: Record<string, string>;
  spotifyTrackImages?: UserProfile["trackImages"];
}

function parseStoredProfile(raw: string | null): UserProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UserProfile & LegacyProfileShape;
    const {
      spotifyTopArtists,
      spotifyTopTracks,
      spotifyArtistImages,
      spotifyArtistIds,
      spotifyTrackImages,
      ...rest
    } = parsed;
    return {
      ...rest,
      topArtists: rest.topArtists ?? spotifyTopArtists,
      topTracks: rest.topTracks ?? spotifyTopTracks,
      artistImages: rest.artistImages ?? spotifyArtistImages,
      artistIds: rest.artistIds ?? spotifyArtistIds,
      trackImages: rest.trackImages ?? spotifyTrackImages,
    };
  } catch {
    return null;
  }
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

  const musicTaste = data.music_taste as Record<string, TasteData> | null;
  const taste: TasteData | null = serviceKey ? (musicTaste?.[serviceKey] ?? null) : null;

  return {
    streamingService: service,
    lastFmUsername: data.last_fm_username || undefined,
    topArtists: taste?.topArtists ?? undefined,
    topTracks: taste?.topTracks ?? undefined,
    artistImages: taste?.artistImages ?? undefined,
    artistIds: taste?.artistIds ?? undefined,
    trackImages: taste?.trackImages ?? undefined,
    calculatedTier: (data.tier as UserProfile["calculatedTier"]) || "casual",
  };
}

/**
 * Resolve which streamingService to use when merging a local and DB profile.
 *
 * Priority:
 *  1. Preserve an explicit streamingService on whichever source is the base
 *  2. Fall back to "Spotify" only if topArtists is populated (legacy
 *     profile rows from before streaming_service was persisted; all such
 *     rows predate Apple Music support and are Spotify by construction)
 *  3. Otherwise empty string (guest-like state)
 *
 * Exported for unit testing. Used by useUserProfile's hydrate effect.
 */
export function resolveStreamingService(
  baseService: UserProfile["streamingService"] | undefined,
  topArtistsCount: number
): UserProfile["streamingService"] {
  if (baseService) return baseService;
  if (topArtistsCount > 0) return "Spotify";
  return "";
}

async function saveProfileToDB(p: UserProfile, userId: string): Promise<void> {
  const tasteData: TasteData | null =
    p.topArtists || p.topTracks
      ? {
          topArtists: p.topArtists ?? [],
          topTracks: p.topTracks ?? [],
          artistImages: p.artistImages ?? {},
          artistIds: p.artistIds ?? {},
          trackImages: p.trackImages ?? [],
        }
      : null;

  const serviceKey = p.streamingService === "Spotify" ? "spotify"
    : p.streamingService === "Apple Music" ? "apple" : null;

  await supabase.from("profiles").upsert(
    {
      user_id: userId,
      tier: p.calculatedTier,
      streaming_service: p.streamingService,
      last_fm_username: p.lastFmUsername || null,
      music_taste: serviceKey && tasteData ? { [serviceKey]: tasteData } : null,
    },
    { onConflict: "user_id" }
  );
}

// ── Profile hook ──────────────────────────────────────────────────────────────

export function useUserProfile() {
  const { user } = useAuth();

  const [profile, setProfileState] = useState<UserProfile | null>(() =>
    parseStoredProfile(localStorage.getItem(PROFILE_KEY))
  );
  // True while we're still figuring out whether this device has a profile.
  // Synchronously false if localStorage already has one (common case —
  // returning user on a known device); true only for the cross-device
  // case where the DB might supply a profile the device doesn't have
  // cached yet. Route gates consume this to avoid flash-redirecting
  // users whose DB profile is still hydrating.
  const [loading, setLoading] = useState<boolean>(() => {
    return parseStoredProfile(localStorage.getItem(PROFILE_KEY)) === null;
  });

  // Sync across hook instances: every call to useUserProfile has its own
  // independent useState slot, so when Connect.tsx saves a profile, other
  // instances (like PlayerProvider) never see it. Listen for the custom
  // event fired by saveProfile/clearProfile and re-read from localStorage.
  // Also listens to the native `storage` event for cross-tab sync.
  useEffect(() => {
    const sync = () => setProfileState(parseStoredProfile(localStorage.getItem(PROFILE_KEY)));
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
    // No signed-in user → nothing to hydrate. If we still had `loading`
    // pending from init, resolve it now so route gates don't hang.
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadProfileFromDB(user.id).then((dbProfile) => {
      if (cancelled) return;
      // Done loading regardless of whether the DB had a profile or not.
      // Downstream readers see either a merged profile (via the event
      // below) or stay on the localStorage fallback.
      setLoading(false);
      if (!dbProfile) return;
      const local = parseStoredProfile(localStorage.getItem(PROFILE_KEY));

      // If local already has taste data, it's fresher — don't overwrite it with stale DB.
      // Preserve local's streamingService if set (handles Apple Music users who previously
      // had Spotify data in the same profile row).
      if (local?.topArtists?.length && local.artistImages
          && Object.keys(local.artistImages).length > 0) {
        // Only pull non-taste fields from DB (tier, lastFm) if local is missing them
        const merged: UserProfile = {
          ...local,
          calculatedTier: local.calculatedTier || dbProfile.calculatedTier,
          lastFmUsername: local.lastFmUsername || dbProfile.lastFmUsername,
          streamingService: resolveStreamingService(
            local.streamingService,
            local.topArtists?.length ?? 0
          ),
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
        notifyProfileUpdated();
        return;
      }

      // No local taste data — use DB profile (e.g. new device sign-in).
      const merged: UserProfile = {
        ...dbProfile,
        streamingService: resolveStreamingService(
          dbProfile.streamingService,
          dbProfile.topArtists?.length ?? 0
        ),
        artistImages: dbProfile.artistImages ?? local?.artistImages,
        artistIds: dbProfile.artistIds ?? local?.artistIds,
        trackImages: dbProfile.trackImages ?? local?.trackImages,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      notifyProfileUpdated();
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Mutating callbacks write to localStorage then dispatch the profile-updated
  // event. The event fires synchronously and the listener above re-reads
  // localStorage, so the originating instance gets its own update through the
  // same path as every other instance — single data flow, no double-set.
  const saveProfile = useCallback(async (p: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    notifyProfileUpdated();
    if (user?.id) await saveProfileToDB(p, user.id);
  }, [user?.id]);

  const clearProfile = useCallback(() => {
    clearStoredProfile();
  }, []);

  return { profile, loading, saveProfile, clearProfile };
}

export function getStoredProfile(): UserProfile | null {
  return parseStoredProfile(localStorage.getItem(PROFILE_KEY));
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
