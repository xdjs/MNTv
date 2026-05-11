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

  // Round-trip parity: the server (generate-nuggets edge function)
  // writes nugget_cache rows with raw decoded artist/title/uri values
  // (no URL encoding). The client reads via canonicalCacheKey, which
  // takes the URL-encoded React-Router param and decodes back to raw.
  // These tests lock in the contract so a future encoding tweak on
  // either side is caught at CI time, not as silent cold-cache misses
  // in production.
  describe("round-trip parity with server write", () => {
    function serverDbCacheKey(artist: string, title: string, uri: string, tier: string): string {
      // Mirror of `fastTrackId` + `fastDbCacheKey` construction in
      // supabase/functions/generate-nuggets/index.ts (firstNuggetOnly
      // path) and the fallback path that uses fallbackTrackId.
      return `real::${artist}::${title}::::${uri}::${tier}`;
    }
    function clientStoryHrefTrackId(artist: string, title: string, uri: string): string {
      // Mirror of `listenHrefForStory` in src/components/StoriesRail.tsx
      // — the URL-encoded form Listen sees from React Router params.
      const enc = encodeURIComponent;
      return `real::${enc(artist)}::${enc(title)}::${enc("")}::${enc(uri)}`;
    }

    it("plain ASCII (Cherele / KIKI / spotify URI)", () => {
      const args = { artist: "Cherele", title: "KIKI", uri: "spotify:track:abc123XYZ" } as const;
      const serverKey = serverDbCacheKey(args.artist, args.title, args.uri, "casual");
      const clientKey = canonicalCacheKey(clientStoryHrefTrackId(args.artist, args.title, args.uri), "casual");
      expect(clientKey).toBe(serverKey);
    });

    it("title with spaces + parens (KIKI (feat. Pete Rango))", () => {
      const args = { artist: "Cherele", title: "KIKI (feat. Pete Rango)", uri: "spotify:track:abc" } as const;
      const serverKey = serverDbCacheKey(args.artist, args.title, args.uri, "curious");
      const clientKey = canonicalCacheKey(clientStoryHrefTrackId(args.artist, args.title, args.uri), "curious");
      expect(clientKey).toBe(serverKey);
    });

    it("Apple URI (apple:song:N)", () => {
      const args = { artist: "Mavi Taylor", title: "rush", uri: "apple:song:1234567890" } as const;
      const serverKey = serverDbCacheKey(args.artist, args.title, args.uri, "nerd");
      const clientKey = canonicalCacheKey(clientStoryHrefTrackId(args.artist, args.title, args.uri), "nerd");
      expect(clientKey).toBe(serverKey);
    });

    it("artist with apostrophe", () => {
      const args = { artist: "softcore's", title: "blindside", uri: "spotify:track:def" } as const;
      const serverKey = serverDbCacheKey(args.artist, args.title, args.uri, "casual");
      const clientKey = canonicalCacheKey(clientStoryHrefTrackId(args.artist, args.title, args.uri), "casual");
      expect(clientKey).toBe(serverKey);
    });
  });
});
