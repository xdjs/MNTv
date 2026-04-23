import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { Story } from "@/hooks/usePreGeneratedStories";
import { usePlayer } from "@/contexts/PlayerContext";

// Persisted visited set: Instagram-style "watched" state. Stories the user
// has tapped (or is currently playing) get dimmed and move to the end of
// the rail. Persists across reload for 24h so reopening the app doesn't
// reset the visual hierarchy.
const VISITED_KEY = "musicnerd_visited_stories";
const VISITED_TTL_MS = 24 * 60 * 60 * 1000;

function readVisited(): Map<string, number> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const out = new Map<string, number>();
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === "number" && now - ts < VISITED_TTL_MS) out.set(k, ts);
    }
    return out;
  } catch {
    return new Map();
  }
}
function writeVisited(m: Map<string, number>): void {
  try {
    const obj: Record<string, number> = {};
    m.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(VISITED_KEY, JSON.stringify(obj));
  } catch { /* noop */ }
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
  const { currentTrack } = usePlayer();
  const [visited, setVisited] = useState<Map<string, number>>(() => readVisited());
  // Track which stories have JUST flipped to ready so we can pulse them once.
  // Previous-ready state persists in a ref so we don't pulse on every render.
  const prevReadyRef = useRef<Set<string>>(new Set());
  const [justReadyIds, setJustReadyIds] = useState<Set<string>>(new Set());

  // Auto-mark any story as visited if it matches the currently-playing track.
  // Catches the case where the user navigated to the Listen page via Browse
  // tiles or search (not the story tap), so the story's visual state still
  // reflects "you've engaged with this track."
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
      const next = new Map(prev);
      next.set(match.trackKey, Date.now());
      writeVisited(next);
      return next;
    });
  }, [currentTrack?.artist, currentTrack?.title, stories]);

  // Sort unwatched first, watched last — mirrors Instagram's visual hierarchy
  // where new stories crowd the front and seen ones trail behind.
  const sorted = useMemo(() => {
    return [...stories].sort((a, b) => {
      const av = visited.has(a.trackKey) ? 1 : 0;
      const bv = visited.has(b.trackKey) ? 1 : 0;
      return av - bv;
    });
  }, [stories, visited]);

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
      const next = new Map(prev);
      next.set(s.trackKey, Date.now());
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
        {sorted.map((s) => {
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
