import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── Auth helper ───────────────────────────────────────────────────────
async function requireAuth(req: Request, corsHeaders: Record<string, string>): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { userId: data.claims.sub as string };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
const CACHE_TTL_HOURS = 24;

async function lastfmGet(method: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Last.fm API error: ${res.status}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabase.auth.getClaims(token);
    // Allow service-role calls from generate-companion (no user claims) but reject invalid tokens
    if (error || (!data?.claims && !token.startsWith("eyJ"))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { username } = await req.json();
    if (!username || typeof username !== "string") {
      return new Response(
        JSON.stringify({ error: "username is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LASTFM_API_KEY = Deno.env.get("LASTFM_API_KEY");
    if (!LASTFM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LASTFM_API_KEY not configured", cached: false }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache
    const { data: cached } = await supabase
      .from("lastfm_cache")
      .select("*")
      .eq("username", username.toLowerCase())
      .maybeSingle();

    if (cached) {
      const fetchedAt = new Date(cached.fetched_at).getTime();
      const ageHours = (Date.now() - fetchedAt) / (1000 * 60 * 60);
      if (ageHours < CACHE_TTL_HOURS) {
        console.log(`Last.fm cache hit for ${username} (${ageHours.toFixed(1)}h old)`);
        return new Response(
          JSON.stringify({
            username,
            topArtists: cached.top_artists,
            recentTracks: cached.recent_tracks,
            userInfo: cached.user_info,
            cached: true,
            fetchedAt: cached.fetched_at,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`Last.fm cache stale for ${username} (${ageHours.toFixed(1)}h old), refreshing...`);
    }

    // Fetch from Last.fm API
    const [topArtistsData, recentTracksData, userInfoData] = await Promise.all([
      lastfmGet("user.getTopArtists", { user: username, period: "1month", limit: "10" }, LASTFM_API_KEY).catch(() => null),
      lastfmGet("user.getRecentTracks", { user: username, limit: "5" }, LASTFM_API_KEY).catch(() => null),
      lastfmGet("user.getInfo", { user: username }, LASTFM_API_KEY).catch(() => null),
    ]);

    // Normalise top artists
    const topArtists = (topArtistsData?.topartists?.artist || []).map((a: any) => ({
      name: a.name,
      playcount: parseInt(a.playcount, 10) || 0,
    }));

    // Normalise recent tracks (skip "now playing" marker)
    const recentTracks = (recentTracksData?.recenttracks?.track || [])
      .filter((t: any) => !t["@attr"]?.nowplaying)
      .slice(0, 5)
      .map((t: any) => ({
        artist: t.artist?.["#text"] || t.artist?.name || "",
        name: t.name,
        album: t.album?.["#text"] || "",
      }));

    // Normalise user info
    const userInfo = userInfoData?.user
      ? {
          realname: userInfoData.user.realname || "",
          playcount: parseInt(userInfoData.user.playcount, 10) || 0,
          registered: userInfoData.user.registered?.["#text"] || "",
          country: userInfoData.user.country || "",
        }
      : {};

    // Upsert cache
    await supabase.from("lastfm_cache").upsert(
      {
        username: username.toLowerCase(),
        top_artists: topArtists,
        recent_tracks: recentTracks,
        user_info: userInfo,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "username" }
    );

    return new Response(
      JSON.stringify({
        username,
        topArtists,
        recentTracks,
        userInfo,
        cached: false,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("lastfm-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
