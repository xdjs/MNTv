import { useState, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";

interface NuggetSource {
  type: string;
  title: string;
  publisher: string;
  url: string;
  quoteSnippet?: string;
}

interface CompanionNugget {
  headline: string;
  text: string;
  kind: string;
  source: NuggetSource;
}

interface Props {
  label: string;
  nuggets: CompanionNugget[];
  colorClass: string;
}

export default function NuggetCategoryCard({ label, nuggets, colorClass }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const childHeight = el.clientHeight;
      if (childHeight > 0) {
        setActiveIndex(Math.round(scrollTop / childHeight));
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  if (!nuggets.length) return null;

  return (
    <div className="apple-glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${colorClass}`}>
          {label}
        </span>
        {nuggets.length > 1 && (
          <div className="flex gap-1.5">
            {nuggets.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === activeIndex ? "bg-primary" : "bg-foreground/20"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scrollable nuggets */}
      <div
        ref={scrollRef}
        className="h-[240px] overflow-y-auto snap-y snap-mandatory"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {nuggets.map((nugget, i) => (
          <div key={i} className="snap-start min-h-full px-4 pb-3 flex flex-col justify-between">
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground leading-snug">
                {nugget.headline}
              </p>
              <p className="text-sm text-foreground/70 leading-relaxed">
                {nugget.text}
              </p>
            </div>

            {/* Source link */}
            {nugget.source?.url && (
              <a
                href={nugget.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-colors group"
              >
                <ExternalLink size={14} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground/80 truncate group-hover:text-primary transition-colors">
                    {nugget.source.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {nugget.source.publisher}
                  </p>
                </div>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
