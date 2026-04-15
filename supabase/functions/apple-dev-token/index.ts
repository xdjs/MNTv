// Serves an Apple Music Developer Token (ES256 JWT) to the client.
// The client passes this to MusicKit.configure() before prompting the user
// to authorize (which then returns a Music User Token for library/history access).
//
// Auth model: this project has no real users in auth.users — every client
// authenticates as anonymous via the Supabase publishable key, which the
// gateway accepts as a valid JWT (verify_jwt = true). Calling
// supabase.auth.getUser() would always return null and 401 the request,
// even though the caller is exactly who we expect. The gateway-level JWT
// check (anon-key-or-better) is the only auth layer that makes sense
// today; see #52 for the broader auth-vs-anonymous discussion.
//
// Called by useAppleMusicAuth on the client before initiateAppleMusicAuth().

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // The Supabase gateway has already validated the JWT (verify_jwt = true).
  // We still check for the header's presence so a misconfigured caller
  // (curl without auth) gets a clean 401 instead of a 500.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const token = await getAppleDeveloperToken();
    return new Response(
      JSON.stringify({ token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Log the full error server-side but return a generic message to the client
    // so we don't leak internal config, key material, or env var names.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[apple-dev-token] Failed to generate token:", message);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
