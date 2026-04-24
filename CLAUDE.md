# MusicNerd TV - Claude AI Assistant Guide

## Project Overview
MusicNerd TV is a React SPA that delivers AI-powered music discovery through real-time "nuggets" — bite-sized facts and insights surfaced while you listen to music on Spotify. The experience is cinematic and TV-style, with content that scales across three listener tiers (Casual, Curious, Hardcore Nerd). A companion mobile page offers deep-dive content accessible via QR code.

## Tech Stack
- **Framework**: React 18 + Vite 5.4 (SWC)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL + Auth + Edge Functions + RLS)
- **Authentication**: Supabase Auth (Spotify OAuth provider + anonymous sessions for Apple Music) + Apple MusicKit JS (separate, for library access)
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives)
- **Animation**: Framer Motion 12
- **Routing**: React Router v6
- **State Management**: React Context API + localStorage
- **Server State**: React Query (@tanstack/react-query)
- **AI Generation**: Google Gemini API (via Supabase Edge Functions)
- **Web Research**: Exa API (fact enrichment for nuggets)
- **Playback**: Spotify Web Playback SDK + YouTube IFrame API (backdrop)
- **Testing**: Vitest + React Testing Library
- **Deploy**: Vercel (frontend, auto on push) + Supabase (edge functions)

## Key Features
1. **AI Nuggets**: Real-time AI-generated facts timed to track playback (Exa → Gemini → validation pipeline)
2. **Tier-Based Content Scaling**: 3/6/9 nuggets for Casual/Curious/Nerd tiers
3. **Spotify Integration**: Supabase-managed OAuth provider, Web Playback SDK, search, artist data
4. **Companion Page**: Mobile-friendly deep-dive content via QR code
5. **Personalized Catalog**: Browse page built from taste signals (Spotify top artists/tracks)
6. **Demo Seed Data**: 50+ pre-generated JSON files for instant guest experience
7. **Listen Count Tracking**: Progressive content unlocking across repeat listens

## Project Structure
```
src/
├── pages/                          # Route-level components
│   ├── Onboarding.tsx             # Landing splash
│   ├── Connect.tsx                 # 4-step onboarding wizard
│   ├── Browse.tsx                  # Personalized catalog
│   ├── Listen.tsx                  # Main playback + nuggets
│   ├── ArtistProfile.tsx           # Artist detail
│   ├── AlbumDetail.tsx             # Album detail
│   ├── Companion.tsx               # AI deep-dive (mobile)
│   └── SpotifyCallback.tsx         # OAuth handler
├── hooks/                          # Custom React hooks
│   ├── useAINuggets.ts            # Nugget generation
│   ├── useMusicNerdState.ts       # Profile/listen-count persistence
│   ├── usePersonalizedCatalog.ts  # Browse data builder
│   ├── useSpotifyAuth.ts          # PKCE OAuth
│   ├── useSpotifyToken.ts         # Token refresh
│   ├── useCurrentlyPlaying.ts     # Playback SDK integration
│   ├── useAccentColor.ts          # Dynamic accent from album art
│   └── useTierAccent.ts           # Tier-specific color tokens
├── contexts/                       # Global state
│   ├── AuthContext.tsx            # Supabase auth
│   └── PlayerContext.tsx          # Spotify playback state
├── components/                     # Reusable UI components
│   ├── NuggetCard.tsx             # Individual nugget
│   ├── NowPlayingBar.tsx          # Bottom player bar
│   ├── SearchOverlay.tsx          # Full-screen search
│   ├── MusicNerdLoadingOrchestrator.tsx  # Smart loading states
│   ├── overlays/                  # Modal/full-screen overlays
│   ├── companion/                 # Companion page components
│   └── ui/                        # shadcn/ui primitives
├── data/                           # Seed & demo data
│   ├── seedNuggets.ts             # Demo track registry
│   └── seed/                      # Pre-generated nugget JSON files
├── integrations/supabase/          # Supabase client & generated types
├── types/                          # TypeScript type definitions
└── test/                           # Test setup

supabase/
├── functions/                      # Edge functions (Deno runtime)
│   ├── generate-nuggets/          # Main nugget pipeline (Exa → Gemini → validation)
│   ├── generate-companion/        # Deep-dive content generation
│   ├── spotify-taste/             # User top artists/tracks
│   ├── artist-image/              # Artist photo fetching
│   ├── youtube-search/            # Video search
│   ├── spotify-search/            # Track search
│   └── seed-nuggets/              # Demo data seeding
└── migrations/                     # SQL migrations
```

## Database Schema
Key tables in Supabase (PostgreSQL with RLS):

- **profiles**: User data — spotify display name, top artists/tracks (JSONB), calculated tier, linked to `auth.users`
- **nugget_cache**: Pre-generated nuggets keyed by `track_id` — nuggets + sources as JSONB, public read-only
- **companion_cache**: Deep-dive content keyed by `track_key` + `listen_count_tier`, public read-only
- **lastfm_cache**: Last.fm user data (top artists, recent tracks)
- **companion_links**: QR code short URLs mapping `short_id` → track metadata

## Environment Variables
Client-side (prefixed `VITE_`):
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SPOTIFY_CLIENT_ID`

Server-side (Supabase edge function secrets):
- `SPOTIFY_CLIENT_SECRET`
- `GOOGLE_AI_API_KEY` (Gemini)
- `EXA_API_KEY` (web research)
- `YOUTUBE_API_KEY`
- `LASTFM_API_KEY`

## Coding Conventions
- **Package manager**: `npm`
- **Path alias**: `@/` maps to `src/`
- **Env vars**: Use `VITE_` prefix for client-side; never expose server secrets client-side
- **Components**: Functional components with TypeScript, default exports for pages
- **Styling**: Tailwind utility classes; use `cn()` from `@/lib/utils` for conditional classes
- **State**: Context API for global state, localStorage for persistence, React Query for server state
- **Edge functions**: Deno runtime, stateless, handle all AI/external API calls server-side
- **Lazy loading**: Connect, Browse, Listen pages are lazy-loaded; Onboarding + Companion are eager
- **Animations**: Framer Motion for page transitions and card animations

## Git Workflow
- **Branching**: Feature branches off `staging` → PR to `staging` → PR from `staging` to `main`
- **Branch naming**: `username/feature-name`
- **Commit messages**: Conventional commits — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `revert:`
- **PRs always target `staging`**, never `main` directly
- **Before pushing**: `npm test && npm run build`

## Available Scripts
```bash
npm run dev          # Vite dev server (port 8080, hot reload)
npm run build        # Production build
npm run build:dev    # Dev build (unminified)
npm run preview      # Preview production build
npm run lint         # ESLint
npm test             # Vitest (single run)
npm run test:watch   # Vitest watch mode
```

## Architecture Notes
- **Nugget Pipeline**: Multi-agent architecture (Curator → Writer → Validator) using Exa for web research + Gemini for generation, reducing hallucination vs pure LLM
- **Tier System**: Same track yields different content depth per tier; cached per `listen_count_tier`
- **Spotify OAuth**: Supabase-managed. `signInWithSpotify()` calls `supabase.auth.signInWithOAuth({ provider: "spotify" })`; Supabase handles the callback server-side with `client_secret`, then redirects to `/connect`. `AuthContext` bridges `session.provider_token` + `session.provider_refresh_token` into `localStorage.spotify_playback_token` (via `src/lib/spotifyTokenStore.ts`) so the Web Playback SDK + `useSpotifyToken` keep reading from the same shape. Refresh is server-side via the `spotify-refresh` edge function (Supabase-issued refresh tokens require the secret). Apple Music users get an anonymous Supabase session via `signInAnonymously()` so routes gate uniformly on session presence, not localStorage
- **Route gating**: `ProtectedRoute` and `RootRoute` in `src/App.tsx` gate on `useAuth().session`, NOT localStorage profile. This allows mid-onboarding users (session but no tier yet) to stay on Connect, and cross-device progression since the session follows the user
- **Demo Mode**: 50+ pre-generated seed files enable zero-latency guest experience
- **RLS**: Row-Level Security enforces data access at the database level; cache tables are public read-only, profiles are user-owned
- **Deploy**: Frontend auto-deploys to Vercel on push; Supabase edge functions deploy via Supabase CLI
