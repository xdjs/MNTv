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

  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <h2
        className="mb-4 text-xl font-bold text-foreground/90 tracking-tight px-10"
        style={{ fontFamily: "'Nunito Sans', sans-serif" }}
      >
        {label}
      </h2>

      <div className="group relative">
        {/* Left arrow */}
        <button
          onClick={() => scroll(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:text-foreground"
        >
          <ChevronLeft size={20} />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scroll-smooth px-10 pb-2 scrollbar-hide"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { tileRefs.current[i] = el; }}
              onClick={() => navigate(item.href)}
              className={`${sizes[tileSize]} shrink-0 group/tile relative overflow-hidden rounded-xl transition-all duration-200 hover:scale-105 outline-none ${
                focusedIndex === i
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                  : ""
              }`}
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                className="h-full w-full object-cover"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              {/* Text */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-sm font-bold text-white leading-tight line-clamp-2" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="mt-0.5 text-xs text-white/60 line-clamp-1">{item.subtitle}</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:text-foreground"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
