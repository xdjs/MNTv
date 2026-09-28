import { expect, it, vi } from "vitest";
import { evidence } from "./factEvidenceFixture";
import { persistStreamedNuggets } from "../../supabase/functions/_shared/persistStreamedNuggets";
const fact = { headline: "Verified", text: "A supported fact", kind: "artist" };
const source = { url: "https://example.com", citation: evidence(fact, "https://example.com") };
function client(data: unknown, error: unknown = null) {
  const upsert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }), upsert }) };
  return { db, upsert };
}
const options = { artist: "Artist", title: "Track", uri: "spotify:track:id", tier: "nerd", listenCount: 1, durationSec: 200, nuggets: [{ ...fact, source }] };
it("replaces a legacy ready row with canonical supported streamed facts", async () => {
  const { db, upsert } = client({ nuggets: [{ headline: "Legacy", text: "Unverified", sourceId: "old" }], sources: {} });
  await persistStreamedNuggets(db, options);
  expect(upsert.mock.calls[0][0].track_id).toBe("real::Artist::Track::::spotify:track:id::nerd");
  expect(upsert.mock.calls[0][0].nuggets).toHaveLength(1);
  expect(upsert.mock.calls[0][0].status).toBe("ready");
});
it("preserves supported earlier facts even on the first listen", async () => {
  const old = { id: "old", headline: "Earlier", text: "Earlier supported fact", sourceId: "old-source" };
  const { db, upsert } = client({ nuggets: [old], sources: { "old-source": { url: source.url, citation: evidence(old, source.url) } } });
  await persistStreamedNuggets(db, options);
  expect(upsert.mock.calls[0][0].nuggets).toHaveLength(2);
});
it("does not overwrite an unread cache or persist unsupported output", async () => {
  const { db, upsert } = client(null, { message: "unavailable" });
  await persistStreamedNuggets(db, options);
  await persistStreamedNuggets(db, { ...options, nuggets: [{ ...fact, source: { url: source.url } }] });
  expect(upsert).not.toHaveBeenCalled();
});
