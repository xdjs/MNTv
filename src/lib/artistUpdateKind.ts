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
