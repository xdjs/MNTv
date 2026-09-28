import { expect, it } from "vitest";
import { getSeedListenNuggets, getSeedCompanion } from "@/data/seedNuggets";
it("does not let unverified demo seeds bypass the source requirements", async () => {
  expect(await getSeedListenNuggets("Daft Punk", "Around the World", "casual", 1)).toBeNull();
  expect(await getSeedCompanion("Daft Punk", "Around the World", "casual")).toBeNull();
});
