import { describe, it, expect } from "vitest";
import { canonicalCacheKey } from "@/hooks/useAINuggets";

// canonicalCacheKey produces the lookup key the client uses to hit
// `nugget_cache`. The server writes its rows with raw (decoded) artist/
// title/uri values, so the client's read key must normalize URL-encoded
// inputs that come in via React Router params. Bug regression: tracks
// with spaces ("KIKI (feat. Pete Rango)") or `:` in URI used to
// cache-miss on every Listen mount and re-run the ~30s pipeline.
describe("canonicalCacheKey", () => {
  describe("real:: trackIds", () => {
    it("produces the expected format with album blanked + tier appended", () => {
      const key = canonicalCacheKey(
        "real::Cherele::KIKI::SOMEALBUM::spotify:track:abc123",
        "casual",
      );
      expect(key).toBe("real::Cherele::KIKI::::spotify:track:abc123::casual");
    });

    it("preserves URI colons (split is on `::` not `:`)", () => {
      const key = canonicalCacheKey(
        "real::Cherele::KIKI::::spotify:track:abc123",
        "curious",
      );
      expect(key).toContain("spotify:track:abc123");
    });
  });

  describe("URL-encoded chars in artist/title/uri", () => {
    it("decodes %20 in title (space)", () => {
      const key = canonicalCacheKey(
        "real::Cherele::KIKI%20(feat.%20Pete%20Rango)::::spotify:track:abc",
        "casual",
      );
      expect(key).toBe(
        "real::Cherele::KIKI (feat. Pete Rango)::::spotify:track:abc::casual",
      );
    });

    it("decodes %3A in URI (colon)", () => {
      const key = canonicalCacheKey(
        "real::Artist::Title::::spotify%3Atrack%3Aabc123",
        "casual",
      );
      expect(key).toBe("real::Artist::Title::::spotify:track:abc123::casual");
    });

    it("decodes special chars in artist (apostrophes, accents)", () => {
      const key = canonicalCacheKey(
        "real::Beyonc%C3%A9::Halo::::spotify:track:xyz",
        "casual",
      );
      expect(key).toBe("real::Beyoncé::Halo::::spotify:track:xyz::casual");
    });
  });

  describe("encoded delimiters (real%3A%3A)", () => {
    it("normalizes %3A%3A delimiters back to :: before splitting", () => {
      const key = canonicalCacheKey(
        "real%3A%3ACherele%3A%3AKIKI%3A%3A%3A%3Aspotify:track:abc",
        "casual",
      );
      // After normalization the result matches the un-encoded form.
      expect(key).toBe("real::Cherele::KIKI::::spotify:track:abc::casual");
    });

    it("handles uppercase %3A as well", () => {
      const key = canonicalCacheKey(
        "real%3A%3AArtist%3A%3ATitle%3A%3A%3A%3Auri",
        "casual",
      );
      expect(key).toContain("real::Artist::Title::::uri");
    });
  });

  describe("malformed / non-real ids", () => {
    it("passes through non-`real::` ids unchanged + tier appended", () => {
      const key = canonicalCacheKey("seed-billie-eilish-bad-guy", "curious");
      expect(key).toBe("seed-billie-eilish-bad-guy::curious");
    });

    it("preserves a malformed `real::` id with too few parts", () => {
      // 3 parts ("real", "artist", "title") — fewer than the expected 5.
      const id = "real::Artist::Title";
      const key = canonicalCacheKey(id, "casual");
      expect(key).toBe("real::Artist::Title::casual");
    });
  });

  describe("album slot is blanked", () => {
    it("strips album metadata so different entry points share the row", () => {
      const fromTile = canonicalCacheKey(
        "real::Cherele::KIKI::Some Album::spotify:track:abc",
        "casual",
      );
      const fromStory = canonicalCacheKey(
        "real::Cherele::KIKI::::spotify:track:abc",
        "casual",
      );
      expect(fromTile).toBe(fromStory);
    });
  });
});
