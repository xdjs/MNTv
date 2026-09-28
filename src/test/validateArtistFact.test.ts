import { expect, it } from "vitest";
import { validateArtistFact } from "../../supabase/functions/_shared/validateArtistFact";
const evidence = "doggone signed with Primary Talent International in March 2026, with Matt Pickering-Copley as primary agent.";
const sources = [
  { title: "William - Spotify", url: "https://open.spotify.com/track/song", text: "William is a song by doggone on Spotify." },
  { title: "Agency signing", url: "https://example.com/news/signing", text: evidence },
];
const fact = { headline: "doggone signed with Primary Talent", body: evidence, sourceNumber: 2, evidence };
it("links the fact to its selected supporting article, not the first result", () => {
  expect(validateArtistFact(fact, sources)?.citation.url).toBe(sources[1].url);
});
it("rejects evidence taken from a different source", () => {
  expect(validateArtistFact({ ...fact, sourceNumber: 1 }, sources)).toBeNull();
});
it("rejects invented evidence, missing attribution and invalid source numbers", () => {
  expect(validateArtistFact({ ...fact, evidence: "This artist signed with a totally different agency in 2020." }, sources)).toBeNull();
  expect(validateArtistFact({ headline: fact.headline, body: fact.body }, sources)).toBeNull();
  expect(validateArtistFact({ ...fact, sourceNumber: 9 }, sources)).toBeNull();
});
it("does not accept catalog pages as evidence for editorial facts", () => {
  expect(validateArtistFact({ ...fact, sourceNumber: 1 }, [{ ...sources[0], text: evidence }])).toBeNull();
});
