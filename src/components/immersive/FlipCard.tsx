import { type ReactNode, useCallback, useRef } from "react";
import { motion } from "framer-motion";

interface FlipCardProps {
  flipped: boolean;
  onFlip: () => void;
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

const springTransition = { type: "spring" as const, stiffness: 300, damping: 30 };

export default function FlipCard({ flipped, onFlip, front, back, className = "" }: FlipCardProps) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("[data-no-flip]")) return;
    if (pointerStartRef.current) {
      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);
      if (dx > 10 || dy > 10) return;
    }
    const dragging = (e.currentTarget as HTMLElement).closest("[data-dragging]");
    if (dragging) return;
    onFlip();
  }, [onFlip]);

  return (
    <div
      className={`relative w-full h-full ${className}`}
      style={{ perspective: 1200 }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {/* Glow element behind the card — separate div so it's not clipped by overflow:hidden */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{
          background: "hsl(var(--neon-glow) / 0.08)",
          boxShadow: "0 0 30px 8px hsl(var(--neon-glow) / 0.15), 0 0 80px 20px hsl(var(--neon-glow) / 0.06)",
        }}
      />

      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={springTransition}
      >
        {/* Front face */}
        <div
          className="absolute inset-0 apple-glass rounded-3xl overflow-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          {front}
        </div>

        {/* Back face */}
        <div
          className="absolute inset-0 apple-glass rounded-3xl overflow-hidden"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
