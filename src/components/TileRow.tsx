import { useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TileItem {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface Props {
  label: string;
  items: TileItem[];
  tileSize?: "sm" | "md" | "lg";
  focusedIndex?: number | null;
}

const sizes = {
  sm: "w-36 h-36",
  md: "w-44 h-44",
  lg: "w-56 h-56",
};

export default function TileRow({ label, items, tileSize = "md", focusedIndex = null }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const navigate = useNavigate();

  const scroll = useCallback((dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }, []);

  // Auto-scroll focused tile into view
  useEffect(() => {
    if (focusedIndex !== null && tileRefs.current[focusedIndex]) {
      tileRefs.current[focusedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [focusedIndex]);

  // Hover glow uses --neon-glow (tier color) — no per-image extraction
  const handleTileEnter = useCallback((el: HTMLElement) => {
    el.style.boxShadow = `0 0 20px 6px hsl(var(--neon-glow) / 0.5), 0 0 50px 12px hsl(var(--neon-glow) / 0.2)`;
  }, []);

  const handleTileLeave = useCallback((el: HTMLElement, isFocused: boolean) => {
    if (!isFocused) el.style.boxShadow = "";
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <h2
        className="mb-2 text-xl font-bold text-foreground/90 tracking-tight px-10"
        style={{ fontFamily: "'Nunito Sans', sans-serif" }}
      >
        {label}
      </h2>

      <div className="group relative">
        {/* Left arrow */}
        <button
          onClick={() => scroll(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:text-foreground"
        >
          <ChevronLeft size={20} />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto scroll-smooth px-10 scrollbar-hide"
          style={{
            scrollbarWidth: "none",
            paddingTop: 64,
            paddingBottom: 64,
            marginTop: -52,
            marginBottom: -52,
          }}
        >
          {items.map((item, i) => {
            const isFocused = focusedIndex === i;
            return (
              <button
                key={item.id}
                ref={(el) => { tileRefs.current[i] = el; }}
                data-tile-row={label}
                data-tile-col={i}
                onClick={() => navigate(item.href)}
                className={`${sizes[tileSize]} shrink-0 group/tile relative rounded-xl transition-all duration-200 outline-none ${
                  isFocused ? "scale-110 z-10" : "hover:scale-110 hover:z-10"
                }`}
                style={{
                  boxShadow: isFocused
                    ? `0 0 20px 6px hsl(var(--neon-glow) / 0.5), 0 0 50px 12px hsl(var(--neon-glow) / 0.2)`
                    : undefined,
                }}
                onMouseEnter={(e) => handleTileEnter(e.currentTarget)}
                onMouseLeave={(e) => handleTileLeave(e.currentTarget, isFocused)}
              >
                <div className="absolute inset-0 rounded-xl overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-full w-full bg-foreground/10 flex items-center justify-center">
                      <span className="text-2xl font-bold text-foreground/30">{item.title?.[0] || "?"}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                  <p className="text-sm font-bold text-white leading-tight line-clamp-2" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="mt-0.5 text-xs text-white/60 line-clamp-1">{item.subtitle}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:text-foreground"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
