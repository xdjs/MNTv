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
import { loadMusicKitSDK } from "@/lib/musickitLoader";
import { getIdFromUri, getServiceFromUri } from "@/lib/trackUri";

/** Apple Music preview clips are exactly 30 seconds. Anything at or below
 *  this at playback start means MusicKit served a preview instead of the
 *  full track — almost always a subscription issue. */
const APPLE_MUSIC_PREVIEW_DURATION_S = 30;

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
  private pollInterval: number | null = null;
  private lastPolledTime = -1;
  private lastPolledDuration = -1;
  private hasLoggedSubscriptionStatus = false;
  private hasWarnedPreview = false;

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
          app: { name: "MusicNerd TV", build: "1.0.0" },
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

    // Wire up native playback events. We still poll at 250ms for smooth
    // progress-bar updates — playbackTimeDidChange fires ~1s which looks
    // chunky compared to Spotify's 250ms cadence.
    instance.addEventListener("playbackStateDidChange", this.boundStateHandler);
    instance.addEventListener("playbackTimeDidChange", this.boundTimeHandler);

    // NOTE: subscription diagnostics fire on the first playbackStateDidChange,
    // not here. At configure() resolve time, isAuthorized/musicUserToken
    // may not be fully populated yet — MusicKit finalizes auth state
    // asynchronously after the configure promise resolves.

    // Auto-play pending URI that was stored before configure resolved
    if (this.lastUri && !this.hasAutoPlayed) {
      this.autoPlay(this.lastUri);
    }
  }

  /** Best-effort subscription probe. Logs what MusicKit exposes about the
   *  user's authorization and storefront. Apple doesn't publish a
   *  `/v1/me/subscription` endpoint, so we lean on `isAuthorized`,
   *  `storefrontCountryCode`, and a `/v1/me/storefront` round-trip (which
   *  requires a valid Music User Token).
   *
   *  Only booleans are logged for any token field — the Music User Token
   *  is a short-lived credential and must never be logged in full. */
  private async logSubscriptionStatus(): Promise<void> {
    if (!this.music) return;
    const m = this.music as unknown as {
      isAuthorized?: boolean;
      storefrontCountryCode?: string;
      storefrontId?: string;
      musicUserToken?: string;
      developerToken?: string;
      api?: {
        music?: (path: string, params?: unknown) => Promise<unknown>;
      };
    };
    const snapshot = {
      isAuthorized: m.isAuthorized,
      storefrontCountryCode: m.storefrontCountryCode,
      storefrontId: m.storefrontId,
      hasMusicUserToken: !!m.musicUserToken, // boolean only — never log the token value
      hasDeveloperToken: !!m.developerToken, // boolean only — never log the token value
    };
    console.log("[AppleMusic] subscription snapshot:", snapshot);

    try {
      const storefront = await m.api?.music?.("v1/me/storefront");
      console.log("[AppleMusic] /v1/me/storefront:", storefront);
    } catch (err) {
      console.warn("[AppleMusic] /v1/me/storefront failed:", err);
    }
  }

  cleanup(): void {
    this.cancelled = true;
    this.stopPolling();
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

    // Commit lastUri immediately so concurrent loadTrack calls with the
    // same URI are caught by the dedup guard above. autoPlay's catch
    // block resets it to null on failure so retries still work.
    // The pre-load stop() below is a state reset for the new track; the
    // hasPlayed && lastUri guard in handlePlaybackState ensures this
    // synchronous stop doesn't trigger a phantom onEnded fire.
    this.lastUri = trackUri;
    this.hasPlayed = false;
    this.hasAutoPlayed = false;
    this._isPlaying = false;
    this.hasWarnedPreview = false;

    try { this.music?.stop(); } catch { /* already stopped */ }

    this.emitState({ isPlaying: false, currentTime: 0, duration: 0 });

    if (!trackUri) return;

    if (this._ready && this.music) {
      await this.autoPlay(trackUri);
    }
    // If not ready, lastUri is already stored above. The onReady-triggered
    // autoPlay in init() will pick it up.
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
   *  No-op for Apple Music: MusicKit JS has no cross-device detection,
   *  so there's no external state to sync to. PlayerContext guards
   *  syncExternalTrack on service === "spotify", so this is never called
   *  in current flows — but we implement it to satisfy the PlaybackEngine
   *  interface without setting phantom state that could mislead consumers. */
  syncUri(_trackUri: string): void {
    // intentionally empty
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
      this.lastUri = null;  // un-commit so retries with a valid URI aren't blocked
      return;
    }
    if (!this.music) return;

    // Apple Music playback requires authorization. Without it, setQueue will
    // silently fail or return preview clips only. Surface a clear error.
    if (!this.music.isAuthorized) {
      console.error("[AppleMusic] Not authorized — user must connect Apple Music before playback");
      this.lastUri = null;
      return;
    }

    if (this.hasAutoPlayed) return;
    this.hasAutoPlayed = true;

    try {
      await this.music.setQueue({ song: catalogId, startPlaying: true });
    } catch (err) {
      console.error("[AppleMusic] setQueue failed:", err, "URI:", uri);
      // Un-commit lastUri and reset the autoplay latch so the caller can
      // retry with the same URI.
      this.lastUri = null;
      this.hasAutoPlayed = false;
    }
  }

  private handlePlaybackState(event: MusicKit.PlaybackStateEvent): void {
    if (this.cancelled || !this.music) return;

    // First state change after configure — now that MusicKit has settled,
    // log the subscription snapshot. Guarded so it only fires once.
    // .catch() handles any unexpected rejection from the fire-and-forget
    // async call; the method already catches its own API errors.
    if (!this.hasLoggedSubscriptionStatus) {
      this.hasLoggedSubscriptionStatus = true;
      this.logSubscriptionStatus().catch(() => { /* diagnostic only */ });
    }

    const state = event.state;
    const PS = window.MusicKit?.PlaybackStates;
    if (!PS) return;

    const isPlaying = state === PS.playing;
    this._isPlaying = isPlaying;
    if (isPlaying) this.hasPlayed = true;

    // Preview detection: a full-track setQueue that reports
    // currentPlaybackDuration ≤ APPLE_MUSIC_PREVIEW_DURATION_S means
    // MusicKit handed us a preview clip instead of the full track —
    // almost always a subscription issue. Gated by hasWarnedPreview so
    // a short track paused/resumed many times doesn't spam the console;
    // reset in loadTrack() when a new URI commits.
    if (
      !this.hasWarnedPreview &&
      isPlaying &&
      this.music.currentPlaybackDuration &&
      this.music.currentPlaybackDuration <= APPLE_MUSIC_PREVIEW_DURATION_S
    ) {
      this.hasWarnedPreview = true;
      console.warn(
        "[AppleMusic] Playing a preview clip, not full track.",
        "Duration:", this.music.currentPlaybackDuration,
        "— check Apple Music subscription status."
      );
    }

    // End-of-track detection: MusicKit reports "completed" (10) or "ended"
    // (5) when a track finishes naturally. "stopped" is deliberately NOT
    // included — MusicKit also emits it during buffering transitions and
    // when music.stop() is called programmatically (e.g. from loadTrack),
    // which would cause phantom onEnded fires.
    const isEnd = state === PS.completed || state === PS.ended;
    if (isEnd && this.hasPlayed && this.lastUri) {
      this.stopPolling();
      this.lastUri = null;
      this.hasPlayed = false;
      for (const cb of this.endListeners) cb();
      return;
    }

    // Drive the progress bar at 250ms while playing. Stop the interval
    // whenever playback isn't active so we don't leak timers or emit
    // spurious time updates while paused/buffering.
    if (isPlaying) this.startPolling();
    else this.stopPolling();

    // Emit state update with latest time/duration from the instance
    this.emitState({
      isPlaying,
      currentTime: this.music.currentPlaybackTime || 0,
      duration: this.music.currentPlaybackDuration || 0,
    });
  }

  /** Native playbackTimeDidChange events fire at ~1s cadence. This path
   *  coexists with the 250ms poll in startPolling() intentionally: the
   *  event gives us the authoritative value from MusicKit whenever it
   *  fires, and the poll smooths the gaps between fires so the progress
   *  bar doesn't look chunky. Both call emitState — don't delete one
   *  thinking the other makes it redundant. */
  private handleTimeChange(event: MusicKit.PlaybackTimeEvent): void {
    if (this.cancelled) return;
    this.emitState({
      isPlaying: this._isPlaying,
      currentTime: event.currentPlaybackTime || 0,
      duration: event.currentPlaybackDuration || 0,
    });
  }

  /** Poll currentPlaybackTime at 250ms to smooth the progress bar. MusicKit's
   *  playbackTimeDidChange event fires ~1s which makes the bar look chunky
   *  vs Spotify's 250ms cadence. Skips emission when time and duration
   *  haven't changed since the last poll to avoid forcing no-op React
   *  re-renders during buffering/stalled playback. */
  private startPolling(): void {
    if (this.pollInterval !== null) return;
    this.pollInterval = window.setInterval(() => {
      if (!this.music || this.cancelled) return;
      const t = this.music.currentPlaybackTime || 0;
      const d = this.music.currentPlaybackDuration || 0;
      if (t === this.lastPolledTime && d === this.lastPolledDuration) return;
      this.lastPolledTime = t;
      this.lastPolledDuration = d;
      this.emitState({
        isPlaying: this._isPlaying,
        currentTime: t,
        duration: d,
      });
    }, 250);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.lastPolledTime = -1;
    this.lastPolledDuration = -1;
  }
}
