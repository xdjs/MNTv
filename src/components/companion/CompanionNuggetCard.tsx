import { ExternalLink, ChevronRight } from "lucide-react";
import type { CompanionNugget } from "@/mock/types";

interface Props {
  nugget: CompanionNugget;
  onDeepDive?: (nugget: CompanionNugget) => void;
}

export default function CompanionNuggetCard({ nugget, onDeepDive }: Props) {
  return (
    <div className="apple-glass rounded-2xl overflow-hidden">
      {/* Image */}
      {nugget.imageUrl && (
        <div className="w-full">
          <img
            src={nugget.imageUrl}
            alt={nugget.imageCaption || nugget.headline || ""}
            className="w-full object-contain max-h-56"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {nugget.imageCaption && (
            <p className="px-4 py-1.5 text-xs text-muted-foreground italic">{nugget.imageCaption}</p>
          )}
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        {/* Headline */}
        {nugget.headline && (
          <p className="text-sm font-bold text-foreground leading-snug">{nugget.headline}</p>
        )}

        {/* Body */}
        <p className="text-sm text-foreground/75 leading-relaxed">{nugget.text}</p>

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {/* Source pill */}
          <a
            href={nugget.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/8 border border-foreground/10 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-colors"
          >
            <ExternalLink size={11} />
            Source: {nugget.sourceName}
          </a>

          {/* Go Deeper */}
          {onDeepDive && (
            <button
              onClick={() => onDeepDive(nugget)}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
            >
              <ChevronRight size={12} />
              Go Deeper
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
