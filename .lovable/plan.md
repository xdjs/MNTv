

# MusicNerd TV — R&D Prototype

## Overview
A TV-like passive-to-engaged listening experience prototype inspired by VH1's Pop Up Video. All data is mocked — the goal is to validate presentation, motion design, and on-screen timing. The pink glasses logo is used creatively throughout, including as the anchor dot in Animation Style C with a subtle neon glow.

---

## Screen 1: Onboarding (`/`)
- Dark, cinematic full-screen hero
- MusicNerd TV pink glasses logo displayed prominently with an animated entrance (subtle neon glow pulse on arrival)
- Short tagline beneath the logo
- Large "Get Started" CTA with TV-friendly focus state
- Smooth cinematic page transition when navigating forward

## Screen 2: Connect Services (`/connect`)
- Two large cards: "Connect Spotify" and "Connect YouTube Music" (both mock — no real auth)
- TV-friendly large hit targets with clear focus/hover states
- "Continue" button proceeds regardless of selection
- Smooth layout transition from onboarding

## Screen 3: Now Playing Harness (`/now-playing`)
- Immediately presents the "currently playing" track with large album cover art, title, artist, album
- "Start MusicNerd Layer" primary CTA to enter the listening experience
- "Switch Track" opens a mock track picker (10 nerd-friendly tracks)
- Feels like "here's what's playing right now" — auto-starts the vibe without a loading gate
- Cinematic transition into the listening screen

## Screen 4: Listening Experience (`/listen/:trackId`)
The core screen — full-screen TV experience.

**Layout:**
- Full-bleed blurred cover art background with vignette + subtle noise texture
- Track title & artist on the left side
- Minimal simulated playback controls (play/pause, scrubber) — time simulated via interval, no real audio

**Nuggets (3 per track):**
- Appear one at a time, bottom-left safe margin (24–40px)
- 5–7 seconds on screen, timed at roughly 20%, 50%, 80% of track duration
- Short text (2–3 lines), optional thumbnail tile, and a tappable source chip
- One nugget per track is a "listen for" type that appears 5 seconds before the relevant musical moment
- Queue system: if a nugget triggers while another is showing, it waits its turn

**3 Switchable Animation Styles (Framer Motion):**
- **Style A — Glass Slide + Focus Bloom:** Enters from slight y-offset, brief blur bloom behind card, exits with upward drift + scale down
- **Style B — Border Sweep + Text Mask Reveal:** Border highlight sweeps around card, text reveals via mask wipe, calm exit
- **Style C — Anchor Dot Expand:** The pink glasses logo appears as the anchor dot with a subtle neon glow, nugget expands outward from it, collapses back toward the glasses on exit

All entrance animations: 250–400ms. No pulsing or bouncing.

**Playback Resume Behavior:**
- When closing a media overlay, the simulated music fades back in over ~1 second rather than snapping back abruptly

## Screen 5: Source Overlays (modal on top of listening)

**Media Overlay (YouTube / video sources):**
- Pauses playback simulation on open
- Full-screen overlay with embedded YouTube player (mock embedId), title, publisher, timestamp locator, quote snippet
- "Return to Listening" button — music fades back in on close

**Reading Overlay (article / interview sources):**
- Does NOT pause playback — music continues
- Glass panel overlay preserving the listening context behind it
- Shows title, publisher, quote snippet, locator
- Optional "Open externally" secondary action
- Close returns seamlessly to listening

## Page Transitions
- Smooth, cinematic transitions between all routes (onboarding → connect → now playing → listening)
- Framer Motion layout animations to make navigation feel like a TV experience, not a web app

## Dev Panel (prototype-only)
- Discreet toggle in listening screen corner
- Switch animation style A / B / C
- Jump to nugget 1 / 2 / 3 for quick testing
- Toggle "Use backdrop motion" placeholder

## Mock Data
- 10 nerd-friendly tracks (e.g., Daft Punk, Radiohead, Pink Floyd, Björk, Talking Heads, etc.) with cover art, durations, metadata
- 3 nuggets per track, each referencing a source with authentic-feeling music trivia
- Sources include YouTube (with embedId + timestamp), articles, and interviews
- All TypeScript typed (`Track`, `Nugget`, `Source`)

## Styling
- Dark theme throughout
- Large typography for distance/TV viewing
- Glass panels with strong blur, subtle borders, soft shadows
- Noise overlay texture on gradients
- TV-remote-friendly focus states with clear highlights
- Hot pink neon accent color drawn from the glasses logo
- Pink glasses logo used as brand element in onboarding, nugget animations (Style C anchor), and subtle watermarks

