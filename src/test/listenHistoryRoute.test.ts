import { expect, it } from "vitest";
import { listenHistoryRoute } from "@/lib/listenHistoryRoute";
it("preserves catalog identity, repeated collaborator credits and other query state for Prev", () => {
  const path = "/listen/real::Primary::Song::::spotify%3Atrack%3Aid";
  const url = new URL(listenHistoryRoute(path, "?artistId=primary-id&collaborator=First&collaborator=Second&nugget=fact", "https://example.com/art.jpg"), "https://example.com");
  expect(url.pathname).toBe(path);
  expect(url.searchParams.get("artistId")).toBe("primary-id");
  expect(url.searchParams.getAll("collaborator")).toEqual(["First", "Second"]);
  expect(url.searchParams.get("nugget")).toBe("fact");
  expect(url.searchParams.get("art")).toBe("https://example.com/art.jpg");
});
it("keeps explicit artwork and avoids an empty query suffix", () => {
  expect(listenHistoryRoute("/listen/demo", "", "")).toBe("/listen/demo");
  expect(new URL(listenHistoryRoute("/listen/demo", "?art=original", "fallback"), "https://example.com").searchParams.get("art")).toBe("original");
});
