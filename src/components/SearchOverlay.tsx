import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchCatalog } from "@/mock/tracks";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = searchCatalog(query);
  const hasResults = results.artists.length + results.albums.length + results.tracks.length > 0;

  useEffect(() => {
    if (open) {
      setQuery("");
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
            {query.length > 0 && !hasResults && (
              <p className="text-muted-foreground text-lg">No results for "{query}"</p>
            )}

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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
