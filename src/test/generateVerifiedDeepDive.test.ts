import { afterEach, expect, it, vi } from "vitest";
import { generateVerifiedDeepDive } from "../../supabase/functions/_shared/generateVerifiedDeepDive";
const url = "https://example.com/article";
const text = "The artist recorded this entire album live in a single afternoon.";
afterEach(() => vi.unstubAllGlobals());
it("grounds the writer and verifier in the same exact source without search", async () => {
  vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ url, text, title: "Article" }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text }) }] } }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ checks: [{ index: 0, supported: true, excerpt: text }] }) }] } }] })));
  vi.stubGlobal("fetch", fetcher);
  const result = await generateVerifiedDeepDive({ artist: "Artist", title: "Track", context: "Earlier fact", sourceUrl: url, googleKey: "test", exaKey: "test" });
  expect(result.source?.url).toBe(url);
  expect(result.text).toBe(text);
  const writer = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(writer.tools).toBeUndefined();
  expect(writer.contents[0].parts[0].text).toContain(text);
  expect(JSON.parse(fetcher.mock.calls[2][1].body).contents[0].parts[0].text).toContain(text);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("withholds a deep dive when the selected document cannot be retrieved", async () => {
  vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ url: "https://other.example", text }] })));
  vi.stubGlobal("fetch", fetcher);
  const result = await generateVerifiedDeepDive({ artist: "Artist", title: "Track", context: "Earlier fact", sourceUrl: url, googleKey: "test", exaKey: "test" });
  expect(result.source).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
