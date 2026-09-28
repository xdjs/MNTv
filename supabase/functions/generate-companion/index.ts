import { hasFactEvidence } from "../_shared/hasFactEvidence.ts";
import { verifyFactSources } from "../_shared/verifyFactSources.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type CompanionFact = { headline?: string; text?: string; sourceUrl?: string; citation?: unknown; [key: string]: unknown };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Companion page is now a thin cache reader.
// All content (nuggets, artistSummary, externalLinks, images) is generated
// by generate-nuggets and stored in nugget_cache. This function just reads it
// and formats the response for the companion page.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, title, album, tier = "casual", listenCount = 1, prebuiltNuggets = null, coverArtUrl = null, artistImage = null, artistSummary: rawArtistSummary = null } = await req.json();
    // Sanitize client-provided artistSummary (length cap, strip newlines, remove injection markers)
    const passedArtistSummary = typeof rawArtistSummary === "string"
      ? rawArtistSummary
          .slice(0, 500)
          .replace(/[\r\n]/g, " ")
          .replace(/```|<\/?[a-z][^>]*>|(\bsystem\b|\bignore\b|\binstruction\b|\bprompt\b).*?:/gi, "")
          .trim()
      : null;

    if (!artist || !title) {
      return new Response(JSON.stringify({ error: "artist and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // Prefer the new publishable/secret key system; fall back to legacy
    // service_role during migration.
    const supabaseKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const safeTier = ["casual", "curious", "nerd"].includes(tier) ? tier : "casual";

    // If prebuiltNuggets provided (from Listen.tsx), write them to companion_cache
    // and return immediately. This is the "pre-gen" path.
    if (Array.isArray(prebuiltNuggets) && prebuiltNuggets.length > 0) {
      // Public QR reads remain anonymous; paid verification requires a real
      // Supabase user session (including the Apple/guest anonymous user).
      const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!token) return new Response(JSON.stringify({ error: "A session is required to submit companion facts." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const { data: quotaAllowed, error: quotaError } = await supabase.rpc("consume_companion_verification_quota", { caller_id: authData.user.id });
      if (quotaError || quotaAllowed !== true) return new Response(JSON.stringify({ error: quotaError ? "Verification is temporarily unavailable." : "Verification limit reached. Try again later." }), {
        status: quotaError ? 503 : 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
      const listenTier = Math.min(Math.max(listenCount, 1), 3);

      // Read nugget_cache for artistSummary and externalLinks
      const dbCacheKey = `${artist}::${title}::${safeTier}`;
      // Try exact match first, then without tier suffix
      let nuggetCacheData: any = null;
      for (const key of [`${dbCacheKey}::1`, dbCacheKey]) {
        const { data } = await supabase
          .from("nugget_cache")
          .select("nuggets, sources")
          .eq("track_id", key)
          .maybeSingle();
        if (data) { nuggetCacheData = data; break; }
      }

      // Prefer artistSummary passed directly from the client (avoids cache key mismatch),
      // fall back to nugget_cache lookup
      const artistSummary = passedArtistSummary || nuggetCacheData?.sources?.artistSummary || "";
      const externalLinks = nuggetCacheData?.sources?.externalLinks || [];

      // Accumulate nuggets from previous listen tiers
      // Client-supplied claims must be checked on the server before sharing.
      const checked = await verifyFactSources(prebuiltNuggets.filter((n: CompanionFact) => n && typeof n.text === "string" && n.text.length <= 2000).slice(-9).map((n: CompanionFact) => ({ ...n, source: { url: n.sourceUrl } })), {
        googleKey: Deno.env.get("GOOGLE_AI_API_KEY"), exaKey: Deno.env.get("EXA_API_KEY"), maxDocumentCharacters: 4000,
      });
      if (!checked.length) {
        return new Response(JSON.stringify({ error: "No supported facts could be verified; existing companion content was preserved." }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let cacheTier = listenTier;
      const allNuggets = checked.map(n => ({ ...n, sourceName: n.source.publisher, citation: n.source.citation }));
      {
        // Preserve supported content even when only part of a submission revalidates.
        for (let t = 1; t <= 3; t++) {
          const prevKey = `${artist}::${title}::${safeTier}::${t}`;
          const { data: prevCached } = await supabase
            .from("companion_cache")
            .select("content")
            .eq("track_key", prevKey)
            .eq("listen_count_tier", t)
            .maybeSingle();
          if (prevCached?.content?.nuggets) {
            cacheTier = Math.max(cacheTier, t);
            const existingIds = new Set(allNuggets.map((n: any) => n.id));
            for (const n of prevCached.content.nuggets) {
              if (!existingIds.has(n.id) && hasFactEvidence(n, { url: n.sourceUrl, citation: n.citation })) { allNuggets.push(n); existingIds.add(n.id); }
            }
          }
        }
      }

      const response = {
        artistSummary: "",
        nuggets: allNuggets,
        externalLinks,
        coverArtUrl: coverArtUrl || undefined,
        artistImage: artistImage || undefined,
      };

      const cacheKey = `${artist}::${title}::${safeTier}::${cacheTier}`;
      // Keep other tiers intact; an interrupted write must not erase the cache.
      await supabase.from("companion_cache").upsert(
        { track_key: cacheKey, listen_count_tier: cacheTier, content: response },
        { onConflict: "track_key,listen_count_tier" }
      );

      console.log(`[Companion] Wrote ${allNuggets.length} nuggets to cache: ${cacheKey}`);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No prebuilt nuggets — companion page requesting directly (QR scan).
    // Look for cached companion data first.
    const baseCacheKey = `${artist}::${title}::${safeTier}`;
    const { data: cached } = await supabase
      .from("companion_cache")
      .select("content, listen_count_tier")
      .in("track_key", [
        `${baseCacheKey}::1`, `${baseCacheKey}::2`, `${baseCacheKey}::3`,
      ])
      .order("listen_count_tier", { ascending: false })
      .limit(1)
      .maybeSingle();

    const supportedCached = (cached?.content?.nuggets ?? []).filter((n: CompanionFact) => hasFactEvidence(n, { url: n.sourceUrl, citation: n.citation }));
    if (cached?.content && supportedCached.length) {
      console.log(`[Companion] Cache hit: ${baseCacheKey}::${cached.listen_count_tier}`);
      return new Response(JSON.stringify({ ...cached.content, artistSummary: "", nuggets: supportedCached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No companion cache — try reading from nugget_cache directly
    const dbCacheKey = `${artist}::${title}::${safeTier}`;
    // Old short links contain artist/title but no provider URI. Match the
    // canonical recording-key layout with escaped literal artist/title fields.
    const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
    const { data: canonicalRows } = await supabase
      .from("nugget_cache")
      .select("nuggets, sources, status")
      .like("track_id", `real::${escapeLike(artist)}::${escapeLike(title)}::::%::${safeTier}`)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(20);
    let nuggetData = (canonicalRows ?? []).find(row => Array.isArray(row.nuggets) && row.nuggets.some((n: any) => hasFactEvidence(n, row.sources?.[n.sourceId] ?? n.source)));
    if (!nuggetData) {
      const { data: legacyData } = await supabase
        .from("nugget_cache")
        .select("nuggets, sources, status")
        .eq("track_id", dbCacheKey)
        .maybeSingle();
      nuggetData = legacyData ?? undefined;
    }

    if (nuggetData?.status === "ready" && nuggetData.nuggets?.length) {
      const artistSummary = nuggetData.sources?.artistSummary || "";
      const externalLinks = nuggetData.sources?.externalLinks || [];

      // Transform nuggets from Listen format to companion format
      const kindToCategory: Record<string, string> = {
        artist: "history", track: "track", discovery: "explore",
      };
      const now = Date.now();
      const companionNuggets = (nuggetData.nuggets as any[]).filter(n => hasFactEvidence(n, nuggetData.sources?.[n.sourceId] ?? n.source)).map((n: any, i: number) => ({
        id: n.id || `nugget-${i}`,
        timestamp: now - i * 60000,
        headline: n.headline || "",
        text: n.text || "",
        category: kindToCategory[n.kind] || "track",
        listenUnlockLevel: 1,
        sourceName: (nuggetData.sources?.[n.sourceId] ?? n.source)?.publisher || "",
        sourceUrl: (nuggetData.sources?.[n.sourceId] ?? n.source)?.url || "",
        citation: (nuggetData.sources?.[n.sourceId] ?? n.source)?.citation,
        imageUrl: n.imageUrl,
        imageCaption: n.imageCaption,
      }));

      const response = {
        artistSummary: "",
        nuggets: companionNuggets,
        externalLinks,
      };

      console.log(`[Companion] Built from nugget_cache: ${dbCacheKey}`);
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nothing cached at all — return empty state
    console.log(`[Companion] No cache found for ${baseCacheKey}`);
    return new Response(JSON.stringify({
      artistSummary: "",
      nuggets: [],
      externalLinks: [
        { label: `${artist} — Wikipedia`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(artist).replace(/%20/g, "_")}` },
      ],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-companion error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
