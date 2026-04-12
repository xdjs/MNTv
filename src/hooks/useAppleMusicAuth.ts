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

import { loadMusicKitSDK } from "@/lib/musickitLoader";
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
      app: { name: "MusicNerd TV" },
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
  partial?: boolean;   // true = weaker signal than Spotify's user-top-read
}

/**
 * Fetch a taste profile from the user's Apple Music library.
 *
 * **NOT YET IMPLEMENTED** — the `apple-taste` edge function is scheduled for
 * Phase 5. Apple Music has no `/me/top/artists` equivalent, so Phase 5 will
 * combine `/me/history/heavy-rotation` + `/me/recent/played/tracks` into a
 * best-effort taste profile (marked `partial: true` in the response).
 *
 * Callers will currently receive `null`. When Phase 5 lands, delete this stub
 * and uncomment the implementation below.
 */
export async function fetchAppleMusicTaste(_musicUserToken: string): Promise<AppleMusicTaste | null> {
  console.warn("[AppleMusic] fetchAppleMusicTaste: apple-taste edge function not yet deployed (Phase 5)");
  return null;

  // Phase 5 implementation (keep for reference):
  // const storefront = window.MusicKit?.getInstance?.()?.storefrontCountryCode || "us";
  // const { data, error } = await supabase.functions.invoke("apple-taste", {
  //   body: { musicUserToken: _musicUserToken, storefront },
  // });
  // if (error || !data) {
  //   console.error("[AppleMusic] Taste fetch error:", error);
  //   return null;
  // }
  // return {
  //   topArtists: data.topArtists || [],
  //   topTracks: data.topTracks || [],
  //   artistImages: data.artistImages || {},
  //   artistIds: data.artistIds || {},
  //   trackImages: data.trackImages || [],
  //   displayName: data.displayName || null,
  //   partial: data.partial === true,
  // };
}
