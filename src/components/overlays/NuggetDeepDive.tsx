import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Loader2 } from "lucide-react";
import type { Nugget, Source } from "@/mock/types";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  nugget: Nugget;
  source: Source | null;
  artist: string;
  trackTitle: string;
  onClose: () => void;
}

// Kind labels
const kindLabels: Record<string, string> = {
  process: "Behind the Scenes",
  constraint: "Creative Constraint",
  pattern: "Pattern",
  human: "Human Story",
  influence: "Influence",
};

interface DeepDiveEntry {
  text: string;
  followUp?: string; // suggestion for next exploration
}

export default function NuggetDeepDive({ nugget, source, artist, trackTitle, onClose }: Props) {
  const [entries, setEntries] = useState<DeepDiveEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const explore = useCallback(async () => {
    setLoading(true);
    try {
      const context = [
        nugget.text,
        ...entries.map((e) => e.text),
      ].join("\n\n");

      const { data, error } = await supabase.functions.invoke("generate-nuggets", {
        body: {
          artist,
          title: trackTitle,
          deepDive: true,
          context,
          sourceTitle: source?.title,
          sourcePublisher: source?.publisher,
        },
      });

      if (error) throw error;
      if (data?.deepDive) {
        setEntries((prev) => [...prev, {
          text: data.deepDive.text,
          followUp: data.deepDive.followUp,
        }]);
      }
    } catch (e) {
      console.error("Deep dive failed:", e);
      setEntries((prev) => [...prev, {
        text: "Couldn't explore further right now. Try again in a moment.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [nugget, entries, artist, trackTitle, source]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop click to close */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="apple-glass relative z-10 mx-6 w-full max-w-xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <MusicNerdLogo size={24} glow />
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-primary">
                {kindLabels[nugget.kind] || nugget.kind}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {artist} — {trackTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-foreground/10 p-2 text-foreground transition-colors hover:bg-foreground/20 tv-focus-visible"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
          {/* Original nugget */}
          <p className="text-sm leading-relaxed text-foreground/90">{nugget.text}</p>

          {/* Source attribution */}
          {source && (
            <div className="flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="uppercase tracking-wider font-medium">
                {source.type === "youtube" ? "▶" : source.type === "article" ? "📄" : "🎙"}
              </span>
              <span className="truncate">{source.title}</span>
              <span className="text-foreground/20">·</span>
              <span>{source.publisher}</span>
            </div>
          )}

          {source?.quoteSnippet && (
            <blockquote className="border-l-2 border-primary pl-3 text-sm text-foreground/70 italic leading-relaxed">
              "{source.quoteSnippet}"
            </blockquote>
          )}

          {/* Deep dive entries */}
          <AnimatePresence>
            {entries.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="border-t border-foreground/5 pt-4"
              >
                <p className="text-sm leading-relaxed text-foreground/90">{entry.text}</p>
                {entry.followUp && (
                  <p className="mt-2 text-xs text-primary/70 italic">💡 {entry.followUp}</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading state */}
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
            >
              <Loader2 size={14} className="animate-spin" />
              <span>Exploring deeper…</span>
            </motion.div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-5 pt-3 border-t border-foreground/5">
          <button
            onClick={explore}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20 disabled:opacity-50 tv-focus-visible"
          >
            <ChevronRight size={14} />
            {entries.length === 0 ? "Tell me more" : "Keep exploring"}
          </button>

          {source?.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-foreground/5 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground tv-focus-visible"
            >
              View Source
            </a>
          )}

          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
