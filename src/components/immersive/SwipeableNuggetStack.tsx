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
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockedRef = useRef<"x" | "y" | null>(null);

  const canGoLeft = activeIndex > 0;
  const canGoRight = activeIndex < unlockedCount - 1;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    lockedRef.current = null;
    isDraggingRef.current = true;
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || !isDraggingRef.current) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    if (lockedRef.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      lockedRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }

    if (lockedRef.current === "x") {
      let clamped = dx;
      if (!canGoRight && dx < 0) clamped = dx * 0.2;
      if (!canGoLeft && dx > 0) clamped = dx * 0.2;
      setDragX(clamped);
    }
  }, [disabled, canGoLeft, canGoRight]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    isDraggingRef.current = false;

    if (disabled || lockedRef.current !== "x") {
      setDragX(0);
      return;
    }

    const dx = e.changedTouches[0].clientX - startXRef.current;
    const swiped = (dx < -SWIPE_THRESHOLD && canGoRight) || (dx > SWIPE_THRESHOLD && canGoLeft);

    if (swiped) {
      // Batch: update content first, then reset position so there's no flash of old content
      if (dx < -SWIPE_THRESHOLD && canGoRight) onSwipe(activeIndex + 1);
      else if (dx > SWIPE_THRESHOLD && canGoLeft) onSwipe(activeIndex - 1);
      // Reset drag on next frame after React processes the swipe
      requestAnimationFrame(() => setDragX(0));
    } else {
      setDragX(0);
    }
  }, [disabled, activeIndex, canGoLeft, canGoRight, onSwipe]);

  return (
    <div
      className="relative w-full h-full overflow-visible"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="w-full h-full"
        style={{
          transform: dragX !== 0 ? `translateX(${dragX}px) rotate(${dragX * 0.02}deg)` : undefined,
          transition: dragX !== 0 ? "none" : "transform 0.2s ease-out",
          willChange: dragX !== 0 ? "transform" : undefined,
        }}
      >
        {children(activeIndex, true)}
      </div>

      {/* Swipe hints — subtle edge indicators when more cards available */}
      {!isDraggingRef.current && unlockedCount > 1 && (
        <>
          {canGoLeft && (
            <div className="absolute left-1 top-1/2 -translate-y-1/2 z-20 pointer-events-none opacity-30">
              <svg width="8" height="24" viewBox="0 0 8 24" fill="none"><path d="M7 1L1 12L7 23" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
          )}
          {canGoRight && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 z-20 pointer-events-none opacity-30">
              <svg width="8" height="24" viewBox="0 0 8 24" fill="none"><path d="M1 1L7 12L1 23" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}
