import { motion } from "framer-motion";
import { X, Play, ExternalLink, Youtube } from "lucide-react";
import type { Source } from "@/mock/types";

interface Props {
  source: Source;
  onClose: () => void;
}

export default function MediaOverlay({ source, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-4xl flex-col gap-6 px-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
              <Youtube size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{source.title}</h2>
              <p className="text-muted-foreground">{source.publisher}</p>
              {source.locator && <p className="text-sm text-primary">⏱ {source.locator}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-foreground/10 p-2 text-foreground transition-colors hover:bg-foreground/20 tv-focus-visible"
          >
            <X size={20} />
          </button>
        </div>

        {/* YouTube embed — only if we have a real embedId */}
        {source.embedId ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${source.embedId}?autoplay=0`}
              title={source.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        ) : (
          /* Fallback: rich source card when no embedId available */
          <div className="relative overflow-hidden rounded-2xl bg-foreground/5 border border-foreground/10 p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                <Play size={36} className="text-red-400 ml-1" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{source.title}</p>
                <p className="text-muted-foreground">{source.publisher}</p>
              </div>
              {source.locator && (
                <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                  Jump to {source.locator}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Quote */}
        {source.quoteSnippet && (
          <blockquote className="border-l-2 border-primary pl-4 text-foreground/80 italic text-lg leading-relaxed">
            "{source.quoteSnippet}"
          </blockquote>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground neon-button transition-transform hover:scale-105 tv-focus-visible"
          >
            Return to Listening
          </button>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-foreground/5 px-6 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground tv-focus-visible"
            >
              <ExternalLink size={14} />
              Search for source
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
