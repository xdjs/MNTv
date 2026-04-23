# Spotify Supabase OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom client-side Spotify PKCE OAuth flow with Supabase's built-in Spotify OAuth provider, establishing real Supabase sessions as the identity spine for ALL connected users (Spotify via OAuth, Apple Music via anonymous sessions). This fixes `nugget_history` (currently silently rejected by RLS because `auth.uid()` is always null for both services) and makes progressive tier unlocking work across devices for both services symmetrically.

**Architecture:** Two unified identity paths, both leaving a Supabase session behind:

1. **Spotify path:** Supabase Auth handles the OAuth dance end-to-end (`accounts.spotify.com` → `<supabase>.supabase.co/auth/v1/callback` → back to app with session in URL hash). `AuthContext.onAuthStateChange` runs `bridgeSpotifyProviderTokens` to copy `session.provider_token` + `session.provider_refresh_token` into the existing `spotify_playback_token` localStorage key so downstream consumers (`useSpotifyToken`, playback SDK, `spotify-taste` edge function) keep working. `SpotifyCallback.tsx` + the custom `/spotify-callback` route are deleted.

2. **Apple Music path:** `ensureSupabaseSession()` calls `supabase.auth.signInAnonymously()` IF no session exists, then `MusicKit.authorize()` runs as it does today. Music User Token stays in `apple_music_token` localStorage. The anonymous Supabase session gives Apple Music users a real `auth.uid()` so `nugget_history` writes land and route gates pass — same as Spotify users.

Both paths: `useSpotifyToken`'s refresh logic stays for Spotify (Supabase does NOT auto-refresh provider tokens, and the `spotify-refresh` edge function added in Task 3.5 handles re-exchange with `client_secret`). `handleTierSelect` in Connect.tsx remains the single write point for the profile row — unchanged.

**Tech Stack:** Supabase Auth JS (already installed via `@supabase/supabase-js`), React 18, Vitest, Deno edge functions.

**Branch:** `clt/spotify-supabase-oauth` off `staging` (per CLAUDE.md conventions).

**Scope (revised after /plan-eng-review — see REVIEW REPORT at end):**
- a. Wire `supabase.auth.signInWithOAuth({ provider: "spotify" })` in `Connect.tsx`
- b. Read tokens via `session.provider_token` (bridged to existing localStorage shape, with TTL + refresh-token-presence defensive guards)
- c. Delete `SpotifyCallback.tsx` and its route
- d. Update tests (including new `useSpotifyPostSigninSync` hook tests + banner tests)
- e. Verify `nugget_history` writes now land (auth.uid() is real) — **manual verification only, no CI test (fake-test concern)**
- ~~f. Flip `verify_jwt = true` for Spotify-related edge functions~~ — **DROPPED; verify_jwt alone is security theater without server-side provider-token resolution (see follow-up in Not In Scope)**
- g. Replace silent `clearStoredProfile` on refresh failure with a visible "reconnect Spotify" UX
- **NEW h.** Swap route gates in `App.tsx` + `Connect.tsx` from `profile exists` to `session + loading resolved` (Supabase session is the identity gate, not localStorage profile presence) — without this, cross-device progression doesn't actually work
- **NEW i.** Keep Spotify taste ephemeral in Connect.tsx until `handleTierSelect` (preserves existing "profile exists = onboarding complete" contract)
- **NEW j.** Anonymous Supabase session on Apple Music connect (`signInAnonymously()` before `MusicKit.authorize()`). Without this, item (h)'s route-gate rewrite locks Apple Music users out of the app (they have no Supabase session). Added post-review when we realized the route-gate change was Spotify-biased. See Task 6.6.

**Not in scope (future slices):**
- **Link-identity upgrade** for anonymous Apple Music users who later want to connect Spotify. Requires `supabase.auth.linkIdentity({ provider: "spotify" })` to preserve the anonymous user's `nugget_history` rows across identity upgrade. Future slice; today a user who signs in anonymously with Apple Music and later adds Spotify gets a NEW `auth.uid()` and their prior history is orphaned. Documented as a known limitation.
- Dropping `useSpotifyToken`'s localStorage bridge entirely (bridge-then-simplify keeps this slice shippable)
- Removing speculative `profiles` table writes (remains useful now that auth is real)
- **Real server-side provider-token resolution in `spotify-taste`** (deferred from f). Requires rewriting the function to ignore body.accessToken and source Spotify token from Supabase auth admin API keyed to the caller's JWT. Separate PR.
- **Integration tests for `nugget_history` writes.** Requires local Supabase test harness with real auth.users rows. Manual QA covers the verification.
- **Playwright E2E coverage** for first-time connect, returning user, reconnect flow, nugget_history write. Repo has no Playwright today; adding it is a separate slice.
- **Sign in with Apple** as an identity provider (separate from Apple Music). Deferred until user demand for a named Apple-ID-bound account exists. Anonymous sessions cover the identity-spine need for Apple Music users in this slice.

---

## Task 0: Research Checkpoint — Spotify Provider Token Refresh ✅ COMPLETED 2026-04-20

Research is complete. See the "Refresh Behavior" section below. Summary of findings that reshape the plan:

- **Provider tokens are NOT persisted by Supabase** (confirmed by Supabase maintainer in discussions/22578). `session.provider_token` and `session.provider_refresh_token` are only present on the FIRST session object returned from the OAuth callback. After the Supabase JWT refreshes (every ~1 hour), they are `undefined`.
- **Client-side refresh with `client_id` only FAILS** for Spotify provider tokens issued via Supabase (issue #1450). Supabase uses the non-PKCE server-side OAuth flow with client_secret, and refreshing those tokens requires the secret.
- **Consequence:** Task 0's contingency activates. An edge function `spotify-refresh` IS required. `useSpotifyToken.getValidToken` must call it instead of hitting Spotify directly.

Task 0's outcome is now reflected in the Review-Driven Revisions section below (new task: **Task 3.5 — Create `spotify-refresh` edge function**).

---

## Task 1: Create Feature Branch + Baseline

**Files:** None (branch setup)

- [ ] **Step 1: Create branch off staging**

  ```bash
  cd /Users/clt/src/xdjs/MNTv
  git checkout staging
  git pull origin staging
  git checkout -b clt/spotify-supabase-oauth
  ```

- [ ] **Step 2: Establish baseline — tests pass on a fresh branch**

  ```bash
  npm test -- --run
  ```

  Expected: all tests pass. If any fail, stop and investigate before modifying anything.

- [ ] **Step 3: Snapshot current Spotify connect flow manually**

  ```bash
  npm run dev
  ```

  Open `http://127.0.0.1:8080`, walk through onboarding → Connect → "Connect Spotify". Confirm the current custom PKCE flow still works end-to-end. This is the regression baseline. Stop the dev server before continuing.

---

## Task 2: Configure Supabase Dashboard + Spotify Dashboard

**Files:** None (dashboard config)

- [ ] **Step 1: Configure Supabase's Spotify provider**

  Supabase dashboard → Authentication → Providers → Spotify:
  - **Enabled:** on
  - **Client ID:** `4a959e37f35a40069a539b5b5c3353eb` (already set per issue #52)
  - **Client Secret:** (paste from secure source; do not commit)
  - **Scopes:** leave blank in dashboard — we pass `options.scopes` at call time (per user's confirmation in brainstorming recap)

- [ ] **Step 2: Add Supabase callback URL to Spotify app**

  Spotify Developer Dashboard → App → Settings → Redirect URIs:
  - Add `https://ofuayztvadxtacmsevxk.supabase.co/auth/v1/callback`
  - Keep `http://127.0.0.1:8080/spotify-callback` and the prod `/spotify-callback` URLs for now (grace period; we remove in cleanup task)

- [ ] **Step 3: Add allowed redirect URLs in Supabase**

  Supabase dashboard → Authentication → URL Configuration → Redirect URLs:
  - Add `http://127.0.0.1:8080/connect`
  - Add `http://localhost:8080/connect` (dev fallback)
  - Add the prod URL, e.g. `https://musicnerd.tv/connect` (verify the actual prod host from `vercel.json` or prod Vercel project)
  - Add Vercel preview wildcard pattern for the project slug (verify the actual Vercel project name; expected shape: `https://mntv-*-xdjs.vercel.app/connect`). Without this, Spotify OAuth redirects on preview deploys fail with `redirect_uri mismatch`.

- [ ] **Step 4: Add `SPOTIFY_CLIENT_SECRET` to Supabase Edge Function Secrets**

  Supabase dashboard → Project Settings → Edge Functions → Secrets:
  - Add `SPOTIFY_CLIENT_SECRET` with the value from the Spotify app settings (same one pasted into the provider config in Step 1).
  - This is consumed by `supabase/functions/spotify-refresh/index.ts` (Task 3.5). Without it, token refresh after the first hour fails and users hit the reconnect banner.

- [ ] **Step 5: Enable Anonymous Sign-Ins in Supabase**

  Supabase dashboard → Authentication → Providers → Anonymous Sign-Ins: **enable**.
  - Required by Task 6.6 (Apple Music connect path). When disabled, `supabase.auth.signInAnonymously()` returns `{ error: { message: "Anonymous sign-ins are disabled" } }` and Apple Music connect fails before MusicKit runs.
  - Verification: open the browser console on the running app (local or preview) and run `await supabase.auth.signInAnonymously()`. Expect `{ data: { session: { ... } }, error: null }`.

- [ ] **Step 6: Verify Spotify endpoint via cold browser session**

  Open an incognito window, go to `https://ofuayztvadxtacmsevxk.supabase.co/auth/v1/authorize?provider=spotify&redirect_to=http://127.0.0.1:8080/connect`. Expected: Spotify's authorize screen renders (you won't complete the flow yet — this just verifies the endpoint + redirect are wired). If you get "INVALID_CLIENT" or "redirect_uri mismatch", fix the dashboard config before proceeding.

---

## Task 3: Add `signInWithSpotify` Helper in `useSpotifyAuth.ts`

**Files:**
- Modify: `src/hooks/useSpotifyAuth.ts`
- Test: `src/test/useSpotifyAuth.test.ts` (create)

- [ ] **Step 1: Write the failing test**

  Create `src/test/useSpotifyAuth.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";

  vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://accounts.spotify.com/authorize?..." }, error: null }),
      },
      functions: { invoke: vi.fn() },
    },
  }));

  import { signInWithSpotify } from "@/hooks/useSpotifyAuth";
  import { supabase } from "@/integrations/supabase/client";

  describe("signInWithSpotify", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // jsdom's default location is about:blank; give it a real origin
      Object.defineProperty(window, "location", {
        value: { origin: "http://127.0.0.1:8080" },
        writable: true,
      });
    });

    it("calls supabase.auth.signInWithOAuth with Spotify + scopes + redirectTo", async () => {
      await signInWithSpotify();
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "spotify",
        options: {
          scopes: "user-top-read user-read-recently-played user-read-private streaming user-read-playback-state user-modify-playback-state",
          redirectTo: "http://127.0.0.1:8080/connect",
        },
      });
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- --run src/test/useSpotifyAuth.test.ts
  ```

  Expected: FAIL — `signInWithSpotify` is not exported from `useSpotifyAuth`.

- [ ] **Step 3: Implement `signInWithSpotify`**

  In `src/hooks/useSpotifyAuth.ts`, add near the top (after existing exports, before `initiateSpotifyAuth`):

  ```typescript
  /**
   * Supabase-managed Spotify OAuth. Replaces initiateSpotifyAuth's custom PKCE
   * flow. Supabase handles the redirect to Spotify, the callback, the token
   * exchange, and session establishment. After Spotify redirects back to
   * /connect, AuthContext's onAuthStateChange fires and the session
   * (including provider_token + provider_refresh_token) is ready.
   */
  export async function signInWithSpotify(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        scopes: SPOTIFY_SCOPES,
        redirectTo: `${window.location.origin}/connect`,
      },
    });
    if (error) {
      console.error("[signInWithSpotify] failed:", error);
      throw error;
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npm test -- --run src/test/useSpotifyAuth.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useSpotifyAuth.ts src/test/useSpotifyAuth.test.ts
  git commit -m "feat(auth): add signInWithSpotify helper using supabase OAuth"
  ```

---

## Task 4: Bridge Session Provider Tokens → `spotify_playback_token` Storage

The existing `useSpotifyToken` + `useCurrentlyPlaying` + playback SDK all read from `localStorage.spotify_playback_token`. Keep that shape working by copying provider tokens from the Supabase session into localStorage whenever the session changes. This minimizes downstream diff.

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Test: `src/test/spotifyTokenBridge.test.ts` (create)

- [ ] **Step 1: Write the failing test**

  Create `src/test/spotifyTokenBridge.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { bridgeSpotifyProviderTokens } from "@/contexts/AuthContext";

  const SPOTIFY_KEY = "spotify_playback_token";

  describe("bridgeSpotifyProviderTokens", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("writes provider tokens to localStorage when session has Spotify provider", () => {
      const session = {
        provider_token: "spotify-access-abc",
        provider_refresh_token: "spotify-refresh-xyz",
        expires_in: 3600,
        user: { app_metadata: { provider: "spotify" } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      bridgeSpotifyProviderTokens(session);

      const stored = JSON.parse(localStorage.getItem(SPOTIFY_KEY)!);
      expect(stored.accessToken).toBe("spotify-access-abc");
      expect(stored.refreshToken).toBe("spotify-refresh-xyz");
      expect(stored.expiresAt).toBeGreaterThan(Date.now());
    });

    it("is a no-op when session is not Spotify-provider", () => {
      const session = {
        provider_token: "apple-token",
        user: { app_metadata: { provider: "apple" } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      bridgeSpotifyProviderTokens(session);
      expect(localStorage.getItem(SPOTIFY_KEY)).toBeNull();
    });

    it("is a no-op when session is null", () => {
      bridgeSpotifyProviderTokens(null);
      expect(localStorage.getItem(SPOTIFY_KEY)).toBeNull();
    });

    it("does not overwrite a fresher existing token", () => {
      // Existing token with a longer expiry than the one in the session
      const existing = {
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
        expiresAt: Date.now() + 7200_000,
      };
      localStorage.setItem(SPOTIFY_KEY, JSON.stringify(existing));

      const session = {
        provider_token: "stale-access",
        provider_refresh_token: "stale-refresh",
        expires_in: 100,
        user: { app_metadata: { provider: "spotify" } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      bridgeSpotifyProviderTokens(session);

      const stored = JSON.parse(localStorage.getItem(SPOTIFY_KEY)!);
      expect(stored.accessToken).toBe("fresh-access");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- --run src/test/spotifyTokenBridge.test.ts
  ```

  Expected: FAIL — `bridgeSpotifyProviderTokens` is not exported.

- [ ] **Step 3: Implement the bridge in `AuthContext.tsx`**

  Add to `src/contexts/AuthContext.tsx` (after the existing imports, before `AuthProvider`):

  ```typescript
  const SPOTIFY_STORAGE_KEY = "spotify_playback_token";
  const TOKEN_CHANGED_EVENT = "spotify-token-changed";

  interface StoredSpotifyToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }

  /**
   * Copy Spotify provider tokens from a Supabase session into
   * localStorage.spotify_playback_token. Idempotent + defensive:
   *  - no-op if session is null or not Spotify-provider
   *  - skips write if existing token has a longer expiry (avoids clobbering a
   *    freshly-refreshed client-side token with a stale session-bound one)
   *
   * Exported for unit testing.
   */
  export function bridgeSpotifyProviderTokens(session: Session | null): void {
    if (!session?.provider_token) return;
    if (session.user?.app_metadata?.provider !== "spotify") return;

    const expiresAt = Date.now() + ((session.expires_in ?? 3600) * 1000);

    const existingRaw = localStorage.getItem(SPOTIFY_STORAGE_KEY);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as StoredSpotifyToken;
        if (existing.expiresAt > expiresAt) return;
      } catch {
        // fall through — bad JSON, overwrite
      }
    }

    const token: StoredSpotifyToken = {
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token ?? "",
      expiresAt,
    };
    localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(token));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
    }
  }
  ```

- [ ] **Step 4: Wire bridge into `AuthProvider`**

  Modify the `AuthProvider` in `src/contexts/AuthContext.tsx`. Replace the current `useEffect` body with:

  ```typescript
  useEffect(() => {
    // 1. Eagerly hydrate from the persisted session (avoids flash)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      bridgeSpotifyProviderTokens(data.session);
      setLoading(false);
    });

    // 2. Keep state in sync for token refreshes, sign-in, sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        bridgeSpotifyProviderTokens(newSession);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);
  ```

- [ ] **Step 5: Run test to verify it passes**

  ```bash
  npm test -- --run src/test/spotifyTokenBridge.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/contexts/AuthContext.tsx src/test/spotifyTokenBridge.test.ts
  git commit -m "feat(auth): bridge Supabase Spotify provider tokens to localStorage"
  ```

---

## Task 5: Extract Taste Fetch + Profile Save Into Reusable Post-Signin Helper

The current `SpotifyCallback.tsx` does: exchange code → store tokens → fetch taste → save profile. The new flow has Supabase do the first two. The last two (taste + profile) need to run after `signInWithOAuth` redirects back. Extract them into a standalone helper that can be called from `Connect.tsx`'s post-signin effect.

**Files:**
- Create: `src/hooks/completeSpotifyConnect.ts`
- Test: `src/test/completeSpotifyConnect.test.ts` (create)

- [ ] **Step 1: Write the failing test**

  Create `src/test/completeSpotifyConnect.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";

  vi.mock("@/hooks/useSpotifyAuth", () => ({
    fetchSpotifyTaste: vi.fn(),
  }));

  import { completeSpotifyConnect } from "@/hooks/completeSpotifyConnect";
  import { fetchSpotifyTaste } from "@/hooks/useSpotifyAuth";

  describe("completeSpotifyConnect", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("returns a Spotify-shaped profile patch from the access token", async () => {
      (fetchSpotifyTaste as ReturnType<typeof vi.fn>).mockResolvedValue({
        topArtists: ["Beach House"],
        topTracks: ["Space Song"],
        artistImages: { "Beach House": "http://img" },
        artistIds: { "Beach House": "abc" },
        trackImages: [],
        displayName: "Jane",
      });

      const patch = await completeSpotifyConnect("access-token");
      expect(patch).toEqual({
        streamingService: "Spotify",
        spotifyDisplayName: "Jane",
        topArtists: ["Beach House"],
        topTracks: ["Space Song"],
        artistImages: { "Beach House": "http://img" },
        artistIds: { "Beach House": "abc" },
        trackImages: [],
      });
    });

    it("returns null when taste fetch fails", async () => {
      (fetchSpotifyTaste as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const patch = await completeSpotifyConnect("access-token");
      expect(patch).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- --run src/test/completeSpotifyConnect.test.ts
  ```

  Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement helper**

  Create `src/hooks/completeSpotifyConnect.ts`:

  ```typescript
  import type { UserProfile } from "@/mock/types";
  import { fetchSpotifyTaste } from "./useSpotifyAuth";

  export type SpotifyProfilePatch = Pick<
    UserProfile,
    "streamingService" | "spotifyDisplayName" | "topArtists" | "topTracks" | "artistImages" | "artistIds" | "trackImages"
  >;

  /**
   * Fetch Spotify taste data + build the profile patch the caller should merge.
   * Separated from the Supabase OAuth handoff so Connect.tsx can invoke it
   * directly when a session with provider=spotify lands.
   *
   * Returns null when the taste edge function fails — caller decides how to surface.
   */
  export async function completeSpotifyConnect(accessToken: string): Promise<SpotifyProfilePatch | null> {
    const taste = await fetchSpotifyTaste(accessToken);
    if (!taste) return null;
    return {
      streamingService: "Spotify",
      spotifyDisplayName: taste.displayName ?? undefined,
      topArtists: taste.topArtists,
      topTracks: taste.topTracks,
      artistImages: taste.artistImages,
      artistIds: taste.artistIds,
      trackImages: taste.trackImages,
    };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npm test -- --run src/test/completeSpotifyConnect.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/completeSpotifyConnect.ts src/test/completeSpotifyConnect.test.ts
  git commit -m "refactor(auth): extract Spotify taste-fetch + profile-patch helper"
  ```

---

## Task 6: Wire New Flow in `Connect.tsx`

Replace the `initiateSpotifyAuth()` call in `Connect.tsx` with `signInWithSpotify()`. Add a post-signin effect that detects a Spotify session with provider tokens and runs `completeSpotifyConnect` → merges into profile.

**Files:**
- Modify: `src/pages/Connect.tsx`

- [ ] **Step 1: Read current Connect.tsx Spotify branch**

  ```bash
  grep -n "initiateSpotifyAuth\|spotify_pending_taste" src/pages/Connect.tsx
  ```

  Note the exact line numbers where `initiateSpotifyAuth` is called and where the `spotify_pending_taste` session-storage dance happens. You'll replace both.

- [ ] **Step 2: Swap the OAuth trigger**

  In `src/pages/Connect.tsx`:
  - Replace `import { initiateSpotifyAuth } from "@/hooks/useSpotifyAuth"` with `import { signInWithSpotify } from "@/hooks/useSpotifyAuth"`
  - Replace every `initiateSpotifyAuth()` call with `signInWithSpotify()` (same signature — `Promise<void>`)

- [ ] **Step 3: Add post-signin taste-fetch effect**

  Add at the top of `Connect.tsx`'s component body (after existing state declarations). The exact surrounding code depends on the current structure — read `Connect.tsx` first and place this next to the existing `spotify_pending_taste` useEffect (the one around line 75):

  ```typescript
  const { user } = useAuth();
  // Already imported: useUserProfile, supabase, completeSpotifyConnect

  useEffect(() => {
    if (!user || user.app_metadata?.provider !== "spotify") return;
    // Profile already has Spotify taste — skip duplicate fetch
    if (profile?.streamingService === "Spotify" && profile?.topArtists?.length) return;

    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.provider_token;
      if (!accessToken) return;

      const patch = await completeSpotifyConnect(accessToken);
      if (cancelled || !patch) return;

      await saveProfile({ ...(profile ?? {} as UserProfile), ...patch });
    })();
    return () => { cancelled = true; };
  }, [user?.id, profile?.streamingService, profile?.topArtists?.length]);
  ```

  Then delete the old `spotify_pending_taste` sessionStorage read/cleanup block (around line 75 and line 86 per earlier grep). Supabase's session is the source of truth now.

- [ ] **Step 4: Verify type-check**

  ```bash
  npm run build
  ```

  Expected: build succeeds. If TypeScript complains about `UserProfile` spread (likely, since `UserProfile` has required fields like `calculatedTier`), fix by destructuring explicitly or using a helper — do NOT use `as any`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/Connect.tsx
  git commit -m "feat(auth): wire signInWithSpotify + post-signin taste fetch in Connect"
  ```

---

## Task 6.6: Anonymous Supabase Session on Apple Music Connect (item j)

Apple Music users today have no Supabase session at all — MusicKit is entirely client-side and never touches Supabase auth. After Task 6.5 flips route gates from "profile exists" to "session + loading resolved", Apple Music users would be locked out of the app. This task adds `supabase.auth.signInAnonymously()` to the Apple Music connect path, unifying the identity model so both paths produce a Supabase session.

Benefits beyond unlocking the gate:
- Apple Music users get `nugget_history` writes that actually land (anonymous users have a real `auth.uid()`, so RLS passes)
- Cross-device progression works within the Apple Music experience (a user who signs in anonymously on two devices still has two separate `auth.uid()`s — per-device but at least not silently failing)
- The route-gate rewrite (h) can be uniform (`!isGuest`) instead of an `OR`-gate hack

**Files:**
- Create: `src/hooks/ensureSupabaseSession.ts` (helper, standalone and tested)
- Modify: `src/pages/Connect.tsx` (Apple Music branch in `handleConnectAppleMusic`)
- Test: `src/test/ensureSupabaseSession.test.ts` (create)
- Test: add to `src/test/useSpotifyPostSigninSync.test.ts` a "does NOT fire for anonymous sessions" case (regression guard against the Spotify sync hook misfiring)

### Contract

`ensureSupabaseSession()` returns `Promise<Session>` and guarantees that by the time it resolves, `supabase.auth.getSession()` returns a non-null session. Behavior:
- If a session already exists (Spotify OAuth earlier, or Apple Music anon session from a prior connect), returns it unchanged — idempotent.
- Otherwise calls `supabase.auth.signInAnonymously()`, waits for it to complete, and returns the new session.
- If `signInAnonymously` fails (network, Supabase down), re-throws so the caller can decide UX. Do NOT silently return null — that would leave Apple Music working without identity, and we'd lose the "all users have a session" invariant the route gate depends on.

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/test/ensureSupabaseSession.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const getSessionMock = vi.fn();
  const signInAnonMock = vi.fn();

  vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
      auth: {
        getSession: getSessionMock,
        signInAnonymously: signInAnonMock,
      },
    },
  }));

  import { ensureSupabaseSession } from "@/hooks/ensureSupabaseSession";

  describe("ensureSupabaseSession", () => {
    beforeEach(() => {
      getSessionMock.mockReset();
      signInAnonMock.mockReset();
    });

    it("returns the existing session when one is already present (no signInAnonymously call)", async () => {
      const existing = { user: { id: "existing-user" } };
      getSessionMock.mockResolvedValue({ data: { session: existing }, error: null });

      const session = await ensureSupabaseSession();
      expect(session).toBe(existing);
      expect(signInAnonMock).not.toHaveBeenCalled();
    });

    it("signs in anonymously when no session exists, returns the new session", async () => {
      const created = { user: { id: "anon-user", is_anonymous: true } };
      getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
      signInAnonMock.mockResolvedValue({ data: { session: created, user: created.user }, error: null });

      const session = await ensureSupabaseSession();
      expect(session).toBe(created);
      expect(signInAnonMock).toHaveBeenCalledOnce();
    });

    it("throws when signInAnonymously returns an error", async () => {
      getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
      signInAnonMock.mockResolvedValue({ data: { session: null }, error: { message: "anon disabled" } });

      await expect(ensureSupabaseSession()).rejects.toThrow(/anon disabled/);
    });

    it("throws when signInAnonymously resolves with no session (defensive)", async () => {
      getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
      signInAnonMock.mockResolvedValue({ data: { session: null, user: null }, error: null });

      await expect(ensureSupabaseSession()).rejects.toThrow(/no session/i);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- --run src/test/ensureSupabaseSession.test.ts
  ```

  Expected: FAIL — `ensureSupabaseSession` module does not exist.

- [ ] **Step 3: Implement the helper**

  Create `src/hooks/ensureSupabaseSession.ts`:

  ```typescript
  import type { Session } from "@supabase/supabase-js";
  import { supabase } from "@/integrations/supabase/client";

  /**
   * Guarantees a Supabase session exists. Returns the existing session if one
   * is present (e.g. Spotify OAuth earlier in the onboarding flow), otherwise
   * creates an anonymous session via supabase.auth.signInAnonymously().
   *
   * Used by the Apple Music connect path in Connect.tsx so every connected
   * user has a real auth.uid() — required for (a) the session-based route
   * gates in App.tsx, and (b) nugget_history writes to pass RLS.
   *
   * Throws on anonymous-sign-in failure rather than returning null: callers
   * need to know if the identity-spine guarantee failed so they can surface
   * UX instead of silently leaving Apple Music working without a session.
   */
  export async function ensureSupabaseSession(): Promise<Session> {
    const { data: existing, error: getErr } = await supabase.auth.getSession();
    if (getErr) throw getErr;
    if (existing.session) return existing.session;

    const { data: created, error: signInErr } = await supabase.auth.signInAnonymously();
    if (signInErr) throw signInErr;
    if (!created.session) throw new Error("signInAnonymously returned no session");
    return created.session;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npm test -- --run src/test/ensureSupabaseSession.test.ts
  ```

  Expected: PASS (all 4 cases).

- [ ] **Step 5: Wire into Connect.tsx's Apple Music branch**

  In `src/pages/Connect.tsx`, modify `handleConnectAppleMusic` (currently at line 101). Add the import at the top:

  ```typescript
  import { ensureSupabaseSession } from "@/hooks/ensureSupabaseSession";
  ```

  Then update the function body. The current block starts with a comment explaining why no Supabase session was required; replace both the comment and the first line of logic:

  ```typescript
  const handleConnectAppleMusic = async () => {
    setAppleMusicConnecting(true);
    setAppleMusicError(null);
    try {
      // Identity spine: guarantee a Supabase session exists before MusicKit
      // authorizes. If the user already has one (Spotify connected first),
      // reuse it. Otherwise sign in anonymously. This unifies route gating
      // (App.tsx uses session presence, not profile presence) and makes
      // nugget_history writes land for Apple Music users (RLS requires a
      // real auth.uid()). See Task 6.6 in docs/superpowers/plans/.
      try {
        await ensureSupabaseSession();
      } catch (sessionErr) {
        console.error("ensureSupabaseSession failed on Apple Music connect:", sessionErr);
        setAppleMusicError("Couldn't start your session. Try again?");
        setAppleMusicConnecting(false);
        return;
      }

      const musicUserToken = await initiateAppleMusicAuth();
      // ... rest of the function unchanged
  ```

  Leave everything after the `musicUserToken` assignment unchanged — taste fetch, `setStep(1)`, error handling for MusicKit failure, etc. all stay as today.

- [ ] **Step 6: Regression test for useSpotifyPostSigninSync**

  In `src/test/useSpotifyPostSigninSync.test.ts` (created in Task 6 per 6A), add a case that confirms the hook does NOT fire a taste fetch for anonymous sessions:

  ```typescript
  it("does not fire taste fetch for anonymous (non-spotify) sessions", async () => {
    // Session exists, user is anonymous (no provider)
    const anonUser = { id: "anon-1", app_metadata: { provider: undefined }, is_anonymous: true };
    // ... render hook with this user, assert completeSpotifyConnect was NOT called
  });
  ```

  This guards against future refactors that remove the `provider !== "spotify"` guard and accidentally run a Spotify taste fetch for an Apple Music user.

- [ ] **Step 7: Type-check + run all tests**

  ```bash
  npm run build && npm test -- --run
  ```

  Expected: build succeeds, all tests pass.

- [ ] **Step 8: Commit**

  ```bash
  git add src/hooks/ensureSupabaseSession.ts src/test/ensureSupabaseSession.test.ts src/pages/Connect.tsx src/test/useSpotifyPostSigninSync.test.ts
  git commit -m "feat(auth): anonymous Supabase session on Apple Music connect"
  ```

### Notes for the implementer

- **Anonymous sign-in must be enabled in Supabase dashboard.** Add this verification step to Task 2: Supabase dashboard → Authentication → Providers → Anonymous Sign-Ins → enable. If it isn't enabled, `signInAnonymously()` returns `{ data: null, error: { message: "Anonymous sign-ins are disabled" } }`. The test covers that error path; the deployed app would surface the error banner until the dashboard setting is flipped.
- **Idempotency.** `ensureSupabaseSession` is safe to call multiple times. A user who taps "Connect Apple Music" twice, or who signs in with Spotify and then connects Apple Music, triggers the get-session path (no duplicate anonymous users).
- **The route-gate rewrite (Task 6.5) depends on Task 6.6.** If Task 6.6 isn't implemented before 6.5 lands, Apple Music users get locked out. Implement 6.6 BEFORE 6.5 in the sequence. This is reflected in the parallelization table below.
- **`useSignOut` already clears Supabase sessions.** An anonymous user signs out the same way a Spotify user does — `supabase.auth.signOut()` invalidates the anon JWT. No change to useSignOut logic, only the docstring (Task 12) needs updating, already planned.

---

## Task 7: Delete `SpotifyCallback.tsx` + Its Route

Supabase handles the callback at its own domain; the app's `/spotify-callback` route is obsolete.

**Files:**
- Delete: `src/pages/SpotifyCallback.tsx`
- Modify: `src/App.tsx` (remove route)

- [ ] **Step 1: Find the route registration**

  ```bash
  grep -n "SpotifyCallback\|spotify-callback" src/App.tsx
  ```

- [ ] **Step 2: Remove the import + route**

  In `src/App.tsx`:
  - Delete the `import SpotifyCallback from "./pages/SpotifyCallback"` line
  - Delete the `<Route path="/spotify-callback" element={<SpotifyCallback />} />` line (likely inside the Router tree)

- [ ] **Step 3: Delete the file**

  ```bash
  git rm src/pages/SpotifyCallback.tsx
  ```

- [ ] **Step 4: Verify no stray imports**

  ```bash
  grep -rn "SpotifyCallback\|spotify-callback" src/
  ```

  Expected: zero hits (aside from possibly documentation/comments — fine to leave docs, they'll be updated in Task 13).

- [ ] **Step 5: Type-check + run all tests**

  ```bash
  npm run build && npm test -- --run
  ```

  Expected: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/App.tsx src/pages/SpotifyCallback.tsx
  git commit -m "refactor(auth): remove custom /spotify-callback route"
  ```

---

## Task 8: Clean Up Dead PKCE Helpers in `useSpotifyAuth.ts`

With Supabase handling the OAuth dance, `initiateSpotifyAuth` + `exchangeSpotifyCode` + PKCE helpers are dead. Remove them. Keep `refreshSpotifyToken`, `fetchSpotifyTaste`, `getSpotifyRedirectUri`, and the new `signInWithSpotify`.

**Files:**
- Modify: `src/hooks/useSpotifyAuth.ts`

- [ ] **Step 1: Verify no callers of dead functions**

  ```bash
  grep -rn "initiateSpotifyAuth\|exchangeSpotifyCode\|generatePKCE\|base64UrlEncode" src/ supabase/
  ```

  Expected: only the `useSpotifyAuth.ts` definitions themselves. If `useSignOut.ts` still imports `PKCE_STATE_KEY`/`PKCE_VERIFIER_KEY`, that's fine — those are still exported for storage-cleanup purposes.

- [ ] **Step 2: Delete dead code**

  In `src/hooks/useSpotifyAuth.ts`, delete:
  - `base64UrlEncode` helper
  - `generatePKCE` helper
  - `initiateSpotifyAuth` function
  - `exchangeSpotifyCode` function

  Keep:
  - `PKCE_STATE_KEY` + `PKCE_VERIFIER_KEY` constants (consumed by `useSignOut` for stale-storage cleanup — safe to keep for now)
  - `getSpotifyRedirectUri` (may be useful for error UX in Task 12; remove in follow-up if not)
  - `refreshSpotifyToken`
  - `fetchSpotifyTaste`
  - `signInWithSpotify` (new)

- [ ] **Step 3: Update the file's top-of-file JSDoc**

  Replace the current header comment:

  ```typescript
  /**
   * Spotify auth helpers — Supabase-managed OAuth.
   *
   * signInWithSpotify triggers Supabase's Spotify provider, which handles the
   * full OAuth dance. After the redirect back to /connect, AuthContext's
   * onAuthStateChange bridges session.provider_token into the existing
   * spotify_playback_token localStorage shape (see AuthContext.tsx).
   *
   * refreshSpotifyToken is still client-side because Supabase does not
   * auto-refresh provider tokens (see Task 0 research note).
   *
   * fetchSpotifyTaste hits our edge function (backend needs the taste for RAG).
   */
  ```

- [ ] **Step 4: Type-check + tests**

  ```bash
  npm run build && npm test -- --run
  ```

  Expected: passes.

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useSpotifyAuth.ts
  git commit -m "refactor(auth): remove dead PKCE helpers in useSpotifyAuth"
  ```

---

## Task 9: Replace Silent `clearStoredProfile` With Reconnect UX (item g)

Today when `refreshSpotifyToken` fails, `useSpotifyToken` silently removes the storage key → user is bounced to onboarding with no explanation. Replace with a reconnect banner.

**Files:**
- Modify: `src/hooks/useSpotifyToken.ts`
- Modify: `src/pages/Listen.tsx` (or wherever the reconnect banner surfaces)
- Create: `src/components/SpotifyReconnectBanner.tsx`
- Test: `src/test/useSpotifyToken.refresh-failure.test.ts` (create)

- [ ] **Step 1: Write the failing test**

  Create `src/test/useSpotifyToken.refresh-failure.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { renderHook, act } from "@testing-library/react";

  vi.mock("@/hooks/useSpotifyAuth", () => ({
    refreshSpotifyToken: vi.fn().mockResolvedValue(null),
  }));

  import { useSpotifyToken } from "@/hooks/useSpotifyToken";

  describe("useSpotifyToken — refresh failure", () => {
    beforeEach(() => {
      localStorage.clear();
      localStorage.setItem("spotify_playback_token", JSON.stringify({
        accessToken: "expired",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000, // already expired
      }));
    });

    it("dispatches a reconnect-required event when refresh fails", async () => {
      const events: Event[] = [];
      window.addEventListener("spotify-reconnect-required", (e) => events.push(e));

      const { result } = renderHook(() => useSpotifyToken());
      await act(async () => {
        await result.current.getValidToken();
      });

      expect(events.length).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- --run src/test/useSpotifyToken.refresh-failure.test.ts
  ```

  Expected: FAIL — no such event dispatched.

- [ ] **Step 3: Dispatch event on refresh failure**

  In `src/hooks/useSpotifyToken.ts:79-83`, modify the refresh-failure branch:

  ```typescript
    // Need to refresh
    const refreshed = await refreshSpotifyToken(token.refreshToken);
    if (!refreshed) {
      localStorage.removeItem(STORAGE_KEY);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("spotify-reconnect-required"));
      }
      return null;
    }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npm test -- --run src/test/useSpotifyToken.refresh-failure.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Add the banner component**

  Create `src/components/SpotifyReconnectBanner.tsx`:

  ```typescript
  import { useEffect, useState } from "react";
  import { signInWithSpotify } from "@/hooks/useSpotifyAuth";

  export default function SpotifyReconnectBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      const onReconnect = () => setVisible(true);
      window.addEventListener("spotify-reconnect-required", onReconnect);
      return () => window.removeEventListener("spotify-reconnect-required", onReconnect);
    }, []);

    if (!visible) return null;

    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-destructive/95 px-5 py-3 text-sm text-destructive-foreground shadow-lg flex items-center gap-3">
        <span>Spotify session expired.</span>
        <button
          onClick={() => signInWithSpotify()}
          className="rounded-lg bg-background px-3 py-1 text-xs font-semibold text-foreground hover:opacity-90"
        >
          Reconnect
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 6: Mount the banner at app root**

  In `src/App.tsx`, add `import SpotifyReconnectBanner from "./components/SpotifyReconnectBanner"` and render `<SpotifyReconnectBanner />` inside `<AuthProvider>` (so it has access to the auth context) but outside the Router outlet, so it surfaces regardless of route.

- [ ] **Step 7: Type-check + run all tests**

  ```bash
  npm run build && npm test -- --run
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add src/hooks/useSpotifyToken.ts src/components/SpotifyReconnectBanner.tsx src/App.tsx src/test/useSpotifyToken.refresh-failure.test.ts
  git commit -m "feat(auth): surface reconnect banner when Spotify refresh fails"
  ```

---

## Task 10: Verify `nugget_history` Now Writes (item e)

The `nugget_history` table has 0 rows today because every INSERT is rejected by RLS (`auth.uid() = user_id`). Once Spotify auth establishes a real session, `auth.uid()` returns the user's id and writes land. Add a regression test + verify manually.

**Files:**
- Test: `src/test/nuggetHistory.auth.test.ts` (create)

- [ ] **Step 1: Write regression test**

  Create `src/test/nuggetHistory.auth.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from "vitest";

  // This test documents the RLS invariant — nugget_history writes require
  // a real auth.uid(). It mocks Supabase but asserts the code calls
  // supabase.auth.getSession() BEFORE writing, so the userId comes from
  // the real session (not the localStorage anon fallback) when available.

  vi.mock("@/integrations/supabase/client", () => {
    const fromMock = vi.fn();
    return {
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { id: "real-user-id" } } },
          }),
        },
        from: fromMock,
      },
    };
  });

  import { supabase } from "@/integrations/supabase/client";

  describe("nugget_history auth contract", () => {
    it("prefers session.user.id over the localStorage anon fallback", async () => {
      const { data: { session } } = await supabase.auth.getSession();
      expect(session?.user.id).toBe("real-user-id");
    });
  });
  ```

  (A light regression — the real test is the integration check in Step 2. This guards against a future refactor that removes the `session?.user?.id ??` branch in `useAINuggets.ts:182`.)

- [ ] **Step 2: Run the test**

  ```bash
  npm test -- --run src/test/nuggetHistory.auth.test.ts
  ```

  Expected: PASS.

- [ ] **Step 3: Manual verification**

  1. `npm run dev`
  2. Complete Spotify connect via the new flow
  3. Play a track to the point where `useAINuggets` runs
  4. Query the DB:

     ```sql
     SELECT user_id, track_key, listen_count FROM public.nugget_history LIMIT 5;
     ```

  5. Expected: at least one row with `user_id` matching `auth.users.id`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/test/nuggetHistory.auth.test.ts
  git commit -m "test(nuggets): guard nugget_history session.user.id preference"
  ```

---

## Task 11: Flip `verify_jwt = true` for Spotify Edge Functions (item f)

Now that real sessions exist, `spotify-taste` can trust the Supabase JWT (which carries the actual `auth.uid()`) instead of relying on the untrusted `accessToken` body field as the sole identity signal.

**Files:**
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/spotify-taste/index.ts` (optional defensive check)

- [ ] **Step 1: Flip the config**

  In `supabase/config.toml`, change:

  ```toml
  [functions.spotify-taste]
  verify_jwt = false
  ```

  to:

  ```toml
  [functions.spotify-taste]
  verify_jwt = true
  ```

  Leave `spotify-search`, `spotify-album`, `spotify-resolve`, `spotify-artist` at `verify_jwt = false` for now — those are read-only lookups called from public-browse contexts where we don't want to block guests. Document this decision as a code comment near the `spotify-taste` stanza.

- [ ] **Step 2: Deploy**

  ```bash
  npx supabase functions deploy spotify-taste
  ```

  Expected: deploy succeeds. If you don't have `SUPABASE_ACCESS_TOKEN` locally, ask the user to run this.

- [ ] **Step 3: Smoke test the deployed function**

  1. Call the function without an `Authorization` header (e.g. via `curl`) — expected: 401 from the gateway
  2. Call it with a stale/random JWT — expected: 401
  3. Call it from the app (new Supabase session will carry a valid JWT) — expected: 200

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/config.toml
  git commit -m "chore(edge): require JWT on spotify-taste now that auth is real"
  ```

---

## Task 12: Update `useSignOut` Documentation (item a-ish)

`supabase.auth.signOut()` now actually does work (it was a no-op before). Update the JSDoc + keep the belt-and-suspenders localStorage sweep.

**Files:**
- Modify: `src/hooks/useSignOut.ts`

- [ ] **Step 1: Update the top-of-file JSDoc**

  Replace the current module-level comment in `src/hooks/useSignOut.ts` with:

  ```typescript
  /**
   * useSignOut — single source of truth for ending a user's session.
   *
   * Since real Supabase sessions landed with Spotify OAuth migration,
   * supabase.auth.signOut() actually invalidates the JWT server-side.
   * The localStorage sweep below remains belt-and-suspenders for the
   * case where the /auth/v1/logout network call fails (see
   * nukeSupabaseAuthTokens comment).
   *
   * Hard reload at the end tears down the Spotify Web Playback SDK +
   * MusicKit JS singletons and avoids the ProtectedRoute re-render race.
   */
  ```

  No behavior change — the code was already correctly structured for the real case; only the docstring lied.

- [ ] **Step 2: Commit**

  ```bash
  git add src/hooks/useSignOut.ts
  git commit -m "docs(auth): useSignOut docstring reflects real session invalidation"
  ```

---

## Task 13: Update Project Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `Dev.md`

- [ ] **Step 1: Update CLAUDE.md architecture notes**

  In `CLAUDE.md`:
  - The "Authentication" line already says "Supabase Auth + Spotify OAuth (PKCE)" — change to "Supabase Auth (Spotify OAuth provider) + Apple MusicKit (separate)"
  - Under "Architecture Notes", the "Spotify PKCE" bullet currently reads: "Spotify PKCE: Client-side OAuth, no backend secret needed; tokens in localStorage". Replace with: "Spotify OAuth: Supabase-managed; provider tokens bridged from session into `spotify_playback_token` localStorage by AuthContext; refresh handled client-side by `useSpotifyToken` (Supabase does not auto-refresh provider tokens)."

- [ ] **Step 2: Update Dev.md**

  Find and rewrite the section that describes the custom PKCE flow. Keep the rest of Dev.md unchanged in this slice — full Section 9 auth audit is separate scope.

- [ ] **Step 3: Commit**

  ```bash
  git add CLAUDE.md Dev.md
  git commit -m "docs: reflect Spotify Supabase OAuth migration"
  ```

---

## Task 14: Final Verification + Open PR

- [ ] **Step 1: Full test suite**

  ```bash
  npm test -- --run && npm run build && npm run lint
  ```

  Expected: all pass. Lint may still show the pre-existing 111 `no-explicit-any` issues tracked in #18 — those are not regressions.

- [ ] **Step 2: End-to-end manual QA**

  1. `npm run dev`, open incognito
  2. Walk through onboarding → Connect → pick Spotify → complete Supabase OAuth
  3. Verify landing on `/connect` with a real Supabase session (check `supabase.auth.getSession()` in devtools)
  4. Verify `localStorage.spotify_playback_token` is populated
  5. Verify `profiles` row exists for the new `auth.users.id`
  6. Play a track → verify `nugget_history` row lands (DB query)
  7. Sign out → verify session gone + localStorage keys cleaned + redirected to onboarding
  8. Sign in again → verify session restores + nugget_history continuity

- [ ] **Step 3: Push branch**

  ```bash
  git push -u origin clt/spotify-supabase-oauth
  ```

- [ ] **Step 4: Open PR against staging**

  Use the `/send-it` slash command or `gh pr create` with target `staging`. Include in the body:
  - Link to issue #52
  - Summary of the 7 scope items delivered
  - "Refresh Behavior" note from Task 0
  - Test plan (manual QA checklist from Step 2)

---

## Self-Review Notes

- Spec coverage: each of a–g has at least one task. Apple Music is explicitly out-of-scope (noted in Goal section).
- Placeholders: none — every task has concrete file paths, exact commands, and complete code snippets.
- Type consistency: `StoredSpotifyToken` in AuthContext matches the shape `useSpotifyToken` reads; `SpotifyProfilePatch` is derived from `UserProfile`.
- Risk: Task 0's research outcome can change Task 3–8's shape if refresh requires an edge function. Mitigation: contingency task scaffolded, marked explicitly.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES_FOUND | 5 sharp concerns, all accepted |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN | 7 issues across 4 sections, all resolved via AskUserQuestion |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** 5 concerns, 5 accepted — route gate routing, premature profile save, token bridge TTL + refresh-token presence, verify_jwt theater, fake test coverage.

**CROSS-MODEL:** Significant overlap on bridge concerns (Issue 1 vs Codex T3 partially align). Codex caught 3 issues the eng review missed entirely: route gate (T1), premature save (T2), verify_jwt as theater (T4).

**UNRESOLVED:** 0

**VERDICT:** ENG CLEARED with revisions — plan body requires edits before implementation (see "Review-Driven Revisions" section below). Task 11 removed. Two new scope items added (h, i). Research scope in Task 0 expanded.

---

## Refresh Behavior (Task 0 output)

**Verified 2026-04-20 via Supabase docs, GitHub discussion #22578, and GitHub issue #1450.**

1. **`signInWithOAuth` does expose `provider_token` + `provider_refresh_token`** on the Session object returned immediately after OAuth callback. Accessible via `data.session?.provider_token` / `data.session?.provider_refresh_token`.

2. **Supabase does NOT persist provider tokens.** Per Supabase maintainer reply on discussions/22578: *"Supabase does not store them for security reasons. You can store them however you like in local storage, etc."* After the first Supabase JWT refresh (~1h), `session.provider_token` and `session.provider_refresh_token` are `undefined` on subsequent `getSession()` calls.

3. **Supabase does NOT auto-refresh provider tokens.** Only the Supabase JWT is auto-refreshed via the refresh-token endpoint. Provider tokens have their own Spotify-issued TTL, independent of the Supabase JWT.

4. **Client-side refresh with `client_id` only FAILS** for Supabase-issued Spotify refresh tokens (issue #1450, closed as not planned). Supabase's Spotify OAuth uses the non-PKCE server-side flow; its refresh tokens require `client_secret`. Using the secret client-side defeats the PKCE security model.

5. **No separate `provider_expires_at` field** is documented on the Session type. Treat Spotify token TTL as independent of `session.expires_in`.

**Implications for the plan:**
- The bridge captures provider tokens ONCE at sign-in (from the initial session). localStorage becomes the only source of truth afterward.
- The bridge's `if (!session?.provider_token) return;` guard (Task 4) correctly handles post-JWT-refresh sessions where provider tokens are gone.
- **Client-side refresh via Spotify's API (current `refreshSpotifyToken` in useSpotifyAuth.ts) will NOT work** for Supabase-issued refresh tokens. We need a new edge function.

**Sources:**
- [Supabase Sessions docs](https://supabase.com/docs/guides/auth/sessions)
- [GitHub discussions/22578](https://github.com/orgs/supabase/discussions/22578)
- [GitHub supabase/auth#1450](https://github.com/supabase/auth/issues/1450)

---

## Review-Driven Revisions (apply before implementation)

The following changes reconcile the original plan with decisions made during `/plan-eng-review` AND Task 0 research. Implementer: treat this section as authoritative where it conflicts with earlier tasks.

### From Task 0 (Research Output)

**Task 3.5 (NEW, REQUIRED) — Create `spotify-refresh` edge function.**
- Create `supabase/functions/spotify-refresh/index.ts`. Accepts `{ refreshToken: string }` in the body, calls Spotify's `/api/token` with `grant_type=refresh_token` + `client_id` + `client_secret` (via `SPOTIFY_CLIENT_SECRET` env secret), returns `{ accessToken, refreshToken, expiresIn }`.
- The function must `verify_jwt = true` from day one (distinct from Task 11's dropped `spotify-taste` flip — the refresh function never touches user-scoped taste data, it just exchanges refresh tokens server-side). The JWT requirement rate-limits the endpoint by authenticated callers only.
- Add to `supabase/config.toml`.
- Update `useSpotifyToken.ts:79` to call `supabase.functions.invoke("spotify-refresh", { body: { refreshToken } })` instead of `refreshSpotifyToken(token.refreshToken)` directly.
- Keep `refreshSpotifyToken` in `useSpotifyAuth.ts` ONLY as a dead helper to remove in Task 8, OR remove immediately if simpler.
- Deploy via `npx supabase functions deploy spotify-refresh` before implementing Task 9 (reconnect banner depends on refresh being callable).
- Test: unit test `useSpotifyToken` hitting the mocked edge function + integration smoke (call the deployed function with a valid refresh token).

### From Architecture Review

### From Architecture Review

**1B — Extract shared token constants.**
- Create `src/lib/spotifyTokenStore.ts` containing `SPOTIFY_STORAGE_KEY`, `TOKEN_CHANGED_EVENT`, and the `StoredSpotifyToken` interface.
- Update `useSpotifyToken.ts` to import from this module (remove its inline constants).
- Have the bridge (formerly `bridgeSpotifyProviderTokens` in `AuthContext.tsx` per Task 4) live in `spotifyTokenStore.ts` too. Export both the bridge and the constants from that module. `AuthContext.tsx` just calls the bridge on state change — no storage concerns in the context file.
- Add a lifecycle JSDoc block above the bridge documenting the three write paths (bridge, refresh, sign-out) and why the freshness guard exists.

**2A — Suppress DB-load race on fresh sign-in.**
- In `useMusicNerdState.ts`, add a `freshSignIn` boolean that the new `useSpotifyPostSigninSync` hook (per 6A) can set to `true` for the duration of its taste fetch.
- The `loadProfileFromDB` useEffect (currently at useMusicNerdState.ts:181) should check this flag and skip the DB load when true. After the post-signin sync writes to localStorage, flip it back to false.
- Test: simulate fresh sign-in, verify `loadProfileFromDB` is NOT called while taste fetch is in flight.

**3A — Vercel preview wildcard URL.**
- Task 2 Step 3 amends to include the preview-URL wildcard. Verify the actual Vercel project slug before writing the pattern. Expected shape: `https://mntv-*-xdjs.vercel.app/connect` (confirm against Vercel project settings).

**4A → superseded by T4 (see Codex section below).** Task 11 is DROPPED.

### From Code Quality Review

**5A — `emptyProfile()` helper.**
- Add `function emptyProfile(): UserProfile { return { streamingService: "", calculatedTier: "casual" }; }` to `useMusicNerdState.ts`.
- Callers that merge into a possibly-null profile use `{ ...(profile ?? emptyProfile()), ...patch }` instead of the cast-to-UserProfile pattern.

**6A — Extract `useSpotifyPostSigninSync` hook.**
- New file: `src/hooks/useSpotifyPostSigninSync.ts`.
- Encapsulates: auth-is-spotify check, profile-has-taste short-circuit, session.provider_token extraction, `completeSpotifyConnect` call, ephemeral-storage of taste patch (per T2 below).
- Connect.tsx calls this hook; no longer holds the effect directly.
- Test file: `src/test/useSpotifyPostSigninSync.test.ts` covering all 7 branches.

### From Test Review

**7A — Hook + banner unit tests.**
- Write test file per 6A (7 branches on the hook).
- Write `src/test/SpotifyReconnectBanner.test.tsx` covering: renders null initially, shows on `spotify-reconnect-required` event, click triggers `signInWithSpotify`.
- Plan Task 9 Steps 1–4 already cover the `useSpotifyToken` refresh-failure path — keep as-is.

### From Codex (Outside Voice)

**T1 — Route gate rewrite (NEW TASK, SEQUENCED AFTER Task 6.6).**
- Insert a new task between Task 6.6 and Task 7: **Task 6.5 — Gate routes on session, not profile.** (Named 6.5 for readability — logical sequence is 6 → 6.6 → 6.5 → 7. See parallelization table.)
- Modify `src/App.tsx:41` and `src/App.tsx:49` (and `src/pages/Connect.tsx:68`) so route protection checks `!loading && !isGuest` from `useAuth()`, NOT `profile !== null`.
- Add a top-level loading state in `App.tsx` so the app renders a spinner during initial auth hydration instead of flash-of-onboarding.
- Test: simulate signed-in-but-no-local-profile, verify user is NOT bounced to onboarding.
- Test: simulate an anonymous Apple Music user (session with `is_anonymous: true`, no profile), verify they are NOT bounced to onboarding (guards against Apple Music regression from item j).
- **Critical: must land AFTER Task 6.6.** Without Task 6.6's anonymous-session provisioning on the Apple Music path, this route-gate change locks existing Apple Music users out. Parallelization table reflects this dependency.
- Without this task, the plan's stated goal (cross-device progression) doesn't land.

**T2 — Spotify taste stays ephemeral until `handleTierSelect`.**
- Revise Task 6 Step 3 and the `useSpotifyPostSigninSync` hook (6A): the hook stores the taste patch in a React state variable or `sessionStorage` key (e.g. `spotify_pending_taste`, same pattern as today). It does NOT call `saveProfile`.
- `handleTierSelect` (Connect.tsx:163/174) reads the ephemeral taste and merges it into the tier-complete profile save, same as today's flow.
- This preserves the existing "profile exists in localStorage = onboarding complete" contract, so the route gate fix (T1) doesn't have to handle partial profiles.

**T3 — Expand Task 0 research + defensive bridge logic.**
- Task 0 Step 1 adds a 4th question: *"What exact session field represents the Spotify access token TTL? Is it `session.expires_in` (Supabase JWT TTL) or a provider-scoped field (e.g. `provider_expires_at`)?"*
- The bridge (from 1B) adds two defensive guards:
  1. If `provider_refresh_token` is falsy, DO NOT write to localStorage (prevents clobbering a good refresh token with empty string on later auth events).
  2. If Task 0 research identifies a provider-scoped TTL field, use it for `expiresAt` instead of `session.expires_in`.

**T4 — Drop Task 11 (`verify_jwt = true` on spotify-taste).**
- Remove Task 11 entirely from this slice.
- `supabase/config.toml` stays `verify_jwt = false` for `spotify-taste`.
- Reason: flipping verify_jwt without server-side provider-token resolution creates false security sense. A valid Supabase JWT does not bind to the Spotify access token in the request body.
- Follow-up slice (documented in Not In Scope above): rewrite `spotify-taste` to ignore `body.accessToken`, call `supabase.auth.getUser()` server-side, source provider token from Supabase auth admin API keyed to the caller's JWT.

**T5 — Delete the fake nugget_history test.**
- Remove Task 10 Steps 1, 2, and 4 (the test creation + assertion + commit).
- Keep Task 10 Step 3 (manual DB verification after first real track play).
- Reason: test only asserts a mock of `getSession()` — doesn't exercise the actual INSERT/UPDATE paths at `useAINuggets.ts:181`, `Listen.tsx:352`, `Listen.tsx:378` that RLS was rejecting. Creates false confidence.

---

## Failure Modes & Mitigations

| Codepath | Realistic failure | Test? | Error-handling? | User visibility? |
|----------|-------------------|-------|----------------|------------------|
| `signInWithOAuth` network failure | Spotify authorize unreachable, returns error URL | Partial (error path GAP) | `console.error` + rethrow | **Silent failure** — critical gap |
| Bridge writes with empty `provider_refresh_token` | Supabase emits session event without refresh token | Covered after T3 guard | Skip write | N/A (silently preserves good state) |
| Token bridge TTL mismatch | Spotify token expires before useSpotifyToken's 60s buffer | Covered by refresh-failure test + T3 research | Reconnect banner fires | Banner visible |
| Route gate renders before session hydrates | User sees onboarding flash before signed-in route | Covered after T1 loading-state fix | Spinner during loading | Clean |
| Ephemeral taste lost on tab close | User closes tab after sign-in, before tier select | Acceptable — same as today | User re-completes onboarding | Clean (edge case) |
| nugget_history RLS regression | Future change removes session-first userId preference | Manual-only (per T5) | RLS rejects silently | **Silent failure** — accepted gap |
| `ensureSupabaseSession` fails (Apple Music path) | Anonymous sign-ins disabled in dashboard, network, or Supabase down | Covered by `ensureSupabaseSession.test.ts` (error cases) | Caught in `handleConnectAppleMusic`, surfaced as `appleMusicError` banner | **Banner visible** — "Couldn't start your session. Try again?" |
| Anonymous user `auth.uid()` orphaned on localStorage clear | User clears site data; new anon session gets new `auth.uid()` | Not testable (manual observation) | Silent — old `nugget_history` rows stranded under prior anon id | Clean UX (silent data drift) |
| Anonymous → Spotify identity swap loses history | Anon user later connects Spotify via `signInWithOAuth` (no `linkIdentity` in this slice) | Not covered | New Supabase user id; prior anon's `nugget_history` orphaned | **Silent** — documented limitation in Not In Scope |

**Critical gap flagged:** `signInWithSpotify` error path has no test AND the thrown error surfaces only via `console.error`. If `signInWithOAuth` returns a soft error (network unreachable, Supabase down), the UI shows no feedback. Recommend adding an error-toast callback surface in a future slice if this path becomes relevant.

---

## Worktree Parallelization Strategy

Most tasks share `useSpotifyAuth.ts` + `AuthContext.tsx` + `Connect.tsx` and must be sequential. Limited parallelism.

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Task 0 (research) ✅ | none | — |
| Task 1 (branch) ✅ | none | Task 0 |
| Task 2 (dashboard config) | none | Task 1 |
| Task 3 (signInWithSpotify) | `hooks/` | Task 1 |
| Task 3.5 (spotify-refresh edge function) | `supabase/functions/`, `supabase/config.toml`, `hooks/useSpotifyToken.ts` | Task 2 Step 4 (`SPOTIFY_CLIENT_SECRET` secret) |
| Task 4 + 1B (bridge → shared module) | `lib/`, `contexts/`, `hooks/` | Task 3 |
| Task 5 (completeSpotifyConnect) | `hooks/` | — |
| Task 6 + T2 + 6A (Connect Spotify branch + hook) | `pages/`, `hooks/` | Task 4, Task 5, 5A |
| Task 6.6 (ensureSupabaseSession + Apple Music anon) | `hooks/`, `pages/Connect.tsx` (Apple Music branch) | Task 2 Step 5 (Anonymous Sign-Ins enabled) |
| Task 6.5 (T1 — route gate) | `pages/`, `contexts/`, `App.tsx` | **Task 6.6 (critical — must land FIRST)**, Task 4 |
| Task 7 (delete SpotifyCallback) | `pages/`, `App.tsx` | Task 6, Task 6.5 |
| Task 8 (cleanup dead PKCE) | `hooks/` | Task 7, Task 3.5 |
| Task 9 (reconnect banner) | `hooks/`, `components/` | Task 4, Task 3.5 |
| Task 10 (nugget_history manual verify) | none (DB query) | Task 6.5 in prod |
| Task 12 (useSignOut docs) | `hooks/` | — |
| Task 13 (docs) | `CLAUDE.md`, `Dev.md` | — |
| Task 14 (final verification + PR) | none | everything above |

**Execution order:**
- Task 2 is user-driven (dashboard). Can run in parallel with Task 3 + Task 5 (both have no dashboard dependency; tests mock Supabase).
- Task 3.5 waits on Task 2 Step 4 (secret) before deployable, though the code can be written in parallel.
- Task 6.6 waits on Task 2 Step 5 (Anonymous Sign-Ins enabled) before the test in a real environment passes; code can be written in parallel.
- **Task 6.5 MUST follow Task 6.6.** The route-gate rewrite depends on Apple Music users having a session; if 6.5 lands first, Apple Music users hit locked routes.
- Tasks 9, 12, 13 can fan out after their deps.

Limited gain from worktree parallelization because Connect.tsx is touched by multiple tasks. Sequential implementation with careful ordering recommended.

---

## Open Questions (resolve during implementation or defer)

Each question below can be safely deferred without blocking implementation, but the implementer should check whether a question becomes actionable as they reach the relevant task. Flag any question that becomes a BLOCKER to the user before making an ad-hoc decision.

1. **Exact prod Vercel host + project slug for redirect URLs.**
   - Needed in: Task 2 Step 3.
   - Action: read `vercel.json` or check Vercel dashboard for the project. Write the concrete hostname into Task 2 Step 3's `prod URL` entry and the wildcard pattern. Expected: `https://musicnerd.tv/connect` + `https://mntv-*-xdjs.vercel.app/connect` (verify).
   - Status: unresolved; blocks Task 2 Step 3 for the final entry.

2. **DB strategy for this slice: shared prod DB vs Supabase Branching vs separate dev project.**
   - Conversation history records three options (A Branching / B separate dev project / C shared). Recommendation was C (shared prod DB) because the migration is additive, but a decision was never finalized — the conversation ended on the concern "would C break prod Spotify auth?" Answer: no, dashboard changes are additive (writeup in plan conversation).
   - Related: two new MCP servers (`devdb`, `proddb`) appeared mid-session. That suggests a dev/prod DB split may already be set up.
   - Action: at the start of Task 2, run `mcp__devdb__get_project_url` and `mcp__proddb__get_project_url` to confirm the two projects exist and which is which. If a dev project exists, point local `.env` at it and scope Task 2 dashboard actions to the dev project first; mirror to prod when the PR is ready to merge.
   - Status: unresolved; decision needed at start of Task 2.

3. **TTL semantics of `session.expires_in` for the Spotify bridge.**
   - Task 0 research established that Supabase's `session.expires_in` is the Supabase JWT TTL, not the Spotify token TTL. T3 asks whether Supabase exposes a provider-scoped TTL field (e.g. `provider_expires_at`); the research did not answer this.
   - Action: during Task 4 (bridge), log the full session object in dev and inspect for any field that looks like a Spotify-specific TTL. If none exists, use `session.expires_in` as the expiry and rely on useSpotifyToken's 60-second refresh buffer + the reconnect banner to handle drift.
   - Status: likely just "session.expires_in works well enough" — but worth one concrete verification during Task 4.

4. **Anonymous user `auth.uid()` orphaned rows cleanup.**
   - When an Apple Music user clears localStorage (or switches devices), their next anonymous sign-in gets a new `auth.uid()`. Prior `nugget_history` rows are stranded but still count as rows in the DB.
   - Action: document the limitation (already noted in Not In Scope and Failure Modes). If the DB grows uncomfortably, add a cleanup cron in a future slice — orphaned rows can be identified by `user_id IN (SELECT id FROM auth.users WHERE is_anonymous = true AND last_sign_in_at < now() - interval '90 days')`.
   - Status: resolved as known limitation; no action in this slice.

5. **Link-identity upgrade path for anonymous Apple Music users who later add Spotify.**
   - Today: anon user → clicks "Connect Spotify" → `signInWithOAuth` replaces the anon session with a Spotify-identified one → prior anon's `auth.uid()` is gone → their `nugget_history` rows are orphaned.
   - Correct approach: `supabase.auth.linkIdentity({ provider: "spotify" })` preserves the anon user's `auth.uid()` and adds Spotify as a linked identity.
   - Action: out of scope for this slice (listed in Not In Scope). Next slice.
   - Status: resolved as future work; mentioned in product-surface-area note.

6. **Does `handleConnectAppleMusic` need to surface anon-sign-in latency to the user?**
   - `signInAnonymously()` is a single network call, typically <200ms. If it's slow, the user sees the "Connecting..." spinner on the Apple Music button for slightly longer than today. Acceptable degradation.
   - Action: no special UX needed. If latency becomes visible in QA, add a skeleton state.
   - Status: resolved.

7. **Does the Spotify OAuth scope list in `useSpotifyAuth.ts:11` match what Supabase's dashboard requires?**
   - Supabase's Spotify provider dashboard has its own scopes field. Task 2 Step 1 says "leave blank" because we pass `options.scopes` at call time. Double-check that Supabase's dashboard doesn't REQUIRE a default when the field is blank — some providers do.
   - Action: during Task 2 Step 6 (cold verify), if the authorize URL doesn't include the expected scopes, set them in the dashboard too.
   - Status: unresolved; worth a 30-second verification at Task 2 Step 6.

8. **Is Supabase anonymous sign-in enabled on the project today?**
   - Answered implicitly by Task 2 Step 5 — if it's not enabled, Task 6.6 unit tests still pass (mocks), but the real app will fail at `handleConnectAppleMusic`. The user would see the new "Couldn't start your session" banner.
   - Action: enable in Task 2 Step 5 before deploying Task 6.6 to a preview.
   - Status: resolved by Task 2 Step 5.

---

## Completion Summary

- Step 0: Scope Challenge — **scope accepted as-is, then reduced** by dropping item (f) based on cross-model review
- Architecture Review: **4 issues found, all resolved**
- Code Quality Review: **2 issues found, all resolved**
- Test Review: diagram produced, **8 gaps identified, 7A closes hook + banner gaps, nugget_history + E2E accepted as manual**
- Performance Review: **0 issues**
- NOT in scope: written (added real server-side provider-token resolution, integration tests, Playwright)
- What already exists: written (AuthContext, useSpotifyToken, useMusicNerdState, useSignOut, fetchSpotifyTaste)
- TODOs: none added — all review outputs routed into plan revisions or existing issue tracker
- Failure modes: 1 critical gap flagged (signInWithSpotify error UX)
- Outside voice: ran (codex) — 5 concerns, 5 accepted
- Parallelization: sequential (shared auth surface limits parallelism); Task 6.6 must precede Task 6.5
- Lake Score: 11/12 recommendations chose complete option (T5 accepted "manual only" as the honest answer, not a shortcut)

---

## Post-Review Addendum — 2026-04-20

**Item (j) added + Task 6.6 inserted** after the initial review. Context: during Task 2 sequencing discussion, the implementer asked "how does this impact Apple Music support?" and we realized the route-gate rewrite (h) would lock Apple Music users out of the app because they have no Supabase session (MusicKit is entirely client-side). Resolution: add anonymous Supabase session on the Apple Music connect path so every connected user has an identity. See Task 6.6 for details.

This addendum was NOT run through `/plan-eng-review` — it's a scope expansion made during implementation. Flag any concerns when executing Task 6.6.

**Session state at addendum time:**
- Branch `clt/spotify-supabase-oauth` created off `staging@41a64ac`
- Task 0 complete (research)
- Task 1 complete (branch + baseline: 230 tests green, current PKCE flow manually verified working)
- Task 2 paused pending DB strategy decision (Open Question 2)
- No code changes committed yet — only this plan file is on the branch
