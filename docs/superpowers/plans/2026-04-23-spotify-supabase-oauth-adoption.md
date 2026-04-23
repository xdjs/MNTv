# Spotify-Supabase OAuth migration — adoption plan

**Status:** approved, blocked on PR #74 merge to main.
**Related canonical plan:** `docs/superpowers/plans/2026-04-17-spotify-supabase-oauth.md` on branch `clt/spotify-supabase-oauth`. That is the 14-task execution plan; this doc captures the decision to adopt it and the few adjustments we're making on top.

## Why this migration

Today, Supabase `auth.users` rows and Spotify identity live in parallel — stitched together only by a `streamingService: "Spotify"` string on a localStorage profile. Consequences:

- `nugget_history` has 0 rows because every INSERT is silently rejected by RLS (`auth.uid()` is null).
- Cross-device progression can't work — profile lives on one device's localStorage.
- OAuth UX bugs (PKCE origin mismatches, missing token-event dispatch, iframe activation races) keep surfacing because we own the whole auth flow client-side.

The migration unifies Spotify as a Supabase identity provider, fixes `nugget_history` as a side effect, and deletes ~60 lines of custom PKCE code we just patched in PR #74.

## Key architectural facts (from Task 0 research)

Verified by the coworker's Task 0 pass against Supabase docs, GitHub discussion #22578, and issue #1450:

1. **Supabase does not persist provider tokens.** `session.provider_token` and `session.provider_refresh_token` are only present on the **first** session returned after OAuth. After any Supabase JWT refresh (~1h) they're `undefined`.
2. **Client-side Spotify refresh cannot work.** Supabase uses the server-side OAuth flow with `client_secret`; refresh requests require the secret. An edge function is mandatory.
3. **No built-in Apple Music provider.** Supabase's "apple" provider is Sign in with Apple (Apple ID), unrelated to Apple Music. Apple Music stays on MusicKit; we add an anonymous Supabase session beneath it so every user has an `auth.uid()`.

These facts reshape the plan: we must capture the refresh token into our own storage at sign-in (the "bridge"), and a new `spotify-refresh` edge function owns the refresh loop.

## Confirmed decisions

| Decision | Value |
|---|---|
| Adopt coworker's 14-task plan | Yes, as-is |
| Include Task 6.6 (anon session for Apple Music) | **Yes** — without it, Task 6.5's route gate locks Apple Music users out |
| Include Task 6.5 (route gate flips to session) | Yes — it's the load-bearing change that makes cross-device progression actually land |
| Flip `verify_jwt = true` on spotify-taste (Task 11) | **No** — dropped. Without server-side provider-token resolution it's security theater. Deferred to a follow-up slice |
| Refresh strategy | Edge function (`spotify-refresh`, Task 3.5) |
| PR target for final migration | `staging` per CLAUDE.md convention (not `main`) |

## Execution order

This migration is **blocked on PR #74** — the current Spotify playback fixes must land first so the coworker's plan baseline ("current PKCE flow manually verified working") still describes reality.

1. **Document adoption plan** (this file). Commit on `p3t3rango/constitution-v1` as part of PR #74.
2. **User runs `/ultrareview 74`.** Per CLAUDE.md, `/ultrareview` is user-triggered; it's billed and the assistant cannot launch it.
3. **Address any ultrareview findings** on PR #74.
4. **Merge PR #74 to main.**
5. **Start the migration:**
   1. `git checkout clt/spotify-supabase-oauth`
   2. `git fetch origin && git rebase origin/main` (or `origin/staging` if staging has caught up — confirm at execution time).
   3. Execute tasks 1–14 from `docs/superpowers/plans/2026-04-17-spotify-supabase-oauth.md` including Task 6.6. TDD rhythm: write failing test → implement → verify → commit, per task.
   4. Open the final PR against `staging` per Task 14.

## Scope delta vs the coworker's plan

Minor adjustments only; the 14-task spine stands:

- **Drop Task 11** (`verify_jwt = true` on `spotify-taste`). Reason above. Revisit as a separate slice that also rewrites the function to ignore body.accessToken and source the provider token from the Supabase auth admin API.
- **Reinforce Task 4's invariant.** Coworker's JSDoc already notes localStorage becomes the source of truth for provider tokens. Worth adding one sentence: the refresh token written by the bridge is the *only* copy we'll ever see — if localStorage is cleared, the user must re-auth.

## What PR #74 overlaps with (no conflict, just dead code after the migration)

PR #74 lands three Spotify-playback fixes that this migration naturally supersedes:

- `useSpotifyAuth.ts` — `localhost → 127.0.0.1` pre-PKCE redirect shim. **Dead after migration** (Supabase owns the redirect URL).
- `useSpotifyToken.ts` / `SpotifyCallback.tsx` — `saveSpotifyToken()` event-dispatch helper. **Dead after migration** (replaced by AuthContext's bridge).
- `SpotifyPlaybackEngine.ts` — duplicate `activateElement()` cleanup + gesture-arm retry. **Keep** — orthogonal to auth, fixes the browser autoplay iframe race.

## Open items to resolve at execution time

Carried from the coworker's plan's "Open Questions" section:

1. **DB strategy.** Shared prod vs Supabase Branching vs separate dev project. Two MCP servers (`devdb`, `proddb`) may already be configured — confirm at Task 2 start.
2. **Vercel preview wildcard host.** Needed for the Supabase redirect allowlist. Expected shape `https://mntv-*-xdjs.vercel.app/connect` — verify against Vercel project settings.
3. **TTL semantics of `session.expires_in`.** Likely the Supabase JWT TTL, not the Spotify token TTL. Verify during Task 4 by logging the full session object.

## Known limitations (accepted, documented, not fixed this slice)

- **Anonymous Apple Music user identity drift:** localStorage clear / new device → new `auth.uid()` → prior `nugget_history` orphans. Cron cleanup is a future slice.
- **Anon → Spotify identity upgrade loses history:** if an Apple Music anon user later connects Spotify via `signInWithOAuth`, they get a new `auth.uid()` and their anon history orphans. Fix is `supabase.auth.linkIdentity({ provider: "spotify" })` — future slice.
- **Playwright E2E coverage:** not added; repo has no Playwright. Manual QA per the coworker's Task 14.
