import { Sparkles, Disc, Users } from "lucide-react";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

/**
 * Shared label + icon for an `ArtistUpdate` kind. Two surfaces render
 * artist-update cards (the Browse rail "Your artists, lately" via
 * ArtistUpdatesSection, and the artist profile "Latest Facts" via
 * LatestFactsSection); both used to maintain their own switch
 * statement, which meant adding a new kind required two edits.
 *
 * Styling is intentionally NOT shared — Browse uses an opinionated
 * card treatment (border accent, gradient bg, hover glow) while the
 * profile uses a flatter chip. Each component keeps a local helper
 * for those visuals.
 */
export interface ArtistUpdateKindMeta {
  kindLabel: string;
  KindIcon: typeof Sparkles;
}

/**
 * Whether an update has something to read.
 *
 * `kind: "track"` entries are play targets, not content: the edge
 * function builds them with the track name as the headline and
 * `body: ""` (artist-updates/index.ts:381 — the only empty body it
 * produces). They exist for the Browse "Get into" lane, which renders
 * them as artwork tiles.
 *
 * The artist profile's "Latest Facts" reads the same array and rendered
 * them as readable cards, so the section promised facts and delivered
 * bare catalog artwork — duplicating the "Popular" list directly below
 * it. Pete: "I don't understand what the track cards are doing here in
 * latest facts, when there is no facts in each of those cards."
 *
 * Also drops any other empty-bodied update, which would render the same
 * broken way. Filtering here rather than in the component keeps the
 * rule in one place for the next surface that reads these.
 */
export function isReadableUpdate(u: ArtistUpdate): boolean {
  if (u.kind === "track") return false;
  return u.body.trim().length > 0;
}

export function getArtistUpdateKindMeta(kind: ArtistUpdate["kind"]): ArtistUpdateKindMeta {
  switch (kind) {
    case "new-release":
      return { kindLabel: "New release", KindIcon: Disc };
    case "collab":
      return { kindLabel: "Collab", KindIcon: Users };
    // Catalog tracks render as artwork tiles in the "Get into" lane, not
    // as readable cards — this case exists so any future surface that
    // does render one doesn't fall through to the "Fact" label.
    case "track":
      return { kindLabel: "Track", KindIcon: Disc };
    case "fact":
    default:
      return { kindLabel: "Fact", KindIcon: Sparkles };
  }
}
