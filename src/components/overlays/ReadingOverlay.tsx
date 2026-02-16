import { motion } from "framer-motion";
import { X, ExternalLink, FileText, Mic } from "lucide-react";
import type { Source } from "@/mock/types";

interface Props {
  source: Source;
  onClose: () => void;
}

export default function ReadingOverlay({ source, onClose }: Props) {
  const isInterview = source.type === "interview";
  const Icon = isInterview ? Mic : FileText;

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
        {/* Header with icon */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon size={20} />
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-primary">
                {isInterview ? "Interview" : "Article"}
              </span>
              <h2 className="mt-1 text-xl font-bold text-foreground">{source.title}</h2>
              <p className="text-muted-foreground">{source.publisher}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-foreground/10 p-2 text-foreground transition-colors hover:bg-foreground/20 tv-focus-visible"
          >
            <X size={20} />
          </button>
        </div>

        {source.locator && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            📍 {source.locator}
          </span>
        )}

        {source.quoteSnippet && (
          <blockquote className="border-l-2 border-primary pl-4 text-foreground/90 italic text-lg leading-relaxed">
            "{source.quoteSnippet}"
          </blockquote>
        )}

        {source.thumbnailUrl && (
          <img src={source.thumbnailUrl} alt="" className="rounded-xl w-full object-cover max-h-48" />
        )}

        {/* Spacer to push actions to bottom */}
        <div className="flex-1" />

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
