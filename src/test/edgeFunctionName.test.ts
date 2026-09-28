import { afterEach, expect, it, vi } from "vitest";
import { edgeFunctionName } from "@/lib/edgeFunctionName";
afterEach(() => vi.unstubAllEnvs());
it("keeps production on the existing backend", () => {
  vi.stubEnv("VITE_EDGE_FUNCTION_CHANNEL", "");
  expect(edgeFunctionName("artist-updates")).toBe("artist-updates");
});
it("routes the staging build to candidate endpoints", () => {
  vi.stubEnv("VITE_EDGE_FUNCTION_CHANNEL", "staging");
  expect(edgeFunctionName("artist-updates")).toBe("artist-updates-staging");
  expect(edgeFunctionName("spotify-artist")).toBe("spotify-artist-staging");
  expect(edgeFunctionName("apple-taste")).toBe("apple-taste-staging");
});
