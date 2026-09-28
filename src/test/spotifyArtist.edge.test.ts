import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import ArtistProfile from "@/pages/ArtistProfile";

const mocks = vi.hoisted(() => ({ handler: null as null | ((req: Request) => Promise<Response>), upsert: vi.fn(), cached: null as unknown }));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (handler: typeof mocks.handler) => { mocks.handler = handler; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({ createClient: () => ({ from: () => {
  const chain = { select: () => chain, eq: () => chain, neq: () => chain, order: () => chain,
    single: async () => ({ data: mocks.cached }), limit: async () => ({ data: [] }), upsert: mocks.upsert };
  return chain;
} }) }));
vi.mock("../../supabase/functions/_shared/spotify-token.ts", () => ({ getSpotifyAppToken: async () => "test-token", clearSpotifyAppToken: vi.fn() }));
vi.mock("../../supabase/functions/_shared/apple-token.ts", () => ({ getAppleDeveloperToken: vi.fn() }));

// Exercise the real page -> function -> page contract entirely locally.
// Only external services and unrelated artist enrichment are mocked.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async (name: string, options: { body: object }) => {
    if (name !== "spotify-artist") throw new Error(`Unexpected function: ${name}`);
    const response = await mocks.handler!(new Request("https://local.test", {
      method: "POST", body: JSON.stringify(options.body),
    }));
    return response.ok
      ? { data: await response.json(), error: null }
      : { data: null, error: new Error(`Function returned ${response.status}`) };
  } } },
}));
vi.mock("@/hooks/useMusicNerdState", () => ({ useUserProfile: () => ({ profile: null }) }));
vi.mock("@/hooks/useArtistImage", () => ({ useArtistImage: () => null }));
vi.mock("@/hooks/useArtistLatestFacts", () => ({
  useArtistLatestFacts: () => ({ updates: [], loading: false }),
}));

const artist = { id: "5INjqkS1o8h1imAzPqGZBb", name: "Tame Impala", genres: [] };
const song = { name: "The Less I Know The Better", uri: "spotify:track:test", artists: [artist], album: { name: "Currents" }, duration_ms: 200000 };
let responses: (path: string) => Response;
beforeEach(async () => {
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => responses(url.replace("https://api.spotify.com/v1", ""))));
  mocks.cached = null;
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  responses = (path) => {
    if (path.startsWith("/search?type=artist")) return Response.json({ artists: { items: [artist] } });
    if (path.startsWith("/search?type=track")) return Response.json({ tracks: { items: [song, { ...song, uri: "spotify:track:wrong", artists: [{ id: "wrong" }] }] } });
    return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
  };
  const modulePath = "../../supabase/functions/spotify-artist/index.ts";
  await import(modulePath);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function request(body: object) {
  return mocks.handler!(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }));
}
describe("Spotify artist backend", () => {
  it("recovers a direct artist lookup from search without accepting a different ID", async () => {
    const res = await request({ artistId: artist.id, artistName: artist.name });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.artist?.id).toBe(artist.id);
    expect(data.topTracks.map((t: { title: string }) => t.title)).toEqual([song.name]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("does not turn upstream failures into not-found", async () => {
    responses = () => Response.json({ error: { message: "Rate limited" } }, { status: 429 });
    const res = await request({ artistName: artist.name });
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty("found", false);
  });
});

it("does not recover a forbidden lookup with a different artist's search result", async () => {
  const res = await request({ artistId: "other-id", artistName: artist.name });
  expect(res.status).toBe(503);
});
it("returns genuine not-found for a missing ID", async () => {
  responses = () => Response.json({}, { status: 404 });
  const res = await request({ artistId: "missing" });
  expect(await res.json()).toEqual({ found: false });
});
it("bypasses legacy cached empty catalogs and fetches songs again", async () => {
  mocks.cached = { created_at: new Date().toISOString(), data: { found: true, artist, topTracks: [], albums: [] } };
  const res = await request({ artistName: artist.name });
  expect((await res.json()).topTracks).toHaveLength(1);
});
it("keeps actual Spotify top tracks in their provided order and caches complete results", async () => {
  responses = (path) => {
    if (path.includes("top-tracks")) return Response.json({ tracks: [song] });
    if (path.includes("/albums")) return Response.json({ items: [] });
    if (path.includes("related-artists")) return Response.json({ artists: [] });
    return Response.json(artist);
  };
  const res = await request({ artistId: artist.id });
  const data = await res.json();
  expect(data.tracksSource).toBe("top-tracks");
  expect(data.topTracks[0].title).toBe(song.name);
  expect(mocks.upsert).toHaveBeenCalledOnce();
});
it("reports unavailable songs and does not cache when all catalog requests fail", async () => {
  responses = (path) => path.startsWith("/artists/") && !path.includes("?market") && !path.includes("albums") && !path.includes("related-artists")
    ? Response.json(artist) : Response.json({}, { status: 503 });
  const data = await (await request({ artistId: artist.id })).json();
  expect(data.found).toBe(true);
  expect(data.tracksUnavailable).toBe(true);
  expect(mocks.upsert).not.toHaveBeenCalled();
});

function ListenDestination() {
  return createElement("output", { "data-testid": "listen-destination" }, useLocation().pathname);
}
function renderArtistPage(path: string) {
  return render(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null,
      createElement(Route, { path: "/artist/:artistId", element: createElement(ArtistProfile) }),
      createElement(Route, { path: "/listen/*", element: createElement(ListenDestination) }),
    ),
  ));
}

describe("local artist-page integration (mock Spotify, real page and edge handler)", () => {
  it.each([
    { id: "5INjqkS1o8h1imAzPqGZBb", name: "Tame Impala" },
    { id: "6KzA7YJ7DBDzaQMT9eq0xR", name: "Dame Atlas" },
  ])("$name: recovers lookup, renders songs, and navigates to the correct playback URI", async (fixture) => {
    const fixtureArtist = { ...fixture, genres: [] };
    const fixtureSong = { ...song, artists: [fixtureArtist], name: "Local fixture song", uri: `spotify:track:fixture-${fixture.id}` };
    responses = (path) => {
      if (path.startsWith("/search?type=artist")) return Response.json({ artists: { items: [fixtureArtist] } });
      if (path.startsWith("/search?type=track")) return Response.json({ tracks: { items: [fixtureSong] } });
      return Response.json({}, { status: 403 });
    };
    renderArtistPage(`/artist/spotify::${fixture.id}::${encodeURIComponent(fixture.name)}`);
    expect(await screen.findByRole("heading", { name: fixture.name })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Songs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Local fixture song/ }));
    const destination = await screen.findByTestId("listen-destination");
    expect(destination.textContent).toBe(`/listen/real::${encodeURIComponent(fixture.name)}::Local%20fixture%20song::Currents::${encodeURIComponent(fixtureSong.uri)}`);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("renders service failure instead of a false missing-artist message", async () => {
    responses = () => Response.json({}, { status: 429 });
    renderArtistPage("/artist/real::Tame%20Impala");
    expect(await screen.findByText("Spotify artist data is temporarily unavailable. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't find this artist on Spotify.")).not.toBeInTheDocument();
  });
});
it("keeps the primary artist separate from collaboration credits in search fallback", async () => {
  const prior = responses;
  responses = path => path.startsWith("/search?type=track")
    ? Response.json({ tracks: { items: [{ ...song, artists: [artist, { id: "featured", name: "Featured" }] }] } })
    : prior(path);
  const data = await (await request({ artistId: artist.id, artistName: artist.name })).json();
  expect(data.topTracks[0].artist).toBe(artist.name);
  expect(data.topTracks[0].artistId).toBe(artist.id);
  expect(data.topTracks[0].collaborators).toEqual(["Featured"]);
});
it("refreshes catalogs cached before primary-artist credits were separated", async () => {
  mocks.cached = { created_at: new Date().toISOString(), data: { catalogVersion: 2, found: true, artist, topTracks: [{ ...song, artist: "Tame Impala, Featured" }] } };
  const data = await (await request({ artistName: artist.name })).json();
  expect(data.catalogVersion).toBe(3);
  expect(data.topTracks[0].artist).toBe(artist.name);
});
