import { beforeEach, describe, expect, it, vi } from "vitest";
import { evidence } from "./factEvidenceFixture";
const mocks = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), rows: {} as Record<string, Record<string, unknown>>, getUser: vi.fn(), verify: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (h: typeof mocks.handler) => { mocks.handler = h; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, from: (table: string) => {
  let key = "";
  const q = { select: () => q, eq: (field: string, value: string) => { if (field === "track_key" || field === "track_id") key = value; return q; }, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: mocks.rows[`${table}:${key}`] ?? null }), delete: () => { mocks.remove(); return { in: async () => ({}) }; }, upsert: mocks.upsert };
  return q;
} }) }));
vi.mock("../../supabase/functions/_shared/verifyFactSources.ts", () => ({ verifyFactSources: mocks.verify }));
beforeEach(async () => {
  mocks.rows = {}; mocks.getUser.mockReset(); mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); vi.resetModules(); mocks.verify.mockReset(); mocks.upsert.mockReset(); mocks.remove.mockReset();
  vi.stubGlobal("Deno", { env: { get: () => "test" } });
  const path = "../../supabase/functions/generate-companion/index.ts";
  await import(path);
});
describe("companion evidence writes", () => {
  it("preserves existing content when an incoming submission cannot be verified", async () => {
    mocks.verify.mockResolvedValue([]);
    const response = await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer test-session" }, body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [{ headline: "A claim", text: "A body", sourceUrl: "https://example.com" }] }) }));
    expect(response.status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

const saved = { id: "saved", headline: "Saved", text: "Verified saved fact", sourceUrl: "https://example.com/source" };
const supported = { ...saved, citation: evidence(saved, saved.sourceUrl) };
it("retains same-tier verified facts after partial revalidation", async () => {
  mocks.rows["companion_cache:Artist::Song::casual::1"] = { content: { nuggets: [supported] } };
  const fresh = { id: "fresh", headline: "New", text: "New verified fact", sourceUrl: saved.sourceUrl };
  mocks.verify.mockResolvedValue([{ ...fresh, source: { url: fresh.sourceUrl, citation: evidence(fresh, fresh.sourceUrl) } }]);
  const response = await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer test-session" }, body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [fresh, saved] }) }));
  expect((await response.json()).nuggets.map((n: { id: string }) => n.id)).toEqual(["fresh", "saved"]);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("falls through legacy companion content to supported nugget cache", async () => {
  mocks.rows["companion_cache:"] = { content: { nuggets: [saved] }, listen_count_tier: 3 };
  mocks.rows["nugget_cache:Artist::Song::casual"] = { status: "ready", nuggets: [{ ...saved, source: { url: saved.sourceUrl, citation: supported.citation } }] };
  const response = await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer test-session" }, body: JSON.stringify({ artist: "Artist", title: "Song" }) }));
  expect((await response.json()).nuggets.map((n: { id: string }) => n.id)).toEqual(["saved"]);
});

it("updates the highest cached tier so a lower-tier submission remains visible", async () => {
  mocks.rows["companion_cache:Artist::Song::casual::3"] = { content: { nuggets: [supported] } };
  mocks.verify.mockResolvedValue([{ ...saved, source: { url: saved.sourceUrl, citation: supported.citation } }]);
  await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer test-session" }, body: JSON.stringify({ artist: "Artist", title: "Song", listenCount: 1, prebuiltNuggets: [saved] }) }));
  expect(mocks.upsert.mock.calls[0][0].listen_count_tier).toBe(3);
  expect(mocks.upsert.mock.calls[0][0].track_key).toBe("Artist::Song::casual::3");
});

it("rejects unauthenticated paid verification without touching providers or cache", async () => {
  const response = await mocks.handler!(new Request("https://test", { method: "POST", body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [saved] }) }));
  expect(response.status).toBe(401);
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("rejects invalid or public API-key bearer tokens", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  const response = await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer public-key" }, body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [saved] }) }));
  expect(response.status).toBe(401);
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("keeps QR cache reads public", async () => {
  const response = await mocks.handler!(new Request("https://test", { method: "POST", body: JSON.stringify({ artist: "Artist", title: "Song" }) }));
  expect(response.status).toBe(200);
  expect(mocks.getUser).not.toHaveBeenCalled();
});
