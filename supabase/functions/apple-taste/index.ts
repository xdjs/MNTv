import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";
import {
  appleGet,
  buildUniqueAppleTracks,
  rankAppleArtists,
  safeStorefront,
  type AppleResource,
} from "../_shared/apple-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fetches the user's Apple Music listening taste given a Music User Token.
// Called by the frontend after MusicKit.authorize() resolves.
//
// Apple Music API has no "top artists/tracks" endpoint, so we combine two
// sources and return a Spotify-taste-compatible shape with partial: true
// so the client knows the signal is softer:
//
//   - /me/history/heavy-rotation      — resources the user listens to often
//                                       (mostly albums; no explicit ranking)
//   - /me/recent/played/tracks?limit  — recent plays, frequency becomes the
//                                       signal we rank artists by
//
// Artists are weighted: +1 per recent play, +3 per heavy-rotation hit.
// The ranking logic lives in _shared/apple-utils.ts for unit test coverage.

// Apple Music User Token character set — same allowlist spotify-taste uses
// for its access token, prevents CR/LF/NUL from reaching the headers layer.
const MUT_PATTERN = /^[A-Za-z0-9\-_=+/.]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth model: this project has no real users in auth.users — every
  // client authenticates as anonymous via the Supabase publishable key,
  // which the gateway accepts as a valid JWT (verify_jwt = true).
  // Calling supabase.auth.getUser() would always return null and 401
  // the request, even though the caller is exactly who we expect.
  // The Music User Token below IS the auth signal: only a real Apple
  // Music subscriber can produce one (popup-driven MusicKit.authorize),
  // and it's bound to that subscriber's library by Apple. See issue #52
  // for the broader auth-vs-anonymous discussion.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { musicUserToken, storefront: rawStorefront } =
      (body ?? {}) as { musicUserToken?: unknown; storefront?: unknown };

    if (
      !musicUserToken ||
      typeof musicUserToken !== "string" ||
      musicUserToken.length < 10 ||
      musicUserToken.length > 4096 ||
      !MUT_PATTERN.test(musicUserToken)
    ) {
      return new Response(JSON.stringify({ error: "Invalid musicUserToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Storefront is passed through to the response as `country` only.
    // Apple's /me/history/* and /me/recent/* endpoints don't take a
    // storefront path segment — they're user-scoped and Apple resolves
    // the user's storefront from the MUT. The client already has the
    // storefront from MusicKit.getInstance().storefrontCountryCode and
    // we echo it back for consistency with spotify-taste's `country`
    // field rather than to influence the Apple requests below.
    const storefront = safeStorefront(rawStorefront);
    const devToken = await getAppleDeveloperToken();

    // Parallel: heavy-rotation resources + recent played tracks
    const [rotation, recent] = await Promise.all([
      appleGet<{ data?: AppleResource[] }>(
        "/me/history/heavy-rotation?limit=20",
        devToken,
        musicUserToken,
      ),
      appleGet<{ data?: AppleResource[] }>(
        "/me/recent/played/tracks?limit=50",
        devToken,
        musicUserToken,
      ),
    ]);

    // If BOTH Apple calls failed, we're either talking to a rate-limited
    // / down Apple Music API or the Music User Token is stale/revoked.
    // Reporting 200 with empty data would let the client persist a blank
    // taste profile over the user's real data. Surface the error so the
    // client can distinguish transient failures from "empty library".
    if (rotation === null && recent === null) {
      console.warn("[apple-taste] both Apple fetches failed — returning 503");
      return new Response(
        JSON.stringify({ error: "Apple Music temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recentItems: AppleResource[] = recent?.data || [];
    const rotationItems: AppleResource[] = rotation?.data || [];

    const { topArtists, artistImages, artistIds } = rankAppleArtists(
      recentItems,
      rotationItems,
    );

    const uniqueTracks = buildUniqueAppleTracks(recentItems);
    const topTrackStrings = uniqueTracks.map((t) => `${t.title} — ${t.artist}`);

    return new Response(
      JSON.stringify({
        topArtists,
        topTracks: topTrackStrings,
        artistImages,
        artistIds,
        trackImages: uniqueTracks,
        displayName: null, // Apple exposes no user display name
        country: storefront.toUpperCase(),
        partial: true, // softer signal than Spotify's explicit top-artists endpoint
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Log full error server-side but return a generic message. Internal
    // errors (missing env vars, signing failures, etc.) must not leak to
    // unauthenticated clients.
    console.error("apple-taste error:", e);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
