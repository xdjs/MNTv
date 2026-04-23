import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { Story } from "@/hooks/usePreGeneratedStories";

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
  if (stories.length === 0) return null;

  return (
    <div className="mb-4 md:mb-6">
      <div className="px-4 md:px-10 mb-2">
        <p className="text-xs uppercase tracking-widest text-white/40">Your nuggets</p>
      </div>
      <div
        className="flex gap-3 overflow-x-auto px-4 md:px-10 pb-2 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {stories.map((s) => (
          <button
            key={s.trackKey}
            onClick={() => navigate(listenHrefForStory(s))}
            className="flex flex-col items-center shrink-0 active:scale-95 transition-transform"
            aria-label={`Open ${s.artist} — ${s.title}`}
          >
            <div
              className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full p-[2px] transition-colors ${
                s.ready
                  ? "bg-gradient-to-tr from-rose-500 to-pink-400"
                  : "bg-white/15"
              }`}
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
        ))}
      </div>
    </div>
  );
}
