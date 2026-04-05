import { type ReactNode, useRef, useState, useCallback, useEffect } from "react";

interface SwipeableNuggetStackProps {
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
  // phase: "idle" | "exit" (old card fading out) | "enter" (new card fading in)
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockedRef = useRef<"x" | "y" | null>(null);
  const prevIndexRef = useRef(activeIndex);
  const swipeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canGoLeft = activeIndex > 0;
  const canGoRight = activeIndex < unlockedCount - 1;

  // Clean up swipe timer on unmount
  useEffect(() => () => {
    if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current);
  }, []);

  // When activeIndex changes externally (auto-unlock), animate entry
  useEffect(() => {
    if (activeIndex !== prevIndexRef.current) {
      prevIndexRef.current = activeIndex;
      setPhase("enter");
      setDragX(0);
      const t = setTimeout(() => setPhase("idle"), 350);
      return () => clearTimeout(t);
    }
  }, [activeIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || phase !== "idle") return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    lockedRef.current = null;
    setIsDragging(true);
  }, [disabled, phase]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || lockedRef.current === "y") return;
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
    setIsDragging(false);

    if (disabled || lockedRef.current !== "x") {
      setDragX(0);
      return;
    }

    const dx = e.changedTouches[0].clientX - startXRef.current;
    const goingLeft = dx < -SWIPE_THRESHOLD && canGoRight;
    const goingRight = dx > SWIPE_THRESHOLD && canGoLeft;

    if (goingLeft || goingRight) {
      // Phase 1: fade out current card
      setPhase("exit");
      setDragX(0);

      // After fade-out, swap content and start fade-in
      if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current);
      swipeTimerRef.current = setTimeout(() => {
        swipeTimerRef.current = null;
        if (goingLeft) onSwipe(activeIndex + 1);
        else onSwipe(activeIndex - 1);
        // "enter" phase is triggered by the useEffect on activeIndex change
      }, 200);
    } else {
      setDragX(0);
    }
  }, [disabled, activeIndex, canGoLeft, canGoRight, onSwipe]);

  // Compute opacity based on phase + drag distance
  let opacity = 1;
  if (phase === "exit") opacity = 0;
  else if (phase === "enter") opacity = 1;
  else if (dragX !== 0) {
    // Fade slightly as user drags further
    const maxDrag = 200;
    opacity = Math.max(0.4, 1 - Math.abs(dragX) / maxDrag * 0.6);
  }

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
          opacity,
          transition: isDragging
            ? "opacity 0.15s ease-out"
            : phase === "exit"
              ? "opacity 0.2s ease-out"
              : phase === "enter"
                ? "opacity 0.3s ease-in"
                : "transform 0.18s ease-out, opacity 0.15s ease-out",
          willChange: dragX !== 0 || phase !== "idle" ? "transform, opacity" : undefined,
        }}
      >
        {children(activeIndex, true)}
      </div>

      {/* Dot indicators */}
      {unlockedCount > 1 && phase === "idle" && !isDragging && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 pointer-events-none">
          {Array.from({ length: unlockedCount }, (_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                i === activeIndex ? "bg-white/70" : "bg-white/20"
              }`}
            />
          ))}
        </div>
      )}

      {/* Swipe hints */}
      {phase === "idle" && !isDragging && unlockedCount > 1 && (
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
