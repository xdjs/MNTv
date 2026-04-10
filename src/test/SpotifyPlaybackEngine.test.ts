import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture listeners registered by the Spotify Player
const listeners = new Map<string, Function>();
const mockPlayer = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  seek: vi.fn(),
  getCurrentState: vi.fn().mockResolvedValue(null),
  addListener: vi.fn((event: string, cb: Function) => {
    listeners.set(event, cb);
  }),
};

// Mock Spotify global + SDK script load
vi.stubGlobal("Spotify", {
  Player: vi.fn().mockImplementation(() => mockPlayer),
});

// The SDK loader appends a script tag and waits for onSpotifyWebPlaybackSDKReady.
// Fire it synchronously so init() resolves immediately in tests.
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  const el = originalCreateElement(tag);
  if (tag === "script") {
    // When the script is appended, immediately fire the SDK ready callback
    const origAppend = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementationOnce((node) => {
      const result = origAppend(node);
      // Fire the global callback that the SDK loader is waiting for
      (window as any).onSpotifyWebPlaybackSDKReady?.();
      return result;
    });
  }
  return el;
});

import { SpotifyPlaybackEngine, _resetSdkStateForTests } from "@/lib/engines/SpotifyPlaybackEngine";

describe("SpotifyPlaybackEngine", () => {
  let engine: SpotifyPlaybackEngine;
  const onReady = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    _resetSdkStateForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    engine = new SpotifyPlaybackEngine({
      getOAuthToken: vi.fn().mockResolvedValue("fake-token"),
      onReady,
    });
  });

  it("auto-plays a pending URI when onReady fires after loadTrack", async () => {
    await engine.init();

    // SDK is connected but "ready" event hasn't fired yet
    expect(engine.ready).toBe(false);

    // loadTrack before ready — stores URI but doesn't call autoPlay
    await engine.loadTrack("spotify:track:abc123");
    expect(fetch).not.toHaveBeenCalled();

    // Simulate the SDK "ready" event
    const readyCb = listeners.get("ready");
    expect(readyCb).toBeDefined();
    readyCb!({ device_id: "device-1" });

    // Give the async autoPlay a tick to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(engine.ready).toBe(true);
    expect(onReady).toHaveBeenCalledWith("device-1");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.spotify.com/v1/me/player/play"),
      expect.objectContaining({
        body: expect.stringContaining("spotify:track:abc123"),
      })
    );
  });
});
