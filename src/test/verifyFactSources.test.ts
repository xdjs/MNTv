import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { verifyFactSources } from "../../supabase/functions/_shared/verifyFactSources";
import { hasFactEvidence } from "../../supabase/functions/_shared/hasFactEvidence";
const url = "https://agency.example/news/doggone";
const excerpt = "doggone signed with Primary Talent International in March 2026.";
const fact = { headline: "doggone signs with Primary Talent", text: excerpt, source: { url } };
const page = { url, title: "Agency announcement", text: excerpt };
const reply = (checks: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ checks }) }] } }] }));
beforeEach(() => vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal }));
afterEach(() => vi.unstubAllGlobals());
describe("source evidence", () => {
  it("binds support to the exact headline, body, source URL and retrieved passage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([{ index: 0, supported: true, excerpt }])));
    const [verified] = await verifyFactSources([fact], { googleKey: "test", pages: [page] });
    expect(hasFactEvidence(verified, verified.source)).toBe(true);
    expect(verified.source.title).toBe(page.title);
    expect(hasFactEvidence({ ...verified, text: "A different claim" }, verified.source)).toBe(false);
    expect(hasFactEvidence({ ...verified, headline: "A different headline" }, verified.source)).toBe(false);
    expect(hasFactEvidence(verified, { ...verified.source, url: "https://wrong.example" })).toBe(false);
    expect(hasFactEvidence(fact, { url, verified: true })).toBe(false);
  });
  it.each([
    { index: 0, supported: false, excerpt },
    { index: 0, supported: true, excerpt: "An invented quotation which does not appear anywhere in the actual source." },
    { index: 7, supported: true, excerpt },
    { index: 0, supported: true, excerpt: "too short" },
  ])("withholds unsupported or fabricated evidence: %j", async check => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([check])));
    expect(await verifyFactSources([fact], { googleKey: "test", pages: [page] })).toEqual([]);
  });
  it("does not treat a Spotify song page as support for an editorial claim", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await verifyFactSources([{ ...fact, source: { url: "https://open.spotify.com/track/William" } }], { googleKey: "test" })).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fetches the selected URL rather than guessing another search result", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ results: [page] })))
      .mockResolvedValueOnce(reply([{ index: 0, supported: true, excerpt }]));
    vi.stubGlobal("fetch", fetcher);
    expect(await verifyFactSources([fact], { googleKey: "test", exaKey: "test" })).toHaveLength(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).ids).toEqual([url]);
  });
  it("rejects content returned for a different URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ ...page, url: "https://other.example" }] })));
    vi.stubGlobal("fetch", fetcher);
    expect(await verifyFactSources([fact], { googleKey: "test", exaKey: "test" })).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("fails closed on missing credentials, network failure or malformed output", async () => {
    expect(await verifyFactSources([fact], { pages: [page] })).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await verifyFactSources([fact], { googleKey: "test", pages: [page] })).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")));
    expect(await verifyFactSources([fact], { googleKey: "test", pages: [page] })).toEqual([]);
  });
});
it("does not start verification after the shared deadline", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await verifyFactSources([fact], { googleKey: "test", pages: [page], deadline: Date.now() - 1 })).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
it("caps each request to remaining shared time and skips verification when retrieval exhausts it", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  const timeout = vi.fn(() => new AbortController().signal);
  vi.stubGlobal("AbortSignal", { timeout });
  const fetcher = vi.fn().mockImplementation(async () => { clock.mockReturnValue(3000); return new Response(JSON.stringify({ results: [page] })); });
  vi.stubGlobal("fetch", fetcher);
  expect(await verifyFactSources([fact], { googleKey: "test", exaKey: "test", deadline: 2500 })).toEqual([]);
  expect(timeout).toHaveBeenCalledWith(1500);
  expect(fetcher).toHaveBeenCalledTimes(1);
  clock.mockRestore();
});
it("bounds retrieved and verifier document sizes for companion submissions", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ ...page, text: "x".repeat(10000) }] })))
    .mockResolvedValueOnce(reply([]));
  vi.stubGlobal("fetch", fetcher);
  await verifyFactSources([fact], { googleKey: "test", exaKey: "test", maxDocumentCharacters: 4000 });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).text.maxCharacters).toBe(4000);
  const prompt = JSON.parse(fetcher.mock.calls[1][1].body).contents[0].parts[0].text;
  expect(prompt).toContain("x".repeat(4000));
  expect(prompt).not.toContain("x".repeat(4001));
});
