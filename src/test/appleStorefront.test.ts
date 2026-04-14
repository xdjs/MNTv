import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readAppleStorefront,
  serviceParamFromProfile,
  withAppleStorefront,
} from "@/lib/appleStorefront";

describe("readAppleStorefront", () => {
  const originalMusicKit = (window as unknown as { MusicKit?: unknown }).MusicKit;

  afterEach(() => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = originalMusicKit;
  });

  it("returns 'us' when MusicKit is undefined", () => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = undefined;
    expect(readAppleStorefront()).toBe("us");
  });

  it("returns 'us' when getInstance throws (pre-configure)", () => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = {
      getInstance: () => { throw new Error("not configured"); },
    };
    expect(readAppleStorefront()).toBe("us");
  });

  it("returns 'us' when storefrontCountryCode is missing", () => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = {
      getInstance: () => ({}),
    };
    expect(readAppleStorefront()).toBe("us");
  });

  it("returns the lowercase 2-letter storefront when present", () => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = {
      getInstance: () => ({ storefrontCountryCode: "GB" }),
    };
    expect(readAppleStorefront()).toBe("gb");

    (window as unknown as { MusicKit?: unknown }).MusicKit = {
      getInstance: () => ({ storefrontCountryCode: "jp" }),
    };
    expect(readAppleStorefront()).toBe("jp");
  });

  it("falls back to 'us' for non-2-letter codes", () => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = {
      getInstance: () => ({ storefrontCountryCode: "USA" }),
    };
    expect(readAppleStorefront()).toBe("us");
  });
});

describe("serviceParamFromProfile", () => {
  it("returns 'apple' for Apple Music users", () => {
    expect(serviceParamFromProfile("Apple Music")).toBe("apple");
  });

  it("returns 'spotify' for Spotify users", () => {
    expect(serviceParamFromProfile("Spotify")).toBe("spotify");
  });

  it("returns 'spotify' for unset or unknown services", () => {
    expect(serviceParamFromProfile(undefined)).toBe("spotify");
    expect(serviceParamFromProfile("")).toBe("spotify");
    expect(serviceParamFromProfile("YouTube Music")).toBe("spotify");
  });
});

describe("withAppleStorefront", () => {
  beforeEach(() => {
    (window as unknown as { MusicKit?: unknown }).MusicKit = {
      getInstance: () => ({ storefrontCountryCode: "gb" }),
    };
  });

  afterEach(() => {
    delete (window as unknown as { MusicKit?: unknown }).MusicKit;
  });

  it("adds the storefront for Apple service", () => {
    const result = withAppleStorefront({ query: "Radiohead", service: "apple" }, "apple");
    expect(result).toEqual({ query: "Radiohead", service: "apple", storefront: "gb" });
  });

  it("returns the body unchanged for Spotify service", () => {
    const body = { query: "Radiohead", service: "spotify" };
    const result = withAppleStorefront(body, "spotify");
    expect(result).toBe(body);
    expect((result as { storefront?: string }).storefront).toBeUndefined();
  });

  it("preserves original body fields", () => {
    const result = withAppleStorefront({ a: 1, b: "two", c: true }, "apple");
    expect(result.a).toBe(1);
    expect(result.b).toBe("two");
    expect(result.c).toBe(true);
    expect((result as { storefront?: string }).storefront).toBe("gb");
  });
});
