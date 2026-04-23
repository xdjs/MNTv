import { describe, it, expect, beforeEach } from "vitest";
import {
  bridgeSpotifyProviderTokens,
  SPOTIFY_STORAGE_KEY,
  type StoredSpotifyToken,
} from "@/lib/spotifyTokenStore";

// Minimal Session stub — we only set fields the bridge actually reads.
type TestSession = Parameters<typeof bridgeSpotifyProviderTokens>[0];

describe("bridgeSpotifyProviderTokens", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes provider tokens to localStorage when session is Spotify-provider", () => {
    const session = {
      provider_token: "spotify-access-abc",
      provider_refresh_token: "spotify-refresh-xyz",
      expires_in: 3600,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;

    bridgeSpotifyProviderTokens(session);

    const stored = JSON.parse(
      localStorage.getItem(SPOTIFY_STORAGE_KEY)!,
    ) as StoredSpotifyToken;
    expect(stored.accessToken).toBe("spotify-access-abc");
    expect(stored.refreshToken).toBe("spotify-refresh-xyz");
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  it("is a no-op when session is null", () => {
    bridgeSpotifyProviderTokens(null);
    expect(localStorage.getItem(SPOTIFY_STORAGE_KEY)).toBeNull();
  });

  it("is a no-op when session has no provider_token", () => {
    const session = {
      provider_token: undefined,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;
    bridgeSpotifyProviderTokens(session);
    expect(localStorage.getItem(SPOTIFY_STORAGE_KEY)).toBeNull();
  });

  it("is a no-op when session is not Spotify-provider", () => {
    const session = {
      provider_token: "apple-token",
      user: { app_metadata: { provider: "apple" } },
    } as unknown as TestSession;
    bridgeSpotifyProviderTokens(session);
    expect(localStorage.getItem(SPOTIFY_STORAGE_KEY)).toBeNull();
  });

  it("is a no-op when session has no provider_refresh_token", () => {
    // Spotify requires a refresh token to keep the Web Playback SDK fed;
    // without one we'd strand the user at the first token expiry.
    const session = {
      provider_token: "spotify-access-abc",
      provider_refresh_token: undefined,
      expires_in: 3600,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;
    bridgeSpotifyProviderTokens(session);
    expect(localStorage.getItem(SPOTIFY_STORAGE_KEY)).toBeNull();
  });

  it("does not overwrite a fresher existing token", () => {
    const existing: StoredSpotifyToken = {
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: Date.now() + 7200_000,
    };
    localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(existing));

    const session = {
      provider_token: "stale-access",
      provider_refresh_token: "stale-refresh",
      expires_in: 100,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;
    bridgeSpotifyProviderTokens(session);

    const stored = JSON.parse(
      localStorage.getItem(SPOTIFY_STORAGE_KEY)!,
    ) as StoredSpotifyToken;
    expect(stored.accessToken).toBe("fresh-access");
  });

  it("overwrites a stale existing token (session is newer)", () => {
    const existing: StoredSpotifyToken = {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 60_000, // already expired
    };
    localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(existing));

    const session = {
      provider_token: "new-access",
      provider_refresh_token: "new-refresh",
      expires_in: 3600,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;
    bridgeSpotifyProviderTokens(session);

    const stored = JSON.parse(
      localStorage.getItem(SPOTIFY_STORAGE_KEY)!,
    ) as StoredSpotifyToken;
    expect(stored.accessToken).toBe("new-access");
  });
});
