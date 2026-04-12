// MusicKit JS v3 type stubs.
// Covers the subset of APIs used by AppleMusicPlaybackEngine and useAppleMusicAuth.
// Full reference: https://js-cdn.music.apple.com/musickit/v3/docs/

declare namespace MusicKit {
  interface ConfigureOptions {
    developerToken: string;
    app: {
      name: string;
      build?: string;
    };
    storefrontId?: string;
    suppressErrorDialog?: boolean;
  }

  /** Playback state values per MusicKit v3 spec. Declared as a runtime
   *  object (not a TS enum) so ambient emit semantics stay predictable
   *  across bundlers. The engine reads window.MusicKit.PlaybackStates at
   *  runtime and compares numeric values. */
  const PlaybackStates: {
    readonly none: 0;
    readonly loading: 1;
    readonly playing: 2;
    readonly paused: 3;
    readonly stopped: 4;
    readonly ended: 5;
    readonly seeking: 6;
    readonly waiting: 8;
    readonly stalled: 9;
    readonly completed: 10;
  };
  type PlaybackStates = typeof PlaybackStates[keyof typeof PlaybackStates];

  interface Artwork {
    url?: string;         // Contains {w}x{h} template placeholders
    width?: number;
    height?: number;
    bgColor?: string;
  }

  interface MediaItem {
    id: string;
    type: string;         // "song", "album", etc.
    attributes?: {
      name?: string;
      artistName?: string;
      albumName?: string;
      artwork?: Artwork;
      durationInMillis?: number;
      url?: string;
    };
  }

  interface SetQueueOptions {
    song?: string;        // Catalog song ID
    songs?: string[];
    album?: string;
    playlist?: string;
    startWith?: number;
    startPlaying?: boolean;
  }

  interface PlaybackTimeEvent {
    currentPlaybackDuration: number;  // seconds
    currentPlaybackTime: number;      // seconds
    currentPlaybackTimeRemaining: number;
  }

  interface PlaybackStateEvent {
    state: PlaybackStates;
    oldState?: PlaybackStates;
  }

  interface MediaItemEvent {
    oldItem?: MediaItem;
    item?: MediaItem;
  }

  type EventCallback<T = unknown> = (event: T) => void;

  interface MusicKitInstance {
    readonly developerToken: string;
    readonly musicUserToken: string;
    readonly isAuthorized: boolean;
    readonly storefrontCountryCode: string;
    readonly nowPlayingItem: MediaItem | null;
    readonly currentPlaybackTime: number;
    readonly currentPlaybackDuration: number;
    readonly currentPlaybackTimeRemaining: number;
    readonly playbackState: PlaybackStates;

    // Auth
    authorize(): Promise<string>;   // Returns Music User Token
    unauthorize(): Promise<void>;

    // Playback control
    play(): Promise<void>;
    pause(): void;
    stop(): void;
    seekToTime(time: number): Promise<void>;
    skipToNextItem(): Promise<void>;
    skipToPreviousItem(): Promise<void>;

    // Queue
    setQueue(options: SetQueueOptions): Promise<void>;

    // Events
    addEventListener(event: "playbackStateDidChange", cb: EventCallback<PlaybackStateEvent>): void;
    addEventListener(event: "playbackTimeDidChange", cb: EventCallback<PlaybackTimeEvent>): void;
    addEventListener(event: "playbackDurationDidChange", cb: EventCallback<{ duration: number }>): void;
    addEventListener(event: "mediaItemDidChange", cb: EventCallback<MediaItemEvent>): void;
    addEventListener(event: "queueItemsDidChange", cb: EventCallback<MediaItem[]>): void;
    addEventListener(event: "authorizationStatusDidChange", cb: EventCallback<{ authorizationStatus: number }>): void;
    addEventListener(event: string, cb: EventCallback): void;
    removeEventListener(event: string, cb: EventCallback): void;
  }

  function configure(options: ConfigureOptions): Promise<MusicKitInstance>;
  function getInstance(): MusicKitInstance;
}

interface Window {
  MusicKit?: typeof MusicKit;
  musicKitLoaded?: boolean;
}
