import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture event listeners registered on the MusicKit instance
const eventListeners = new Map<string, Function>();

const mockMusic = {
  developerToken: "dev",
  musicUserToken: "mut",
  isAuthorized: true,
  storefrontCountryCode: "us",
  nowPlayingItem: null,
  currentPlaybackTime: 0,
  currentPlaybackDuration: 0,
  currentPlaybackTimeRemaining: 0,
  playbackState: 0,
  authorize: vi.fn().mockResolvedValue("mut"),
  unauthorize: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  stop: vi.fn(),
  seekToTime: vi.fn().mockResolvedValue(undefined),
  skipToNextItem: vi.fn(),
  skipToPreviousItem: vi.fn(),
  setQueue: vi.fn().mockResolvedValue(undefined),
  addEventListener: vi.fn((event: string, cb: Function) => {
    eventListeners.set(event, cb);
  }),
  removeEventListener: vi.fn(),
};

// Mock window.MusicKit before importing the engine
vi.stubGlobal("MusicKit", {
  configure: vi.fn().mockResolvedValue(mockMusic),
  getInstance: vi.fn(() => {
    throw new Error("not configured yet");
  }),
  PlaybackStates: {
    none: 0,
    loading: 1,
    playing: 2,
    paused: 3,
    stopped: 4,
    ended: 5,
    seeking: 6,
    waiting: 8,
    stalled: 9,
    completed: 10,
  },
});

// Short-circuit the SDK script loader by pretending it's already loaded
(window as any).MusicKit = (window as any).MusicKit || globalThis.MusicKit;

import { AppleMusicPlaybackEngine, _resetSdkStateForTests } from "@/lib/engines/AppleMusicPlaybackEngine";

describe("AppleMusicPlaybackEngine", () => {
  const onReady = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    eventListeners.clear();
    _resetSdkStateForTests();

    // Re-attach the MusicKit stub onto window for each test
    (window as any).MusicKit = {
      configure: vi.fn().mockResolvedValue(mockMusic),
      getInstance: vi.fn(() => {
        throw new Error("not configured yet");
      }),
      PlaybackStates: globalThis.MusicKit.PlaybackStates,
    };
  });

  it("service property is apple-music and deviceId is null", () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    expect(engine.service).toBe("apple-music");
    expect(engine.deviceId).toBeNull();
  });

  it("init() configures MusicKit and becomes ready", async () => {
    const engine = new AppleMusicPlaybackEngine({
      developerToken: "dev-token",
      onReady,
    });

    await engine.init();

    expect(window.MusicKit!.configure).toHaveBeenCalledWith({
      developerToken: "dev-token",
      app: { name: "MusicNerd TV" },
    });
    expect(engine.ready).toBe(true);
    expect(onReady).toHaveBeenCalledWith(null);
  });

  it("loadTrack extracts catalog ID and calls setQueue", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    await engine.init();

    await engine.loadTrack("apple:song:1440833060");

    expect(mockMusic.setQueue).toHaveBeenCalledWith({
      song: "1440833060",
      startPlaying: true,
    });
  });

  it("loadTrack deduplicates repeat calls with the same URI", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    await engine.init();

    await engine.loadTrack("apple:song:1");
    await engine.loadTrack("apple:song:1"); // same URI — should be ignored

    expect(mockMusic.setQueue).toHaveBeenCalledTimes(1);
  });

  it("loadTrack before init() stores URI and plays when ready", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });

    // Call loadTrack before init resolves
    await engine.loadTrack("apple:song:999");
    expect(mockMusic.setQueue).not.toHaveBeenCalled();

    await engine.init();
    // Give autoPlay a tick to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(mockMusic.setQueue).toHaveBeenCalledWith({
      song: "999",
      startPlaying: true,
    });
  });

  it("onStateChange receives updates from playbackTimeDidChange events", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    await engine.init();

    const stateSpy = vi.fn();
    engine.onStateChange(stateSpy);

    const timeCb = eventListeners.get("playbackTimeDidChange");
    expect(timeCb).toBeDefined();

    timeCb!({ currentPlaybackTime: 42, currentPlaybackDuration: 200, currentPlaybackTimeRemaining: 158 });

    expect(stateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ currentTime: 42, duration: 200 })
    );
  });

  it("onTrackEnd fires when playback reaches completed state", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    await engine.init();

    // Start playing a track so hasPlayed becomes true
    await engine.loadTrack("apple:song:1");
    const stateCb = eventListeners.get("playbackStateDidChange");
    expect(stateCb).toBeDefined();

    // Simulate "playing" state first
    stateCb!({ state: 2 /* playing */ });

    const endSpy = vi.fn();
    engine.onTrackEnd(endSpy);

    // Then simulate "completed" state
    stateCb!({ state: 10 /* completed */ });
    expect(endSpy).toHaveBeenCalled();
  });

  it("onTrackEnd does NOT fire if the track never played", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    await engine.init();

    const endSpy = vi.fn();
    engine.onTrackEnd(endSpy);

    const stateCb = eventListeners.get("playbackStateDidChange");
    // Directly fire "completed" without a prior "playing" state
    stateCb!({ state: 10 });

    expect(endSpy).not.toHaveBeenCalled();
  });

  it("cleanup removes listeners and stops playback", async () => {
    const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
    await engine.init();

    engine.cleanup();

    expect(mockMusic.removeEventListener).toHaveBeenCalledWith("playbackStateDidChange", expect.any(Function));
    expect(mockMusic.removeEventListener).toHaveBeenCalledWith("playbackTimeDidChange", expect.any(Function));
    expect(mockMusic.stop).toHaveBeenCalled();
  });
});
