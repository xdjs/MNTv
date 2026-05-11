import { memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ArtistUpdate, ArtistUpdateGroup } from "@/hooks/useArtistUpdates";
import { serviceParamFromProfile, withAppleStorefront } from "@/lib/appleStorefront";
import { getArtistUpdateKindMeta } from "@/lib/artistUpdateKind";
import type { UserProfile } from "@/mock/types";

/**
 * Browse's "Your artists, lately" section. Renders one nested row per
 * top artist — each row is a horizontally-scrollable strip of update
 * cards (release + 2 facts from the `useArtistUpdates` hook). Artist
 * grouping is the point: it gives Pete's "scroll through a few facts
 * for each top artist" feel rather than a Spotify-flavored artist-tile
 * row.
 *
 * While the hook is still fetching a given artist, that row renders
 * skeleton cards so the user sees something is coming without a blank
 * gap. Once `group.updates !== null` is an empty array, the row is
 * omitted entirely (silent drop rather than a "no updates" toast).
 */

interface Props {
  groups: ArtistUpdateGroup[];
  /** Fed in by Browse's useUserProfile for artist-href composition. */
  profile: UserProfile | null;
  /** Artist name → artist id map (from profile + runtime resolution). */
  artistIds?: Record<string, string>;
  /** Total attempted; used for the progress indicator. */
  totalCount: number;
  /** Count that's resolved (including empty-result resolutions). */
  readyCount: number;
}

// Memoized — Browse re-renders frequently as the keyboard-nav focus
// state shifts between row/col indices. None of those updates touch
// this section's props, so skipping the re-render is a clear win.
// Cheap today (DEFAULT_MAX_ARTISTS = 1) but pays off if/when the row
// count grows.
function ArtistUpdatesSectionInner({
  groups,
  profile,
  artistIds = {},
  totalCount,
  readyCount,
}: Props) {
  const navigate = useNavigate();
  const activeService = serviceParamFromProfile(profile?.streamingService);
  // Pete 2026-05-11: clicking a card now opens an expanded popup
  // instead of navigating immediately. The popup shares a layoutId
  // with the source card so Framer Motion morphs between them. The
  // user can then choose to open the linked Listen / Artist page from
  // a CTA inside the popup, or dismiss to stay on Browse.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const showProgress = totalCount > 0 && readyCount < totalCount;

  // Stable id: prefer the Gemini-supplied nuggetId, fall back to a
  // composite of artist+kind+headline so cards without nuggetId still
  // animate cleanly (and don't share a layoutId with other cards).
  const cardKey = useCallback((u: ArtistUpdate) =>
    u.nuggetId ?? `${u.artistName}::${u.kind}::${u.headline}`,
    []);

  // Find the currently-expanded update so we can render its expanded
  // content. Search across all groups since expandedKey is global.
  let expandedUpdate: ArtistUpdate | null = null;
  if (expandedKey) {
    for (const g of groups) {
      const found = g.updates?.find((u) => cardKey(u) === expandedKey);
      if (found) { expandedUpdate = found; break; }
    }
  }

  function openArtistAtNugget(update: ArtistUpdate) {
    // New-release / collab cards: tap should land on Listen for the
    // released track, not the artist profile. We need at minimum a
    // track-level title from the edge function (set only when it
    // successfully resolved the album's first track via Spotify).
    //
    // Service-aware URI handling:
    //   - Spotify users: bake the spotify:track: URI into the route
    //     so Listen plays instantly without a catalog re-lookup.
    //   - Apple Music users: omit the URI so Listen's findCatalogUri
    //     effect resolves the Apple equivalent via {artist, title}.
    //     Passing the Spotify URI directly would lock Listen into a
    //     URI Apple Music can't play.
    if (
      (update.kind === "new-release" || update.kind === "collab") &&
      update.relatedTrackTitle
    ) {
      const album = update.relatedAlbumName ?? "";
      const isAppleUser = profile?.streamingService === "Apple Music";
      const hasSpotifyTrackUri =
        !!update.relatedTrackUri && update.relatedTrackUri.startsWith("spotify:track:");
      const navUri = !isAppleUser && hasSpotifyTrackUri ? update.relatedTrackUri! : "";
      navigate(
        `/listen/real::${encodeURIComponent(update.artistName)}::${encodeURIComponent(update.relatedTrackTitle)}::${encodeURIComponent(album)}::${encodeURIComponent(navUri)}`,
      );
      return;
    }

    // Fact cards (or release cards where track resolution failed):
    // open the artist profile and deep-link to the nugget.
    const id = artistIds[update.artistName] || update.artistId;
    if (!id) return;
    // Route format is `spotify::{id}::{name}` (double-colon delimiter
    // per src/lib/routeParsing.ts). Single-colon URLs don't match
    // `isSpotifyPrefix` and fall through to the mock-artist lookup,
    // which surfaces as "Artist not found." for every Spotify-real
    // artist card.
    const path = withAppleStorefront(
      `/artist/${activeService}::${id}::${encodeURIComponent(update.artistName)}?nugget=${encodeURIComponent(update.nuggetId ?? "")}`,
      profile?.streamingService,
    );
    navigate(path);
  }

  return (
    <section className="mb-6 md:mb-10">
      <div className="px-4 md:px-10 mb-3 flex items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-white/40">
          Your artists, lately
        </p>
        {showProgress && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-rose-300/70">
            <Loader2 className="w-3 h-3 animate-spin" />
            {readyCount} of {totalCount} ready
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 md:gap-6">
        {groups.map((group) => {
          // Hide rows that finished with zero updates — don't clutter
          // Browse with an empty "SOMEONE" label for an artist we
          // couldn't resolve on Spotify.
          if (group.updates !== null && group.updates.length === 0) return null;

          return (
            <ArtistRow
              key={group.artistName}
              group={group}
              onExpand={(u) => setExpandedKey(cardKey(u))}
              cardKey={cardKey}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {expandedUpdate && (
          <ExpandedUpdateModal
            update={expandedUpdate}
            layoutId={cardKey(expandedUpdate)}
            onClose={() => setExpandedKey(null)}
            onOpen={() => {
              const u = expandedUpdate!;
              setExpandedKey(null);
              openArtistAtNugget(u);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

const ArtistUpdatesSection = memo(ArtistUpdatesSectionInner);
export default ArtistUpdatesSection;

// ── Per-artist row ────────────────────────────────────────────────────

interface ArtistRowProps {
  group: ArtistUpdateGroup;
  onExpand: (u: ArtistUpdate) => void;
  cardKey: (u: ArtistUpdate) => string;
}

function ArtistRow({ group, onExpand, cardKey }: ArtistRowProps) {
  const loading = group.updates === null;
  const updates = group.updates ?? [];
  // Prefer a fact update's image for the row header avatar — that's the
  // artist photo. Release cards hand back an album cover in the same
  // field, which makes a lousy circular avatar. Fall back to whatever's
  // there if no fact update exists yet.
  const heroImg =
    updates.find((u) => u.kind === "fact")?.artistImageUrl
    ?? updates[0]?.artistImageUrl
    ?? "";

  return (
    <div>
      <div className="px-4 md:px-10 mb-3 flex items-center gap-3">
        {heroImg ? (
          <img
            src={heroImg}
            alt={`${group.artistName} avatar`}
            className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10 shadow-lg"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-400/40 to-pink-500/40 ring-2 ring-white/10" />
        )}
        <span className="text-lg md:text-xl font-black text-white tracking-tight">
          {group.artistName}
        </span>
      </div>
      <div
        className="flex gap-3 overflow-x-auto px-4 md:px-10 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          : updates.map((u) => (
              <UpdateCard
                key={cardKey(u)}
                layoutId={cardKey(u)}
                update={u}
                onClick={() => onExpand(u)}
              />
            ))}
      </div>
    </div>
  );
}

// ── One update card ───────────────────────────────────────────────────

interface UpdateCardProps {
  update: ArtistUpdate;
  layoutId: string;
  onClick: () => void;
}

// Pete 2026-05-11 redesign: every card is now image-backed (artist
// photo or release cover, whichever the edge function returned in
// `artistImageUrl`). Tapping a card triggers a Framer-Motion
// shared-layout transition into ExpandedUpdateModal — no immediate
// navigation. The modal offers an explicit "Open" CTA when the user
// wants to follow through.
function UpdateCard({ update, layoutId, onClick }: UpdateCardProps) {
  const { kindLabel, KindIcon } = getArtistUpdateKindMeta(update.kind);
  const { chipClass } = kindStyle(update.kind);
  const img = update.artistImageUrl;

  return (
    <motion.button
      layoutId={layoutId}
      onClick={onClick}
      className="relative shrink-0 w-[280px] md:w-[320px] h-44 md:h-48 text-left rounded-2xl overflow-hidden group active:scale-[0.98] transition-transform"
      aria-label={`${kindLabel}: ${update.headline}`}
    >
      {img ? (
        <motion.img
          layoutId={`${layoutId}::img`}
          src={img}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <motion.div
          layoutId={`${layoutId}::img`}
          className="absolute inset-0 bg-gradient-to-br from-rose-500/30 via-violet-500/20 to-sky-500/15"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
      <span className={`absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full backdrop-blur-sm ${chipClass}`}>
        <KindIcon className="w-3 h-3" />
        {kindLabel}
      </span>
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="text-base md:text-lg font-black text-white leading-tight line-clamp-2 mb-1 drop-shadow">
          {update.headline}
        </h3>
        <p className="text-xs text-white/70 leading-relaxed line-clamp-1">
          {update.body}
        </p>
      </div>
    </motion.button>
  );
}

// ── Expanded popup ────────────────────────────────────────────────────

interface ExpandedUpdateModalProps {
  update: ArtistUpdate;
  layoutId: string;
  onClose: () => void;
  onOpen: () => void;
}

function ExpandedUpdateModal({ update, layoutId, onClose, onOpen }: ExpandedUpdateModalProps) {
  const { kindLabel, KindIcon } = getArtistUpdateKindMeta(update.kind);
  const { chipClass } = kindStyle(update.kind);
  const img = update.artistImageUrl;

  // CTA wording matches what the open path actually does: release /
  // collab cards land on Listen for the related track; fact cards
  // open the artist profile.
  const ctaLabel =
    (update.kind === "new-release" || update.kind === "collab") && update.relatedTrackTitle
      ? `Listen to "${update.relatedTrackTitle}"`
      : `Open ${update.artistName}`;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        layoutId={layoutId}
        className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
      >
        <motion.div
          className="relative w-full max-w-md max-h-[85vh] rounded-3xl overflow-hidden bg-black ring-1 ring-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.6)] pointer-events-auto flex flex-col"
        >
          {/* Hero image — keeps the same layoutId for the morph */}
          <div className="relative h-56 md:h-64 flex-shrink-0">
            {img ? (
              <motion.img
                layoutId={`${layoutId}::img`}
                src={img}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <motion.div
                layoutId={`${layoutId}::img`}
                className="absolute inset-0 bg-gradient-to-br from-rose-500/30 via-violet-500/20 to-sky-500/15"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <span className={`absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full backdrop-blur-sm ${chipClass}`}>
              <KindIcon className="w-3 h-3" />
              {kindLabel}
            </span>
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 active:scale-90 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <motion.div
            className="overflow-y-auto px-5 pt-4 pb-5 scrollbar-hide"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.25 }}
          >
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
              {update.artistName}
            </p>
            <h3 className="text-xl font-black text-white leading-tight mb-3">
              {update.headline}
            </h3>
            <p className="text-sm text-white/75 leading-relaxed mb-4">
              {update.body}
            </p>

            {update.source?.title && (
              <p className="text-[11px] text-white/40 mb-4">
                Source: {update.source.publisher
                  ? `${update.source.title} · ${update.source.publisher}`
                  : update.source.title}
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/25 text-primary text-sm font-semibold hover:bg-primary/35 active:scale-95 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {ctaLabel}
              </button>
              {update.source?.url && (
                <a
                  href={update.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 text-white/70 text-sm hover:bg-white/15 active:scale-95 transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  Source
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </>
  );
}

// Browse-specific styling per kind. Label + icon come from the shared
// helper in src/lib/artistUpdateKind.ts so adding a new kind only
// requires editing the shared file. Local styling stays here because
// the rail uses an opinionated card treatment (border accent, gradient
// bg, hover glow) that differs from the artist-profile chip.
interface KindStyle {
  chipClass: string;
  borderAccent: string;
  cardBg: string;
  hoverGlow: string;
}

function kindStyle(kind: ArtistUpdate["kind"]): KindStyle {
  switch (kind) {
    case "new-release":
      return {
        chipClass: "bg-rose-500/25 text-rose-100 ring-1 ring-rose-300/30",
        borderAccent: "border-l-rose-400/70",
        cardBg: "from-rose-500/10 to-white/[0.02]",
        hoverGlow: "hover:shadow-[0_0_24px_rgba(244,114,182,0.15)]",
      };
    case "collab":
      return {
        chipClass: "bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30",
        borderAccent: "border-l-violet-400/70",
        cardBg: "from-violet-500/10 to-white/[0.02]",
        hoverGlow: "hover:shadow-[0_0_24px_rgba(167,139,250,0.18)]",
      };
    case "fact":
    default:
      return {
        chipClass: "bg-sky-500/25 text-sky-100 ring-1 ring-sky-300/30",
        borderAccent: "border-l-sky-400/70",
        cardBg: "from-sky-500/10 to-white/[0.02]",
        hoverGlow: "hover:shadow-[0_0_24px_rgba(125,211,252,0.15)]",
      };
  }
}

// ── Skeleton card ─────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="shrink-0 w-[280px] md:w-[320px] rounded-2xl bg-white/[0.04] border border-white/5 p-4 animate-pulse"
      aria-hidden
    >
      <div className="h-4 w-20 rounded-full bg-white/10 mb-3" />
      <div className="h-4 w-full rounded bg-white/10 mb-2" />
      <div className="h-4 w-5/6 rounded bg-white/10 mb-3" />
      <div className="h-3 w-3/4 rounded bg-white/5" />
    </div>
  );
}
