import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";
import { isReadableUpdate } from "@/lib/artistUpdateKind";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { useArtistLatestFacts } from "@/hooks/useArtistLatestFacts";
import { supabase } from "@/integrations/supabase/client";

const base = {
  artistId: "a1",
  artistName: "BADBADNOTGOOD",
  artistImageUrl: "https://i.scdn.co/image/abc",
};

const FACT: ArtistUpdate = {
  ...base,
  kind: "fact",
  headline: "BADBADNOTGOOD started their collaboration with Kaytranada.",
  body: "Alex Sowinski noted Kaytranada, whom the band met on tour.",
  nuggetId: "fact-1",
};

// What the edge function actually builds for Browse's play targets:
// track name as headline, empty body (artist-updates/index.ts:381).
const TRACK: ArtistUpdate = {
  ...base,
  kind: "track",
  headline: "Time Moves Slow",
  body: "",
  relatedTrackUri: "spotify:track:xyz",
  relatedTrackTitle: "Time Moves Slow",
  nuggetId: "track-spotify:track:xyz",
};

describe("isReadableUpdate", () => {
  it("keeps a fact that has a body", () => {
    expect(isReadableUpdate(FACT)).toBe(true);
  });

  it("drops a catalog track", () => {
    expect(isReadableUpdate(TRACK)).toBe(false);
  });

  // The kind is the rule, not just the empty body — a track is a play
  // target regardless of what the server puts in it.
  it("drops a track even if it somehow carries a body", () => {
    expect(isReadableUpdate({ ...TRACK, body: "A song about something." })).toBe(false);
  });

  it("keeps a new release with a body", () => {
    expect(isReadableUpdate({ ...FACT, kind: "new-release" })).toBe(true);
  });

  it("keeps a collab with a body", () => {
    expect(isReadableUpdate({ ...FACT, kind: "collab" })).toBe(true);
  });

  // An empty-bodied fact would render exactly as broken as a track tile.
  it("drops an empty-bodied fact", () => {
    expect(isReadableUpdate({ ...FACT, body: "" })).toBe(false);
  });

  it("drops a whitespace-only body", () => {
    expect(isReadableUpdate({ ...FACT, body: "   \n  " })).toBe(false);
  });
});

// ── The wiring ────────────────────────────────────────────────────────
// The predicate passing proves nothing on its own; the bug was that
// nothing called it. These pin that the hook feeding "Latest Facts"
// actually applies it.
describe("useArtistLatestFacts — what reaches Latest Facts", () => {
  const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

  beforeEach(() => invoke.mockReset());

  it("hands the section only readable updates", async () => {
    invoke.mockResolvedValue({ data: { updates: [FACT, TRACK, TRACK] }, error: null });

    const { result } = renderHook(() => useArtistLatestFacts("BADBADNOTGOOD", "nerd"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.updates).toEqual([FACT]);
  });

  it("leaves the section empty rather than showing bare tiles", async () => {
    invoke.mockResolvedValue({ data: { updates: [TRACK, TRACK, TRACK] }, error: null });

    const { result } = renderHook(() => useArtistLatestFacts("BADBADNOTGOOD", "nerd"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    // LatestFactsSection renders nothing at all when this is empty,
    // which is the right outcome — better than a heading over tiles.
    expect(result.current.updates).toEqual([]);
  });

  it("keeps every fact when the server sends no tracks", async () => {
    const second = { ...FACT, nuggetId: "fact-2", headline: "A second fact." };
    invoke.mockResolvedValue({ data: { updates: [FACT, second] }, error: null });

    const { result } = renderHook(() => useArtistLatestFacts("BADBADNOTGOOD", "nerd"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.updates).toHaveLength(2);
  });
});
