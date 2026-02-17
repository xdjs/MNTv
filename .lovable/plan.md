
# Dwell-to-Expand Nugget + Fix Deep Dive Button Focus Styles

## Two Changes

### 1. Dwell Timer Auto-Expand (with instant Enter shortcut)

When the user presses Up to focus a nugget, a 1.5-second dwell timer starts. If they stay on the nugget for 1.5s, it auto-expands into the deep dive. If they press Enter before the timer fires, it opens immediately. If they press Up again (or any other direction) before the timer fires, the timer cancels and navigation continues normally to the top bar.

The hint text changes from "Press Enter to explore" to something like "Exploring..." with a subtle progress indicator during the dwell, so the user understands something is about to happen.

**Changes in `src/pages/Listen.tsx`:**
- Add a `dwellTimerRef = useRef` to track the 1.5s timeout
- When `focusZone` becomes `'nugget'`, start the dwell timer that calls `handleNuggetClick(activeNugget)` after 1500ms
- When `focusZone` leaves `'nugget'` (any direction key), clear the dwell timer
- Enter on nugget still works instantly (clears timer + opens deep dive)
- Update the hint text below the nugget from "Press Enter to explore" to a two-stage message: show "Exploring in a moment..." or a small animated indicator during the dwell period

### 2. Fix Deep Dive Button Focus Colors (View Source + Back)

The "View Source" and "Back" buttons use `tv-focus-visible` for keyboard focus styling, which only adds a glow/box-shadow but does NOT change the text color. The `hover:text-foreground` class only triggers on mouse hover, not on keyboard focus.

**Fix in `src/components/overlays/NuggetDeepDive.tsx`:**
- Add `focus-visible:text-foreground` to both the "View Source" link (line 278) and the "Back" button (line 290) so keyboard focus matches the mouse hover text color change

## Technical Details

### `src/pages/Listen.tsx`
- Add `dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)`
- In the keydown handler, when ArrowUp lands on `'nugget'` zone: start `dwellTimerRef.current = setTimeout(() => handleNuggetClick(activeNugget), 1500)`
- When any key moves focus away from nugget zone, or Enter is pressed: `clearTimeout(dwellTimerRef.current)`
- Also clear on component unmount and when `activeNugget` changes
- Update the hint text under the focused nugget to show a subtle "Hold to explore..." or small animated dot sequence during dwell

### `src/components/overlays/NuggetDeepDive.tsx`
- Line 278 (View Source `<a>`): add `focus-visible:text-foreground` to className
- Line 290 (Back `<button>`): add `focus-visible:text-foreground` to className
