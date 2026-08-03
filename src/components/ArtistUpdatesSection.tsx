import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X, ExternalLink, Play } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ArtistUpdate, ArtistUpdateGroup } from "@/hooks/useArtistUpdates";
import { splitArtistUpdates, resolvePlayTarget, type PlayableTrack } from "@/lib/artistUpdateSplit";
import { buildListenRoute } from "@/lib/listenRoute";
import { serviceParamFromProfile, withAppleStorefront } from "@/lib/appleStorefront";
import { getArtistUpdateKindMeta } from "@/lib/artistUpdateKind";
import { isSafeUrl } from "@/lib/urlSafety";
import RemoteImage from "@/components/RemoteImage";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Stable onClose reference so ExpandedUpdateModal's focus-trap
  // effect doesn't re-fire on every parent re-render (which would
  // pull focus back to the close button mid-interaction whenever
  // readyCount/groups update from useArtistUpdatesContext).
  const modalOnClose = useCallback(() => setExpandedKey(null), []);

  if (groups.length === 0) return null;

  const showProgress = totalCount > 0 && readyCount < totalCount;

  // cardKey is a pure function — see module-level definition below.

  // Look up the currently-expanded update so we can render its
  // expanded content. Memoized on (expandedKey, groups) so the scan
  // doesn't run on every keystroke / scroll / unrelated re-render
  // (parent context emits readyCount changes as artist rows resolve).
  // Worst case O(artists × updates_per_artist) ≈ 3 × 3 = 9 today.
  const expandedUpdate = useMemo<ArtistUpdate | null>(() => {
    if (!expandedKey) return null;
    for (const g of groups) {
      const found = g.updates?.find((u) => cardKey(u) === expandedKey);
      if (found) return found;
    }
    return null;
  }, [expandedKey, groups]);

  // Always opens the artist profile, deep-linked to the nugget.
  //
  // This used to route release/collab cards to Listen for their track
  // instead — correct when it was the card's only action, but it now
  // duplicates the Play button. Playback is the Play button's job; this
  // is the only way to reach the artist, so it must not be overloaded.
  const openArtistAtNugget = useCallback((update: ArtistUpdate) => {
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
  }, [profile?.streamingService, activeService, artistIds, navigate]);

  // Playback always goes straight to Listen — from a card's play control
  // or the expanded card's Play button. No expand step in between: the
  // user already said what they want.
  const playTrack = useCallback((artistName: string, track: PlayableTrack) => {
    navigate(buildListenRoute({
      artist: artistName,
      title: track.title,
      album: track.album,
      uri: track.uri,
      streamingService: profile?.streamingService,
    }));
  }, [navigate, profile?.streamingService]);

  // The expanded card needs the same play target its tile had, so
  // opening a fact never becomes a dead end. Resolved from the owning
  // artist's lanes rather than the update alone, since a plain fact
  // borrows the artist's first track.
  const expandedPlayTarget = useMemo<PlayableTrack | null>(() => {
    if (!expandedUpdate) return null;
    const group = groups.find((g) => g.artistName === expandedUpdate.artistName);
    const { tracks } = splitArtistUpdates(group?.updates);
    return resolvePlayTarget(expandedUpdate, tracks);
  }, [expandedUpdate, groups]);

  // openArtistAtNugget silently no-ops without an artist id, so the
  // button must not render at all in that case — the same reason the
  // play control is omitted when nothing resolves.
  const expandedCanOpenArtist = useMemo(() => {
    if (!expandedUpdate) return false;
    return !!(artistIds[expandedUpdate.artistName] || expandedUpdate.artistId);
  }, [expandedUpdate, artistIds]);

  const modalOnPlay = useCallback(() => {
    if (!expandedUpdate || !expandedPlayTarget) return;
    playTrack(expandedUpdate.artistName, expandedPlayTarget);
  }, [expandedUpdate, expandedPlayTarget, playTrack]);

  // Stable modal onOpen so the memoized ExpandedUpdateModal isn't
  // forced to re-render every parent tick. Depends on expandedUpdate
  // (correct: closes over which card to open) and openArtistAtNugget.
  const modalOnOpen = useCallback(() => {
    if (!expandedUpdate) return;
    setExpandedKey(null);
    openArtistAtNugget(expandedUpdate);
  }, [expandedUpdate, openArtistAtNugget]);

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
              onPlay={playTrack}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {expandedUpdate && (
          <ExpandedUpdateModalMemoized
            update={expandedUpdate}
            layoutId={cardKey(expandedUpdate)}
            onClose={modalOnClose}
            onOpen={modalOnOpen}
            playTarget={expandedPlayTarget}
            onPlay={expandedPlayTarget ? modalOnPlay : undefined}
            canOpenArtist={expandedCanOpenArtist}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

const ArtistUpdatesSection = memo(ArtistUpdatesSectionInner);
export default ArtistUpdatesSection;

// ── cardKey ───────────────────────────────────────────────────────────
// Stable id for a card — prefers the Gemini-supplied nuggetId, falls
// back to an FNV-1a hash of artist|kind|headline (collision rate
// ~2^-32, far below "two cards from the same artist with similar
// headlines" can produce). Pure function, module-level so nothing in
// the render tree allocates a new wrapper each pass.
export function cardKey(u: ArtistUpdate): string {
  if (u.nuggetId) return u.nuggetId;
  const seed = `${u.artistName}|${u.kind}|${u.headline}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `card-${(h >>> 0).toString(36)}`;
}

// ── Per-artist row ────────────────────────────────────────────────────

interface ArtistRowProps {
  group: ArtistUpdateGroup;
  onExpand: (u: ArtistUpdate) => void;
  onPlay: (artistName: string, track: PlayableTrack) => void;
}

function ArtistRow({ group, onExpand, onPlay }: ArtistRowProps) {
  const loading = group.updates === null;
  const updates = group.updates ?? [];
  // Two lanes: cards to read, tracks to play. The split rules live in
  // artistUpdateSplit so they're testable without rendering.
  const { facts, tracks } = useMemo(() => splitArtistUpdates(group.updates), [group.updates]);
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
        <RemoteImage
          src={heroImg}
          alt={`${group.artistName} avatar`}
          className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10 shadow-lg"
          fallback={
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-400/40 to-pink-500/40 ring-2 ring-white/10" />
          }
        />
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
          : facts.map((u) => {
              // Every card should lead somewhere. A fact with no track of
              // its own borrows the artist's first — but if nothing
              // resolves, the card renders without a control rather than
              // with a dead one.
              const target = resolvePlayTarget(u, tracks);
              return (
                <UpdateCard
                  key={cardKey(u)}
                  layoutId={cardKey(u)}
                  update={u}
                  onClick={() => onExpand(u)}
                  playTarget={target}
                  onPlay={target ? () => onPlay(u.artistName, target) : undefined}
                />
              );
            })}
      </div>
    </div>
  );
}

// ── One update card ───────────────────────────────────────────────────

interface UpdateCardProps {
  update: ArtistUpdate;
  layoutId: string;
  onClick: () => void;
  /** Sizing/spacing classes. Default is the Browse-rail horizontal-
   *  scroll size; ArtistProfile passes `w-full` for a single-column
   *  vertical stack. */
  sizeClass?: string;
  pulsing?: boolean;
  /** Track this card offers to play, if one resolved. */
  playTarget?: PlayableTrack | null;
  /** Omitted when there is nothing to play — the control is then not
   *  rendered at all rather than rendered inert. */
  onPlay?: () => void;
}

// Image-backed for every kind. Tap morphs into ExpandedUpdateModal
// via Framer Motion layoutId — no immediate navigation. Exported so
// ArtistProfile's Latest Facts section can reuse the exact same card
// + modal pattern that Browse uses.
export function UpdateCard({ update, layoutId, onClick, sizeClass = "shrink-0 w-[280px] md:w-[320px] h-44 md:h-48", pulsing = false, playTarget = null, onPlay }: UpdateCardProps) {
  const { kindLabel, KindIcon } = getArtistUpdateKindMeta(update.kind);
  const { chipClass } = kindStyle(update.kind);
  const img = update.artistImageUrl;
  const showPlay = !!playTarget && !!onPlay;

  // The play control is a SIBLING of the card button, not a child —
  // nesting a button inside a button is invalid HTML and breaks
  // keyboard traversal. The wrapper carries the sizing so the card
  // still fills it.
  return (
    <div className={`relative ${sizeClass}`}>
    <motion.button
      layoutId={layoutId}
      onClick={onClick}
      className={`relative text-left rounded-2xl overflow-hidden group active:scale-[0.98] transition-transform w-full h-full ${
        pulsing ? "ring-2 ring-rose-400/70 shadow-[0_0_24px_rgba(244,114,182,0.35)]" : ""
      }`}
      aria-label={`${kindLabel}: ${update.headline}`}
    >
      <RemoteImage
        src={img}
        alt=""
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        fallback={
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/30 via-violet-500/20 to-sky-500/15" />
        }
      />
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
    {showPlay && (
      // Names the song rather than showing a bare play glyph — you
      // should know what you're about to hear before you tap. Sits
      // top-right, mirroring the kind chip opposite it, so it doesn't
      // crowd the headline; styled as glass rather than a solid white
      // circle so it belongs to the card instead of sitting on top of it.
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Play ${playTarget!.title} by ${update.artistName}`}
        className="absolute top-2 right-2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm ring-1 ring-white/25 active:scale-95 transition-transform"
      >
        <Play size={13} fill="currentColor" className="text-white ml-[1px]" />
      </button>
    )}
    </div>
  );
}

// ── Expanded popup ────────────────────────────────────────────────────

interface ExpandedUpdateModalProps {
  update: ArtistUpdate;
  layoutId: string;
  onClose: () => void;
  onOpen: () => void;
  playTarget?: PlayableTrack | null;
  onPlay?: () => void;
  canOpenArtist?: boolean;
}

function ExpandedUpdateModal({ update, layoutId, onClose, onOpen, playTarget = null, onPlay, canOpenArtist = true }: ExpandedUpdateModalProps) {
  const { kindLabel, KindIcon } = getArtistUpdateKindMeta(update.kind);
  const { chipClass } = kindStyle(update.kind);
  const img = update.artistImageUrl;

  // Lock document scroll while the modal is open. Without this, the
  // Browse page scrolls behind the open modal on mobile/trackpad —
  // the modal itself uses position:fixed so its position is stable,
  // but the body underneath remains scrollable and the user can
  // accidentally scroll the rail behind the dialog.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const titleId = `expanded-${layoutId.replace(/[^a-zA-Z0-9_-]/g, "_")}-title`;

  // Shared with Profile's saved-nugget dialog — see useDialogFocusTrap.
  const closeBtnRef = useDialogFocusTrap(onClose);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        layoutId={layoutId}
        className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
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
              ref={closeBtnRef}
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
            <h3 id={titleId} className="text-xl font-black text-white leading-tight mb-3">
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

            {/* One weight per action. Three filled pills gave every
                control the same emphasis and wrapped into a ragged
                two-row block; the labels also restated the headline
                directly above them, which is what made them so wide.
                Play is the only filled element — an icon, matching the
                treatment on the card tiles so the gesture reads the same
                on both surfaces — and the two navigations sit beside it
                as quiet links. */}
            <div className="flex items-center gap-3.5">
              {playTarget && onPlay && (
                // Unlabelled by design, so the aria-label carries the
                // whole promise: which track, by whom.
                <button
                  onClick={onPlay}
                  aria-label={`Play ${playTarget.title} by ${update.artistName}`}
                  className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-white text-black hover:bg-white/90 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <Play className="w-4 h-4 ml-[2px]" fill="currentColor" />
                </button>
              )}
              <div className="flex flex-col items-start gap-1.5 min-w-0">
                {canOpenArtist && (
                  <button
                    onClick={onOpen}
                    className="inline-flex items-center gap-1.5 max-w-full text-sm font-semibold text-primary hover:underline active:scale-95 transition-transform"
                  >
                    <span className="truncate">{update.artistName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </button>
                )}
                {isSafeUrl(update.source?.url) && (
                  // Scheme guard: only render the anchor if the URL is
                  // http(s). The url originates from Exa / Gemini output
                  // — without this a hallucinated `javascript:` or
                  // `data:` scheme would be a navigable XSS vector.
                  <a
                    href={update.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Source
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </>
  );
}

// Memoized export. The parent passes a stable onClose (useCallback)
// but onOpen is recreated each render — without memo the modal would
// re-render on every parent re-render, which is harmless on its own
// but adds noise during layout-shared transitions. Exported so
// LatestFactsSection (and any future consumer) can render the exact
// same modal without duplicating the Framer Motion layoutId wiring.
export const ExpandedUpdateModalMemoized = memo(ExpandedUpdateModal);

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
