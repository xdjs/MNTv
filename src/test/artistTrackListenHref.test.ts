import { expect, it } from "vitest";
import { artistTrackListenHref } from "@/lib/artistTrackListenHref";
it("carries primary catalog identity and collaborator credits without combining their names", () => {
  const href = artistTrackListenHref({ artist: "Primary", artistId: "primary-id", collaborators: ["Featured"], title: "Song", album: "Album", uri: "spotify:track:id" }, { id: "featured-id", name: "Featured" });
  const url = new URL(href, "https://example.com");
  expect(url.pathname).toContain("real::Primary::Song");
  expect(url.searchParams.get("artistId")).toBe("primary-id");
  expect(url.searchParams.getAll("collaborator")).toEqual(["Featured"]);
});
it("does not substitute the viewed artist's ID for a different primary artist", () => {
  expect(artistTrackListenHref({ artist: "Other", title: "Song", album: "", uri: "spotify:track:id" }, { id: "viewed-id", name: "Viewed" })).not.toContain("artistId");
});
