import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, Users, Disc } from "lucide-react";
import type { ArtistUpdate, ArtistUpdateGroup } from "@/hooks/useArtistUpdates";
import { serviceParamFromProfile, withAppleStorefront } from "@/lib/appleStorefront";
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

export default function ArtistUpdatesSection({
  groups,
  profile,
  artistIds = {},
  totalCount,
  readyCount,
}: Props) {
  const navigate = useNavigate();
  const activeService = serviceParamFromProfile(profile?.streamingService);

  if (groups.length === 0) return null;

  const showProgress = totalCount > 0 && readyCount < totalCount;

  function openArtistAtNugget(update: ArtistUpdate) {
    const id = artistIds[update.artistName] || update.artistId;
    if (!id) return;
    const path = withAppleStorefront(
      `/artist/${activeService}:${id}?nugget=${encodeURIComponent(update.nuggetId ?? "")}`,
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
              onOpen={openArtistAtNugget}
            />
          );
        })}
      </div>
    </section>
  );
}

// ── Per-artist row ────────────────────────────────────────────────────

interface ArtistRowProps {
  group: ArtistUpdateGroup;
  onOpen: (u: ArtistUpdate) => void;
}

function ArtistRow({ group, onOpen }: ArtistRowProps) {
  const loading = group.updates === null;
  const updates = group.updates ?? [];
  // Best-effort cover image for the row header — use the first update
  // if present, otherwise fall back to a neutral gradient tile.
  const heroImg = updates[0]?.artistImageUrl ?? "";

  return (
    <div>
      <div className="px-4 md:px-10 mb-2 flex items-center gap-3">
        {heroImg ? (
          <img
            src={heroImg}
            alt=""
            className="w-8 h-8 rounded-full object-cover opacity-90"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400/30 to-pink-500/30" />
        )}
        <span className="text-sm font-semibold text-white/85">
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
                key={u.nuggetId ?? `${u.kind}-${u.headline}`}
                update={u}
                onOpen={() => onOpen(u)}
              />
            ))}
      </div>
    </div>
  );
}

// ── One update card ───────────────────────────────────────────────────

interface UpdateCardProps {
  update: ArtistUpdate;
  onOpen: () => void;
}

function UpdateCard({ update, onOpen }: UpdateCardProps) {
  const { kindLabel, kindClass, KindIcon } = kindMeta(update.kind);
  return (
    <button
      onClick={onOpen}
      className="shrink-0 w-[280px] md:w-[320px] text-left rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 p-4 hover:border-white/25 active:scale-[0.98] transition-all"
      aria-label={`${kindLabel}: ${update.headline}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${kindClass}`}>
          <KindIcon className="w-3 h-3" />
          {kindLabel}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-3 mb-2">
        {update.headline}
      </h3>
      <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
        {update.body}
      </p>
    </button>
  );
}

function kindMeta(kind: ArtistUpdate["kind"]): {
  kindLabel: string;
  kindClass: string;
  KindIcon: typeof Sparkles;
} {
  switch (kind) {
    case "new-release":
      return {
        kindLabel: "New release",
        kindClass: "bg-rose-500/15 text-rose-300",
        KindIcon: Disc,
      };
    case "collab":
      return {
        kindLabel: "Collab",
        kindClass: "bg-violet-500/15 text-violet-300",
        KindIcon: Users,
      };
    case "fact":
    default:
      return {
        kindLabel: "Fact",
        kindClass: "bg-sky-500/15 text-sky-300",
        KindIcon: Sparkles,
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
