import { motion } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import type { Source } from "@/mock/types";

interface Props {
  source: Source;
  onClose: () => void;
}

export default function ReadingOverlay({ source, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-lg flex-col"
    >
      {/* Click outside to close */}
      <div className="absolute inset-0 -left-[100vw] w-[100vw]" onClick={onClose} />

      <div className="glass-panel relative ml-auto flex h-full w-full flex-col gap-6 p-8 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-primary">
              {source.type === "article" ? "Article" : "Interview"}
            </span>
            <h2 className="mt-1 text-xl font-bold text-foreground">{source.title}</h2>
            <p className="text-muted-foreground">{source.publisher}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-foreground/10 p-2 text-foreground transition-colors hover:bg-foreground/20 tv-focus-visible"
          >
            <X size={20} />
          </button>
        </div>

        {source.locator && (
          <p className="text-sm text-muted-foreground">📍 {source.locator}</p>
        )}

        {source.quoteSnippet && (
          <blockquote className="border-l-2 border-primary pl-4 text-foreground/90 italic text-lg leading-relaxed">
            "{source.quoteSnippet}"
          </blockquote>
        )}

        {source.thumbnailUrl && (
          <img src={source.thumbnailUrl} alt="" className="rounded-xl w-full object-cover max-h-48" />
        )}

        <div className="mt-auto flex gap-3">
          <button
            onClick={onClose}
            className="rounded-xl bg-foreground/5 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 tv-focus-visible"
          >
            Close
          </button>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-foreground/5 px-6 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground tv-focus-visible"
          >
            <ExternalLink size={14} />
            Open externally
          </a>
        </div>
      </div>
    </motion.div>
  );
}
