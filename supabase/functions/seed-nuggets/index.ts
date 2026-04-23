import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// All demo tracks
const DEMO_TRACKS = [
  { id: "daft-punk-around-the-world", title: "Around the World", artist: "Daft Punk", album: "Homework", durationSec: 210 },
  { id: "daft-punk-one-more-time", title: "One More Time", artist: "Daft Punk", album: "Discovery", durationSec: 320 },
  { id: "daft-punk-get-lucky", title: "Get Lucky", artist: "Daft Punk", album: "Random Access Memories", durationSec: 369 },
  { id: "radiohead-everything", title: "Everything in Its Right Place", artist: "Radiohead", album: "Kid A", durationSec: 252 },
  { id: "radiohead-paranoid-android", title: "Paranoid Android", artist: "Radiohead", album: "OK Computer", durationSec: 386 },
  { id: "radiohead-reckoner", title: "Reckoner", artist: "Radiohead", album: "In Rainbows", durationSec: 290 },
  { id: "pink-floyd-money", title: "Money", artist: "Pink Floyd", album: "The Dark Side of the Moon", durationSec: 383 },
  { id: "pink-floyd-shine-on", title: "Shine On You Crazy Diamond", artist: "Pink Floyd", album: "Wish You Were Here", durationSec: 516 },
  { id: "pink-floyd-comfortably-numb", title: "Comfortably Numb", artist: "Pink Floyd", album: "The Wall", durationSec: 382 },
  { id: "bjork-army-of-me", title: "Army of Me", artist: "Björk", album: "Post", durationSec: 224 },
  { id: "bjork-joga", title: "Jóga", artist: "Björk", album: "Homogenic", durationSec: 305 },
  { id: "talking-heads-once", title: "Once in a Lifetime", artist: "Talking Heads", album: "Remain in Light", durationSec: 264 },
  { id: "kraftwerk-autobahn", title: "Autobahn", artist: "Kraftwerk", album: "Autobahn", durationSec: 270 },
  { id: "kraftwerk-tee", title: "Trans-Europe Express", artist: "Kraftwerk", album: "Trans-Europe Express", durationSec: 407 },
  { id: "aphex-twin-xtal", title: "Xtal", artist: "Aphex Twin", album: "Selected Ambient Works 85–92", durationSec: 290 },
  { id: "david-bowie-heroes", title: '"Heroes"', artist: "David Bowie", album: '"Heroes"', durationSec: 370 },
  { id: "david-bowie-ziggy", title: "Ziggy Stardust", artist: "David Bowie", album: "The Rise and Fall of Ziggy Stardust", durationSec: 194 },
  { id: "portishead-wandering", title: "Wandering Star", artist: "Portishead", album: "Dummy", durationSec: 292 },
  { id: "steely-dan-aja", title: "Aja", artist: "Steely Dan", album: "Aja", durationSec: 476 },
  { id: "sakamoto-mcml", title: "Merry Christmas Mr. Lawrence", artist: "Ryuichi Sakamoto", album: "Merry Christmas Mr. Lawrence", durationSec: 285 },
  { id: "sakamoto-andata", title: "andata", artist: "Ryuichi Sakamoto", album: "async", durationSec: 340 },
  { id: "moe-shop-love-taste", title: "Love Taste", artist: "Moe Shop", album: "Moe Moe", durationSec: 176 },
  { id: "moe-shop-baby-pink", title: "Baby Pink", artist: "Moe Shop", album: "Moe Moe", durationSec: 198 },
  { id: "pete-rango-off-the-leash", title: "OFF THE LEASH", artist: "LIL LIL & Pete Rango", album: "LIL LIL", durationSec: 182 },
  { id: "jamee-cornelia-husky", title: "Husky", artist: "Jamee Cornelia", album: "BIG HOMIE", durationSec: 195 },
  { id: "jamee-cornelia-routine", title: "Routine", artist: "Jamee Cornelia", album: "Art School Dropout", durationSec: 210 },
];

const MB_USER_AGENT = "MusicNerd/1.0 (musicnerd-app)";

// ── Image resolution (inlined from nugget-image) ────────────────────

async function fetchWithRetry(url: string, options?: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      clearTimeout(timeout);
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

async function resolveArtistImage(query: string, width = 500): Promise<string | null> {
  try {
    // MusicBrainz search
    const mbRes = await fetchWithRetry(
      `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(query)}&fmt=json&limit=1`,
      { headers: { "User-Agent": MB_USER_AGENT } }
    );
    if (!mbRes.ok) return null;
    const mbData = await mbRes.json();
    const mbid = mbData.artists?.[0]?.id;
    if (!mbid) return null;

    await new Promise((r) => setTimeout(r, 1100)); // Rate limit

    // Get Wikidata ID
    const relRes = await fetchWithRetry(
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`,
      { headers: { "User-Agent": MB_USER_AGENT } }
    );
    if (!relRes.ok) return null;
    const relData = await relRes.json();
    let wikidataId: string | null = null;
    for (const rel of relData.relations || []) {
      if (rel.type === "wikidata" && rel.url?.resource) {
        const match = rel.url.resource.match(/\/wiki\/(Q\d+)/);
        if (match) { wikidataId = match[1]; break; }
      }
    }
    if (!wikidataId) return null;

    // Get image from Wikidata
    const wdRes = await fetchWithRetry(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`);
    if (!wdRes.ok) return null;
    const wdData = await wdRes.json();
    const filename = wdData.entities?.[wikidataId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;

    // Get Commons thumb URL
    const normalized = filename.replace(/ /g, "_");
    const commonsRes = await fetchWithRetry(
      `https://en.wikipedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(normalized)}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`,
      { headers: { "User-Agent": MB_USER_AGENT } }
    );
    if (!commonsRes.ok) return null;
    const commonsData = await commonsRes.json();
    const pages = commonsData.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as any;
    return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null;
  } catch (e) {
    console.warn("resolveArtistImage failed:", e);
    return null;
  }
}

async function resolveAlbumImage(query: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(
      `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=1`,
      { headers: { "User-Agent": MB_USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const mbid = data["release-groups"]?.[0]?.id;
    if (!mbid) return null;
    const caaRes = await fetch(`https://coverartarchive.org/release-group/${mbid}/front-500`, { redirect: "follow" });
    if (caaRes.ok) return caaRes.url;
    return null;
  } catch { return null; }
}

async function resolveWikiImage(query: string, width = 500): Promise<string | null> {
  try {
    const res = await fetchWithRetry(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`,
      { headers: { "User-Agent": MB_USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages) as any[]) {
      const thumbUrl = page?.imageinfo?.[0]?.thumburl;
      if (thumbUrl) return thumbUrl;
    }
    return null;
  } catch { return null; }
}

async function resolveImage(hint: { type: string; query: string }): Promise<string | null> {
  switch (hint.type) {
    case "artist": return resolveArtistImage(hint.query);
    case "album": return resolveAlbumImage(hint.query);
    case "wiki": return resolveWikiImage(hint.query);
    default: return null;
  }
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // seed-nuggets is an internal admin tool — require the secret/service key
  // as a Bearer token. Accept either the new secret key or the legacy
  // service_role key during migration.
  const authHeader = req.headers.get("Authorization");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const validTokens = [secretKey, serviceRoleKey].filter(Boolean).map((k) => `Bearer ${k}`);
  if (!authHeader || !validTokens.includes(authHeader)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const trackFilter: string[] | undefined = body.trackIds; // optional: seed specific tracks
    const skipExisting: boolean = body.skipExisting !== false; // default true

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ADMIN_KEY = secretKey ?? serviceRoleKey!;
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY);

    const tracksToSeed = trackFilter
      ? DEMO_TRACKS.filter((t) => trackFilter.includes(t.id))
      : DEMO_TRACKS;

    // Check which tracks already have cached nuggets
    let existingIds: Set<string> = new Set();
    if (skipExisting) {
      const { data: existing } = await supabase
        .from("nugget_cache")
        .select("track_id");
      if (existing) {
        existingIds = new Set(existing.map((r: any) => r.track_id));
      }
    }

    const results: { trackId: string; status: string; error?: string }[] = [];

    for (const track of tracksToSeed) {
      if (existingIds.has(track.id)) {
        console.log(`SKIP ${track.id} — already cached`);
        results.push({ trackId: track.id, status: "skipped" });
        continue;
      }

      console.log(`PROCESSING ${track.id}: "${track.title}" by ${track.artist}...`);

      try {
        // Step 1: Generate nuggets via Gemini
        // No Authorization header needed — generate-nuggets has
        // verify_jwt = false and doesn't read the caller's auth.
        // (The old Bearer header broke with the new sb_secret_* key
        // format, which isn't a JWT.)
        const generateRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-nuggets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artist: track.artist,
            title: track.title,
            album: track.album,
            listenCount: 1,
            previousNuggets: [],
          }),
        });

        if (!generateRes.ok) {
          const errText = await generateRes.text();
          throw new Error(`generate-nuggets failed: ${generateRes.status} ${errText}`);
        }

        const genData = await generateRes.json();
        const aiNuggets = genData.nuggets || [];
        
        if (aiNuggets.length === 0) {
          throw new Error("No nuggets generated");
        }

        console.log(`  Generated ${aiNuggets.length} nuggets, resolving images...`);

        // Step 2: Resolve images for each nugget
        const resolvedNuggets = [];
        const resolvedSources: Record<string, any> = {};

        for (let i = 0; i < aiNuggets.length; i++) {
          const n = aiNuggets[i];
          const sourceId = `cached-src-${track.id}-${i}`;
          const nuggetId = `cached-nug-${track.id}-${i}`;

          // Resolve image
          let imageUrl: string | null = null;
          if (n.imageHint) {
            try {
              imageUrl = await resolveImage(n.imageHint);
              console.log(imageUrl ? `  ✓ Image: ${n.imageHint.query}` : `  ✗ No image: ${n.imageHint.query}`);
            } catch {
              console.warn(`  ✗ Image error: ${n.imageHint.query}`);
            }
            // Rate limit for MusicBrainz
            if (n.imageHint.type === "artist") {
              await new Promise((r) => setTimeout(r, 1200));
            }
          }

          // Distribute timestamps
          const earlyStart = 10;
          const usableDuration = track.durationSec - 20;
          const spacing = usableDuration / aiNuggets.length;
          const timestampSec = Math.floor(earlyStart + spacing * i);

          const nugget: any = {
            id: nuggetId,
            trackId: track.id,
            timestampSec: Math.min(timestampSec, track.durationSec - 10),
            durationMs: 7000,
            headline: n.headline,
            text: n.text,
            kind: n.kind,
            listenFor: n.listenFor || false,
            sourceId,
            imageUrl: imageUrl || undefined,
            imageCaption: n.imageHint?.caption,
          };

          // Mark one as visual
          const visualSlotIndex = track.id.charCodeAt(0) % 3;
          if (i === visualSlotIndex && imageUrl) {
            nugget.visualOnly = true;
          }

          resolvedNuggets.push(nugget);
          resolvedSources[sourceId] = {
            id: sourceId,
            type: n.source?.type || "article",
            title: n.source?.title || `${track.title} by ${track.artist}`,
            publisher: n.source?.publisher || "Unknown",
            url: n.source?.url,
            embedId: n.source?.embedId,
            quoteSnippet: n.source?.quoteSnippet || "",
            locator: n.source?.locator,
          };
        }

        // Ensure at least one visual nugget
        if (!resolvedNuggets.some((n) => n.visualOnly)) {
          const withImage = resolvedNuggets.find((n) => n.imageUrl);
          if (withImage) withImage.visualOnly = true;
        }

        // Step 3: Store in cache
        const { error: upsertError } = await supabase
          .from("nugget_cache")
          .upsert({
            track_id: track.id,
            nuggets: resolvedNuggets,
            sources: resolvedSources,
          }, { onConflict: "track_id" });

        if (upsertError) throw new Error(`Cache upsert: ${upsertError.message}`);

        console.log(`✅ ${track.id} — ${resolvedNuggets.length} nuggets cached`);
        results.push({ trackId: track.id, status: "success" });

      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        console.error(`❌ ${track.id}: ${errMsg}`);
        results.push({ trackId: track.id, status: "error", error: errMsg });
      }

      // Delay between tracks
      await new Promise((r) => setTimeout(r, 3000));
    }

    return new Response(JSON.stringify({
      total: tracksToSeed.length,
      success: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "error").length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed-nuggets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
