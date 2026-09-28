import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handler: null as null | ((req: Request) => Promise<Response>) }));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (handler: typeof mocks.handler) => { mocks.handler = handler; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({ createClient: vi.fn() }));
vi.mock("../../supabase/functions/_shared/spotify-token.ts", () => ({ getSpotifyAppToken: async () => "test" }));
afterEach(() => vi.unstubAllGlobals());
it("keeps the exact artist's songs but never generates facts from namesake research", async () => {
  const artist = { id: "62jLhwXSHpY3qoNybvyemr", name: "LIL LIL" };
  vi.stubGlobal("Deno", { env: { get: (key: string) => ["EXA_API_KEY", "GOOGLE_AI_API_KEY"].includes(key) ? "test" : undefined } });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requests.push(url);
    if (url.endsWith(`/artists/${artist.id}`)) return Response.json(artist);
    if (url.includes("top-tracks")) return Response.json({ tracks: [{ name: "BLACK PETAL ROSES", uri: "spotify:track:correct", album: { name: "Album" } }] });
    if (url.includes("/albums?")) return Response.json({ items: [] });
    if (url.includes("exa.ai")) return Response.json({ results: [{ title: "Lil Lil interview", text: "Lil Lil made Fotzelicious with Kleptos.", url: "https://example.com/interview" }] });
    throw new Error(`Unexpected request: ${url}`);
  }));
  const path = "../../supabase/functions/artist-updates/index.ts";
  await import(path);
  const res = await mocks.handler!(new Request("https://example.test", { method: "POST", body: JSON.stringify({ artist: artist.name, spotifyArtistId: artist.id }) }));
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data.updates).toHaveLength(1);
  expect(data.updates[0]).toMatchObject({ artistId: artist.id, kind: "track", relatedTrackUri: "spotify:track:correct" });
  expect(requests.some((url) => url.includes("googleapis"))).toBe(false);
  expect(requests.some((url) => url.includes("type=artist"))).toBe(false);
});
