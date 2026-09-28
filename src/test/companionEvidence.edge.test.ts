import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), verify: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({ serve: (h: typeof mocks.handler) => { mocks.handler = h; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({ createClient: () => ({ from: () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), delete: () => { mocks.remove(); return { in: async () => ({}) }; }, upsert: mocks.upsert };
  return q;
} }) }));
vi.mock("../../supabase/functions/_shared/verifyFactSources.ts", () => ({ verifyFactSources: mocks.verify }));
beforeEach(async () => {
  vi.resetModules(); mocks.verify.mockReset(); mocks.upsert.mockReset(); mocks.remove.mockReset();
  vi.stubGlobal("Deno", { env: { get: () => "test" } });
  const path = "../../supabase/functions/generate-companion/index.ts";
  await import(path);
});
describe("companion evidence writes", () => {
  it("preserves existing content when an incoming submission cannot be verified", async () => {
    mocks.verify.mockResolvedValue([]);
    const response = await mocks.handler!(new Request("https://test", { method: "POST", body: JSON.stringify({ artist: "Artist", title: "Song", prebuiltNuggets: [{ headline: "A claim", text: "A body", sourceUrl: "https://example.com" }] }) }));
    expect(response.status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
