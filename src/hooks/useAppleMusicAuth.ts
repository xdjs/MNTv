/**
 * Apple Music authorization via MusicKit JS v3.
 *
 * Unlike Spotify's PKCE redirect flow, Apple Music uses a popup:
 *   1. Fetch Developer Token from our edge function
 *   2. Load MusicKit JS SDK (lazy singleton)
 *   3. Configure MusicKit with the Developer Token
 *   4. Call MusicKit.getInstance().authorize() — shows Apple popup
 *   5. Returns a Music User Token directly (no redirect, no callback page)
 *
 * The Music User Token has no refresh mechanism — if it expires or the user
 * revokes access, the app must prompt them to re-authorize.
 */

import { supabase } from "@/integrations/supabase/client";
import { loadMusicKitSDK } from "@/lib/musickitLoader";
import { readAppleStorefront } from "@/lib/appleStorefront";
import { fetchAppleDeveloperToken, saveAppleMusicToken } from "./useAppleMusicToken";

// ── Auth flow ─────────────────────────────────────────────────────────

/**
 * Kick off Apple Music authorization.
 * On success, persists tokens to localStorage and returns the Music User Token.
 * On cancellation or failure, returns null.
 */
export async function initiateAppleMusicAuth(): Promise<string | null> {
  try {
    // 1. Fetch Developer Token from edge function
    const developerToken = await fetchAppleDeveloperToken();
    if (!developerToken) {
      console.error("[AppleMusic] No developer token — cannot authorize");
      return null;
    }

    // 2. Load MusicKit JS
    await loadMusicKitSDK();
    if (!window.MusicKit) {
      console.error("[AppleMusic] MusicKit failed to load");
      return null;
    }

    // 3. Configure MusicKit with the Developer Token
    await window.MusicKit.configure({
      developerToken,
      app: { name: "MusicNerd TV", build: "1.0.0" },
    });

    const music = window.MusicKit.getInstance();

    // 4. Open authorize popup — resolves with Music User Token
    const musicUserToken = await music.authorize();
    if (!musicUserToken) {
      console.warn("[AppleMusic] Authorization cancelled or denied");
      return null;
    }

    // 5. Persist tokens
    saveAppleMusicToken(musicUserToken, developerToken);
    return musicUserToken;
  } catch (err) {
    console.error("[AppleMusic] initiateAppleMusicAuth failed:", err);
    return null;
  }
}

// ── Taste profile fetch (mirrors useSpotifyAuth.fetchSpotifyTaste) ────

export interface AppleMusicTaste {
  topArtists: string[];
  topTracks: string[];
  artistImages: Record<string, string>;
  artistIds: Record<string, string>;
  trackImages: { title: string; artist: string; imageUrl: string; uri?: string }[];
  displayName: string | null;
}

/**
 * Fetch a taste profile from the user's Apple Music library.
 *
 * Calls the `apple-taste` edge function which combines
 * `/me/history/heavy-rotation` with `/me/recent/played/tracks` into a
 * weighted-frequency ranking. Response matches `spotify-taste` shape
 * plus `partial: true` so callers can treat Apple taste as softer signal.
 *
 * Returns null on any failure — the caller (Connect.tsx) continues
 * onboarding with empty taste data rather than blocking the flow.
 */
export async function fetchAppleMusicTaste(musicUserToken: string): Promise<AppleMusicTaste | null> {
  try {
    const { data, error } = await supabase.functions.invoke("apple-taste", {
      body: { musicUserToken, storefront: readAppleStorefront() },
    });
    if (error) {
      // supabase-js wraps non-2xx as FunctionsHttpError with the raw
      // Response on .context. Extract the JSON body so any diagnostic
      // payload from the edge function (e.g. apple-taste's appleStatus
      // / appleBody) lands in the console instead of being swallowed.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.clone === "function") {
        try {
          const body = await ctx.clone().json();
          console.error("[AppleMusic] fetchAppleMusicTaste failed:", error, body);
        } catch {
          console.error("[AppleMusic] fetchAppleMusicTaste failed:", error);
        }
      } else {
        console.error("[AppleMusic] fetchAppleMusicTaste failed:", error);
      }
      return null;
    }
    // Shape check: Array.isArray alone is insufficient because a
    // `[1, 2, 3]` payload passes but breaks every downstream string
    // consumer. Verify the element type too. Same for trackImages
    // (downstream code reads .title / .artist / .imageUrl).
    if (
      !data ||
      !Array.isArray(data.topArtists) ||
      !data.topArtists.every((a: unknown) => typeof a === "string") ||
      !Array.isArray(data.topTracks ?? []) ||
      !Array.isArray(data.trackImages ?? [])
    ) {
      console.warn("[AppleMusic] fetchAppleMusicTaste returned unexpected shape:", data);
      return null;
    }
    return {
      topArtists: data.topArtists as string[],
      topTracks: (data.topTracks ?? []) as string[],
      artistImages: (data.artistImages ?? {}) as Record<string, string>,
      artistIds: (data.artistIds ?? {}) as Record<string, string>,
      trackImages: (data.trackImages ?? []) as AppleMusicTaste["trackImages"],
      displayName: (data.displayName ?? null) as string | null,
    };
  } catch (err) {
    console.error("[AppleMusic] fetchAppleMusicTaste exception:", err);
    return null;
  }
}
