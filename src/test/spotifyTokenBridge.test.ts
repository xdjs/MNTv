import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  bridgeSpotifyProviderTokens,
  SPOTIFY_STORAGE_KEY,
  RECONNECT_REQUIRED_EVENT,
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

// ── Unrecoverable credentials ─────────────────────────────────────────
// Pete, on staging: "song is not playing... its working on main
// production currently." The session was valid (expiring 40 minutes
// out) but carried provider_token:false AND provider_refresh_token:
// false, and localStorage held no spotify_playback_token. Supabase only
// issues provider_token on a fresh OAuth and drops it on JWT refresh, so
// there was nothing to refresh and nothing stored to fall back on.
//
// getValidToken returns null for a missing token WITHOUT raising the
// reconnect event — that path only fires when a token exists and its
// refresh fails. So the SDK had no credentials, the play button did
// nothing, and no error appeared anywhere.
//
// The bridge is the only place that sees this: it runs on every session
// hydration, including the refresh that drops the provider tokens.
describe("bridgeSpotifyProviderTokens — unrecoverable credentials", () => {
  let reconnects: number;
  const count = () => { reconnects += 1; };

  beforeEach(() => {
    localStorage.clear();
    reconnects = 0;
    window.addEventListener(RECONNECT_REQUIRED_EVENT, count);
  });
  afterEach(() => {
    window.removeEventListener(RECONNECT_REQUIRED_EVENT, count);
  });

  const strandedSession = {
    provider_token: undefined,
    provider_refresh_token: undefined,
    expires_in: 3600,
    user: { app_metadata: { provider: "spotify" } },
  } as unknown as TestSession;

  it("asks the user to reconnect when nothing can supply credentials", () => {
    bridgeSpotifyProviderTokens(strandedSession);
    expect(reconnects).toBe(1);
  });

  // The common case, and the reason the bridge no-ops rather than
  // writing an empty token: post-refresh sessions routinely arrive
  // without provider tokens while the stored one is still perfectly
  // good. Crying reconnect here would push a working user through OAuth
  // for nothing.
  it("stays quiet when a stored token still covers us", () => {
    const stored: StoredSpotifyToken = {
      accessToken: "still-good",
      refreshToken: "still-good-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(stored));

    bridgeSpotifyProviderTokens(strandedSession);

    expect(reconnects).toBe(0);
    // and it must not clobber the token it just declined to replace
    expect(JSON.parse(localStorage.getItem(SPOTIFY_STORAGE_KEY)!).accessToken)
      .toBe("still-good");
  });

  // An expired stored token is still recoverable — getValidToken owns
  // that path, refreshes it, and raises the event itself if the refresh
  // chain fails. Firing here too would double up.
  it("leaves an expired stored token to the refresh path", () => {
    const stored: StoredSpotifyToken = {
      accessToken: "expired",
      refreshToken: "expired-refresh",
      expiresAt: Date.now() - 60_000,
    };
    localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(stored));

    bridgeSpotifyProviderTokens(strandedSession);

    expect(reconnects).toBe(0);
  });

  // Raised in review. A raw `getItem` truthiness check would see the key
  // and conclude a fallback exists, while every real consumer parses and
  // finds nothing — leaving the user stranded with no signal, which is
  // the exact failure this whole path exists to catch. Both sides now go
  // through readStoredSpotifyToken so they cannot disagree.
  it("treats a corrupted stored token as no token at all", () => {
    localStorage.setItem(SPOTIFY_STORAGE_KEY, "{ not json");
    bridgeSpotifyProviderTokens(strandedSession);
    expect(reconnects).toBe(1);
  });

  // Parseable but useless — same reasoning.
  it("treats a stored token with no access token as no token", () => {
    localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify({ refreshToken: "r", expiresAt: 1 }));
    bridgeSpotifyProviderTokens(strandedSession);
    expect(reconnects).toBe(1);
  });

  it("does not fire for an Apple / anonymous session", () => {
    const session = {
      provider_token: undefined,
      provider_refresh_token: undefined,
      user: { app_metadata: { provider: "anonymous" } },
    } as unknown as TestSession;

    bridgeSpotifyProviderTokens(session);

    expect(reconnects).toBe(0);
  });

  it("does not fire when signed out", () => {
    bridgeSpotifyProviderTokens(null);
    expect(reconnects).toBe(0);
  });

  // Half a credential set is as useless as none — Spotify needs the
  // refresh token to keep the SDK fed past the first hour.
  it("fires when the access token is present but the refresh token is not", () => {
    const session = {
      provider_token: "spotify-access-abc",
      provider_refresh_token: undefined,
      expires_in: 3600,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;

    bridgeSpotifyProviderTokens(session);

    expect(reconnects).toBe(1);
    expect(localStorage.getItem(SPOTIFY_STORAGE_KEY)).toBeNull();
  });

  it("stays quiet on a healthy sign-in", () => {
    const session = {
      provider_token: "spotify-access-abc",
      provider_refresh_token: "spotify-refresh-xyz",
      expires_in: 3600,
      user: { app_metadata: { provider: "spotify" } },
    } as unknown as TestSession;

    bridgeSpotifyProviderTokens(session);

    expect(reconnects).toBe(0);
    expect(localStorage.getItem(SPOTIFY_STORAGE_KEY)).not.toBeNull();
  });
});
