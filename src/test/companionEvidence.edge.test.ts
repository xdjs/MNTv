import { beforeEach, describe, expect, it, vi } from "vitest";
import { evidence } from "./factEvidenceFixture";
const mocks = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), rows: {} as Record<string, unknown>, rpc: vi.fn(), getUser: vi.fn(), verify: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (h: typeof mocks.handler) => { mocks.handler = h; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({ createClient: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser }, from: (table: string) => {
  let key = "";
  const q = { select: () => q, eq: (field: string, value: string) => { if (field === "track_key" || field === "track_id") key = value; return q; }, like: (_field: string, pattern: string) => { key = pattern; return q; }, then: (resolve: (value: { data: unknown }) => unknown) => Promise.resolve(resolve({ data: mocks.rows[`${table}:${key}`] ?? null })), in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: mocks.rows[`${table}:${key}`] ?? null }), delete: () => { mocks.remove(); return { in: async () => ({}) }; }, upsert: mocks.upsert };
  return q;
} }) }));
vi.mock("../../supabase/functions/_shared/verifyFactSources.ts", () => ({ verifyFactSources: mocks.verify }));
beforeEach(async () => {
  mocks.rows = {}; mocks.rpc.mockReset(); mocks.rpc.mockResolvedValue({ data: true, error: null }); mocks.getUser.mockReset(); mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); vi.resetModules(); mocks.verify.mockReset(); mocks.upsert.mockReset().mockResolvedValue({ error: null }); mocks.remove.mockReset();
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

it.each([{ data: false, error: null, status: 429 }, { data: null, error: { message: "unavailable" }, status: 503 }])("fails closed before paid calls when quota rejects or is unavailable", async ({ data, error, status }) => {
  mocks.rpc.mockResolvedValue({ data, error });
  const response = await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer session" }, body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [saved] }) }));
  expect(response.status).toBe(status);
  expect(mocks.rpc).toHaveBeenCalledWith("consume_companion_verification_quota", { caller_id: "user" });
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("recovers supported facts from the canonical recording key for a legacy QR link", async () => {
  mocks.rows["companion_cache:"] = { content: { nuggets: [saved] }, listen_count_tier: 3 };
  mocks.rows["nugget_cache:real::Artist::Song::::%::casual"] = [{ status: "ready", nuggets: [{ ...saved, source: { url: saved.sourceUrl, citation: supported.citation } }] }];
  const response = await mocks.handler!(new Request("https://test", { method: "POST", body: JSON.stringify({ artist: "Artist", title: "Song" }) }));
  expect((await response.json()).nuggets.map((n: { id: string }) => n.id)).toEqual(["saved"]);
});
it("bounds the paid verification batch even when the client sends accumulated history", async () => {
  mocks.verify.mockResolvedValue([]);
  await mocks.handler!(new Request("https://test", { method: "POST", headers: { Authorization: "Bearer session" }, body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [...Array.from({ length: 30 }, () => saved), { ...saved, text: "x".repeat(2001) }] }) }));
  expect(mocks.verify.mock.calls[0][0]).toHaveLength(9);
  expect(mocks.verify.mock.calls[0][1].maxDocumentCharacters).toBe(4000);
});
it("escapes wildcard characters in canonical artist/title lookups", async () => {
  mocks.rows[String.raw`nugget_cache:real::Artist\_100\%::Song::::%::casual`] = [{ status: "ready", nuggets: [{ ...saved, source: { url: saved.sourceUrl, citation: supported.citation } }] }];
  const response = await mocks.handler!(new Request("https://test", { method: "POST", body: JSON.stringify({ artist: "Artist_100%", title: "Song" }) }));
  expect((await response.json()).nuggets).toHaveLength(1);
});
it('returns a retryable error when verified companion persistence fails', async () => {
  mocks.verify.mockResolvedValue([{ ...saved, source: { url: saved.sourceUrl, citation: supported.citation } }]);
  mocks.upsert.mockResolvedValue({ error: { message: 'database write failed' } });
  const response = await mocks.handler!(new Request('https://test', { method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ artist: 'Artist', title: 'Song', prebuiltNuggets: [saved] }) }));
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty('nuggets');
  expect(mocks.remove).not.toHaveBeenCalled();
});
