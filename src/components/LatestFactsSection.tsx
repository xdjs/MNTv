import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";
import { getArtistUpdateKindMeta } from "@/lib/artistUpdateKind";

/**
 * "Latest Facts" section on the Artist Profile. Renders artist-level
 * updates from the same edge function Browse uses, so a nugget the
 * user just tapped on Browse is immediately available here.
 *
 * If the URL has a `?nugget=<id>` query (Browse → Artist Profile tap-
 * through), this component scrolls the matching fact into view, auto-
 * expands it, and pulses a ring around it for ~1.2s before silently
 * removing the query param so a refresh doesn't re-pulse.
 */

interface Props {
  updates: ArtistUpdate[];
  loading: boolean;
  /** For empty / loading state copy. */
  artistName: string;
}

export default function LatestFactsSection({ updates, loading, artistName }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetNuggetId = searchParams.get("nugget");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Scroll + highlight behavior when landed via `?nugget=<id>`.
  useEffect(() => {
    if (!targetNuggetId || updates.length === 0) return;
    const match = updates.find((u) => u.nuggetId === targetNuggetId);
    if (!match) return;
    const id = match.nuggetId!;
    setExpandedId(id);
    setPulseId(id);
    // Defer the scroll one tick so the expanded body has laid out.
    const scrollTimer = setTimeout(() => {
      cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
    const pulseTimer = setTimeout(() => setPulseId(null), 1200);
    const stripTimer = setTimeout(() => {
      // Quietly remove the ?nugget= param so reload doesn't re-pulse.
      const next = new URLSearchParams(searchParams);
      next.delete("nugget");
      setSearchParams(next, { replace: true });
    }, 1400);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(pulseTimer);
      clearTimeout(stripTimer);
    };
    // Ignoring searchParams/setSearchParams in deps because including
    // them re-fires the effect on the strip, creating an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNuggetId, updates.length]);

  if (!loading && updates.length === 0) {
    // Quiet fallback — don't render an empty section header on artists
    // we couldn't compose anything for.
    return null;
  }

  return (
    <section className="px-4 md:px-10 pb-6 md:pb-8 mb-4">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-bold text-foreground/90 font-nunito">
          Latest Facts
        </h2>
        {loading && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-rose-300/70">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {loading && updates.length === 0
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          : updates.map((u) => (
              <FactCard
                key={u.nuggetId ?? `${u.kind}-${u.headline}`}
                update={u}
                expanded={u.nuggetId === expandedId}
                pulsing={u.nuggetId === pulseId}
                onToggle={() =>
                  setExpandedId((prev) => (prev === u.nuggetId ? null : (u.nuggetId ?? null)))
                }
                registerRef={(el) => {
                  if (u.nuggetId) cardRefs.current.set(u.nuggetId, el);
                }}
              />
            ))}
      </div>
    </section>
  );
}

// ── Fact card ─────────────────────────────────────────────────────────

interface FactCardProps {
  update: ArtistUpdate;
  expanded: boolean;
  pulsing: boolean;
  onToggle: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

function FactCard({ update, expanded, pulsing, onToggle, registerRef }: FactCardProps) {
  const { kindLabel, KindIcon } = getArtistUpdateKindMeta(update.kind);
  const chipClass = kindClass(update.kind);
  return (
    <div
      ref={registerRef}
      className={`rounded-2xl border bg-gradient-to-br from-white/[0.06] to-white/[0.02] transition-all ${
        pulsing
          ? "border-rose-400/70 ring-2 ring-rose-400/40"
          : "border-white/10 hover:border-white/20"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        aria-expanded={expanded}
      >
        <span
          className={`mt-0.5 shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${chipClass}`}
        >
          <KindIcon className="w-3 h-3" />
          {kindLabel}
        </span>
        <h3 className="flex-1 text-sm md:text-base font-semibold text-white/95 leading-snug">
          {update.headline}
        </h3>
      </button>
      {expanded && (
        <div className="px-4 pb-4 -mt-1 flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-white/70">{update.body}</p>
          {update.source?.url && (
            <a
              href={update.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-white/40 hover:text-white/70 transition-colors self-start"
            >
              Source: {update.source.publisher ?? "link"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// Local styling for the artist-profile chip. Label + icon come from
// the shared helper in src/lib/artistUpdateKind.ts so adding a new
// kind only edits one file.
function kindClass(kind: ArtistUpdate["kind"]): string {
  switch (kind) {
    case "new-release": return "bg-rose-500/15 text-rose-300";
    case "collab": return "bg-violet-500/15 text-violet-300";
    case "fact":
    default: return "bg-sky-500/15 text-sky-300";
  }
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/5 p-4 animate-pulse" aria-hidden>
      <div className="flex items-center gap-3 mb-2">
        <div className="h-4 w-16 rounded-full bg-white/10" />
        <div className="h-4 flex-1 rounded bg-white/10" />
      </div>
      <div className="h-3 w-5/6 rounded bg-white/5" />
    </div>
  );
}
