# MusicNerd TV

A music discovery app that surfaces AI-generated insights ("nuggets") while you listen. Connect Spotify, play a track, and learn fascinating facts about the artist, song, and album — displayed in a cinematic TV-style interface.

## Features

- **Spotify Playback** — Stream tracks directly via Spotify Web Playback SDK
- **AI Nuggets** — Real-time AI-generated facts and insights powered by Gemini, enriched with Exa web research
- **Companion Page** — QR code on screen opens a mobile companion with categorized deep-dive content
- **Personalized Browse** — Home page rows built from your Spotify listening history
- **Tiered Experience** — Casual, Curious, and Nerd tiers adjust the depth of insights
- **Artist Profiles** — Explore artist pages with top tracks and related artists

## Tech Stack

- **Frontend**: React + Vite + TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (database, edge functions, auth)
- **AI**: Google Gemini (nugget generation), Exa (web research)
- **Playback**: Spotify Web Playback SDK, YouTube IFrame API (backdrop)
- **Deploy**: Vercel (frontend), Supabase (edge functions)

## Local Development

Requires Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
git clone https://github.com/xdjs/MNTv.git
cd MNTv
npm install
npm run dev
```

Create a `.env` file with:

```
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

## Architecture

```
src/
  pages/         — Route pages (Browse, Listen, Connect, Companion)
  components/    — Reusable UI components
  hooks/         — Custom React hooks (AI nuggets, Spotify auth, etc.)
  contexts/      — Global state (PlayerContext)
  data/          — Seed data for demo tracks
supabase/
  functions/     — Edge functions (generate-nuggets, generate-companion, etc.)
```
