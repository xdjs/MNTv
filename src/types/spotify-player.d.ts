declare namespace Spotify {
  interface PlayerOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  interface WebPlaybackTrack {
    uri: string;
    id: string;
    type: string;
    media_type: string;
    name: string;
    is_playable: boolean;
    album: {
      uri: string;
      name: string;
      images: { url: string }[];
    };
    artists: { uri: string; name: string }[];
  }

  interface WebPlaybackState {
    context: { uri: string; metadata: Record<string, unknown> };
    disallows: Record<string, boolean>;
    paused: boolean;
    position: number;
    duration: number;
    track_window: {
      current_track: WebPlaybackTrack;
      previous_tracks: WebPlaybackTrack[];
      next_tracks: WebPlaybackTrack[];
    };
  }

  interface WebPlaybackError {
    message: string;
  }

  class Player {
    constructor(options: PlayerOptions);
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(event: "ready", callback: (data: { device_id: string }) => void): void;
    addListener(event: "not_ready", callback: (data: { device_id: string }) => void): void;
    addListener(event: "player_state_changed", callback: (state: WebPlaybackState | null) => void): void;
    addListener(event: "initialization_error", callback: (error: WebPlaybackError) => void): void;
    addListener(event: "authentication_error", callback: (error: WebPlaybackError) => void): void;
    addListener(event: "account_error", callback: (error: WebPlaybackError) => void): void;
    removeListener(event: string): void;
    getCurrentState(): Promise<WebPlaybackState | null>;
    setName(name: string): Promise<void>;
    getVolume(): Promise<number>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
    activateElement(): Promise<void>;
  }
}

interface Window {
  Spotify?: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
