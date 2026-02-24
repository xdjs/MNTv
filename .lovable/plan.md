

## Problem

The visual nugget card uses `object-contain` which leaves ugly black/empty space around the image (visible in the screenshot — the Roger Waters photo floats in a dark box with dead space on the sides). The card has a fixed `maxHeight: 200px` constraint that doesn't adapt to the image's natural proportions.

## Solution

Redesign the visual nugget layout to be image-forward and adaptive:

1. **Remove fixed maxHeight and object-contain** — these cause the awkward floating image effect
2. **Use `object-cover` with a taller, constrained container** — fill the width of the card, crop minimally
3. **Use `object-position: top`** — for portrait photos of artists, prioritize showing the face/head area rather than centering (which often cuts heads off)
4. **Add a gradient overlay at the bottom** — fade the image into the caption text, creating a cinematic look instead of a harsh image-then-text boundary
5. **Position the caption over the gradient** — overlay the caption text on the bottom of the image with a text-shadow for legibility

### Changes in `src/components/NuggetCard.tsx` (visual-only block, ~lines 137–155):

Replace the current visual layout:
```tsx
{/* ── Visual-only layout: image + caption ── */}
{isVisual ? (
  <>
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.4, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
      className="relative overflow-hidden rounded-lg"
    >
      <img
        src={nugget.imageUrl}
        alt={nugget.imageCaption || nugget.headline || ""}
        className="w-full rounded-lg object-cover object-top"
        style={{ maxHeight: "260px", minHeight: "140px" }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {/* Gradient overlay for caption legibility */}
      <div className="absolute inset-x-0 bottom-0 h-16 rounded-b-lg bg-gradient-to-t from-black/70 to-transparent" />
      {/* Caption overlaid on gradient */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.55, duration: 0.3 } }}
        className="absolute bottom-2 left-3 right-3 text-sm text-white/90 leading-snug drop-shadow-lg"
      >
        {nugget.imageCaption || nugget.headline}
      </motion.p>
    </motion.div>
  </>
) : ( ... )}
```

### Key differences from current code:
- **`object-cover` + `object-top`** instead of `object-contain` — fills the card width, crops from the bottom (preserving faces)
- **`maxHeight: 260px`, `minHeight: 140px`** — adapts to image aspect ratio within a range
- **Removed `bg-black/20`** wrapper background — no more visible dead space
- **Gradient overlay + overlaid caption** — cinematic look, caption reads over the image bottom edge
- **Removed separate caption `<p>` below image** — it's now part of the image container

This creates a polished, TV-ready visual card where the image fills edge-to-edge and the caption integrates naturally.

