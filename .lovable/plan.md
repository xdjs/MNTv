

# Breathing Glow on Focused Nugget Card

## What Changes
When the nugget card is focused (via D-pad), the pink neon glow will slowly pulse in and out in a continuous loop -- like a calm heartbeat. This replaces the current static `tv-focus-glow` box-shadow with a smooth, animated version.

## How It Feels
- The glow intensity oscillates between ~40% and ~100% opacity over a 2-second cycle
- The spread radius also breathes slightly (tighter at dim, wider at bright)
- The card stays scaled at 1.03 -- only the glow moves
- Stops immediately when the card loses focus

## Technical Details

### `src/components/NuggetCard.tsx`
- Replace the static `tv-focus-glow` class on the focused card with a Framer Motion `animate` loop
- When `focused` is true, apply an animated `boxShadow` using `motion.div` with `transition: { repeat: Infinity, repeatType: "reverse", duration: 1, ease: "easeInOut" }`
- The shadow keyframes will alternate between a dim state (`0 0 8px 2px hsl(330 90% 60% / 0.25), 0 0 20px 4px hsl(330 90% 60% / 0.1)`) and a bright state (`0 0 20px 6px hsl(330 90% 60% / 0.55), 0 0 50px 12px hsl(330 90% 60% / 0.25)`)
- The `scale-[1.03]` remains as a static class, not animated in the loop

### `src/index.css`
- No changes needed -- the static `.tv-focus-glow` class stays for use elsewhere (tile rows, etc.)

