import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Music, Share2, Trash2, Check } from "lucide-react";
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

// track_id is stored as the same string Listen.tsx uses as its rawTrackId
// (format: `real::artist::title::album::uri`), so we embed it as-is.
function listenUrlFor(bm: Bookmark): string {
  return `/listen/${bm.track_id}`;
}

export default function Profile() {
  const { profile } = useUserProfile();
  const { bookmarks, loading, signedIn, toggle } = useBookmarks();
  const navigate = useNavigate();
  // Transient per-row UI state for the share button's "Copied!" confirmation.
  // Keyed by bookmark id.
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());

  async function handleShare(bm: Bookmark) {
    const url = `${window.location.origin}${listenUrlFor(bm)}`;
    const text = `${bm.headline}\n\n${bm.body}\n\n— ${bm.artist}, ${bm.title}\n${url}`;
    try {
      // Prefer Web Share API on mobile so users can send to Messages / Whatsapp
      // directly; fall back to clipboard copy on desktop.
      if (navigator.share) {
        await navigator.share({ title: bm.headline, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSharedIds((prev) => {
        const next = new Set(prev);
        next.add(bm.id);
        return next;
      });
      setTimeout(() => {
        setSharedIds((prev) => {
          const next = new Set(prev);
          next.delete(bm.id);
          return next;
        });
      }, 1500);
    } catch {
      // User cancelled the share sheet, or clipboard blocked — silent.
    }
  }

  function handleRemove(bm: Bookmark) {
    // toggle removes when already-bookmarked (which it always is on Profile).
    // Optimistic update from useBookmarks makes the row disappear instantly.
    toggle({
      trackId: bm.track_id,
      artist: bm.artist,
      title: bm.title,
      kind: bm.nugget_kind,
      headline: bm.headline,
      body: bm.body,
      source: bm.source,
      imageUrl: bm.image_url ?? undefined,
    });
  }

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
                      <div
                        key={bm.id}
                        className="bg-white/5 hover:bg-white/10 transition rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => navigate(listenUrlFor(bm))}
                          className="w-full text-left active:scale-[0.99] transition-transform p-4 flex gap-3"
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
                        {/* Per-bookmark quick actions. e.stopPropagation isn't
                            needed — the card and these buttons are siblings,
                            not nested — so tapping an action never bubbles to
                            the jump-to-Listen handler. */}
                        <div className="px-4 pb-3 pt-0 flex gap-2 border-t border-white/5">
                          <button
                            onClick={() => handleShare(bm)}
                            aria-label="Share nugget"
                            className="text-[11px] px-3 py-1.5 rounded-full bg-white/10 text-white/70 active:scale-95 transition-transform flex items-center gap-1.5 mt-2"
                          >
                            {sharedIds.has(bm.id) ? (
                              <>
                                <Check className="w-3 h-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Share2 className="w-3 h-3" />
                                Share
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleRemove(bm)}
                            aria-label="Remove bookmark"
                            className="text-[11px] px-3 py-1.5 rounded-full bg-white/5 text-white/50 hover:bg-rose-500/15 hover:text-rose-400 active:scale-95 transition-all flex items-center gap-1.5 mt-2"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      </div>
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
