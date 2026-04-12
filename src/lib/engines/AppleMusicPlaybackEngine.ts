// Apple Music playback engine via MusicKit JS v3.
// Implements the same PlaybackEngine interface as SpotifyPlaybackEngine so
// PlayerContext can swap between providers.
//
// Key differences from Spotify:
//   - Native playbackTimeDidChange events (no 250ms polling)
//   - setQueue + play instead of REST API calls
//   - No device ID / no cross-device transfer (browser-only)
//   - Requires an Apple Music subscription for full tracks (previews otherwise)

import type { PlaybackEngine, PlaybackState } from "./types";
import { loadMusicKitSDK, _resetMusicKitLoaderForTests } from "@/lib/musickitLoader";
import { getIdFromUri, getServiceFromUri } from "@/lib/trackUri";

/** Reset module-level SDK state — only for tests. Re-exported for backward compat. */
export function _resetSdkStateForTests(): void {
  _resetMusicKitLoaderForTests();
}

// ── Engine ────────────────────────────────────────────────────────────

export interface AppleMusicPlaybackEngineOptions {
  developerToken: string;
  /** Called when MusicKit is configured and ready. */
  onReady?: (deviceId: string | null) => void;
}

/** Extract the catalog ID from an apple:song:{id} URI.
 *  Returns empty string for non-Apple URIs (e.g. spotify:track:abc), which
 *  prevents a wrong-service URI from being silently passed to setQueue. */
function extractAppleCatalogId(trackUri: string): string {
  if (getServiceFromUri(trackUri) !== "apple-music") return "";
  const id = getIdFromUri(trackUri);
  // Apple Music catalog IDs are numeric strings
  if (!/^\d+$/.test(id)) return "";
  return id;
}

export class AppleMusicPlaybackEngine implements PlaybackEngine {
  readonly service = "apple-music" as const;

  private music: MusicKit.MusicKitInstance | null = null;
  private _ready = false;
  private cancelled = false;
  private initStarted = false;

  // Internal tracking
  private lastUri: string | null = null;
  private hasPlayed = false;
  private hasAutoPlayed = false;
  private _isPlaying = false;

  // Subscribers
  private stateListeners: Set<(s: PlaybackState) => void> = new Set();
  private endListeners: Set<() => void> = new Set();

  // Bound event handlers (kept as props so removeEventListener can match)
  private boundStateHandler: (event: unknown) => void;
  private boundTimeHandler: (event: unknown) => void;

  private developerToken: string;
  private onReadyCb?: (deviceId: string | null) => void;

  constructor(opts: AppleMusicPlaybackEngineOptions) {
    this.developerToken = opts.developerToken;
    this.onReadyCb = opts.onReady;
    this.boundStateHandler = (e) => this.handlePlaybackState(e as MusicKit.PlaybackStateEvent);
    this.boundTimeHandler = (e) => this.handleTimeChange(e as MusicKit.PlaybackTimeEvent);
  }

  get ready() { return this._ready; }
  /** Apple Music has no device ID concept — always null. */
  get deviceId() { return null; }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async init(): Promise<void> {
    // Re-entrancy guard: attaching event listeners twice doubles emissions
    if (this.initStarted) return;
    this.initStarted = true;

    await loadMusicKitSDK();
    if (this.cancelled) return;

    if (!window.MusicKit) {
      console.error("[AppleMusic] MusicKit failed to load");
      return;
    }

    // MusicKit.configure() is a one-shot singleton per page load. If it's
    // already configured (e.g. from useAppleMusicAuth during onboarding),
    // reuse the existing instance instead of re-configuring.
    let instance: MusicKit.MusicKitInstance | null = null;
    try {
      instance = window.MusicKit.getInstance();
    } catch {
      // Not configured yet, fall through
    }

    if (!instance) {
      try {
        instance = await window.MusicKit.configure({
          developerToken: this.developerToken,
          app: { name: "MusicNerd TV" },
        });
      } catch (err) {
        console.error("[AppleMusic] configure failed:", err);
        return;
      }
    }

    if (this.cancelled) return;
    this.music = instance;
    this._ready = true;
    this.onReadyCb?.(null);

    // Wire up native events (no polling needed)
    instance.addEventListener("playbackStateDidChange", this.boundStateHandler);
    instance.addEventListener("playbackTimeDidChange", this.boundTimeHandler);

    // Auto-play pending URI that was stored before configure resolved
    if (this.lastUri && !this.hasAutoPlayed) {
      this.autoPlay(this.lastUri);
    }
  }

  cleanup(): void {
    this.cancelled = true;
    if (this.music) {
      try {
        this.music.removeEventListener("playbackStateDidChange", this.boundStateHandler);
        this.music.removeEventListener("playbackTimeDidChange", this.boundTimeHandler);
        this.music.stop();
      } catch (err) {
        console.warn("[AppleMusic] cleanup error:", err);
      }
      // Don't null the MusicKit singleton — other code may still reference it.
      this.music = null;
    }
  }

  // ── Playback control ────────────────────────────────────────────────

  async loadTrack(trackUri: string): Promise<void> {
    if (this.lastUri === trackUri) return;

    // Reset state
    this.lastUri = null;
    this.hasPlayed = false;
    this.hasAutoPlayed = false;
    this._isPlaying = false;

    try { this.music?.stop(); } catch { /* already stopped */ }

    this.emitState({ isPlaying: false, currentTime: 0, duration: 0 });

    if (!trackUri) return;

    if (this._ready && this.music) {
      await this.autoPlay(trackUri);
    } else {
      // Store for auto-play once init() resolves
      this.lastUri = trackUri;
    }
  }

  async play(): Promise<void> {
    try {
      await this.music?.play();
    } catch (err) {
      console.error("[AppleMusic] play failed:", err);
    }
  }

  async pause(): Promise<void> {
    try { this.music?.pause(); } catch { /* already paused */ }
  }

  /** Sync internal tracking to match an externally-changed track.
   *  Apple Music has no cross-device detection, so this is only called
   *  when the engine is swapped in mid-session — rare but harmless. */
  syncUri(trackUri: string): void {
    this.lastUri = trackUri;
    this.hasPlayed = true;
    this.hasAutoPlayed = true;
    this._isPlaying = true;
  }

  async seek(seconds: number): Promise<void> {
    try {
      await this.music?.seekToTime(seconds);
    } catch (err) {
      console.error("[AppleMusic] seek failed:", err);
    }
    // Optimistically update time — omit duration so subscribers keep current value
    this.emitState({ isPlaying: this._isPlaying, currentTime: seconds });
  }

  stop(): void {
    try { this.music?.stop(); } catch { /* already stopped */ }
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
    const state: PlaybackState = {
      isPlaying: partial.isPlaying,
      currentTime: partial.currentTime,
      duration: partial.duration,
    };
    for (const cb of this.stateListeners) cb(state);
  }

  private async autoPlay(uri: string): Promise<void> {
    const catalogId = extractAppleCatalogId(uri);
    if (!catalogId) {
      console.error("[AppleMusic] Invalid or non-Apple URI:", uri);
      return;
    }
    if (!this.music) return;

    // Apple Music playback requires authorization. Without it, setQueue will
    // silently fail or return preview clips only. Surface a clear error.
    if (!this.music.isAuthorized) {
      console.error("[AppleMusic] Not authorized — user must connect Apple Music before playback");
      return;
    }

    // Mark as "attempted" only after validation passes, so an invalid URI
    // followed by a retry with a valid URI isn't blocked by the dedup guard.
    if (this.hasAutoPlayed) return;
    this.hasAutoPlayed = true;
    this.lastUri = uri;

    try {
      await this.music.setQueue({ song: catalogId, startPlaying: true });
    } catch (err) {
      console.error("[AppleMusic] setQueue failed:", err, "URI:", uri);
    }
  }

  private handlePlaybackState(event: MusicKit.PlaybackStateEvent): void {
    if (this.cancelled || !this.music) return;

    const state = event.state;
    const PS = window.MusicKit?.PlaybackStates;
    if (!PS) return;

    const isPlaying = state === PS.playing;
    this._isPlaying = isPlaying;
    if (isPlaying) this.hasPlayed = true;

    // End-of-track detection: MusicKit reports one of "completed" (10),
    // "ended" (5), or "stopped" (4) when a track finishes naturally.
    // Only fire onEnded if the track actually played at least once
    // (prevents phantom end events during load).
    const isEnd = state === PS.completed || state === PS.ended || state === PS.stopped;
    if (isEnd && this.hasPlayed && this.lastUri) {
      this.lastUri = null;
      this.hasPlayed = false;
      for (const cb of this.endListeners) cb();
      return;
    }

    // Emit state update with latest time/duration from the instance
    this.emitState({
      isPlaying,
      currentTime: this.music.currentPlaybackTime || 0,
      duration: this.music.currentPlaybackDuration || 0,
    });
  }

  private handleTimeChange(event: MusicKit.PlaybackTimeEvent): void {
    if (this.cancelled) return;
    this.emitState({
      isPlaying: this._isPlaying,
      currentTime: event.currentPlaybackTime || 0,
      duration: event.currentPlaybackDuration || 0,
    });
  }
}
