import { describe, it, expect } from "vitest";
import { isSafeUrl } from "@/lib/urlSafety";

describe("isSafeUrl", () => {
  it("accepts http URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("accepts https URLs", () => {
    expect(isSafeUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("accepts uppercase HTTPS (case-insensitive scheme)", () => {
    expect(isSafeUrl("HTTPS://example.com")).toBe(true);
    expect(isSafeUrl("HTTP://example.com")).toBe(true);
  });

  it("rejects javascript: scheme", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("javascript:void(0)")).toBe(false);
  });

  it("rejects data: scheme", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects file:, ftp:, and other non-web schemes", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects protocol-relative and relative URLs", () => {
    expect(isSafeUrl("//example.com")).toBe(false);
    expect(isSafeUrl("/path/to/page")).toBe(false);
    expect(isSafeUrl("page.html")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(42)).toBe(false);
    expect(isSafeUrl({})).toBe(false);
    expect(isSafeUrl([])).toBe(false);
  });

  it("rejects empty string and whitespace", () => {
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl("   ")).toBe(false);
  });

  it("rejects leading-whitespace bypass attempts", () => {
    // Some browsers historically trimmed leading whitespace from href.
    // The regex anchors to ^http(s) so any leading char fails.
    expect(isSafeUrl(" javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("\tjavascript:alert(1)")).toBe(false);
    expect(isSafeUrl(" https://example.com")).toBe(false);
  });
});
