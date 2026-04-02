import { type ReactNode, useRef, useCallback } from "react";

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
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockedRef = useRef<"x" | "y" | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    lockedRef.current = null;
  }, [disabled]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled || lockedRef.current !== "x") return;
    const dx = e.changedTouches[0].clientX - startXRef.current;

    if (dx < -SWIPE_THRESHOLD && activeIndex < unlockedCount - 1) {
      onSwipe(activeIndex + 1);
    } else if (dx > SWIPE_THRESHOLD && activeIndex > 0) {
      onSwipe(activeIndex - 1);
    }
  }, [disabled, activeIndex, unlockedCount, onSwipe]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    if (lockedRef.current === null) {
      const dx = Math.abs(e.touches[0].clientX - startXRef.current);
      const dy = Math.abs(e.touches[0].clientY - startYRef.current);
      // Lock direction once we've moved enough
      if (dx > 8 || dy > 8) {
        lockedRef.current = dx > dy ? "x" : "y";
      }
    }
  }, [disabled]);

  return (
    <div
      className="relative w-full h-full overflow-visible"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {children(activeIndex, true)}
    </div>
  );
}
