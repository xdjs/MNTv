import { expect, it } from "vitest";
import { matchesArtistResearch } from "../../supabase/functions/_shared/matchesArtistResearch";
const identity = { id: "62jLhwXSHpY3qoNybvyemr", name: "LIL LIL", service: "spotify" as const, titles: ["BLACK PETAL ROSES", "ROUND N ROUND"] };
it("rejects the observed same-name research despite matching capitalization", () => {
  expect(matchesArtistResearch({ text: "LIL LIL made Fotzelicious with Kleptos, inspired by Fergalicious." }, identity)).toBe(false);
});
it("accepts research tying the artist to their actual catalog", () => {
  expect(matchesArtistResearch({ text: "Lil Lil discusses BLACK PETAL ROSES." }, identity)).toBe(true);
});
it("does not allow one source's identity evidence to validate another source", () => {
  const sources = [{ text: "LIL LIL discusses Black Petal Roses" }, { text: "Lil Lil discusses Fotzelicious" }];
  expect(sources.filter(s => matchesArtistResearch(s, identity))).toEqual([sources[0]]);
});
it("requires exact provider URL identity and rejects lookalike hosts", () => {
  expect(matchesArtistResearch({ text: "LIL LIL", url: `https://open.spotify.com/artist/${identity.id}` }, identity)).toBe(true);
  expect(matchesArtistResearch({ text: "LIL LIL", url: `https://open.spotify.com.evil.test/artist/${identity.id}` }, identity)).toBe(false);
});
