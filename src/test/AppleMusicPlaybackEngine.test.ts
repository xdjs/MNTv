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

import { AppleMusicPlaybackEngine } from "@/lib/engines/AppleMusicPlaybackEngine";
import { _resetMusicKitLoaderForTests } from "@/lib/musickitLoader";

describe("AppleMusicPlaybackEngine", () => {
  const onReady = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    eventListeners.clear();
    _resetMusicKitLoaderForTests();

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
      app: { name: "MusicNerd TV", build: "1.0.0" },
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

  // ── Polling lifecycle ─────────────────────────────────────────────────

  it("polls currentPlaybackTime at 250ms while playing", async () => {
    vi.useFakeTimers();
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      const stateSpy = vi.fn();
      engine.onStateChange(stateSpy);

      mockMusic.currentPlaybackTime = 10;
      mockMusic.currentPlaybackDuration = 200;

      // Enter playing state — starts the interval
      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 /* playing */ });
      stateSpy.mockClear();

      mockMusic.currentPlaybackTime = 10.25;
      vi.advanceTimersByTime(250);
      expect(stateSpy).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 10.25 }));

      mockMusic.currentPlaybackTime = 10.5;
      vi.advanceTimersByTime(250);
      expect(stateSpy).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 10.5 }));

      expect(stateSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling when playback pauses", async () => {
    vi.useFakeTimers();
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      const stateSpy = vi.fn();
      engine.onStateChange(stateSpy);

      mockMusic.currentPlaybackTime = 5;
      mockMusic.currentPlaybackDuration = 200;

      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 /* playing */ });
      vi.advanceTimersByTime(250);
      stateCb!({ state: 3 /* paused */ });
      stateSpy.mockClear();

      // Time advances past several poll intervals but we're paused — no more ticks
      mockMusic.currentPlaybackTime = 6;
      vi.advanceTimersByTime(1000);

      // Only the state-change event itself may emit; the interval must not fire.
      // Filter the spy to just "driven by the poll" calls — those would be the
      // ones fired without an accompanying state-change event. Since we cleared
      // above and don't fire another state-change, any call means the poll leaked.
      expect(stateSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips emission when polled time and duration are unchanged", async () => {
    vi.useFakeTimers();
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      const stateSpy = vi.fn();
      engine.onStateChange(stateSpy);

      mockMusic.currentPlaybackTime = 7;
      mockMusic.currentPlaybackDuration = 200;

      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 });
      stateSpy.mockClear();

      // First tick records values
      vi.advanceTimersByTime(250);
      const firstCallCount = stateSpy.mock.calls.length;

      // Subsequent ticks with no change should not emit
      vi.advanceTimersByTime(250);
      vi.advanceTimersByTime(250);
      vi.advanceTimersByTime(250);

      expect(stateSpy.mock.calls.length).toBe(firstCallCount);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleanup() stops polling so no interval leaks", async () => {
    vi.useFakeTimers();
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 });

      engine.cleanup();

      const stateSpy = vi.fn();
      engine.onStateChange(stateSpy);

      mockMusic.currentPlaybackTime = 99;
      vi.advanceTimersByTime(1000);

      expect(stateSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns when currentPlaybackDuration is ≤30s at playback start", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      mockMusic.currentPlaybackDuration = 30;
      mockMusic.currentPlaybackTime = 0;

      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 /* playing */ });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("preview clip"),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn when currentPlaybackDuration is a full track", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      mockMusic.currentPlaybackDuration = 429;
      mockMusic.currentPlaybackTime = 0;

      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 });

      const previewWarns = warnSpy.mock.calls.filter((args) =>
        typeof args[0] === "string" && args[0].includes("preview clip")
      );
      expect(previewWarns.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("logs subscription snapshot once, on the first state change (not during init)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const engine = new AppleMusicPlaybackEngine({ developerToken: "dev-token" });
      await engine.init();

      // init() must NOT emit the snapshot — auth state isn't guaranteed
      // populated at configure() resolve time.
      const initSnapshots = logSpy.mock.calls.filter((args) =>
        typeof args[0] === "string" && args[0].includes("subscription snapshot")
      );
      expect(initSnapshots.length).toBe(0);

      // First state change fires the snapshot
      const stateCb = eventListeners.get("playbackStateDidChange");
      stateCb!({ state: 2 });

      const afterFirst = logSpy.mock.calls.filter((args) =>
        typeof args[0] === "string" && args[0].includes("subscription snapshot")
      );
      expect(afterFirst.length).toBe(1);

      // A second state change must not log the snapshot again
      stateCb!({ state: 3 });
      const afterSecond = logSpy.mock.calls.filter((args) =>
        typeof args[0] === "string" && args[0].includes("subscription snapshot")
      );
      expect(afterSecond.length).toBe(1);
    } finally {
      logSpy.mockRestore();
    }
  });
});
