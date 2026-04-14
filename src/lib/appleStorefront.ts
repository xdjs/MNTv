/**
 * Apple Music storefront helpers.
 *
 * Apple Music catalog queries are storefront-scoped (`us`, `gb`, `jp`, …).
 * The user's storefront is available from the configured MusicKit instance.
 * This module centralizes reading it + a `buildAppleBody` helper that
 * merges the storefront into an edge function request body.
 *
 * Every frontend caller of the Phase 5 edge functions (spotify-search,
 * spotify-artist, spotify-album, spotify-resolve) goes through this
 * helper when the active service is Apple Music. Without it, non-US
 * Apple Music users would see US-catalog results everywhere, which
 * breaks album detail, artist top tracks, and search for region-
 * scoped content.
 */

/** Returns the active Apple Music storefront (2-letter lowercase).
 *  Falls back to `"us"` when MusicKit is unconfigured or throws — safe
 *  default that matches the backend's `safeStorefront()` helper. */
export function readAppleStorefront(): string {
  try {
    const music = window.MusicKit?.getInstance?.();
    const code = music?.storefrontCountryCode;
    return typeof code === "string" && code.length === 2 ? code.toLowerCase() : "us";
  } catch {
    return "us";
  }
}

/** Given a UserProfile's streamingService, return the edge function
 *  `service` param value. Accepts both the `"Apple Music"` UI label and
 *  the already-normalized `"apple-music"` value from trackUri.ts. */
export function serviceParamFromProfile(
  streamingService: string | undefined,
): "apple" | "spotify" {
  return streamingService === "Apple Music" ? "apple" : "spotify";
}

/** Merge the storefront into an edge function request body when the
 *  active service is Apple. Returns the body unchanged for Spotify
 *  users so existing callers don't need to branch. */
export function withAppleStorefront<T extends Record<string, unknown>>(
  body: T,
  service: "apple" | "spotify",
): T & { storefront?: string } {
  if (service !== "apple") return body;
  return { ...body, storefront: readAppleStorefront() };
}
