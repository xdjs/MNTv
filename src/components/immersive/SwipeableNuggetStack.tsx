import { type ReactNode, useRef, useState } from "react";
import { motion, useMotionValue, animate, type PanInfo } from "framer-motion";

interface SwipeableNuggetStackProps {
  count: number;
  unlockedCount: number;
  activeIndex: number;
  onSwipe: (newIndex: number) => void;
  disabled?: boolean;
  children: (index: number, isActive: boolean) => ReactNode;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 200;

export default function SwipeableNuggetStack({
  unlockedCount,
  activeIndex,
  onSwipe,
  disabled = false,
  children,
}: SwipeableNuggetStackProps) {
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => {
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    if (disabled) {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
      return;
    }

    const { offset, velocity } = info;
    const swipedLeft = offset.x < -SWIPE_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD;
    const swipedRight = offset.x > SWIPE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD;

    let newIndex = activeIndex;
    if (swipedLeft && activeIndex < unlockedCount - 1) {
      newIndex = activeIndex + 1;
    } else if (swipedRight && activeIndex > 0) {
      newIndex = activeIndex - 1;
    }

    animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });

    if (newIndex !== activeIndex) {
      onSwipe(newIndex);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <motion.div
        className="w-full h-full"
        drag={disabled ? false : "x"}
        dragConstraints={{ left: -80, right: 80 }}
        dragElastic={0.3}
        dragDirectionLock
        style={{ x }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        data-dragging={isDragging || undefined}
      >
        {children(activeIndex, true)}
      </motion.div>
    </div>
  );
}
