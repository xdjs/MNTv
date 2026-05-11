import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { Story } from "@/hooks/usePreGeneratedStories";
import { usePlayer } from "@/contexts/PlayerContext";
import { readVisited, markVisited, type VisitedMap } from "@/lib/storyVisited";

// Visited tracking lives in src/lib/storyVisited so StoriesContext's
// cascade selector and this rail share the same data. Pete 2026-05-10:
// "If I already listened to a track in my story, from me as the user
// pressing that story, it should clear from my stories and present a
// new track" — so visited stories now DISAPPEAR (was: dimmed). The
// cascade replaces the slot from the next eligible liked track.

/**
 * StoriesRail: Instagram-style horizontal row of "stories" at the top of
 * Browse. Each story = one of the user's top tracks with a nugget ready
 * (or warming up). Tapping a story jumps to Listen for that track; the
 * first nugget lands instantly if pre-gen already primed the cache.
 *
 * Visual language:
 *   - Ring: rose = ready (nugget primed), gray = still warming
 *   - Spinner overlay on not-yet-ready circles
 *   - Album art in the circle, artist name below
 */
interface StoriesRailProps {
  stories: Story[];
}

function listenHrefForStory(s: Story): string {
  const enc = encodeURIComponent;
  const uri = s.uri ?? "";
  // Mirror Listen's `real::artist::title::album::uri` trackId format. We
  // don't have album data in the stories source; an empty album slot parses
  // fine in Listen.tsx.
  return `/listen/real::${enc(s.artist)}::${enc(s.title)}::${enc("")}::${enc(uri)}`;
}

export default function StoriesRail({ stories }: StoriesRailProps) {
  const navigate = useNavigate();
  const { currentTrack } = usePlayer();
  const [visited, setVisited] = useState<VisitedMap>(() => readVisited());
  // Track which stories have JUST flipped to ready so we can pulse them once.
  // Previous-ready state persists in a ref so we don't pulse on every render.
  const prevReadyRef = useRef<Set<string>>(new Set());
  const [justReadyIds, setJustReadyIds] = useState<Set<string>>(new Set());

  // Listen for visited writes from anywhere (handleTap below, the
  // currently-playing-track effect, or another tab) so the rail stays
  // in sync with what StoriesContext's cascade is using.
  useEffect(() => {
    function refresh() { setVisited(readVisited()); }
    window.addEventListener("musicnerd:visited-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("musicnerd:visited-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Auto-mark any story as visited if it matches the currently-playing track.
  // Catches the case where the user navigated to the Listen page via Browse
  // tiles or search (not the story tap).
  // Functional updater so we don't have to list `visited` as a dep —
  // listing visited would make this effect re-run on every tap (which
  // updates visited), and even though the early-return inside guards
  // against an infinite loop, the cleaner form is to receive `prev`
  // and let setVisited decide whether to bail.
  useEffect(() => {
    if (!currentTrack) return;
    const match = stories.find(
      (s) =>
        s.artist.toLowerCase() === currentTrack.artist.toLowerCase() &&
        s.title.toLowerCase() === currentTrack.title.toLowerCase(),
    );
    if (!match) return;
    setVisited((prev) => {
      if (prev.has(match.trackKey)) return prev;
      return markVisited(match.trackKey, prev);
    });
  }, [currentTrack?.artist, currentTrack?.title, stories]);

  // Hide visited stories entirely (Pete 2026-05-10 spec: "it should
  // clear from my stories"). StoriesContext's cascade selector then
  // refills the slot with the next eligible liked track. Until the
  // cascade hands a fresh story, the rail just renders fewer cards —
  // no dimmed placeholders.
  const visibleStories = useMemo(
    () => stories.filter((s) => !visited.has(s.trackKey)),
    [stories, visited],
  );

  useEffect(() => {
    const nowReady = new Set(visibleStories.filter((s) => s.ready).map((s) => s.trackKey));
    const newlyReady = new Set<string>();
    nowReady.forEach((k) => { if (!prevReadyRef.current.has(k)) newlyReady.add(k); });
    prevReadyRef.current = nowReady;
    if (newlyReady.size === 0) return;
    setJustReadyIds((prev) => {
      const next = new Set(prev);
      newlyReady.forEach((k) => next.add(k));
      return next;
    });
    // Remove after the pulse animation settles (1s) so stale entries don't
    // keep pulsing on every re-render.
    const timer = setTimeout(() => {
      setJustReadyIds((prev) => {
        const next = new Set(prev);
        newlyReady.forEach((k) => next.delete(k));
        return next;
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [visibleStories]);

  if (visibleStories.length === 0) return null;

  const handleTap = (s: Story) => {
    // Update local state synchronously with the returned map so the
    // story disappears in the same React tick as the navigation. The
    // event listener also fires from markVisited but is async — if
    // navigate ever becomes soft/animated, the rail would briefly
    // flicker the still-visible story without this synchronous call.
    setVisited(markVisited(s.trackKey, visited));
    navigate(listenHrefForStory(s));
  };

  const warmingCount = visibleStories.filter((s) => !s.ready).length;

  return (
    <div className="mb-4 md:mb-6">
      <div className="px-4 md:px-10 mb-2 flex items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-white/40">Your stories</p>
        {warmingCount > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-rose-300/70">
            <Loader2 className="w-3 h-3 animate-spin" />
            {warmingCount} warming up
          </span>
        )}
      </div>
      <div
        className="flex gap-3 overflow-x-auto px-4 md:px-10 pb-2 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {visibleStories.map((s) => {
          const justReady = justReadyIds.has(s.trackKey);
          return (
            <button
              key={s.trackKey}
              onClick={() => handleTap(s)}
              className="flex flex-col items-center shrink-0 active:scale-95 transition-transform"
              aria-label={`Open ${s.artist} — ${s.title}`}
            >
              <div
                className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full p-[2px] transition-colors ${
                  s.ready ? "bg-gradient-to-tr from-rose-500 to-pink-400" : "bg-white/15"
                } ${justReady ? "animate-pulse-once" : ""}`}
                style={justReady ? { animation: "mn-pulse 0.9s ease-out 1" } : undefined}
              >
                <div className="w-full h-full rounded-full bg-background overflow-hidden p-[2px]">
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-white/10" />
                  )}
                </div>
                {!s.ready && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                    <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] text-white/80 max-w-[80px] truncate">
                {[s.artist, ...(s.collaborators ?? [])].filter(Boolean).join(", ")}
              </p>
            </button>
          );
        })}
      </div>
      {/* Scoped keyframe for the "just became ready" pulse. Using inline
          style above means we need the animation defined somewhere in-tree.
          Vite bundles this style block with the component. */}
      <style>{`
        @keyframes mn-pulse {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
