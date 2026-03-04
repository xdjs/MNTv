import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchCatalog } from "@/mock/tracks";
import { supabase } from "@/integrations/supabase/client";

interface SpotifyArtist { id: string; name: string; imageUrl: string }
interface SpotifyTrack { title: string; artist: string; album: string; imageUrl: string; uri: string }
interface SpotifyResults { artists: SpotifyArtist[]; tracks: SpotifyTrack[] }

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyResults | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  // Local (instant) results
  const results = searchCatalog(query);
  const hasLocalResults = results.artists.length + results.albums.length + results.tracks.length > 0;
  const hasSpotifyResults = spotifyResults && (spotifyResults.artists.length + spotifyResults.tracks.length > 0);

  // Debounced Spotify search
  const searchSpotify = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSpotifyResults(null);
      setSpotifyLoading(false);
      return;
    }
    setSpotifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: q.trim() },
      });
      if (error) throw error;
      setSpotifyResults(data as SpotifyResults);
    } catch (err) {
      console.error("Spotify search error:", err);
      setSpotifyResults(null);
    } finally {
      setSpotifyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSpotifyResults(null);
      setSpotifyLoading(false);
      return;
    }
    setSpotifyLoading(true);
    debounceRef.current = setTimeout(() => searchSpotify(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchSpotify]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSpotifyResults(null);
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

  const noResults = query.length > 0 && !hasLocalResults && !hasSpotifyResults && !spotifyLoading;

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
          <div className="flex items-center gap-4 px-10 pt-8">
            <Search size={24} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists, albums, tracks…"
              className="flex-1 bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none"
              style={{ fontFamily: "'Nunito Sans', sans-serif" }}
            />
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-10 pt-8 pb-20">
            {noResults && (
              <p className="text-muted-foreground text-lg">No results for "{query}"</p>
            )}

            {/* === Local results === */}
            {results.artists.length > 0 && (
              <section className="mb-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Artists</h3>
                <div className="flex flex-wrap gap-4">
                  {results.artists.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { onClose(); navigate(`/artist/${a.id}`); }}
                      className="flex items-center gap-3 rounded-xl bg-foreground/5 p-3 pr-6 transition-colors hover:bg-foreground/10"
                    >
                      <img src={a.imageUrl} alt={a.name} className="h-12 w-12 rounded-full object-cover" />
                      <div className="text-left">
                        <p className="text-sm font-bold text-foreground">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.genres.slice(0, 2).join(", ")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {results.albums.length > 0 && (
              <section className="mb-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Albums</h3>
                <div className="flex flex-wrap gap-4">
                  {results.albums.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { onClose(); navigate(`/album/${a.id}`); }}
                      className="w-36 text-left group"
                    >
                      <img src={a.coverArtUrl} alt={a.title} className="h-36 w-36 rounded-xl object-cover transition-transform group-hover:scale-105" />
                      <p className="mt-2 text-sm font-bold text-foreground line-clamp-1">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.year}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {results.tracks.length > 0 && (
              <section className="mb-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Tracks</h3>
                <div className="space-y-2">
                  {results.tracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { onClose(); navigate(`/listen/${t.id}`); }}
                      className="flex w-full items-center gap-4 rounded-xl p-3 transition-colors hover:bg-foreground/5 text-left"
                    >
                      <img src={t.coverArtUrl} alt={t.title} className="h-10 w-10 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.artist} · {t.album}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* === Spotify results === */}
            {query.trim().length >= 2 && (
              <>
                {spotifyLoading && !hasSpotifyResults && (
                  <div className="flex items-center gap-2 text-muted-foreground mt-4">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Searching Spotify…</span>
                  </div>
                )}

                {hasSpotifyResults && (
                  <>
                    <div className="border-t border-foreground/10 mt-4 mb-6" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">From Spotify</h2>

                    {spotifyResults!.artists.length > 0 && (
                      <section className="mb-8">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Artists</h3>
                        <div className="flex flex-wrap gap-4">
                          {spotifyResults!.artists.map((a) => (
                            <button
                              key={a.id || a.name}
                              onClick={() => { onClose(); navigate(a.id ? `/artist/spotify::${a.id}::${encodeURIComponent(a.name)}` : `/artist/real::${encodeURIComponent(a.name)}`); }}
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

                    {spotifyResults!.tracks.length > 0 && (
                      <section className="mb-8">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Tracks</h3>
                        <div className="space-y-2">
                          {spotifyResults!.tracks.map((t, i) => (
                            <button
                              key={`${t.artist}-${t.title}-${i}`}
                              onClick={() => { onClose(); navigate(`/listen/real::${encodeURIComponent(t.artist)}::${encodeURIComponent(t.title)}::${encodeURIComponent(t.album)}::${encodeURIComponent(t.uri || "")}`); }}
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
