import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Nugget, Source } from "@/mock/types";

// Lifecycle tests for useAINuggets — WHEN generation runs, not what it
// produces.
//
// Every bug reported in this feature has lived in this seam rather than
// in any single function: generation re-firing on a value that merely
// arrived late, state cleared out from under the reader, an in-flight
// stream aborted by its own effect cleanup. The 500-odd unit tests
// around this hook could not see any of it, because they test pure
// helpers while the defects live in a dependency array.
//
// Observability trick: generate() consults the in-memory nugget cache
// early and returns as soon as it hits. Seeding that cache makes every
// run short and deterministic, and getNuggetCache call-count becomes an
// exact measure of how many times generation actually fired.

const getNuggetCache = vi.fn();
const setNuggetCache = vi.fn();
const getTrackListenCount = vi.fn(() => 1);
const setTrackListenCount = vi.fn();

vi.mock("@/contexts/PlayerContext", () => ({
  usePlayer: () => ({
    getNuggetCache,
    setNuggetCache,
    getTrackListenCount,
    setTrackListenCount,
    currentTime: 0,
    isPlaying: false,
  }),
}));

// Nothing below should be reached while the in-memory cache hits. If a
// test ever trips one of these, generation went further than intended
// and the test is no longer measuring what it claims to.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(() => { throw new Error("DB hit — generation ran past the in-memory cache"); }),
    functions: { invoke: vi.fn() },
  },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
}));

vi.mock("@/data/seedNuggets", () => ({
  getSeedListenNuggets: vi.fn(async () => null),
}));

import { useAINuggets } from "@/hooks/useAINuggets";

const NUGGET: Nugget = {
  id: "n-1",
  trackId: "real::Turnover::Humming",
  timestampSec: 0,
  durationMs: 7000,
  headline: "A real fact about the track.",
  text: "With a body that adds something.",
  kind: "artist",
  sourceId: "s-1",
};

const SOURCE: Source = {
  id: "s-1", type: "article", title: "t", publisher: "p", url: "https://example.com/x",
};

/** The hook's positional signature, as a named shape so tests read clearly. */
interface Args {
  trackId: string;
  artist: string;
  title: string;
  durationSec: number;
  regenerateKey: number;
  coverArtUrl?: string;
  artistImageUrl?: string;
  tier: "casual" | "curious" | "nerd";
  topArtists?: string[];
  topTracks?: string[];
}

const BASE: Args = {
  trackId: "real::Turnover::Humming",
  artist: "Turnover",
  title: "Humming",
  durationSec: 200,
  regenerateKey: 0,
  coverArtUrl: "https://example.com/art.jpg",
  artistImageUrl: "",
  tier: "curious",
  topArtists: ["Turnover"],
  topTracks: ["Humming"],
};

function render(initial: Args = BASE) {
  return renderHook(
    (a: Args) => useAINuggets(
      a.trackId, a.artist, a.title, undefined, a.durationSec, a.regenerateKey,
      a.coverArtUrl, a.artistImageUrl, a.tier, a.topArtists, a.topTracks,
    ),
    { initialProps: initial },
  );
}

/** How many times generation has fired. */
const generationCount = () => getNuggetCache.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  // Every lookup hits, so generation short-circuits deterministically.
  getNuggetCache.mockReturnValue({
    nuggets: [NUGGET],
    sources: new Map([[SOURCE.id, SOURCE]]),
    listenCount: 1,
  });
});

describe("useAINuggets — when generation fires", () => {
  it("generates once on mount", async () => {
    render();
    await waitFor(() => expect(generationCount()).toBeGreaterThan(0));
    expect(generationCount()).toBe(1);
  });

  // ── THE REGRESSION ──────────────────────────────────────────────────
  // Pete: "I had a track paused for a while, I unpaused, and all the
  // facts disappeared and the researching pill showed up again."
  //
  // artistImageUrl resolves asynchronously from profile.artistImages;
  // topArtists/topTracks get replaced by the background taste refresh.
  // When those were in generate()'s dependency array, arriving late
  // re-ran it — wiping state mid-listen and aborting any in-flight
  // stream via the effect's own cleanup.

  it("does NOT regenerate when the artist image resolves late", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, artistImageUrl: "https://example.com/artist.jpg" });
    await Promise.resolve();

    expect(generationCount()).toBe(1);
  });

  it("does NOT regenerate when cover art arrives late", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, coverArtUrl: "https://example.com/late-art.jpg" });
    await Promise.resolve();

    expect(generationCount()).toBe(1);
  });

  // The background taste refresh hands back fresh arrays — new identity,
  // same meaning. That must not restart research.
  it("does NOT regenerate when the taste refresh replaces top artists", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, topArtists: ["Turnover", "Citizen"], topTracks: ["Humming", "Sunny"] });
    await Promise.resolve();

    expect(generationCount()).toBe(1);
  });

  it("does NOT regenerate when several enrichment values land at once", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({
      ...BASE,
      artistImageUrl: "https://example.com/artist.jpg",
      coverArtUrl: "https://example.com/late-art.jpg",
      topArtists: ["Turnover", "Citizen"],
    });
    await Promise.resolve();

    expect(generationCount()).toBe(1);
  });

  // The reader must keep what they were reading.
  it("keeps the facts on screen when enrichment lands", async () => {
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.nuggets.length).toBe(1));

    rerender({ ...BASE, artistImageUrl: "https://example.com/artist.jpg" });
    await Promise.resolve();

    expect(result.current.nuggets).toHaveLength(1);
    expect(result.current.nuggets[0].id).toBe("n-1");
  });

  // ── The other direction ─────────────────────────────────────────────
  // Excluding enrichment must not make the hook inert. These guard
  // against "fixing" the regression by never regenerating at all.

  it("DOES regenerate on a track change", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, trackId: "real::Turnover::Sunshine", title: "Sunshine Type" });
    await waitFor(() => expect(generationCount()).toBe(2));
  });

  it("DOES regenerate on a tier change", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, tier: "nerd" });
    await waitFor(() => expect(generationCount()).toBe(2));
  });

  it("DOES regenerate when regenerateKey bumps for a deeper listen", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, regenerateKey: 1 });
    await waitFor(() => expect(generationCount()).toBe(2));
  });

  it("DOES regenerate when the artist changes", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE, artist: "Citizen", trackId: "real::Citizen::Jet" });
    await waitFor(() => expect(generationCount()).toBe(2));
  });

  it("stays put across an unrelated re-render with identical inputs", async () => {
    const { rerender } = render();
    await waitFor(() => expect(generationCount()).toBe(1));

    rerender({ ...BASE });
    rerender({ ...BASE });
    await Promise.resolve();

    expect(generationCount()).toBe(1);
  });
});
