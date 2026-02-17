import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
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

const kindLabels: Record<string, string> = {
  process: "Behind the Scenes",
  constraint: "Creative Constraint",
  pattern: "Pattern",
  human: "Human Story",
  influence: "Influence",
  discovery: "Explore Next",
};

interface DeepDiveEntry {
  text: string;
  followUp?: string;
}

export default function NuggetDeepDiveInline({ nugget, source, artist, trackTitle, onClose }: Props) {
  const [entries, setEntries] = useState<DeepDiveEntry[]>([]);
  const [currentView, setCurrentView] = useState<'original' | number>('original');
  const [loading, setLoading] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const buttonRefs = [useRef<HTMLButtonElement>(null), useRef<HTMLAnchorElement>(null), useRef<HTMLButtonElement>(null)];
  const buttonCount = source?.url ? 3 : 2;

  useEffect(() => {
    buttonRefs[0].current?.focus();
  }, []);

  useEffect(() => {
    const idx = Math.min(focusIndex, buttonCount - 1);
    const ref = buttonRefs[source?.url ? idx : (idx === 0 ? 0 : 2)];
    ref.current?.focus();
  }, [currentView, loading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIndex(prev => {
          const next = Math.max(0, prev - 1);
          const ref = buttonRefs[source?.url ? next : (next === 0 ? 0 : 2)];
          ref.current?.focus();
          return next;
        });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIndex(prev => {
          const next = Math.min(buttonCount - 1, prev + 1);
          const ref = buttonRefs[source?.url ? next : (next === 0 ? 0 : 2)];
          ref.current?.focus();
          return next;
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentView(prev => {
          if (prev === 'original') return prev;
          if (prev === 0) return 'original';
          return prev - 1;
        });
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentView(prev => {
          if (entries.length === 0) return prev;
          if (prev === 'original') return 0;
          if (typeof prev === 'number' && prev < entries.length - 1) return prev + 1;
          return prev;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, buttonCount, source?.url, entries.length]);

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
        const newIndex = entries.length;
        setEntries((prev) => [...prev, {
          text: data.deepDive.text,
          followUp: data.deepDive.followUp,
        }]);
        setCurrentView(newIndex);
      }
    } catch (e) {
      console.error("Deep dive failed:", e);
      const newIndex = entries.length;
      setEntries((prev) => [...prev, {
        text: "Couldn't explore further right now. Try again in a moment.",
      }]);
      setCurrentView(newIndex);
    } finally {
      setLoading(false);
    }
  }, [nugget, entries, artist, trackTitle, source]);

  const currentContent = currentView === 'original'
    ? { text: nugget.text, followUp: undefined }
    : entries[currentView];

  const totalPages = 1 + entries.length;
  const currentPage = currentView === 'original' ? 1 : currentView + 2;
  const contentKey = currentView === 'original' ? 'original' : `entry-${currentView}`;

  return (
    <div
      className="apple-glass relative flex flex-col rounded-3xl overflow-hidden"
      style={{
        boxShadow: "0 0 20px 6px hsl(330 90% 60% / 0.3), 0 0 50px 12px hsl(330 90% 60% / 0.12), 0 8px 60px hsl(0 0% 0% / 0.35)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-8 pt-6 pb-2">
        <MusicNerdLogo size={28} glow />
        <div className="flex-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            {kindLabels[nugget.kind] || nugget.kind}
          </span>
          <p className="text-sm text-muted-foreground mt-0.5">
            {artist} — {trackTitle}
          </p>
        </div>
        {totalPages > 1 && (
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            {currentPage} / {totalPages}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-8 py-6 min-h-[180px]">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center gap-3 text-muted-foreground"
            >
              <Loader2 size={20} className="animate-spin" />
              <span className="text-lg">Exploring deeper…</span>
            </motion.div>
          ) : (
            <motion.div
              key={contentKey}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-4"
            >
              <p className="text-lg md:text-xl leading-relaxed text-foreground/90">
                {currentContent?.text}
              </p>

              {currentView === 'original' && source && (
                <div className="flex items-center gap-2 rounded-lg bg-foreground/5 px-4 py-2.5 text-sm text-muted-foreground">
                  <span>
                    {source.type === "youtube" ? "▶" : source.type === "article" ? "📄" : "🎙"}
                  </span>
                  <span className="truncate">{source.title}</span>
                  <span className="text-foreground/20">·</span>
                  <span>{source.publisher}</span>
                </div>
              )}

              {currentContent?.followUp && (
                <p className="text-base text-primary/60 italic mt-2">
                  💡 {currentContent.followUp}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-4 px-8 pb-6 pt-2 border-t border-foreground/5">
        <button
          ref={buttonRefs[0] as React.RefObject<HTMLButtonElement>}
          onClick={explore}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-primary/15 px-6 py-3 text-base font-medium text-primary transition-all hover:bg-primary/25 disabled:opacity-50 tv-focus-visible"
        >
          <ChevronRight size={18} />
          {entries.length === 0 ? "Tell me more" : "Keep exploring"}
        </button>

        {source?.url && (
          <a
            ref={buttonRefs[1] as React.RefObject<HTMLAnchorElement>}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-foreground/5 px-6 py-3 text-base text-muted-foreground transition-colors hover:text-foreground tv-focus-visible"
          >
            <ExternalLink size={16} />
            View Source
          </a>
        )}

        <div className="flex-1" />

        <button
          ref={buttonRefs[2] as React.RefObject<HTMLButtonElement>}
          onClick={onClose}
          className="flex items-center gap-2 rounded-xl bg-foreground/5 px-6 py-3 text-base text-muted-foreground transition-colors hover:text-foreground tv-focus-visible"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>
    </div>
  );
}
