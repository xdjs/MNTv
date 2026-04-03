import { type ReactNode, useRef, useState, useCallback, useEffect } from "react";

interface SwipeableNuggetStackProps {
  count: number;
  unlockedCount: number;
  activeIndex: number;
  onSwipe: (newIndex: number) => void;
  disabled?: boolean;
  children: (index: number, isActive: boolean) => ReactNode;
}

const SWIPE_THRESHOLD = 40;
const CARD_WIDTH = 400; // exit distance

export default function SwipeableNuggetStack({
  unlockedCount,
  activeIndex,
  onSwipe,
  disabled = false,
  children,
}: SwipeableNuggetStackProps) {
  const [dragX, setDragX] = useState(0);
  const [exitDir, setExitDir] = useState<-1 | 0 | 1>(0); // -1 = exiting left, 1 = exiting right
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockedRef = useRef<"x" | "y" | null>(null);
  const prevIndexRef = useRef(activeIndex);

  const canGoLeft = activeIndex > 0;
  const canGoRight = activeIndex < unlockedCount - 1;

  // When activeIndex changes externally (auto-unlock), animate entry
  useEffect(() => {
    if (activeIndex !== prevIndexRef.current) {
      const dir = activeIndex > prevIndexRef.current ? 1 : -1;
      setExitDir(0);
      setDragX(dir * 60); // start offset
      requestAnimationFrame(() => setDragX(0)); // animate to center
      prevIndexRef.current = activeIndex;
    }
  }, [activeIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    lockedRef.current = null;
    isDraggingRef.current = true;
    setExitDir(0);
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
    const goingLeft = dx < -SWIPE_THRESHOLD && canGoRight;
    const goingRight = dx > SWIPE_THRESHOLD && canGoLeft;

    if (goingLeft || goingRight) {
      // Animate card out in swipe direction
      const dir = goingLeft ? -1 : 1;
      setExitDir(dir as -1 | 1);
      setDragX(dir * CARD_WIDTH);

      // After exit animation, swap content and reset
      setTimeout(() => {
        if (goingLeft) onSwipe(activeIndex + 1);
        else onSwipe(activeIndex - 1);
        setExitDir(0);
        setDragX(0);
      }, 180);
    } else {
      setDragX(0);
    }
  }, [disabled, activeIndex, canGoLeft, canGoRight, onSwipe]);

  const isExiting = exitDir !== 0;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="w-full h-full"
        style={{
          transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
          transition: isDraggingRef.current ? "none" : "transform 0.18s ease-out",
          opacity: isExiting ? 0.5 : 1,
          willChange: dragX !== 0 ? "transform" : undefined,
        }}
      >
        {children(activeIndex, true)}
      </div>

      {/* Swipe hints */}
      {!isDraggingRef.current && !isExiting && unlockedCount > 1 && (
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
