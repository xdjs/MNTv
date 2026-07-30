import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Music, Share2, Trash2, Check, Play, X, ExternalLink } from "lucide-react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { useBookmarks, type Bookmark } from "@/hooks/useBookmarks";
import PageTransition from "@/components/PageTransition";
import { AnimatePresence, motion } from "framer-motion";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { isSafeUrl } from "@/lib/urlSafety";

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
// (format: `real::artist::title::album::uri`). Encode before embedding
// because artist/title/album can contain `#`, `?`, `&`, `+`, or spaces —
// left unencoded, `?` truncates into a query string and `#` into a hash
// fragment, breaking both the Profile tile tap and the Share URL. Listen
// decodes the splat param on the way in, so the round-trip is safe.
function listenUrlFor(bm: Bookmark): string {
  return `/listen/${encodeURIComponent(bm.track_id)}`;
}

// Bookmarks store no artist id, so this uses the search-by-name form the
// app already resolves server-side (same fallback RecommendedButtons uses
// when Gemini gives a name but no Spotify id).
function artistUrlFor(bm: Bookmark): string {
  return `/artist/real::${encodeURIComponent(bm.artist)}`;
}

// A saved nugget's citation, when the edge function stored one.
function sourceUrlOf(bm: Bookmark): string | null {
  const src = bm.source as { url?: unknown } | null;
  const url = typeof src?.url === "string" ? src.url : null;
  return url && isSafeUrl(url) ? url : null;
}

export default function Profile() {
  const { profile } = useUserProfile();
  const { bookmarks, loading, signedIn, toggle } = useBookmarks();
  const navigate = useNavigate();
  // Transient per-row UI state for the share button's "Copied!" confirmation.
  // Keyed by bookmark id.
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  // Tapping a saved nugget used to navigate straight to Listen, which
  // committed the user to playback before they could re-read what they
  // saved or decide they wanted the artist instead. Now it opens.
  const [openId, setOpenId] = useState<string | null>(null);
  const openBookmark = useMemo(
    () => bookmarks.find((b) => b.id === openId) ?? null,
    [bookmarks, openId],
  );
  // Validated once rather than on each render branch that needs it.
  const sourceUrl = openBookmark ? sourceUrlOf(openBookmark) : null;
  const closeDetail = useCallback(() => setOpenId(null), []);
  // Same Escape / focus-trap / focus-restore behaviour as the Browse
  // expanded card. This dialog was written to match that one visually
  // and shipped without any of it, so a keyboard user could Tab straight
  // through the backdrop with no way to dismiss.
  const closeBtnRef = useDialogFocusTrap(closeDetail, !!openBookmark);

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
                          onClick={() => setOpenId(bm.id)}
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

      {/* Saved-nugget detail. Opening the card first is the point: a saved
          nugget is something you chose to keep, so the tap should let you
          re-read it and then decide where to go — the song, the artist, or
          the source — rather than committing you to playback.

          Action shape matches the Browse expanded card deliberately: one
          filled play control, quiet links beside it. Same gesture, same
          meaning, on both surfaces. */}
      <AnimatePresence>
        {openBookmark && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetail}
          >
            <motion.div
              className="relative w-full max-w-md bg-neutral-950 rounded-2xl overflow-hidden ring-1 ring-white/10 max-h-[85vh] flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-label={openBookmark.headline}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {openBookmark.image_url && (
                <div className="relative h-44 shrink-0">
                  <img src={openBookmark.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
                </div>
              )}

              <button
                ref={closeBtnRef}
                onClick={closeDetail}
                aria-label="Close"
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center active:scale-95 transition-transform"
              >
                <X className="w-4 h-4 text-white/80" />
              </button>

              <div className="px-5 pb-5 pt-4 overflow-y-auto scrollbar-hide">
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                  {openBookmark.artist} · {openBookmark.title}
                </p>
                <h2 className="text-xl font-black text-white leading-tight mb-3">
                  {openBookmark.headline}
                </h2>
                <p className="text-sm text-white/75 leading-relaxed mb-5">
                  {openBookmark.body}
                </p>

                <div className="flex items-center gap-3.5">
                  <button
                    onClick={() => navigate(listenUrlFor(openBookmark))}
                    aria-label={`Play ${openBookmark.title} by ${openBookmark.artist}`}
                    className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-white text-black hover:bg-white/90 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <Play className="w-4 h-4 ml-[2px]" fill="currentColor" />
                  </button>
                  <div className="flex flex-col items-start gap-1.5 min-w-0">
                    <button
                      onClick={() => navigate(artistUrlFor(openBookmark))}
                      className="inline-flex items-center gap-1.5 max-w-full text-sm font-semibold text-primary hover:underline active:scale-95 transition-transform"
                    >
                      <span className="truncate">{openBookmark.artist}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </button>
                    {sourceUrl && (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
                      >
                        Source
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
