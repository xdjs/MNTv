import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Music } from "lucide-react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { useBookmarks, type Bookmark } from "@/hooks/useBookmarks";
import PageTransition from "@/components/PageTransition";

// Group bookmarks into date buckets for a scannable profile page. Exact
// edges don't matter much — the goal is to let a user visually parse
// "new stuff today" from "stuff from a while ago."
function bucketBookmark(bm: Bookmark): "Today" | "This week" | "Earlier" {
  const now = Date.now();
  const age = now - new Date(bm.created_at).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  if (age < DAY) return "Today";
  if (age < 7 * DAY) return "This week";
  return "Earlier";
}

// Reconstruct the /listen URL for a bookmark — matches Listen.tsx's
// expected format: `real::artist::title::album::uri`. Album + URI may be
// missing on older bookmarks; the Listen page tolerates empty segments.
function listenUrlFor(bm: Bookmark): string {
  const enc = encodeURIComponent;
  const album = bm.album ?? "";
  // track_id is the same string Listen uses as the rawTrackId; embed it as-is.
  return `/listen/${bm.track_id}`;
}

export default function Profile() {
  const { profile } = useUserProfile();
  const { bookmarks, loading, signedIn } = useBookmarks();
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const out: Record<"Today" | "This week" | "Earlier", Bookmark[]> = {
      "Today": [],
      "This week": [],
      "Earlier": [],
    };
    for (const bm of bookmarks) out[bucketBookmark(bm)].push(bm);
    return out;
  }, [bookmarks]);

  const displayName = profile?.spotifyDisplayName || "Music Nerd";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md px-4 pt-3 pb-2 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Link
              to="/browse"
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-white/40">Profile</p>
              <p className="text-base font-semibold text-white truncate">{displayName}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pt-6">
          <h1 className="text-2xl font-bold mb-1">Saved nuggets</h1>
          <p className="text-sm text-white/50 mb-6">
            Tap the heart on any nugget to save it here.
          </p>

          {loading && (
            <div className="text-sm text-white/50 py-8 text-center">Loading…</div>
          )}

          {!loading && !signedIn && (
            <div className="text-sm text-white/60 py-8 text-center">
              Sign in to Spotify or Apple Music to save and see your bookmarks.
            </div>
          )}

          {!loading && signedIn && bookmarks.length === 0 && (
            <div className="text-sm text-white/50 py-16 text-center">
              <Heart className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>Your saved nuggets will appear here.</p>
              <p className="mt-1 text-xs">Start listening — tap the heart on any fact you want to keep.</p>
            </div>
          )}

          {!loading &&
            signedIn &&
            bookmarks.length > 0 &&
            (["Today", "This week", "Earlier"] as const).map((bucket) =>
              grouped[bucket].length === 0 ? null : (
                <section key={bucket} className="mb-6">
                  <h2 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                    {bucket}
                  </h2>
                  <div className="flex flex-col gap-3">
                    {grouped[bucket].map((bm) => (
                      <button
                        key={bm.id}
                        onClick={() => navigate(listenUrlFor(bm))}
                        className="text-left bg-white/5 hover:bg-white/10 active:scale-[0.99] transition rounded-lg p-4 flex gap-3"
                      >
                        {bm.image_url ? (
                          <img
                            src={bm.image_url}
                            alt=""
                            className="w-14 h-14 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
                            <Music className="w-5 h-5 text-white/30" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">
                            {bm.artist} · {bm.title}
                          </p>
                          <p className="text-sm font-semibold text-white mb-1 line-clamp-2">
                            {bm.headline}
                          </p>
                          <p className="text-xs text-white/50 line-clamp-2">{bm.body}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ),
            )}
        </div>
      </div>
    </PageTransition>
  );
}
