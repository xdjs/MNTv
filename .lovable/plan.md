

# TV-Optimized Deep Dive Overlay

## Problem
The current NuggetDeepDive overlay is designed for mouse/desktop interaction:
- It scrolls vertically (not TV-friendly)
- Text is too small for 10-foot viewing
- X button requires precise mouse targeting
- No D-pad/arrow-key navigation support
- Content stacks up and overflows

## Design Approach

Replace the scrollable card with a **fixed-size, full-viewport glassmorphic panel** that swaps content in-place using crossfade animations. No scrolling. Navigation is entirely D-pad driven (arrow keys + Enter).

### Layout (TV-optimized)
- Full-screen overlay with the apple-glass panel centered, roughly 70% width / 60% height
- Larger text: body at `text-lg` / `text-xl`, source attribution at `text-base`
- Only ONE content block visible at a time -- the original nugget OR the latest deep dive entry
- "Keep exploring" replaces the current text with a crossfade (old fades out, new fades in)
- Follow-up teaser displayed below the main text as a subtle prompt

### Navigation Model (D-pad)
- Three focusable buttons in a horizontal row at the bottom: **Keep Exploring** | **View Source** | **Back**
- Arrow Left/Right moves focus between buttons
- Enter activates the focused button
- "Back" button replaces the X close icon (larger, labeled, TV-friendly)
- No backdrop-click-to-close (no mouse on TV)
- Auto-focus lands on "Keep Exploring" when overlay opens
- `tv-focus-visible` ring styling for clear focus indication

### Content Transition
- When user hits "Keep exploring":
  1. Current text fades out (200ms)
  2. Loading spinner appears briefly
  3. New deep dive text fades in (300ms)
  4. Previous content is stored in state but not displayed (only latest entry shown)
- A small page indicator like "1 / 3" shows depth of exploration

## Technical Changes

### `src/components/overlays/NuggetDeepDive.tsx` (full rewrite)
- Remove scrollable container, X button, and vertical stacking of entries
- Add `useRef` for button focus management and `useEffect` for keyboard navigation (ArrowLeft, ArrowRight, Enter, Escape/Back)
- Track `currentView: 'original' | number` -- index into entries array
- AnimatePresence with `mode="wait"` for crossfade between content blocks
- Larger typography: main text `text-xl leading-relaxed`, source `text-sm`, quote `text-lg`
- Three bottom action buttons with `tv-focus-visible` class, auto-focused via refs
- "Back" button replaces X, using Escape key as shortcut
- Panel uses `apple-glass` with `max-w-4xl` and `max-h-[70vh]` for TV proportions
- Page depth indicator: small pill showing "Exploration 2 of 4" style

### `src/pages/Listen.tsx`
- No structural changes needed -- it already renders NuggetDeepDive in AnimatePresence

### No backend changes
- The edge function deep dive endpoint remains the same
