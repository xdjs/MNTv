// Service abstraction layer for multi-provider playback (Spotify, Apple Music).
// PlaybackEngine is a plain class interface — not a hook — so implementations
// can be instantiated conditionally without violating React's rules of hooks.

export type ServiceType = "spotify" | "apple-music" | "none";

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;   // seconds
  duration: number;       // seconds
}

export interface PlaybackEngine {
  readonly service: ServiceType;
  readonly ready: boolean;
  /** Spotify-only: the Web Playback SDK device ID. Other engines return null. */
  readonly deviceId?: string | null;

  init(): Promise<void>;
  cleanup(): void;

  loadTrack(trackUri: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  stop(): void;

  /** Subscribe to playback state changes. Returns unsubscribe function. */
  onStateChange(cb: (state: PlaybackState) => void): () => void;
  /** Subscribe to track-end events. Returns unsubscribe function. */
  onTrackEnd(cb: () => void): () => void;
}
