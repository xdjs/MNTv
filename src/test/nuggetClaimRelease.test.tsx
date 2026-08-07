import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Does a generation claim get released when the run does NOT finish?
//
// A `status='generating'` row in nugget_cache is a lock: other clients
// poll it rather than starting their own generation. Releasing it used
// to live at the end of the try block, so only the two paths that
// reached the bottom ever cleaned up. Thirteen earlier exits did not —
// including every `if (cancelledRef.current) return` and the AbortError
// catch, which is exactly what the hook's own effect cleanup triggers
// when a user skips a track a few seconds in.
//
// Nothing else ever cleared those rows, so an affected track showed
// "researching" and no facts to every later listener, permanently.
// Twelve had accumulated since May 2026, including Turnover's "Humming"
// (claimed 2026-07-30) which Pete reported as never resolving.

const getNuggetCache = vi.fn(() => null);
const setNuggetCache = vi.fn();
const getTrackListenCount = vi.fn(() => 1);
const setTrackListenCount = vi.fn();

vi.mock("@/contexts/PlayerContext", () => ({
  usePlayer: () => ({
    getNuggetCache, setNuggetCache, getTrackListenCount, setTrackListenCount,
    currentTime: 0, isPlaying: false,
  }),
}));

vi.mock("@/data/seedNuggets", () => ({
  getSeedListenNuggets: vi.fn(async () => null),
}));

/** Every nugget_cache write the hook attempts, in order. */
const dbOps: { op: string; key?: string }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  // Chainable stand-in for the PostgREST builder. `.eq()` has to be both
  // chainable (after .select()) and awaitable (after .delete()), which
  // is how the hook actually calls it.
  const makeQuery = () => {
    let deleting = false;
    const q: Record<string, unknown> = {
      select: () => q,
      maybeSingle: async () => ({ data: null }),
      insert: async () => { dbOps.push({ op: "insert" }); return { error: null }; },
      delete: () => { deleting = true; return q; },
      eq: (_col: string, val: string) => {
        if (deleting) {
          dbOps.push({ op: "delete", key: val });
          return Promise.resolve({ error: null });
        }
        return q;
      },
    };
    return q;
  };
  return {
    supabase: {
      auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
      from: vi.fn(() => makeQuery()),
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    },
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
  };
});

import { useAINuggets } from "@/hooks/useAINuggets";

const TRACK = "real::Turnover::Humming";

function renderHookForTrack() {
  return renderHook(() => useAINuggets(
    TRACK, "Turnover", "Humming", undefined, 200, 0,
    "https://example.com/art.jpg", "", "curious", ["Turnover"], ["Humming"],
  ));
}

/** Resolves once generation has reached the streaming request. */
let reachedSse: Promise<void>;
const realFetch = global.fetch;

beforeEach(() => {
  dbOps.length = 0;
  getNuggetCache.mockReturnValue(null);

  let arrived: () => void;
  reachedSse = new Promise<void>((res) => { arrived = res; });

  // Hangs until aborted — the shape of a real generation the user
  // walks away from mid-stream.
  global.fetch = vi.fn((_url: string, opts: { signal: AbortSignal }) => {
    arrived();
    return new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
  }) as unknown as typeof global.fetch;
});

afterEach(() => { global.fetch = realFetch; });

const claimed = () => dbOps.some((o) => o.op === "insert");
const released = () => dbOps.some((o) => o.op === "delete");

describe("generation claims are released when the run does not finish", () => {
  it("claims the track before generating", async () => {
    renderHookForTrack();
    await reachedSse;
    expect(claimed()).toBe(true);
  });

  // THE REGRESSION. Unmounting mid-generation is the common case — a
  // track skip — and it took the AbortError exit, which never reached
  // the old cleanup.
  it("releases the claim when unmounted mid-generation", async () => {
    const { unmount } = renderHookForTrack();
    await reachedSse;
    expect(released()).toBe(false);

    unmount();

    await waitFor(() => expect(released()).toBe(true));
  });

  it("releases the claim for the track it claimed", async () => {
    const { unmount } = renderHookForTrack();
    await reachedSse;
    unmount();

    await waitFor(() => {
      const del = dbOps.find((o) => o.op === "delete");
      expect(del?.key).toContain("Turnover");
    });
  });

  // Releasing twice would be a different bug: the second delete could
  // land after another client had re-claimed the track.
  it("releases exactly once", async () => {
    const { unmount } = renderHookForTrack();
    await reachedSse;
    unmount();

    await waitFor(() => expect(released()).toBe(true));
    expect(dbOps.filter((o) => o.op === "delete")).toHaveLength(1);
  });
});
