import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useMusicNerdState";

interface SearchArtist { id: string; name: string; imageUrl: string }
interface SearchTrack { title: string; artist: string; album: string; imageUrl: string; uri: string }
interface SearchResults { artists: SearchArtist[]; tracks: SearchTrack[] }

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const isAppleMusicUser = profile?.streamingService === "Apple Music";
  const serviceParam = isAppleMusicUser ? "apple" : "spotify";
  const sourceLabel = isAppleMusicUser ? "Apple Music" : "Spotify";

  const hasResults = searchResults && (searchResults.artists.length + searchResults.tracks.length > 0);

  // Debounced catalog search — service param routes to Spotify or Apple Music
  // inside the shared edge function.
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: q.trim(), service: serviceParam },
      });
      if (error) throw error;
      setSearchResults(data as SearchResults);
    } catch (err) {
      console.error(`[search] ${serviceParam} search error:`, err);
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, [serviceParam]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSearchResults(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const noResults = query.length > 0 && !hasResults && !searchLoading;

  // Artist routes: use the active service's prefix so the downstream
  // detail page fetches from the right catalog. `real::` remains the
  // fallback for bare names with no catalog ID.
  const buildArtistRoute = (a: SearchArtist): string => {
    if (!a.id) return `/artist/real::${encodeURIComponent(a.name)}`;
    return isAppleMusicUser
      ? `/artist/apple::${a.id}::${encodeURIComponent(a.name)}`
      : `/artist/spotify::${a.id}::${encodeURIComponent(a.name)}`;
  };

  // Track routes encode the URI directly — `apple:song:XXX` vs
  // `spotify:track:XXX` both flow through the same `real::` handler in
  // Listen.tsx and PlayerContext picks the engine based on
  // getServiceFromUri(uri).
  const buildTrackRoute = (t: SearchTrack): string => {
    const base = `/listen/real::${encodeURIComponent(t.artist)}::${encodeURIComponent(t.title)}::${encodeURIComponent(t.album)}::${encodeURIComponent(t.uri || "")}`;
    return t.imageUrl ? `${base}?art=${encodeURIComponent(t.imageUrl)}` : base;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl"
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 md:gap-4 px-4 md:px-10 pt-6 md:pt-8">
            <Search size={24} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists, albums, tracks…"
              className="flex-1 bg-transparent text-xl md:text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none"
              style={{ fontFamily: "'Nunito Sans', sans-serif" }}
            />
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 md:px-10 pt-6 md:pt-8 pb-20">
            {noResults && (
              <p className="text-muted-foreground text-lg">No results for "{query}"</p>
            )}

            {query.trim().length >= 2 && (
              <>
                {searchLoading && !hasResults && (
                  <div className="flex items-center gap-2 text-muted-foreground mt-4">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Searching {sourceLabel}…</span>
                  </div>
                )}

                {hasResults && (
                  <>
                    <div className="border-t border-foreground/10 mt-4 mb-6" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">From {sourceLabel}</h2>

                    {searchResults!.artists.length > 0 && (
                      <section className="mb-8">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Artists</h3>
                        <div className="flex flex-wrap gap-4">
                          {searchResults!.artists.map((a) => (
                            <button
                              key={a.id || a.name}
                              onClick={() => { onClose(); navigate(buildArtistRoute(a)); }}
                              className="flex items-center gap-3 rounded-xl bg-foreground/5 p-3 pr-6 transition-colors hover:bg-foreground/10"
                            >
                              {a.imageUrl ? (
                                <img src={a.imageUrl} alt={a.name} className="h-12 w-12 rounded-full object-cover" />
                              ) : (
                                <div className="h-12 w-12 rounded-full bg-foreground/10 flex items-center justify-center text-muted-foreground text-lg font-bold">
                                  {a.name[0]}
                                </div>
                              )}
                              <p className="text-sm font-bold text-foreground">{a.name}</p>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {searchResults!.tracks.length > 0 && (
                      <section className="mb-8">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Tracks</h3>
                        <div className="space-y-2">
                          {searchResults!.tracks.map((t, i) => (
                            <button
                              key={`${t.artist}-${t.title}-${i}`}
                              onClick={() => { onClose(); navigate(buildTrackRoute(t)); }}
                              className="flex w-full items-center gap-4 rounded-xl p-3 transition-colors hover:bg-foreground/5 text-left"
                            >
                              {t.imageUrl ? (
                                <img src={t.imageUrl} alt={t.title} className="h-10 w-10 rounded-lg object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded-lg bg-foreground/10" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{t.artist} · {t.album}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
