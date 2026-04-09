// Spotify Web Playback SDK engine — extracted from PlayerContext.tsx.
// Implements PlaybackEngine so PlayerContext can swap between providers.

import type { PlaybackEngine, PlaybackState } from "./types";

// ── SDK singleton loader ─────────────────────────────────────────────

let sdkLoading = false;
let sdkReady = false;
const sdkReadyCallbacks: (() => void)[] = [];

/** Reset module-level SDK state — only for tests. Without this, sdkReady
 *  stays true after the first test and subsequent init() calls skip the
 *  SDK load entirely. */
export function _resetSdkStateForTests(): void {
  sdkLoading = false;
  sdkReady = false;
  sdkReadyCallbacks.length = 0;
}

function loadSpotifySDK(): Promise<void> {
  if (sdkReady) return Promise.resolve();
  return new Promise((resolve) => {
    sdkReadyCallbacks.push(resolve);
    if (sdkLoading) return;
    sdkLoading = true;
    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkReady = true;
      sdkReadyCallbacks.forEach((cb) => cb());
      sdkReadyCallbacks.length = 0;
    };
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(script);
  });
}

// ── Track info reported by the Spotify SDK ───────────────────────────

// Intentionally uses spotifyUri (not trackUri) — this is the SDK's native
// Spotify URI format (spotify:track:xxxxx). It equals the service-agnostic
// trackUri for Spotify tracks but is named distinctly because this type is
// only populated from the Spotify SDK's player_state_changed event.
export interface SpotifyStateTrack {
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string;
  spotifyUri: string;
  spotifyAlbumUri: string;
}

// ── Engine ────────────────────────────────────────────────────────────

export interface SpotifyPlaybackEngineOptions {
  getOAuthToken: () => Promise<string | null>;
  /** Called when the SDK is ready with the device ID. */
  onReady?: (deviceId: string) => void;
  /** Called when the SDK reports a new current track (player_state_changed). */
  onSpotifyStateTrack?: (track: SpotifyStateTrack) => void;
  /** Called when another Spotify device takes over playback. */
  onDeviceLost?: () => void;
}

export class SpotifyPlaybackEngine implements PlaybackEngine {
  readonly service = "spotify" as const;

  private player: Spotify.Player | null = null;
  private _ready = false;
  private _deviceId: string | null = null;
  private cancelled = false;

  // Internal tracking refs
  private pollInterval: number | null = null;
  private lastUri: string | null = null;
  private hasPlayed = false;
  private hasAutoPlayed = false;
  private _isPlaying = false;  // current playing state (not "has ever played")
  private maxPosition = 0;        // ms — highest position reached
  private lastPosition = 0;       // ms — for resume after device loss
  private deviceLost = false;
  private reTransferring = false;

  // Subscribers
  private stateListeners: Set<(s: PlaybackState) => void> = new Set();
  private endListeners: Set<() => void> = new Set();

  private getOAuthToken: () => Promise<string | null>;
  private onSpotifyStateTrackCb?: (track: SpotifyStateTrack) => void;
  private onReadyCb?: (deviceId: string) => void;
  private onDeviceLostCb?: () => void;

  constructor(opts: SpotifyPlaybackEngineOptions) {
    this.getOAuthToken = opts.getOAuthToken;
    this.onReadyCb = opts.onReady;
    this.onSpotifyStateTrackCb = opts.onSpotifyStateTrack;
    this.onDeviceLostCb = opts.onDeviceLost;
  }

  get ready() { return this._ready; }
  get deviceId() { return this._deviceId; }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await loadSpotifySDK();
    if (this.cancelled) return;

    const player = new Spotify.Player({
      name: "MusicNerd TV",
      getOAuthToken: async (cb) => {
        const t = await this.getOAuthToken();
        if (t) cb(t);
      },
      volume: 0.8,
    });

    player.addListener("ready", ({ device_id }) => {
      if (this.cancelled) return;
      this._deviceId = device_id;
      this._ready = true;
      this.onReadyCb?.(device_id);
      // Auto-play pending URI that was stored before the SDK was ready
      if (this.lastUri && !this.hasAutoPlayed) {
        this.autoPlay(this.lastUri);
      }
    });

    player.addListener("not_ready", () => {
      if (!this.cancelled) this._ready = false;
    });

    player.addListener("player_state_changed", (state) => this.handleStateChange(state));

    player.addListener("initialization_error", ({ message }) =>
      console.error("[Spotify] Init error:", message));
    player.addListener("authentication_error", ({ message }) =>
      console.error("[Spotify] Auth error:", message));
    player.addListener("account_error", ({ message }) =>
      console.error("[Spotify] Account error:", message));

    await player.connect();
    this.player = player;
  }

  cleanup(): void {
    this.cancelled = true;
    this.stopPolling();
    if (this.player) {
      this.player.disconnect();
      this.player = null;
    }
  }

  // ── Playback control ────────────────────────────────────────────────

  async loadTrack(trackUri: string): Promise<void> {
    // Don't reload if already playing this exact URI
    if (this.lastUri === trackUri) return;

    // Reset state
    this.lastUri = null;
    this.hasPlayed = false;
    this.hasAutoPlayed = false;
    this._isPlaying = false;
    this.maxPosition = 0;
    this.player?.pause();
    this.stopPolling();

    this.emitState({ isPlaying: false, currentTime: 0, duration: 0 });

    if (!trackUri) return;

    // If ready, auto-play immediately; otherwise store the URI and
    // auto-play when onReady fires (see the "ready" listener in init()).
    if (this._ready && this._deviceId) {
      await this.autoPlay(trackUri);
    } else {
      this.lastUri = trackUri;
    }
  }

  async play(): Promise<void> {
    // Re-transfer if another device stole playback
    if (this.deviceLost && this._deviceId && this.lastUri) {
      if (this.reTransferring) return;
      this.reTransferring = true;
      try {
        const token = await this.getOAuthToken();
        if (token) {
          console.log("[Player] Re-transferring playback back to MusicNerd TV device");
          const res = await fetch(
            `https://api.spotify.com/v1/me/player/play?device_id=${this._deviceId}`,
            {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                uris: [this.lastUri],
                position_ms: Math.max(0, this.lastPosition),
              }),
            }
          );
          if (res.ok) {
            this.deviceLost = false;
          } else {
            console.error(`[Player] Re-transfer failed (${res.status}):`, await res.text().catch(() => ""));
          }
        }
      } finally {
        this.reTransferring = false;
      }
      return;
    }
    this.player?.resume();
  }

  async pause(): Promise<void> {
    this.player?.pause();
  }

  /** Sync internal tracking to match an externally-changed track.
   *  Unlike loadTrack, this does NOT pause or restart playback. */
  syncUri(trackUri: string): void {
    this.lastUri = trackUri;
    this.hasPlayed = true;
    this.hasAutoPlayed = true;
    this._isPlaying = true;
    // Inherit the last known position so end-of-track detection
    // (maxPosition > 5000) isn't blind for the first few seconds.
    this.maxPosition = this.lastPosition;
  }

  async seek(seconds: number): Promise<void> {
    this.player?.seek(seconds * 1000);
    // Optimistically update time — omit duration so subscribers keep current value
    this.emitState({ isPlaying: this._isPlaying, currentTime: seconds });
  }

  stop(): void {
    this.player?.pause();
    this.stopPolling();
    this.lastUri = null;
  }

  // ── Subscriptions ───────────────────────────────────────────────────

  onStateChange(cb: (s: PlaybackState) => void): () => void {
    this.stateListeners.add(cb);
    return () => { this.stateListeners.delete(cb); };
  }

  onTrackEnd(cb: () => void): () => void {
    this.endListeners.add(cb);
    return () => { this.endListeners.delete(cb); };
  }

  // ── Internals ───────────────────────────────────────────────────────

  private emitState(partial: { isPlaying: boolean; currentTime: number; duration?: number }) {
    // When duration is omitted, subscribers should keep their current value.
    const state: PlaybackState = {
      isPlaying: partial.isPlaying,
      currentTime: partial.currentTime,
      duration: partial.duration,
    };
    for (const cb of this.stateListeners) cb(state);
  }

  private async autoPlay(uri: string): Promise<void> {
    if (this.hasAutoPlayed) return;
    this.hasAutoPlayed = true;
    this.lastUri = uri;

    const token = await this.getOAuthToken();
    if (this.cancelled || !token || !this._deviceId) return;

    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${this._deviceId}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [uri] }),
      }
    );
    if (!res.ok) {
      console.error(`[Player] Spotify play failed (${res.status}):`, await res.text().catch(() => ""), "URI:", uri);
    }
  }

  private handleStateChange(state: Spotify.PlaybackState | null): void {
    if (this.cancelled) return;

    if (!state) {
      // Another device took over
      this.deviceLost = true;
      this.stopPolling();
      this.emitState({ isPlaying: false, currentTime: 0, duration: 0 });
      this.onDeviceLostCb?.();
      console.log("[Player] Device lost — playback transferred to another device");
      return;
    }

    this.deviceLost = false;
    const currentTime = state.position / 1000;
    const duration = state.duration / 1000;
    const isPlaying = !state.paused;
    this._isPlaying = isPlaying;
    this.lastPosition = state.position;

    this.emitState({ isPlaying, currentTime, duration });

    if (isPlaying) {
      this.hasPlayed = true;
      this.maxPosition = Math.max(this.maxPosition, state.position);
      this.startPolling();
    } else {
      this.stopPolling();
    }

    // Report SDK track info
    const ct = state.track_window.current_track;
    if (ct?.uri) {
      this.onSpotifyStateTrackCb?.({
        title: ct.name || "",
        artist: ct.artists?.map((a: { name: string }) => a.name).join(", ") || "",
        album: ct.album?.name || "",
        albumArtUrl: ct.album?.images?.[0]?.url || "",
        spotifyUri: ct.uri,
        spotifyAlbumUri: ct.album?.uri || "",
      });
    }

    // End-of-track detection
    if (state.paused && state.position === 0 && ct?.uri === this.lastUri
        && this.hasPlayed && this.maxPosition > 5000) {
      this.lastUri = null;
      this.hasPlayed = false;
      for (const cb of this.endListeners) cb();
    }
  }

  private startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = window.setInterval(async () => {
      const s = await this.player?.getCurrentState();
      if (!s) return;
      this.lastPosition = s.position;
      this.emitState({
        isPlaying: !s.paused,
        currentTime: s.position / 1000,
        duration: s.duration / 1000,
      });
    }, 250);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
