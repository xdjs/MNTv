import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { Story } from "@/hooks/usePreGeneratedStories";

// Per-session visited set so tapped stories go dim (Instagram-style "seen"
// treatment). Survives page navigation but not a full reload — intentional,
// since the user may want to revisit a story for its nugget.
const VISITED_KEY = "musicnerd_visited_stories";
function readVisited(): Set<string> {
  try {
    const raw = sessionStorage.getItem(VISITED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function writeVisited(s: Set<string>): void {
  try { sessionStorage.setItem(VISITED_KEY, JSON.stringify([...s])); } catch { /* noop */ }
}

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
  const [visited, setVisited] = useState<Set<string>>(() => readVisited());
  // Track which stories have JUST flipped to ready so we can pulse them once.
  // Previous-ready state persists in a ref so we don't pulse on every render.
  const prevReadyRef = useRef<Set<string>>(new Set());
  const [justReadyIds, setJustReadyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const nowReady = new Set(stories.filter((s) => s.ready).map((s) => s.trackKey));
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
  }, [stories]);

  if (stories.length === 0) return null;

  const handleTap = (s: Story) => {
    setVisited((prev) => {
      const next = new Set(prev);
      next.add(s.trackKey);
      writeVisited(next);
      return next;
    });
    navigate(listenHrefForStory(s));
  };

  return (
    <div className="mb-4 md:mb-6">
      <div className="px-4 md:px-10 mb-2">
        <p className="text-xs uppercase tracking-widest text-white/40">Your stories</p>
      </div>
      <div
        className="flex gap-3 overflow-x-auto px-4 md:px-10 pb-2 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {stories.map((s) => {
          const isVisited = visited.has(s.trackKey);
          const justReady = justReadyIds.has(s.trackKey);
          return (
            <button
              key={s.trackKey}
              onClick={() => handleTap(s)}
              className={`flex flex-col items-center shrink-0 active:scale-95 transition-transform ${
                isVisited ? "opacity-60" : ""
              }`}
              aria-label={`Open ${s.artist} — ${s.title}`}
            >
              <div
                className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full p-[2px] transition-colors ${
                  s.ready
                    ? isVisited
                      ? "bg-white/20"
                      : "bg-gradient-to-tr from-rose-500 to-pink-400"
                    : "bg-white/15"
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
                {s.artist}
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
