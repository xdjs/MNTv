import * as React from "react";

// Framer Motion replacement for component tests.
//
// Two problems it solves under jsdom:
//  1. AnimatePresence keeps exiting children mounted until their exit
//     animation completes — which never happens without a real
//     animation frame loop, so removed elements linger in the DOM and
//     "is this gone?" becomes unanswerable.
//  2. motion.* forwards animation-only props (initial/animate/exit/…)
//     that React warns about when they reach real DOM elements.
//
// Renders plain tags with the animation props stripped, so DOM presence
// tracks component state directly.
//
// Usage — the factory must be imported inside vi.mock, which is hoisted:
//   vi.mock("framer-motion", async () =>
//     (await import("./helpers/framerMotionMock")).makeFramerMotionMock());
const ANIMATION_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants", "layout", "layoutId",
  "whileTap", "whileHover", "whileInView", "whileDrag", "whileFocus",
  "onAnimationComplete", "onAnimationStart", "drag", "dragConstraints",
  "dragElastic", "dragMomentum", "onDragEnd", "onDragStart", "custom",
]);

/**
 * `exposeLayoutId` surfaces layoutId as a `data-layout-id` attribute.
 * Framer Motion consumes layoutId to compute a shared-element morph and
 * never writes it to the DOM, so without this a test cannot see whether
 * both ends of a morph agree on the id — and a morph wired up on only
 * one end hard-cuts silently rather than failing. Opt-in, because it is
 * not a real DOM attribute and would be noise in every other suite.
 */
export function makeFramerMotionMock({ exposeLayoutId = false } = {}) {
  const cache = new Map<string, React.ElementType>();

  const passthrough = (tag: string) =>
    React.forwardRef(function MotionStub(
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
      ref: React.Ref<HTMLElement>,
    ) {
      const domProps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (!ANIMATION_PROPS.has(key)) domProps[key] = value;
      }
      if (exposeLayoutId && props.layoutId !== undefined) {
        domProps["data-layout-id"] = props.layoutId;
      }
      return React.createElement(tag, { ...domProps, ref }, children);
    });

  return {
    motion: new Proxy({} as Record<string, React.ElementType>, {
      get: (_target, key: string) => {
        if (!cache.has(key)) cache.set(key, passthrough(key));
        return cache.get(key);
      },
    }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
}
