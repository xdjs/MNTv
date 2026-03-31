import { describe, it, expect } from "vitest";
import teasePatternStrings from "../../shared/tease-headline-patterns.json";

// Shared source of truth — same JSON imported by the edge function (Deno) and tests (Vitest).
const TEASE_HEADLINE_PATTERNS = teasePatternStrings.map(
  (s: string) => new RegExp(s, "i")
);

function isTease(headline: string): boolean {
  return TEASE_HEADLINE_PATTERNS.some((pat) => pat.test(headline));
}

describe("TEASE_HEADLINE_PATTERNS", () => {
  describe("should flag tease headlines", () => {
    const teaseHeadlines = [
      "the secret behind the robot voice on this track",
      "The Secret Of Daft Punk's helmets",
      "the reason behind Radiohead's pay-what-you-want model",
      "the reason why Kendrick changed his name",
      "what happened when Billie walked into the studio",
      "you won't believe who almost sang this",
      "you won\u2019t believe where this was recorded",
      "the surprising truth about this collaboration",
      "the real reason the album was delayed",
      "what really happened at the recording session",
      "the hidden meaning in this track",
      "the hidden truth about the lyrics",
      "why nobody knows about this collaboration",
      "why nobody talks about this album",
      "the untold story of the making of this record",
      "the untold truth about Pete Rango's early career",
      "how the band really started their career",
      "how this track actually began as a joke",
      "what most people don't know about this beat",
      "what most fans don\u2019t know about Kendrick",
      "the story behind the making of this track",
      "the story of Daft Punk's robot personas",
      "the truth about Kendrick's writing process",
      "the mystery behind Daft Punk's helmets",
      "the mystery of the missing vocal take",
      "find out why this track was almost scrapped",
      "find out how Billie recorded this at home",
    ];

    for (const headline of teaseHeadlines) {
      it(`flags: "${headline}"`, () => {
        expect(isTease(headline)).toBe(true);
      });
    }
  });

  describe("should pass fact-first headlines", () => {
    const goodHeadlines = [
      "Daft Punk used a talk box, not a vocoder, for the robot voice on this",
      "this beat was originally made for Gucci Mane",
      "Radiohead first played this as an orchestral piece in 2005",
      "Billie Eilish recorded this entire album in her brother's bedroom",
      "Kendrick Lamar's cousin Baby Keem was a key collaborator on DAMN.",
      "Pete Rango's family fled Colombia due to guerrilla persecution",
      "the iconic piano beat was mixed on a JVC boombox from 1986",
      "Jamee Cornelia ran a punk band for four years before going solo",
      "how Daft Punk's Thomas Bangalter co-created Stardust",
      "the guitar riff came from a 4-track demo recorded in 1997",
    ];

    for (const headline of goodHeadlines) {
      it(`passes: "${headline}"`, () => {
        expect(isTease(headline)).toBe(false);
      });
    }
  });

  describe("edge cases", () => {
    it("does not flag 'how' without really/actually", () => {
      expect(isTease("how Daft Punk built their helmets")).toBe(false);
    });

    it("handles smart quotes in won\u2019t", () => {
      expect(isTease("you won\u2019t believe this")).toBe(true);
    });

    it("handles straight quotes in won't", () => {
      expect(isTease("you won't believe this")).toBe(true);
    });

    it("is case insensitive", () => {
      expect(isTease("THE SECRET BEHIND THE BEAT")).toBe(true);
      expect(isTease("The Hidden Meaning In This Track")).toBe(true);
    });

    it("does not flag 'the secret' mid-sentence", () => {
      expect(isTease("Daft Punk kept the secret behind their masks for years")).toBe(false);
    });
  });
});
