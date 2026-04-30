import { describe, it, expect } from "vitest";
import { sanitizeRedirect } from "@/lib/routeUtils";

describe("sanitizeRedirect", () => {
  // ── Valid pass-through ────────────────────────────────────────────────
  describe("valid in-app paths", () => {
    it("accepts /browse", () => {
      expect(sanitizeRedirect("/browse")).toBe("/browse");
    });
    it("accepts /listen/real::Artist::Title::::spotify:track:xxx", () => {
      expect(sanitizeRedirect("/listen/real::Artist::Title::::spotify:track:xxx"))
        .toBe("/listen/real::Artist::Title::::spotify:track:xxx");
    });
    it("accepts /artist/:id with query params", () => {
      expect(sanitizeRedirect("/artist/spotify::abc::Name?nugget=xyz"))
        .toBe("/artist/spotify::abc::Name?nugget=xyz");
    });
    it("accepts /profile", () => {
      expect(sanitizeRedirect("/profile")).toBe("/profile");
    });
  });

  // ── Onboarding-loop rejection ─────────────────────────────────────────
  describe("rejects onboarding self-references", () => {
    it("rejects /", () => {
      expect(sanitizeRedirect("/")).toBeNull();
    });
    it("rejects /connect", () => {
      expect(sanitizeRedirect("/connect")).toBeNull();
    });
    it("rejects /preparing", () => {
      expect(sanitizeRedirect("/preparing")).toBeNull();
    });
    it("rejects /preparing?next=/browse (any /preparing-prefixed path)", () => {
      expect(sanitizeRedirect("/preparing?next=/browse")).toBeNull();
    });
    it("rejects /preparing-room (intentional prefix-match, see code comment)", () => {
      expect(sanitizeRedirect("/preparing-room")).toBeNull();
    });
  });

  // ── Open-redirect rejection ───────────────────────────────────────────
  describe("rejects external/protocol URLs (open-redirect defense)", () => {
    it("rejects protocol-relative //evil.com", () => {
      expect(sanitizeRedirect("//evil.com")).toBeNull();
    });
    it("rejects absolute https://evil.com", () => {
      expect(sanitizeRedirect("https://evil.com")).toBeNull();
    });
    it("rejects absolute http://evil.com", () => {
      expect(sanitizeRedirect("http://evil.com")).toBeNull();
    });
    it("rejects javascript:alert(1)", () => {
      expect(sanitizeRedirect("javascript:alert(1)")).toBeNull();
    });
    it("rejects data: URLs", () => {
      expect(sanitizeRedirect("data:text/html,<script>alert(1)</script>")).toBeNull();
    });
    it("rejects path without leading slash", () => {
      expect(sanitizeRedirect("foo")).toBeNull();
    });
    it("rejects empty string", () => {
      expect(sanitizeRedirect("")).toBeNull();
    });
  });

  // ── Nullish handling ──────────────────────────────────────────────────
  describe("nullish inputs", () => {
    it("returns null for null", () => {
      expect(sanitizeRedirect(null)).toBeNull();
    });
    it("returns null for undefined", () => {
      expect(sanitizeRedirect(undefined)).toBeNull();
    });
  });
});
