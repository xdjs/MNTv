// Serves an Apple Music Developer Token (ES256 JWT) to the client.
// The client passes this to MusicKit.configure() before prompting the user
// to authorize (which then returns a Music User Token for library/history access).
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
