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
const GLOW = "0 0 20px 6px hsl(var(--neon-glow) / 0.4), 0 0 50px 12px hsl(var(--neon-glow) / 0.15)";

const FACE_STYLE_FRONT = {
  backfaceVisibility: "hidden" as const,
};
const FACE_STYLE_BACK = {
  backfaceVisibility: "hidden" as const,
  transform: "rotateY(180deg)",
};

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
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {/* Glow — rendered OUTSIDE the preserve-3d context so border-radius works on iOS */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ boxShadow: GLOW }}
      />

      {/* 3D flip container */}
      <div className="relative w-full h-full" style={{ perspective: 1200 }}>
        <motion.div
          className="relative w-full h-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={springTransition}
        >
          <div className="absolute inset-0 apple-glass rounded-3xl overflow-hidden" style={FACE_STYLE_FRONT}>
            {front}
          </div>
          <div className="absolute inset-0 apple-glass rounded-3xl overflow-hidden" style={FACE_STYLE_BACK}>
            {back}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
