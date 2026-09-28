import { evidence } from "./factEvidenceFixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { selectUpdateArtist } from "../../supabase/functions/_shared/selectUpdateArtist";
import { buildArtistUpdatesCacheKey } from "@/lib/artistFactToNugget";
import { useArtistUpdates } from "@/hooks/useArtistUpdates";
import { useArtistLatestFacts } from "@/hooks/useArtistLatestFacts";
import type { UserProfile } from "@/mock/types";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const id = "62jLhwXSHpY3qoNybvyemr";
const wrongId = "5INjqkS1o8h1imAzPqGZBb";
const profile = { streamingService: "Spotify", topArtists: ["LIL LIL"], artistIds: { "LIL LIL": id } } as unknown as UserProfile;
const fact = { artistId: id, artistName: "LIL LIL", kind: "fact", headline: "Correct artist", body: "Fact" };

const update = { ...fact, source: { type: "article", url: "https://example.com/artist", citation: evidence(fact, "https://example.com/artist") } };

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); invoke.mockReset();
  invoke.mockResolvedValue({ data: { updates: [update] }, error: null });
});

describe("artist identity", () => {
  it("selects the saved ID despite casing, order, and a more popular namesake", () => {
    const candidates = [{ id: wrongId, name: "Lil Lil", followers: { total: 9000 } }, { id, name: "LIL LIL", followers: { total: 1 } }];
    expect(selectUpdateArtist(candidates, "LIL LIL", id)?.id).toBe(id);
    expect(selectUpdateArtist(candidates, "LIL LIL")).toBeNull();
    expect(selectUpdateArtist(candidates.slice(0, 1), "LIL LIL", id)).toBeNull();
  });
  it("isolates same-name artists' caches and ignores display-name casing for a known ID", () => {
    expect(buildArtistUpdatesCacheKey("LIL LIL", "casual", id)).not.toBe(buildArtistUpdatesCacheKey("Lil Lil", "casual", wrongId));
    expect(buildArtistUpdatesCacheKey("LIL LIL", "casual", id)).toBe(buildArtistUpdatesCacheKey("Lil Lil", "casual", id));
    expect(buildArtistUpdatesCacheKey("LIL LIL", "casual", id)).not.toBe(buildArtistUpdatesCacheKey("LIL LIL", "casual"));
  });
  it("sends the profile Spotify ID when fetching Lately", async () => {
    const { result } = renderHook(() => useArtistUpdates(profile, { tier: "casual" }));
    await waitFor(() => expect(result.current.readyCount).toBe(1));
    expect(invoke).toHaveBeenCalledWith("artist-updates", { body: { artist: "LIL LIL", tier: "casual", spotifyArtistId: id } });
    expect(result.current.groups[0].updates).toEqual([update]);
  });
  it("rejects a wrong-artist response from an old backend or cache", async () => {
    invoke.mockResolvedValue({ data: { updates: [{ ...update, artistId: wrongId }] }, error: null });
    const { result } = renderHook(() => useArtistUpdates(profile, { tier: "casual" }));
    await waitFor(() => expect(result.current.readyCount).toBe(1));
    expect(result.current.groups[0].updates).toEqual([]);
  });
  it("refetches if the saved ID changes without a name change", async () => {
    const { result, rerender } = renderHook(({ selected }) => useArtistUpdates(selected, { tier: "casual" }), { initialProps: { selected: profile } });
    await waitFor(() => expect(result.current.readyCount).toBe(1));
    rerender({ selected: { ...profile, artistIds: { "LIL LIL": wrongId } } });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][1].body.spotifyArtistId).toBe(wrongId);
  });
  it("keeps artist-profile facts scoped to the route's Spotify ID", async () => {
    invoke.mockResolvedValue({ data: { updates: [update, { ...update, artistId: wrongId }] }, error: null });
    const { result } = renderHook(() => useArtistLatestFacts("LIL LIL", "casual", id));
    await waitFor(() => expect(result.current.updates).toEqual([update]));
    expect(invoke.mock.calls[0][1].body.spotifyArtistId).toBe(id);
  });
  it("does not send Apple catalog IDs as Spotify IDs", async () => {
    const { result } = renderHook(() => useArtistUpdates({ ...profile, streamingService: "Apple Music", artistIds: { "LIL LIL": "123456" } }, { tier: "casual" }));
    await waitFor(() => expect(result.current.readyCount).toBe(1));
    expect(invoke.mock.calls[0][1].body).toEqual({ artist: "LIL LIL", tier: "casual", service: "apple", storefront: "us", artistId: "123456" });
    expect(result.current.groups[0].updates).toEqual([]);
  });
});
