import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Guarantee a Supabase session exists. Returns the existing session if
 * there is one (e.g. Spotify OAuth earlier in the onboarding flow),
 * otherwise creates an anonymous session via
 * `supabase.auth.signInAnonymously()`.
 *
 * Used by the Apple Music connect path so every connected user has a
 * real `auth.uid()`. Two downstream benefits:
 *   1. The session-based route gate (see `src/routes.tsx`) works for
 *      Apple users (they're no longer locked out for lacking a session).
 *   2. `nugget_history` writes pass RLS, which today silently rejects
 *      them because `auth.uid()` is null for Apple users.
 *
 * Throws (rather than returning null) on anonymous-sign-in failure so
 * the caller can surface a UI error. Silently returning null here would
 * leave Apple Music working without identity and break the "every
 * connected user has a session" invariant the route gate depends on.
 *
 * Note: `supabase.auth.signInAnonymously()` requires Anonymous Sign-Ins
 * to be enabled in the Supabase dashboard (Auth → Providers → Anonymous
 * Sign-Ins). If it's disabled, the call returns
 * `{ error: { message: "Anonymous sign-ins are disabled" } }` and this
 * function throws with that message — surface to the user and enable.
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
