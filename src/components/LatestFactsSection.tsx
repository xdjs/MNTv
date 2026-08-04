import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";
import {
  UpdateCard,
  ExpandedUpdateModalMemoized,
  cardKey,
} from "@/components/ArtistUpdatesSection";

/**
 * "Latest Facts" section on the Artist Profile. Renders artist-level
 * updates from the same edge function Browse uses, so a fact a user
 * just tapped on Browse is immediately available here.
 *
 * Uses the same image-backed UpdateCard + shared-layout ExpandedUpdate
 * Modal pattern that Browse uses, so the expand-on-tap feel is
 * consistent across the app. Layout differs from Browse: vertical
 * single-column stack (we're already on the artist page; no need for
 * a horizontal-scroll rail across multiple artists).
 *
 * If the URL has a `?nugget=<id>` query (Browse → Artist Profile tap-
 * through), this component scrolls the matching fact into view and
 * pulses it, then silently strips the param so a refresh doesn't repeat
 * it. It deliberately does NOT open the modal — the user pressed "Open
 * {Artist}" to see the artist, and re-opening the card they just came
 * from puts a full-screen overlay between them and the page they asked
 * for.
 */

interface Props {
  updates: ArtistUpdate[];
  loading: boolean;
  /** For empty / loading state copy. */
  artistName: string;
}

/** Respect motion sensitivity for the deep-link scroll. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function LatestFactsSection({ updates, loading, artistName }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetNuggetId = searchParams.get("nugget");
  const navigate = useNavigate();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  // Card nodes by layoutId, so the deep-link can scroll to the referenced
  // fact rather than opening it.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // layoutId namespace prefix. Both this section and Browse's
  // "Your artists, lately" rail render UpdateCard with the same
  // cardKey-derived layoutId. Different routes today so they never
  // co-exist in the DOM, but if React Router ever keeps both in the
  // tree during a shared-layout exit transition, Framer Motion would
  // try to animate the same layoutId from two DOM nodes and glitch.
  // Namespacing makes the contract airtight either way.
  const layoutIdFor = (u: ArtistUpdate) => `artist-profile-${cardKey(u)}`;

  // Look up the expanded update for modal content. Memoized so the
  // scan doesn't re-run on every parent re-render.
  const expandedUpdate = useMemo<ArtistUpdate | null>(() => {
    if (!expandedKey) return null;
    return updates.find((u) => layoutIdFor(u) === expandedKey) ?? null;
  }, [expandedKey, updates]);

  // Deep-link from Browse: point AT the referenced fact without covering
  // the page with it. Pete: "it takes me to the profile but the fact card
  // stays open or re-opens on top of the artist profile instead of
  // letting me see the artist profile." That was this effect calling
  // setExpandedKey — the card was never lingering, it was being opened
  // again on arrival.
  //
  // Scroll it into view and pulse it instead, which is what the artist
  // page already documented this param as doing.
  useEffect(() => {
    if (!targetNuggetId || updates.length === 0) return;
    const match = updates.find((u) => u.nuggetId === targetNuggetId);
    if (!match) return;
    const key = layoutIdFor(match);
    setPulseKey(key);
    // Next frame, so the card exists before we scroll to it.
    const scrollFrame = requestAnimationFrame(() => {
      cardRefs.current[key]?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    });
    const pulseTimer = setTimeout(() => setPulseKey(null), 1800);
    const stripTimer = setTimeout(() => {
      // Quietly remove the ?nugget= param so reload doesn't re-open.
      const next = new URLSearchParams(searchParams);
      next.delete("nugget");
      setSearchParams(next, { replace: true });
    }, 200);
    return () => {
      cancelAnimationFrame(scrollFrame);
      clearTimeout(pulseTimer);
      clearTimeout(stripTimer);
    };
    // Ignoring searchParams/setSearchParams in deps — including them
    // re-fires the effect on the strip, creating an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNuggetId, updates.length]);

  const modalOnClose = useCallback(() => setExpandedKey(null), []);

  // Modal's "Open / Listen" CTA. Release / collab cards in this
  // section route to /listen for the related track; pure fact cards
  // are a no-op (already on the artist profile) so the modal just
  // closes.
  const modalOnOpen = useCallback(() => {
    if (!expandedUpdate) return;
    setExpandedKey(null);
    const u = expandedUpdate;
    if ((u.kind === "new-release" || u.kind === "collab") && u.relatedTrackTitle) {
      const album = u.relatedAlbumName ?? "";
      const navUri = u.relatedTrackUri?.startsWith("spotify:track:") ? u.relatedTrackUri : "";
      navigate(
        `/listen/real::${encodeURIComponent(u.artistName)}::${encodeURIComponent(u.relatedTrackTitle)}::${encodeURIComponent(album)}::${encodeURIComponent(navUri)}`,
      );
    }
  }, [expandedUpdate, navigate]);

  if (!loading && updates.length === 0) {
    // Quiet fallback — don't render an empty section header on
    // artists we couldn't compose anything for.
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

      <div className="flex flex-col gap-3">
        {loading && updates.length === 0
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          : updates.map((u) => {
              const key = layoutIdFor(u);
              return (
                <div key={key} ref={(el) => { cardRefs.current[key] = el; }}>
                  <UpdateCard
                    layoutId={key}
                    update={u}
                    onClick={() => setExpandedKey(key)}
                    sizeClass="w-full h-44 md:h-48"
                    pulsing={pulseKey === key}
                  />
                </div>
              );
            })}
      </div>

      <AnimatePresence>
        {expandedUpdate && (
          <ExpandedUpdateModalMemoized
            update={expandedUpdate}
            layoutId={layoutIdFor(expandedUpdate)}
            onClose={modalOnClose}
            onOpen={modalOnOpen}
          />
        )}
      </AnimatePresence>

      {/* Reserve the section name in JSX comments for accessibility
          screen readers — `artistName` is the data shape contract
          used by the parent ArtistProfile when an empty state needs a
          name. We don't render the artist name visibly here (the page
          header already shows it). */}
      <span className="sr-only">Latest facts about {artistName}</span>
    </section>
  );
}

function SkeletonCard() {
  // Full-width tall skeleton matching the real card's footprint so
  // the layout doesn't jump when content lands.
  return (
    <div
      className="w-full h-44 md:h-48 rounded-2xl bg-white/[0.04] border border-white/5 animate-pulse"
      aria-hidden
    />
  );
}
