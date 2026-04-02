import { type ReactNode, useRef, useState, useCallback } from "react";

interface SwipeableNuggetStackProps {
  count: number;
  unlockedCount: number;
  activeIndex: number;
  onSwipe: (newIndex: number) => void;
  disabled?: boolean;
  children: (index: number, isActive: boolean) => ReactNode;
}

const SWIPE_THRESHOLD = 40;

export default function SwipeableNuggetStack({
  unlockedCount,
  activeIndex,
  onSwipe,
  disabled = false,
  children,
}: SwipeableNuggetStackProps) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockedRef = useRef<"x" | "y" | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    lockedRef.current = null;
    setIsDragging(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    if (lockedRef.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        lockedRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }

    if (lockedRef.current === "x") {
      // Clamp drag — add resistance at edges
      let clamped = dx;
      if (activeIndex === 0 && dx > 0) clamped = dx * 0.3; // resist right at start
      if (activeIndex >= unlockedCount - 1 && dx < 0) clamped = dx * 0.3; // resist left at end
      setDragX(clamped);
    }
  }, [disabled, activeIndex, unlockedCount]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled || lockedRef.current !== "x") {
      setDragX(0);
      setIsDragging(false);
      return;
    }

    const dx = e.changedTouches[0].clientX - startXRef.current;
    if (dx < -SWIPE_THRESHOLD && activeIndex < unlockedCount - 1) {
      onSwipe(activeIndex + 1);
    } else if (dx > SWIPE_THRESHOLD && activeIndex > 0) {
      onSwipe(activeIndex - 1);
    }

    setDragX(0);
    setIsDragging(false);
  }, [disabled, activeIndex, unlockedCount, onSwipe]);

  const canGoLeft = activeIndex > 0;
  const canGoRight = activeIndex < unlockedCount - 1;
  const transition = isDragging ? "none" : "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)";

  return (
    <div
      className="relative w-full h-full overflow-visible"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Previous card (peeking from left) */}
      {canGoLeft && (
        <div
          className="absolute inset-0 opacity-40 scale-95"
          style={{
            transform: `translateX(${Math.min(dragX - 20, 0)}px) scale(0.95)`,
            transition,
            pointerEvents: "none",
          }}
        >
          {children(activeIndex - 1, false)}
        </div>
      )}

      {/* Active card — moves with finger */}
      <div
        className="relative w-full h-full"
        style={{
          transform: `translateX(${dragX}px)`,
          transition,
        }}
      >
        {children(activeIndex, true)}
      </div>

      {/* Next card (peeking from right) */}
      {canGoRight && (
        <div
          className="absolute inset-0 opacity-40 scale-95"
          style={{
            transform: `translateX(${Math.max(dragX + 20, 0)}px) scale(0.95)`,
            transition,
            pointerEvents: "none",
          }}
        >
          {children(activeIndex + 1, false)}
        </div>
      )}

      {/* Swipe indicators */}
      {!isDragging && unlockedCount > 1 && (
        <>
          {canGoLeft && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-20 pointer-events-none">
              <div className="w-1 h-10 rounded-full bg-white/20 animate-pulse" />
            </div>
          )}
          {canGoRight && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-20 pointer-events-none">
              <div className="w-1 h-10 rounded-full bg-white/20 animate-pulse" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
