import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

// layoutId is surfaced as data-layout-id here — see the helper. Without
// that, both ends of the morph render identically whether or not they
// agree, which is exactly how the regression below reached review.
vi.mock("framer-motion", async () =>
  (await import("./helpers/framerMotionMock")).makeFramerMotionMock({ exposeLayoutId: true }));

import { UpdateCard, ExpandedUpdateModalMemoized } from "@/components/ArtistUpdatesSection";

const LAYOUT_ID = "artist::turnover::fact-42";

const FACT: ArtistUpdate = {
  artistId: "a1",
  artistName: "Turnover",
  artistImageUrl: "https://i.scdn.co/image/abc123",
  kind: "fact",
  headline: "Turnover tracked the record with their live engineer.",
  body: "They brought him into the studio to capture the room.",
  nuggetId: "fact-42",
};

const noop = () => {};

function renderCard(update: ArtistUpdate) {
  const { container } = render(
    <MemoryRouter>
      <UpdateCard update={update} layoutId={LAYOUT_ID} onClick={noop} />
    </MemoryRouter>,
  );
  return container;
}

function renderModal(update: ArtistUpdate) {
  const { container } = render(
    <MemoryRouter>
      <ExpandedUpdateModalMemoized
        update={update}
        layoutId={LAYOUT_ID}
        onClose={noop}
        onOpen={noop}
      />
    </MemoryRouter>,
  );
  return container;
}

/** Every morph id declared in a rendered tree. Both the container and
 *  the artwork carry one, so comparing the whole set is what catches a
 *  half-wired pair — checking a single element would just re-find the
 *  container on both ends and pass regardless. */
const morphIds = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("[data-layout-id]"))
    .map((el) => el.getAttribute("data-layout-id"))
    .sort();

// ── The regression ────────────────────────────────────────────────────
// Routing the card thumbnail through RemoteImage dropped its layoutId,
// because RemoteImage rendered a plain <img>. The modal hero kept
// its own, so the pair no longer matched and the photo hard-cut into
// the modal instead of scaling. Both ends have to agree; asserting only
// one end is what let this through the first time.
describe("artist card → modal shared-element morph", () => {
  it("gives the card thumbnail a morph id", () => {
    expect(morphIds(renderCard(FACT))).toContain(`${LAYOUT_ID}::img`);
  });

  it("gives the modal hero the same morph id", () => {
    expect(morphIds(renderModal(FACT))).toContain(`${LAYOUT_ID}::img`);
  });

  // Every id on one end needs a partner on the other — an unpaired id
  // is precisely a hard cut.
  it("declares the same morph ids on both ends", () => {
    expect(morphIds(renderCard(FACT))).toEqual(morphIds(renderModal(FACT)));
  });

  // The original wired the empty state up too, so an artist with no
  // photo still morphs its placeholder rather than popping.
  it("morphs the placeholder when the artist has no photo", () => {
    const noPhoto = { ...FACT, artistImageUrl: undefined };

    expect(morphIds(renderCard(noPhoto))).toContain(`${LAYOUT_ID}::img`);
    expect(morphIds(renderCard(noPhoto))).toEqual(morphIds(renderModal(noPhoto)));
  });
});

// Regaining the morph must not cost the deferral — the card thumbnails
// were the bulk of the ~53-request burst that made Browse render as a
// wall of black cards.
describe("morphing card thumbnails still defer loading", () => {
  it("keeps the card thumbnail lazy", () => {
    const img = renderCard(FACT).querySelector("img");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("keeps decoding off the main thread", () => {
    const img = renderCard(FACT).querySelector("img");
    expect(img?.getAttribute("decoding")).toBe("async");
  });
});
