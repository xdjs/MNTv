// Serves an Apple Music Developer Token (ES256 JWT) to authenticated clients.
// The client passes this to MusicKit.configure() before prompting the user
// to authorize (which then returns a Music User Token for library/history access).
//
// Requires a valid Supabase user session — prevents anonymous abuse of the
// Apple Music API quota by third parties scraping the endpoint.
//
// Called by useAppleMusicAuth on the client before initiateAppleMusicAuth().

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";

// Wildcard origin is safe here — access is gated by the Supabase JWT
// validation below, so no unauthenticated cross-origin caller can obtain
// a token. Matches the CORS pattern used across the repo's edge functions.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require a valid Supabase session — the client library includes the user's
  // JWT automatically via supabase.functions.invoke.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, "")
    );
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
