import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── YouTube Data API search ──────────────────────────────────────────
interface YTVideo {
  videoId: string;
  title: string;
  channelTitle: string;
}

async function searchYouTube(query: string, apiKey: string): Promise<YTVideo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "5");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errText = await res.text();
    console.error("YouTube search failed:", res.status, errText);
    return [];
  }
  const data = await res.json();
  return (data.items || [])
    .map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
    }))
    .filter((v: YTVideo) => v.videoId);
}

// ── Fetch transcript via Innertube ───────────────────────────────────
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const playerRes = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" },
          },
        }),
      }
    );
    if (!playerRes.ok) return null;
    const playerData = await playerRes.json();

    const captionTracks =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks?.length) return null;

    const enTrack = captionTracks.find(
      (t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en")
    );
    const track = enTrack || captionTracks[0];
    if (!track.baseUrl) return null;

    const captionRes = await fetch(track.baseUrl);
    if (!captionRes.ok) return null;
    const xml = await captionRes.text();

    const textSegments = xml
      .match(/<text[^>]*>([\s\S]*?)<\/text>/g)
      ?.map((seg) =>
        seg
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
      );

    if (!textSegments?.length) return null;
    let transcript = textSegments.join(" ");
    if (transcript.length > 4000) transcript = transcript.slice(0, 4000) + "...";
    return transcript;
  } catch (e) {
    console.error(`Transcript fetch failed for ${videoId}:`, e);
    return null;
  }
}

// ── Spotify artist data (genres + related artists) ──────────────────
let spotifyTokenCache: string | null = null;
let spotifyTokenExpiry = 0;

async function getSpotifyAppToken(): Promise<string | null> {
  if (spotifyTokenCache && Date.now() < spotifyTokenExpiry) return spotifyTokenCache;
  const clientId = Deno.env.get("VITE_SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    spotifyTokenCache = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    return spotifyTokenCache;
  } catch { return null; }
}

interface SpotifyArtistInfo {
  genres: string[];
  relatedArtists: string[];
  topTrackNames: string[];
  albumNames: string[];
  followers: number;
}

async function fetchSpotifyArtistInfo(artistName: string, spotifyTrackId?: string): Promise<SpotifyArtistInfo | null> {
  try {
    const token = await getSpotifyAppToken();
    if (!token) return null;

    let artist: any = null;

    // When a track ID is available, resolve the artist from the track directly.
    // This prevents name collisions where two artists share the same name.
    if (spotifyTrackId) {
      const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${spotifyTrackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        const primaryArtistId = trackData?.artists?.[0]?.id;
        if (primaryArtistId) {
          const artistRes = await fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (artistRes.ok) {
            artist = await artistRes.json();
            console.log(`[Spotify] Resolved artist from track ID: ${artist.name} (${primaryArtistId})`);
          }
        }
      }
    }

    // Fallback: search by name if track-based resolution failed
    if (!artist) {
      const q = encodeURIComponent(artistName.trim());
      const searchRes = await fetch(`https://api.spotify.com/v1/search?type=artist&limit=1&q=${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      artist = searchData?.artists?.items?.[0];
    }
    if (!artist) return null;

    // Fetch top tracks + albums in parallel — these give Gemini genre clues
    const [topTracksRes, albumsRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&limit=20&market=US`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const topTracksData = topTracksRes.ok ? await topTracksRes.json() : null;
    const albumsData = albumsRes.ok ? await albumsRes.json() : null;

    const topTrackNames = (topTracksData?.tracks || []).slice(0, 10).map((t: any) => t.name);
    const albumNames = (albumsData?.items || []).slice(0, 10).map((a: any) => a.name);

    console.log(`[Spotify] ${artistName}: ${artist.genres.length} genres, ${topTrackNames.length} tracks, ${albumNames.length} albums, ${artist.followers?.total || 0} followers`);

    return {
      genres: artist.genres || [],
      relatedArtists: [],
      topTrackNames,
      albumNames,
      followers: artist.followers?.total || 0,
    };
  } catch (e) {
    console.error("[Spotify] Artist info fetch failed:", e);
    return null;
  }
}

// ── Last.fm similar artists ──────────────────────────────────────────
interface LastFmSimilarArtist {
  name: string;
  match: number; // 0-1 similarity score
}

async function fetchLastFmSimilarArtists(artistName: string): Promise<LastFmSimilarArtist[]> {
  const apiKey = Deno.env.get("LASTFM_API_KEY");
  if (!apiKey) {
    console.log("[Last.fm] No LASTFM_API_KEY configured, skipping");
    return [];
  }
  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.getSimilar");
    url.searchParams.set("artist", artistName);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "10");
    url.searchParams.set("autocorrect", "1");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.log(`[Last.fm] artist.getSimilar failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const artists = data?.similarartists?.artist || [];
    if (artists.length === 0) {
      console.log(`[Last.fm] No similar artists found for "${artistName}"`);
      return [];
    }
    const result = artists.map((a: any) => ({
      name: a.name as string,
      match: parseFloat(a.match) || 0,
    }));
    console.log(`[Last.fm] Found ${result.length} similar artists for "${artistName}": ${result.slice(0, 5).map((a: LastFmSimilarArtist) => a.name).join(", ")}`);
    return result;
  } catch (e) {
    console.error("[Last.fm] Error fetching similar artists:", e);
    return [];
  }
}

// Also fetch Last.fm genre tags for an artist
async function fetchLastFmArtistTags(artistName: string): Promise<string[]> {
  const apiKey = Deno.env.get("LASTFM_API_KEY");
  if (!apiKey) return [];
  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.getTopTags");
    url.searchParams.set("artist", artistName);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("autocorrect", "1");

    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.toptags?.tag || [])
      .slice(0, 5)
      .map((t: any) => t.name as string)
      .filter((t: string) => t.toLowerCase() !== "seen live");
  } catch {
    return [];
  }
}

// ── Exa /answer API ─────────────────────────────────────────────────
interface ExaCitation {
  citIndex: number;
  url: string;
  title: string;
  author: string | null;
  publishedDate: string | null;
  imageUrl: string | null;
  extraImageUrls?: string[];  // Additional images from Exa extras.imageLinks
}

interface ExaAnswer {
  label: string;
  answer: string;
  citations: ExaCitation[];
  costDollars: number;
}

interface ImageCandidate {
  label: string;        // "IMG-A1", "IMG-T2", "IMG-D1"
  group: "artist" | "track" | "discovery";
  mimeType: string;
  base64: string;
  sourceUrl: string;    // original URL for post-processing
  citIndex: number;
  citTitle: string;
}

// Extract image URLs from Exa citation text content
function extractImageUrl(text: string | undefined): string | null {
  if (!text) return null;
  // Match common image URL patterns in page content
  const imgPatterns = [
    /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi,
    /https?:\/\/upload\.wikimedia\.org\/[^\s"'<>]+/gi,
    /https?:\/\/i\.scdn\.co\/[^\s"'<>]+/gi,
  ];
  for (const pattern of imgPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      // Clean URLs: strip trailing markdown/punctuation artifacts and embedded markdown links
      const cleaned = matches.map(m => m.replace(/\]\(https?:\/\/.*$/, "").replace(/[)\]}>'"\\]+$/, ""));
      // Prefer larger images, skip thumbnails, icons, and placeholder images
      const good = cleaned.find(m =>
        !m.includes("icon") && !m.includes("logo") && !m.includes("favicon") &&
        !m.includes("1x1") && !m.includes("pixel") && !m.includes("no-image") &&
        !m.includes("no_image") && !m.includes("placeholder") && !m.includes("default") &&
        !m.includes("blank") && !m.includes("spacer") && !m.includes("dummy") &&
        !m.includes("revslider") && !m.includes("/plugins/") && m.length < 500
      );
      if (good) return good;
    }
  }
  return null;
}

// Search Exa with /search + contents instead of /answer for better entity control.
// Uses includeText to ensure pages actually mention the artist name.
async function searchExaPages(
  query: string,
  label: string,
  apiKey: string,
  citIndexStart: number,
  includeText?: string[],
  excludeText?: string[],
  options?: { numResults?: number; searchType?: string },
): Promise<ExaAnswer> {
  const body: any = {
    query,
    type: options?.searchType || "auto",
    numResults: options?.numResults || 5,
    livecrawl: "fallback",
    contents: {
      text: { maxCharacters: 6000 },
      highlights: { numSentences: 3, highlightsPerUrl: 3 },
      extras: { imageLinks: 3 },
    },
    excludeDomains: ["facebook.com", "instagram.com"],
  };
  if (includeText?.length) body.includeText = includeText;
  if (excludeText?.length) body.excludeText = excludeText;

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[Exa] /search failed for ${label}:`, res.status, await res.text());
    return { label, answer: "", citations: [], costDollars: 0 };
  }

  const data = await res.json();
  const results = data.results || [];

  // Build citations from search results — prefer Exa's native r.image over regex extraction
  const citations: ExaCitation[] = results.map(
    (r: any, i: number) => {
      // Exa extras.imageLinks: additional images per result (field location may vary)
      const extraImages: string[] = [];
      const rawExtras = r.extras?.imageLinks || r.extrasImageLinks;
      if (Array.isArray(rawExtras)) {
        for (const img of rawExtras) {
          const imgUrl = typeof img === "string" ? img : img?.url;
          if (imgUrl && typeof imgUrl === "string") extraImages.push(imgUrl);
        }
      }
      return {
        citIndex: citIndexStart + i,
        url: r.url || "",
        title: r.title || "",
        author: r.author || null,
        publishedDate: r.publishedDate || null,
        imageUrl: r.image || extractImageUrl(r.text) || null,
        extraImageUrls: extraImages.length > 0 ? extraImages : undefined,
      };
    }
  );

  // Build answer from page text snippets + highlights
  const snippets = results
    .filter((r: any) => r.text || r.highlights?.length)
    .map((r: any, i: number) => {
      // Truncate each page to keep prompt reasonable
      const text = (r.text || "").slice(0, 5000);
      // Highlights are key excerpts Exa identified as most relevant to the query
      const highlights = (r.highlights || []) as string[];
      const highlightBlock = highlights.length > 0
        ? `\n[Key excerpts]:\n${highlights.map((h: string) => `• ${h}`).join("\n")}`
        : "";
      return `[Source: "${r.title}" — ${r.url}]${highlightBlock}\n${text}`;
    })
    .join("\n\n---\n\n");

  const nativeImgCount = results.filter((r: any) => r.image).length;
  const citImgCount = citations.filter(c => c.imageUrl).length;
  const extraImgCount = citations.reduce((sum, c) => sum + (c.extraImageUrls?.length || 0), 0);
  if (citImgCount > 0 || extraImgCount > 0) {
    console.log(`[Exa] ${label}: ${nativeImgCount} native (r.image) + ${citImgCount - nativeImgCount} regex images + ${extraImgCount} extras from ${results.length} results`);
  }
  console.log(`[Exa] ${label}: ${results.length} results${includeText ? ` (includeText: ${includeText.join(", ")})` : ""}`);

  return {
    label,
    answer: snippets,
    citations,
    costDollars: data.costDollars?.total || 0,
  };
}

class RecitationError extends Error {
  constructor() { super("RECITATION"); this.name = "RecitationError"; }
}

// ── Wikipedia / Wikimedia Commons image search ──────────────────────
// Check if a Wikipedia page title is relevant to the search query
function isRelevantWikiResult(pageTitle: string, query: string): boolean {
  const titleLower = pageTitle.toLowerCase();
  const queryLower = query.toLowerCase();

  // First try: entire cleaned query as substring (e.g., "pete rango" in title)
  const cleanQuery = queryLower
    .replace(/\b(musician|artist|band|song|album|music|producer|track)\b/g, "")
    .trim();
  if (cleanQuery && titleLower.includes(cleanQuery)) return true;

  // Fallback: ALL significant words must appear (fixes "Pete Townshend" matching "Pete Rango musician")
  const stopWords = new Set(["the", "a", "an", "of", "by", "in", "at", "for",
    "and", "or", "to", "musician", "artist", "band", "song", "album", "music",
    "producer", "track"]);
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  return queryWords.length > 0 && queryWords.every(word => titleLower.includes(word));
}

// Reject known bad image patterns from Wikipedia/Commons
function isGarbageImage(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes(".pdf") ||
    lower.includes(".djvu") ||
    lower.includes(".svg") ||
    lower.includes("flag_of_") ||
    lower.includes("coat_of_arms") ||
    lower.includes("coat_of_") ||
    lower.includes("map_of_") ||
    lower.includes("us_navy") ||
    lower.includes("no-image") ||
    lower.includes("no_image") ||
    lower.includes("placeholder") ||
    lower.includes("icon") ||
    lower.includes("logo") ||
    lower.includes("symbol") ||
    lower.includes("question_mark") ||
    lower.includes("blank") ||
    lower.includes("dummy") ||
    lower.includes("spacer") ||
    lower.includes("1x1") ||
    lower.includes("revslider") ||
    lower.includes("/plugins/") ||
    lower.includes("2a96cbd8b46e442fc41c2b86b821562f") || // Last.fm default placeholder
    lower.includes("mdpi.com/files") ||
    lower.includes("ams.org/images") ||
    lower.includes("govinfo.gov") ||
    lower.includes("big_cover-") ||
    lower.includes("monument")
  );
}

// ── Validate that a URL points to an actual image (not a page URL) ────
function isActualImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  // Check for image file extensions
  if (/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(lower)) return true;
  // Check for known image CDN hostnames (always serve images regardless of extension)
  const imageCDNs = [
    "upload.wikimedia.org",
    "i.scdn.co",
    "mosaic.scdn.co",
    "i.imgur.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
    "images.genius.com",
    "static.wikia.nocookie.net",
    "lastfm.freetls.fastly.net",
    "cdns-images.dzcdn.net",
    "e-cdns-images.dzcdn.net",
    "img.discogs.com",
    "media.pitchfork.com",
    "f4.bcbits.com",
    "pbs.twimg.com",
  ];
  try {
    const hostname = new URL(url).hostname;
    return imageCDNs.some(cdn => hostname === cdn || hostname.endsWith(`.${cdn}`));
  } catch {
    return false;
  }
}

// ── Word-boundary matching helper ─────────────────────────────────────
// Uses regex \b to prevent "pete" matching inside "peter" or "cornelia" matching "Cornelia Murr"
function wordBoundaryMatch(haystack: string, needle: string): boolean {
  try {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
  } catch {
    return haystack.includes(needle);
  }
}

// ── Filter Exa citations by relevance ─────────────────────────────────
// Two-level filtering:
//   "strict" = artist name must appear (for images + external links — avoids wrong-person contamination)
//   "loose"  = artist OR title may appear (for prompt context — wider but still filtered)
function citationMentionsArtistStrict(c: ExaCitation, artistLower: string): boolean {
  const hay = `${c.title} ${c.url} ${c.author || ""}`.toLowerCase();
  // Strict: require the FULL artist name as a unit — "pete rango" must appear, not just "pete" + "rango" separately
  // This prevents "Pete Rock", "Pete Atkin", "Cornelia Murr" from matching
  if (wordBoundaryMatch(hay, artistLower)) return true;
  // Also check URL slug variants: "peterango" (concatenated), "pete-rango" (hyphenated)
  const slug = artistLower.replace(/\s+/g, "");
  const hyphenated = artistLower.replace(/\s+/g, "-");
  return hay.includes(slug) || hay.includes(hyphenated);
}

function citationMentionsArtistLoose(c: ExaCitation, artistLower: string, titleLower: string, artistWords: string[]): boolean {
  const hay = `${c.title} ${c.url} ${c.author || ""}`.toLowerCase();
  // Full name match
  if (wordBoundaryMatch(hay, artistLower)) return true;
  // Title match
  if (wordBoundaryMatch(hay, titleLower)) return true;
  // Individual word fallback (only for loose mode)
  return artistWords.length >= 2 && artistWords.every(w => wordBoundaryMatch(hay, w));
}

function filterRelevantCitations(
  citations: ExaCitation[], artist: string, title: string,
  mode: "strict" | "loose" = "loose"
): ExaCitation[] {
  const artistLower = artist.toLowerCase();
  const titleLower = title.toLowerCase();
  const artistWords = artistLower.split(/\s+/).filter(w => w.length > 2);

  if (mode === "strict") {
    // STRICT: require FULL artist name — no individual word fallback
    // This prevents "Pete Rock" (matches "pete" but not "pete rango"),
    // "Cornelia Murr" (matches "cornelia" but not "jamee cornelia"), etc.
    const artistOnly = citations.filter(c => citationMentionsArtistStrict(c, artistLower));
    return artistOnly.length > 0 ? artistOnly : [];
  }

  // Loose mode: artist OR title match (used for prompt context to Gemini)
  const relevant = citations.filter(c =>
    citationMentionsArtistLoose(c, artistLower, titleLower, artistWords)
  );

  // If filtering removes everything, return originals (some context is better than none)
  return relevant.length > 0 ? relevant : citations;
}

// ── Fetch image as base64 for multimodal Gemini input ────────────────
async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const mimeType = validTypes.find(t => contentType.includes(t));
    if (!mimeType) return null;

    const buf = await res.arrayBuffer();
    // Skip tiny images (<5KB, likely icons) and huge ones (>500KB)
    if (buf.byteLength < 5000 || buf.byteLength > 500_000) return null;

    const bytes = new Uint8Array(buf);
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    }
    const base64 = btoa(chunks.join(""));
    return { mimeType, base64 };
  } catch {
    return null;
  }
}

// ── Prepare image candidates from Exa citations ─────────────────────
async function prepareImageCandidates(
  citations: ExaCitation[],
  artist?: string,
  spotifyArtistImageUrl?: string,
): Promise<ImageCandidate[]> {
  const groups: { name: "artist" | "track" | "discovery"; prefix: string; start: number; end: number }[] = [
    { name: "artist", prefix: "A", start: 0, end: 10 },
    { name: "track", prefix: "T", start: 10, end: 20 },
    { name: "discovery", prefix: "D", start: 20, end: 30 },
  ];

  const tasks: { label: string; group: "artist" | "track" | "discovery"; cit: ExaCitation }[] = [];

  for (const g of groups) {
    const groupCits = citations.filter(c =>
      c.citIndex >= g.start && c.citIndex < g.end &&
      c.imageUrl && !isGarbageImage(c.imageUrl)
    );
    // Take max 3 per group from primary imageUrl
    let count = 0;
    for (let i = 0; i < Math.min(3, groupCits.length); i++) {
      tasks.push({
        label: `IMG-${g.prefix}${count + 1}`,
        group: g.name,
        cit: groupCits[i],
      });
      count++;
    }
    // Fill remaining slots from extraImageUrls (Exa extras.imageLinks)
    if (count < 3) {
      const allGroupCits = citations.filter(c => c.citIndex >= g.start && c.citIndex < g.end);
      for (const c of allGroupCits) {
        if (count >= 3) break;
        for (const extraUrl of (c.extraImageUrls || [])) {
          if (count >= 3) break;
          if (!isGarbageImage(extraUrl)) {
            tasks.push({
              label: `IMG-${g.prefix}${count + 1}`,
              group: g.name,
              cit: { ...c, imageUrl: extraUrl },
            });
            count++;
          }
        }
      }
    }
  }

  // Start Spotify image fetch in parallel with Exa images (not sequentially after)
  const spotifyImagePromise = spotifyArtistImageUrl
    ? fetchImageAsBase64(spotifyArtistImageUrl)
    : Promise.resolve(null);

  if (tasks.length === 0 && !spotifyArtistImageUrl) return [];

  const [exaResults, spotifyImgData] = await Promise.all([
    tasks.length > 0
      ? Promise.allSettled(
          tasks.map(async (t) => {
            const imgData = await fetchImageAsBase64(t.cit.imageUrl!);
            if (!imgData) return null;
            return {
              label: t.label,
              group: t.group,
              mimeType: imgData.mimeType,
              base64: imgData.base64,
              sourceUrl: t.cit.imageUrl!,
              citIndex: t.cit.citIndex,
              citTitle: t.cit.title,
            } as ImageCandidate;
          })
        )
      : Promise.resolve([] as PromiseSettledResult<ImageCandidate | null>[]),
    spotifyImagePromise,
  ]);

  const candidates = exaResults
    .filter((r): r is PromiseFulfilledResult<ImageCandidate | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((c): c is ImageCandidate => c !== null);

  // Inject Spotify artist image as IMG-A0 (guaranteed-relevant artist image)
  if (spotifyImgData) {
    candidates.unshift({
      label: "IMG-A0",
      group: "artist",
      mimeType: spotifyImgData.mimeType,
      base64: spotifyImgData.base64,
      sourceUrl: spotifyArtistImageUrl!,
      citIndex: -1,
      citTitle: `${artist || "Artist"} (Spotify artist photo)`,
    });
    console.log(`[ImagePrep] Injected Spotify artist image as IMG-A0`);
  }

  // Cross-group sharing: if a group has 0 candidates, borrow from groups with surplus.
  // This handles indie artists where track/discovery searches return no images but artist search is rich.
  const groupCounts = { artist: 0, track: 0, discovery: 0 };
  for (const c of candidates) groupCounts[c.group]++;
  const emptyGroups = (["artist", "track", "discovery"] as const).filter(g => groupCounts[g] === 0);
  if (emptyGroups.length > 0 && candidates.length > 0) {
    // Find donor images: candidates from groups with > 1 image (keep at least 1 for the donor group)
    const donors = candidates.filter(c => groupCounts[c.group] > 1);
    for (const emptyGroup of emptyGroups) {
      const donor = donors.shift();
      if (!donor) break;
      const prefix = emptyGroup === "artist" ? "A" : emptyGroup === "track" ? "T" : "D";
      candidates.push({
        ...donor,
        label: `IMG-${prefix}1`,
        group: emptyGroup,
      });
      groupCounts[donor.group]--;
      groupCounts[emptyGroup]++;
      console.log(`[ImagePrep] Cross-group: shared ${donor.label} (${donor.group}) → IMG-${prefix}1 (${emptyGroup})`);
    }
    // If no surplus donors, duplicate from any group that has images (artist photos work for all nuggets)
    for (const emptyGroup of emptyGroups) {
      if (groupCounts[emptyGroup] > 0) continue;
      const anyCandidate = candidates.find(c => c.group !== emptyGroup);
      if (anyCandidate) {
        const prefix = emptyGroup === "artist" ? "A" : emptyGroup === "track" ? "T" : "D";
        candidates.push({
          ...anyCandidate,
          label: `IMG-${prefix}1`,
          group: emptyGroup,
        });
        groupCounts[emptyGroup]++;
        console.log(`[ImagePrep] Cross-group (dup): copied ${anyCandidate.label} → IMG-${prefix}1 (${emptyGroup})`);
      }
    }
  }

  // Cap at 5 total candidates to limit multimodal payload size (base64 images inflate Gemini requests)
  // Keep IMG-A0 (Spotify) first, then best from each group
  if (candidates.length > 5) {
    const capped: ImageCandidate[] = [];
    const a0 = candidates.find(c => c.label === "IMG-A0");
    if (a0) capped.push(a0);
    for (const group of ["artist", "track", "discovery"] as const) {
      const groupItems = candidates.filter(c => c.group === group && !capped.includes(c));
      const perGroup = group === "artist" ? (a0 ? 1 : 2) : 2;
      capped.push(...groupItems.slice(0, perGroup));
    }
    // Fill remaining slots if we're under 5
    for (const c of candidates) {
      if (capped.length >= 5) break;
      if (!capped.includes(c)) capped.push(c);
    }
    candidates.length = 0;
    candidates.push(...capped.slice(0, 5));
    console.log(`[ImagePrep] Capped from ${tasks.length} to ${candidates.length} candidates to reduce payload`);
  }

  console.log(`[ImagePrep] Final ${candidates.length}/${tasks.length} candidate images (${candidates.filter(c => c.group === "artist").length}A/${candidates.filter(c => c.group === "track").length}T/${candidates.filter(c => c.group === "discovery").length}D)`);
  return candidates;
}

// ── Build multimodal parts for Gemini (text + inline images) ─────────
function buildMultimodalParts(
  prompt: string,
  imageCandidates?: ImageCandidate[],
): any[] {
  if (!imageCandidates || imageCandidates.length === 0) {
    return [{ text: prompt }];
  }

  const parts: any[] = [{ text: prompt }];
  parts.push({ text: "\n\n--- IMAGE CANDIDATES (visually inspect each) ---" });

  for (const img of imageCandidates) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    });
    parts.push({ text: `[${img.label}] from "${img.citTitle}" (CIT ${img.citIndex})` });
  }

  parts.push({ text: "--- END IMAGE CANDIDATES ---" });
  return parts;
}

// Primary: Wikipedia search → lead image of top result (with relevance check)
async function searchWikipediaImage(query: string): Promise<{ url: string; title: string } | null> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrlimit", "3"); // Get top 3 for better matching
    url.searchParams.set("prop", "pageimages");
    url.searchParams.set("piprop", "thumbnail");
    url.searchParams.set("pithumbsize", "500");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    // Check each result for relevance
    for (const page of Object.values(pages) as any[]) {
      const thumb = page?.thumbnail?.source;
      if (!thumb) continue;
      if (isGarbageImage(thumb)) continue;
      if (!isRelevantWikiResult(page.title || "", query)) continue;
      return { url: thumb, title: page.title || query };
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback: Wikimedia Commons direct file search (with relevance check)
async function searchCommonsImage(query: string): Promise<{ url: string; title: string } | null> {
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrlimit", "3");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "500");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    for (const page of Object.values(pages) as any[]) {
      const thumbUrl = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
      if (!thumbUrl) continue;
      if (isGarbageImage(thumbUrl)) continue;
      // Commons file titles often contain the subject
      if (!isRelevantWikiResult(page.title || "", query)) continue;
      return { url: thumbUrl, title: page.title || query };
    }
    return null;
  } catch {
    return null;
  }
}

// Resolve image for a single nugget's search query
async function resolveNuggetImage(query: string): Promise<{ url: string; title: string } | null> {
  const [wikiResult, commonsResult] = await Promise.allSettled([
    searchWikipediaImage(query),
    searchCommonsImage(query),
  ]);
  const wiki = wikiResult.status === "fulfilled" ? wikiResult.value : null;
  if (wiki) return wiki;
  const commons = commonsResult.status === "fulfilled" ? commonsResult.value : null;
  if (commons) return commons;
  return null;
}

// ── Tier configuration ──────────────────────────────────────────────
type Tier = "casual" | "curious" | "nerd";

const TIER_CONFIG: Record<Tier, {
  tone: string;
  assumedKnowledge: string;
  artistFocus: string;
  trackFocus: string;
  discoveryFocus: string;
  sourceExpectation: string;
  model: string;
  temperature: number;
}> = {
  casual: {
    tone: "Conversational, warm, jargon-free. Like a knowledgeable friend sharing something cool they just learned. Wikipedia-level facts are perfectly fine — the goal is to make someone feel more connected to the music.",
    assumedKnowledge: "Assume the listener knows who this artist is but not much else. Introductory context is welcome.",
    artistFocus: "Who this person is as a human — their origin story, a memorable personality moment, a relatable struggle or triumph, or a surprising personal detail. Make them feel like a real person, not a Wikipedia entry.",
    trackFocus: "The story behind how this song came to exist — who made a key decision, what almost went differently, what was happening in the room or in the artist's life. Prioritize origin stories and specific people over general philosophy. No technical jargon.",
    discoveryFocus: "One artist they could play right now and instantly enjoy. Name the SPECIFIC connection — a shared producer, label, sample source, or concrete musical element they share. 'If this track hits right, you'll love...' Avoid artists they likely already know well.",
    sourceExpectation: "Wikipedia, mainstream music press (Rolling Stone, NME, Billboard), YouTube interviews, music documentaries.",
    model: "gemini-2.5-flash",
    temperature: 1.0,
  },
  curious: {
    tone: "Engaging storytelling with genuine depth. Go one layer deeper than Wikipedia — find the production detail, the cultural moment, the artistic tension that makes this truly interesting.",
    assumedKnowledge: "Assume some music knowledge. Don't reintroduce the artist from scratch. The listener wants context and backstory, not a biography summary.",
    artistFocus: "A career turning point, creative evolution, or artistic philosophy that shaped who they became. What were the tensions, decisions, or collaborations that defined their sound? Name specific people and moments.",
    trackFocus: "The specific origin story of this track — who made it, where, and what almost went differently. Name key collaborators, the studio or setup, and the decision or accident that shaped the final version. Prioritize 'almost didn't happen' moments over general career context.",
    discoveryFocus: "An artist with a genuine musical thread connecting them. Name the SPECIFIC mechanism: a shared producer, a real collaboration, a confirmed sample source, a label connection, or a documented influence. Not just 'similar vibe' — give the listener the actual link.",
    sourceExpectation: "Pitchfork, Rolling Stone deeper features, AllMusic, quality podcast interviews (Zane Lowe, Broken Record, Song Exploder, Rolling Stone Music Now).",
    model: "gemini-2.5-flash",
    temperature: 0.9,
  },
  nerd: {
    tone: "Authoritative and technical. Assume full music terminology fluency. Skip the handholding — go straight to the specific, obscure, or analytical detail that this person couldn't find by casually googling.",
    assumedKnowledge: "Assume deep familiarity with the artist, their full catalog, and their genre/era. Skip biography entirely. Go to the technical, historical, or analytical layer that requires real knowledge to appreciate.",
    artistFocus: "Technical innovations and signature approaches: specific gear (name the exact make/model/year), recording chain, studio methodology, influence chains with named records, relationships with specific engineers and producers. What is their sonic fingerprint and exactly how do they achieve it?",
    trackFocus: "Production technique, harmonic or rhythmic analysis, specific studio and engineer details, specific take or edit decisions, what's happening in the mix that requires careful listening to notice. Be precise — name the exact gear, the exact technique, the specific moment in the track.",
    discoveryFocus: "An obscure but precisely connected record: a session musician they share, a sample source, a specific B-side or deep cut that influenced this track, a micro-genre ancestor, or an engineer whose fingerprint appears on both. The connection should be something only a real fan would know.",
    sourceExpectation: "Sound on Sound, Tape Op, Recording magazine, Discogs, MusicBrainz, academic music journals, specific Reddit communities (r/indieheads, r/LetsTalkMusic, r/audiophile), Resident Advisor (for electronic), gear wikis.",
    model: "gemini-2.5-pro",
    temperature: 0.8,
  },
};

// ── Thematic angle pools (tier + listen-count gated) ─────────────────
interface AngleDef {
  name: string;
  minListen: number;          // earliest listen count where this angle appears
  tiers: Set<Tier>;           // which tiers include this angle
}

const ANGLE_POOL: AngleDef[] = [
  // Available from first listen
  { name: "personal stories",           minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "cultural impact",            minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "live performances",          minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "collaborations",             minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "lyrical meaning",            minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "chart performance",          minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "music video creation",       minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "historical context",         minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  // Unlock at listen 2 for casual/curious, always available for nerd
  { name: "recording sessions",         minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "production techniques",      minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "instrument choices",         minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "critical reception",         minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "samples and influences",     minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "fan theories",               minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "session musicians",          minListen: 2, tiers: new Set(["nerd"]) },
  // Deep cuts — unlock at listen 3 for curious, always available for nerd
  { name: "harmonic and rhythmic analysis", minListen: 3, tiers: new Set(["nerd"]) },
  { name: "signal chain and gear",      minListen: 3, tiers: new Set(["nerd"]) },
  { name: "micro-genre lineage",        minListen: 3, tiers: new Set(["nerd"]) },
  { name: "mixing and mastering",       minListen: 3, tiers: new Set(["nerd"]) },
];

function pickAngles(tier: Tier, listenCount: number, count = 2): string[] {
  // Nerd tier gets everything unlocked regardless of listen count
  const eligible = ANGLE_POOL.filter((a) =>
    a.tiers.has(tier) && (tier === "nerd" || listenCount >= a.minListen)
  );
  // Shuffle and pick
  const shuffled = eligible.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((a) => a.name);
}

// ── Check if artist search results mention a specific track ──────────
function trackMentionedInResults(results: ExaAnswer, trackTitle: string): boolean {
  if (!results.answer) return false;
  const titleLower = trackTitle.toLowerCase();
  // Skip very short titles (3 chars or less) — too many false positives
  if (titleLower.length <= 3) return false;
  return wordBoundaryMatch(results.answer.toLowerCase(), titleLower);
}

// ── Exa question builder ─────────────────────────────────────────────
function buildExaQuestions(
  artist: string,
  title: string,
  album: string | undefined,
  tier: Tier,
  angles: string[],
): { artistQ: string; trackQ: string; discoveryQ: string } {
  const cfg = TIER_CONFIG[tier];
  const albumCtx = album ? ` from the album "${album}"` : "";
  const angleStr = angles.join(", ");

  return {
    artistQ: `"${artist}" music artist${albumCtx}: ${cfg.artistFocus} Focus on: ${angleStr}.`,
    trackQ: `"${title}" by "${artist}" music artist (NOT cover, NOT remix, NOT video game, specifically the song by "${artist}")${albumCtx}: ${cfg.trackFocus} Focus on: ${angleStr}.`,
    discoveryQ: `Musicians with similar sound to "${artist}"${albumCtx}: ${cfg.discoveryFocus}`,
  };
}

// Build a broader 2nd artist search query (different from the tier-specific first search)
function buildBroadArtistQuery(artist: string): string {
  return `"${artist}" music interview OR profile OR feature OR review`;
}

// ── Build citation-indexed context for Gemini prompt ─────────────────
function buildExaPromptContext(
  answers: ExaAnswer[],
  artist?: string,
  title?: string,
  album?: string,
  spotifyInfo?: SpotifyArtistInfo | null,
): {
  context: string;
  allCitations: ExaCitation[];
} {
  const allCitations: ExaCitation[] = [];
  const parts: string[] = [];

  const artistLower = (artist || "").toLowerCase();
  const artistWords = artistLower.split(/\s+/).filter(w => w.length > 2);

  // Build known discography for cross-validation (prevents wrong-artist contamination)
  const knownAlbums = (spotifyInfo?.albumNames || []).map(a => a.toLowerCase()).filter(a => a.length > 3);
  const knownTracks = (spotifyInfo?.topTrackNames || []).map(t => t.toLowerCase()).filter(t => t.length > 3);
  const albumLower = album?.toLowerCase();
  const titleLower = (title || "").toLowerCase();
  // Cross-check triggers with ANY known discography data, not just large catalogs
  const canValidateDiscography = knownAlbums.length > 0 || knownTracks.length > 0;

  for (const a of answers) {
    if (!a.answer) continue;
    const answerLower = a.answer.toLowerCase();

    // Check if the Exa answer actually mentions the artist — if not, the answer
    // is likely about an unrelated person with a similar name or song title.
    // Skip irrelevant answers to prevent Gemini from using wrong-person data.
    if (artist && artistWords.length > 0) {
      const mentionsArtist = wordBoundaryMatch(answerLower, artistLower) ||
        (artistWords.length >= 2 && artistWords.every(w => wordBoundaryMatch(answerLower, w)));
      if (!mentionsArtist) {
        console.log(`[Exa] Skipping ${a.label} answer — does not mention "${artist}"`);
        continue;
      }
    }

    // Discography cross-check: if we have the correct artist's discography from Spotify,
    // verify the answer discusses the same artist (not a different artist with the same name).
    // Checks album name, track title, AND known discography from Spotify.
    if (canValidateDiscography && a.label.startsWith("artist")) {
      const mentionsRequestedAlbum = albumLower && albumLower.length > 3 && answerLower.includes(albumLower);
      const mentionsRequestedTitle = titleLower && titleLower.length > 3 && answerLower.includes(titleLower);
      const mentionsKnownWork =
        knownAlbums.some(alb => answerLower.includes(alb)) ||
        knownTracks.some(trk => answerLower.includes(trk));
      if (!mentionsRequestedAlbum && !mentionsRequestedTitle && !mentionsKnownWork) {
        console.log(`[Exa] Skipping ${a.label} answer — mentions "${artist}" but none of their known albums/tracks (possible name collision)`);
        continue;
      }
    }
    allCitations.push(...a.citations);
    parts.push(
      `[${a.label.toUpperCase()} RESEARCH]\n${a.answer}`
    );
  }

  // Include image URLs in citation list so Gemini can select them
  const citList = allCitations.map((c) => {
    let line = `[CIT ${c.citIndex}] "${c.title}"${c.author ? ` by ${c.author}` : ""} — ${c.url}`;
    if (c.imageUrl) {
      line += `\n  [IMG CIT ${c.citIndex}] ${c.imageUrl}`;
    }
    return line;
  }).join("\n");

  const context = parts.join("\n\n---\n\n") +
    "\n\n---\nSOURCE CITATIONS:\n" + citList;

  return { context, allCitations };
}

// ── Extract previously recommended artist names from headlines ────────
function extractPreviousDiscoveryArtists(headlines: string[]): string[] {
  const artists: string[] = [];
  for (const h of headlines) {
    // Match patterns like "you need to hear [Artist]", "check out [Artist]", etc.
    const patterns = [
      /(?:check out|explore|listen to|hear|try|meet|discover|dive into)\s+(?:the\s+)?(?:work of\s+)?(?:the\s+)?([A-Z][\w\s'.&-]+?)(?:\s*[,.'!?;—–-]|\s+(?:is|has|was|who|whose|crafts|creates|offers|shares|brings|excels|operates|for|and|if|they|to|—))/gi,
      /(?:you(?:'ll)?\s+(?:love|enjoy|dig|need))\s+(?:what\s+)?(?:the\s+)?([A-Z][\w\s'.&-]+?)(?:\s*[,.'!?;—–-]|\s+(?:did|does|has|was|is|'s))/gi,
      // "...what [Artist] did on..." or "...what [Artist]'s..."
      /what\s+([A-Z][\w\s'.&-]+?)(?:\s+did|\s+does|'s)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(h)) !== null) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 50) {
          artists.push(name);
        }
      }
    }
  }
  return [...new Set(artists)];
}

// ── Research Curation Agent ────────────────────────────────────────────
// Agent 1: Extract verified facts from raw research. Handles disambiguation,
// cross-track contamination, origin accuracy. Produces a clean fact brief
// so the writer prompt can be short and focused on creative quality.
interface CuratedResearch {
  artistOrigin: string;
  artistBio: string;
  artistFacts: string[];
  trackFacts: string[];
  albumContext: string;
  keyCollaborators: string[];
  warningsForWriter: string[];
}

async function curateResearch(
  artist: string,
  title: string,
  album: string | undefined,
  exaContext: string,
  transcriptContext: string,
  apiKey: string,
  spotifyInfo?: SpotifyArtistInfo | null,
): Promise<CuratedResearch> {
  const fallback: CuratedResearch = {
    artistOrigin: "unknown",
    artistBio: "",
    artistFacts: [],
    trackFacts: [],
    albumContext: "",
    keyCollaborators: [],
    warningsForWriter: ["Curation unavailable — writer should rely on its own knowledge"],
  };

  // Build discography context for artist disambiguation
  const discographySection = spotifyInfo && (spotifyInfo.albumNames.length > 0 || spotifyInfo.topTrackNames.length > 0)
    ? `\nVERIFIED DISCOGRAPHY (from Spotify — use this to identify the CORRECT "${artist}"):
${spotifyInfo.genres.length > 0 ? `Genres: ${spotifyInfo.genres.join(", ")}` : ""}
${spotifyInfo.albumNames.length > 0 ? `Albums/Singles: ${spotifyInfo.albumNames.join(", ")}` : ""}
${spotifyInfo.topTrackNames.length > 0 ? `Top tracks: ${spotifyInfo.topTrackNames.join(", ")}` : ""}
If sources discuss an artist named "${artist}" but with a DIFFERENT discography (different albums, different genre, different era), those facts are about a DIFFERENT artist with the same name. Exclude them and add a warning to warningsForWriter.\n`
    : "";

  const prompt = `You are a research analyst. Extract ALL verifiable facts from the sources below about the music artist "${artist}" and their song "${title}"${album ? ` from the album "${album}"` : ""}.

YOUR GOAL: Be EXHAUSTIVE. Extract every specific detail — names, dates, ages, places, quotes, numbers, credits, anecdotes. The writer downstream has NO access to these sources, so anything you skip is LOST. More detail = better nuggets.

CRITICAL: Preserve STORY ARCS, not just isolated facts. If a source says "he got kicked out of college, moved to Fort Myers, and discovered hip-hop production there" — extract the whole chain, not three separate bullets. The writer needs cause-and-effect to tell compelling stories.
${discographySection}
RULES:
1. "${artist}" is the primary artist. If a source clearly discusses a DIFFERENT person or a DIFFERENT artist with the same name (different discography, different genre), exclude those facts. But if a name is a plausible variation (e.g., "Pete RG" could be "Pete Rango"), INCLUDE the facts and note the name variation in warningsForWriter.
2. If a source reviews a DIFFERENT track by ${artist}, extract general artist biography, career details, creative philosophy, and collaborator info — just NOT that other track's specific sonic descriptions or genre labels.
3. If a source discusses a different album/project by the same artist, extract career facts, creative approach, and collaborator info — just NOT that project's specific recording details.
4. ORIGIN: When both a birthplace AND current city are mentioned, list the BIRTHPLACE as origin. "Grew up in Bogota" + "based in Richmond" → origin is Bogota, Colombia. Look carefully — origin info often appears in interview intros or "about" sections.
5. Do NOT fabricate. But DO extract every piece of real information: career milestones, collaborators, genre descriptions, interview quotes, personal background, creative philosophy, tour info, production credits, etc.
6. Include [CIT N] references to trace each fact back to its source.

EXTRACTION CHECKLIST — actively look for and include each of these when present:
- Specific people mentioned BY NAME (producers, engineers, collaborators, mentors, teachers, family)
- Direct quotes from interviews (exact wording in quotation marks) — INCLUDE who said it, when, and why
- Numbers: ages, years, chart positions, stream counts, award counts, dollar amounts
- Specific places: studios, cities, venues, labels
- Anecdotes: origin stories behind specific songs, "almost didn't happen" moments, creative accidents
- Story arcs: cause-and-effect chains (e.g., "got kicked out → moved to X → discovered Y"), turning points, before/after moments
- Relationships between artists: who worked with whom, who influenced whom, real collaborations
- Track-specific production details: who played what instrument, where it was recorded, what gear was used

SOURCES:
${exaContext}
${transcriptContext ? `\nYOUTUBE TRANSCRIPTS:\n${transcriptContext}` : ""}

Return ONLY valid JSON:
{
  "artistOrigin": "City, Country (birthplace preferred over current residence) — 'unknown' only if truly absent from ALL sources",
  "artistBio": "2-3 factual sentences about who ${artist} is — their background, career, and creative identity",
  "artistFacts": ["Every verified fact about ${artist} — be SPECIFIC: include names, dates, ages, places, quotes. Each fact should be a self-contained detail the writer can use. [CIT N]"],
  "trackFacts": ["Any facts specifically about '${title}' — recording, personnel, who produced it, chart performance, behind-the-scenes stories, direct quotes about the song [CIT N]"],
  "albumContext": "What sources say about '${album || "the album"}'",
  "keyCollaborators": ["Full Name — specific role (e.g. 'produced the beat', 'co-wrote', 'engineered at Studio X') [CIT N]"],
  "warningsForWriter": ["Caveats: name variations found, different projects referenced, limited track-specific info, etc."]
}`;

  // Curator uses gemini-2.0-flash with an enhanced extraction prompt.
  // 2.5-flash/lite "think" for 30-60s on popular artists — same time as the Writer.
  // 2.0-flash runs in <1s. The enhanced prompt (extraction checklist) compensates for the shallower model.
  const CURATOR_MODELS = ["gemini-2.0-flash"];
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 },
  });

  let res: Response | null = null;
  let curatorModelUsed = CURATOR_MODELS[0];
  try {
    for (const model of CURATOR_MODELS) {
      curatorModelUsed = model;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (res.ok || (res.status !== 404 && res.status !== 400)) break;
      console.log(`[Curator] Model ${model} unavailable (${res.status}), trying next...`);
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text() : "no response";
      console.error(`[Curator] Gemini error (${curatorModelUsed}):`, res?.status, errText);
      return fallback;
    }
    console.log(`[Curator] Using model: ${curatorModelUsed}`);

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === "RECITATION") {
      console.warn("[Curator] RECITATION — retrying without transcripts");
      // Retry curator without transcript content
      const retryPrompt = prompt.replace(/\nYOUTUBE TRANSCRIPTS:[\s\S]*$/, "");
      const retryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${curatorModelUsed}:generateContent?key=${apiKey}`;
      const retryRes = await fetch(retryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: retryPrompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!retryRes.ok) return fallback;
      const retryData = await retryRes.json();
      const retryText = retryData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!retryText.trim()) return fallback;
      const cleaned = retryText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      console.log(`[Curator] (retry) Origin: ${parsed.artistOrigin}, ${parsed.artistFacts?.length || 0} artist facts, ${parsed.trackFacts?.length || 0} track facts`);
      return parsed as CuratedResearch;
    }

    const text = candidate?.content?.parts?.[0]?.text || "";
    if (!text.trim()) {
      console.error("[Curator] Empty response");
      return fallback;
    }

    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    console.log(`[Curator] Origin: ${parsed.artistOrigin}, ${parsed.artistFacts?.length || 0} artist facts, ${parsed.trackFacts?.length || 0} track facts`);
    return parsed as CuratedResearch;
  } catch (e) {
    console.error("[Curator] Error:", e);
    return fallback;
  }
}

// ── Nugget Quality Validator ───────────────────────────────────────────
// Agent 3: Code-level check for banned words, vague headlines, structure.
const BANNED_PHRASES = [
  "likely", "suggests", "implies", "might conjure", "could be", "possibly", "perhaps",
  "offers a glimpse", "provides insight", "sheds light on", "speaks to",
  "a testament to", "underscores", "resonates with", "captures the essence",
  "sonic landscape", "soundscape", "sonic palette", "musical tapestry",
  "while specific details are scarce", "although information is limited",
  "this track offers", "this song offers", "the track provides", "the song provides",
  "immerse yourself", "the track's title provides", "provides a crucial clue",
  "isn't just", "wasn't just", "more than just", "not just another",
  "last.fm", "lastfm", "listener overlap", "listener data shows", "listener match",
];

// Hallucinated source indicators — publishers/types Gemini invents when it has no real sources
const HALLUCINATED_PUBLISHERS = [
  "music data insights", "internal data", "musicdatainsights",
  "ai music database", "music insights", "artist database",
  "music analytics", "song insights", "track insights",
];

function validateNuggetQuality(nuggets: GeminiNugget[]): { valid: boolean; issues: string[]; hallucinated: boolean } {
  const issues: string[] = [];
  let hallucinatedSourceCount = 0;
  for (let i = 0; i < nuggets.length; i++) {
    const n = nuggets[i];
    const allText = `${n.headline} ${n.text}`.toLowerCase();
    for (const banned of BANNED_PHRASES) {
      if (allText.includes(banned.toLowerCase())) {
        issues.push(`Nugget ${i} (${n.kind}): banned phrase "${banned}"`);
      }
    }
    // Check for hallucinated source types and publishers
    const sourceType = (n.source?.type || "").toLowerCase();
    const sourcePublisher = (n.source?.publisher || "").toLowerCase();
    if (sourceType === "internal-data" || sourceType === "internal_data" || sourceType === "database" || sourceType === "editorial") {
      issues.push(`Nugget ${i} (${n.kind}): hallucinated source type "${n.source.type}"`);
      hallucinatedSourceCount++;
    }
    if (HALLUCINATED_PUBLISHERS.some(hp => sourcePublisher.includes(hp))) {
      issues.push(`Nugget ${i} (${n.kind}): hallucinated publisher "${n.source.publisher}"`);
      hallucinatedSourceCount++;
    }
    // Check for empty quoteSnippet with unverified google search URL — likely fabricated
    const sourceUrl = n.source?.sourceUrl || "";
    const quoteSnippet = n.source?.quoteSnippet || "";
    if (!quoteSnippet && sourceUrl.includes("google.com/search") && sourceType !== "youtube") {
      issues.push(`Nugget ${i} (${n.kind}): no quote + google search URL (likely fabricated)`);
      hallucinatedSourceCount++;
    }
  }
  const hallucinated = hallucinatedSourceCount >= 2; // majority of nuggets have fake sources
  return { valid: issues.length === 0, issues, hallucinated };
}

// ── Generate nuggets with Gemini + Google Search grounding ───────────
interface GeminiNugget {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery" | "context";
  listenFor: boolean;
  selectedImageLabel?: string;  // Multimodal: label like "IMG-A1" chosen after visual inspection
  selectedImageUrl?: string;   // Legacy text-only fallback: Exa image URL chosen by Gemini
  imageSearchQuery?: string;   // fallback: search Wikipedia/Commons for this
  imageCaption?: string;
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    sourceUrl?: string;
    quoteSnippet: string;
    locator?: string;
    videoIndex?: number;
  };
}

async function generateWithGemini(
  artist: string,
  title: string,
  album: string | undefined,
  videos: YTVideo[],
  transcripts: Map<string, string>,
  apiKey: string,
  listenCount: number = 1,
  previousNuggets: string[] = [],
  tier: Tier = "casual",
  userTopArtists: string[] = [],
  userTopTracks: string[] = [],
  exaContext?: string,
  exaCitations?: ExaCitation[],
  imageCandidates?: ImageCandidate[],
  sparseData?: boolean,
  spotifyInfo?: SpotifyArtistInfo | null,
  lastFmSimilar?: LastFmSimilarArtist[],
  lastFmTags?: string[],
  trackSearchSkipped?: boolean,
  discoverySearchSkipped?: boolean,
  timingTracker?: { ts: (label: string) => void; te: (label: string) => void },
): Promise<{ nuggets: GeminiNugget[]; artistSummary: string; groundingChunks: any[]; exaCitations?: ExaCitation[]; noTrackData?: boolean }> {
  const _ts = timingTracker?.ts || (() => {});
  const _te = timingTracker?.te || (() => {});
  const tierConfig = TIER_CONFIG[tier];
  const transcriptContext = videos
    .filter((v) => transcripts.has(v.videoId))
    .map((v, i) => {
      const t = transcripts.get(v.videoId)!;
      return `[VIDEO ${i}] "${v.title}" by ${v.channelTitle} (videoId: ${v.videoId})\nTranscript:\n${t}`;
    })
    .join("\n\n---\n\n");

  const videoListContext = videos
    .map((v, i) => `[VIDEO ${i}] "${v.title}" by ${v.channelTitle} (videoId: ${v.videoId})`)
    .join("\n");

  // Depth tier instructions
  let depthInstruction: string;
  if (listenCount <= 1) {
    depthInstruction = "This is the listener's FIRST TIME hearing this track. Be introductory and welcoming. Set the stage — who is this artist, what's the basic story of this song, and what's one obvious next listen.";
  } else if (listenCount === 2) {
    depthInstruction = "The listener has heard this before. Skip the basics. Go deeper — surprising production details, lesser-known connections, a more adventurous recommendation.";
  } else {
    depthInstruction = "The listener keeps coming back (listen #" + listenCount + "). Give them deep cuts — obscure influences, technical breakdowns, unexpected cultural connections, niche recommendations only a true nerd would know.";
  }

  // Pick random thematic angles for this generation
  const angles = pickAngles(tier, listenCount);
  const angleInstruction = `\nTHEMATIC ANGLES: For the artist and track nuggets, explore these angles: ${angles.join(", ")}. Use these as creative direction — the nugget should still be surprising and specific, not a generic take on the angle.`;

  // Extract previously recommended artist names from discovery headlines to prevent repeats
  const extractedDiscoveryArtists = previousNuggets.length > 0
    ? extractPreviousDiscoveryArtists(previousNuggets)
    : [];

  const nonRepeatInstruction = previousNuggets.length > 0
    ? `\n\nPREVIOUSLY SHOWN — the listener has already seen ALL of these nuggets:
${previousNuggets.map((h) => `- "${h}"`).join("\n")}

FACT-LEVEL DEDUP RULES:
- Do NOT retell the same specific fact, anecdote, or story as any previous nugget, even with different wording. Example: if a previous nugget says the artist "started as a videographer at 15 for a skate team," do NOT retell that same origin story. However, you CAN mention other video work like a specific music video they directed or a different visual project — those are different facts.
- Each nugget must reveal a genuinely NEW piece of information not covered above.
${extractedDiscoveryArtists.length > 0 ? `
PREVIOUSLY RECOMMENDED ARTISTS — do NOT recommend any of these again:
${extractedDiscoveryArtists.map(a => `- ${a}`).join("\n")}
Your discovery nugget MUST feature a DIFFERENT artist not listed above.
` : ""}Every nugget you generate must be about a DIFFERENT fact, angle, and (for discovery) a DIFFERENT recommended artist than anything listed above.`
    : "";

  // Build listener taste context for personalized connections
  const tasteContext = userTopArtists.length > 0
    ? `\nLISTENER PROFILE — use this to personalize your nuggets:
This listener's top artists include: ${userTopArtists.slice(0, 8).join(", ")}.${userTopTracks.length > 0 ? `\nTheir top tracks include: ${userTopTracks.slice(0, 5).join(", ")}.` : ""}
Use this to:
- Draw genuine connections to artists they already love when relevant (not forced)
- Calibrate assumed knowledge — if they already listen to this artist, skip basic biography
- For the discovery nugget: recommend something adjacent to their existing taste that feels like an expert tip
- Do NOT recommend artists already in their top artists list\n`
    : "";

  // Build music context for accurate genre + discovery recommendations
  const hasSpotifyGenres = spotifyInfo && spotifyInfo.genres.length > 0;
  const hasSpotifyTracks = spotifyInfo && spotifyInfo.topTrackNames.length > 0;
  const hasLastFmSimilar = lastFmSimilar && lastFmSimilar.length > 0;
  const hasLastFmTags = lastFmTags && lastFmTags.length > 0;

  let musicDataContext = `\nMUSIC DATA for "${artist}":`;
  // Spotify catalog data
  if (hasSpotifyGenres) {
    musicDataContext += `\nSpotify genres: ${spotifyInfo!.genres.join(", ")}`;
  }
  if (hasLastFmTags) {
    musicDataContext += `\nGenre tags: ${lastFmTags!.join(", ")}`;
  }
  if (hasSpotifyTracks) {
    musicDataContext += `\nTop tracks: ${spotifyInfo!.topTrackNames.join(", ")}`;
  }
  if (spotifyInfo && spotifyInfo.albumNames.length > 0) {
    musicDataContext += `\nAlbums/Singles: ${spotifyInfo!.albumNames.join(", ")}`;
  }
  if (spotifyInfo) {
    musicDataContext += `\nFollowers: ${spotifyInfo.followers.toLocaleString()}`;
  }
  // Similar artists from listener data — key data for discovery recommendations
  // NOTE: Do NOT mention "Last.fm" in the prompt label — Gemini copies it into nugget text
  if (hasLastFmSimilar) {
    musicDataContext += `\n\nVERIFIED SIMILAR ARTISTS (ranked by listener overlap):`;
    for (const sim of lastFmSimilar!.slice(0, 8)) {
      musicDataContext += `\n- ${sim.name} (${Math.round(sim.match * 100)}% listener overlap)`;
    }
  }

  // Discovery instruction — prioritize Last.fm similar artists when available
  // Build dedup clause for previously recommended discovery artists
  const discoveryDedupClause = extractedDiscoveryArtists.length > 0
    ? `\nDo NOT recommend any of these previously recommended artists: ${extractedDiscoveryArtists.join(", ")}. Pick a DIFFERENT artist.`
    : "";

  if (hasLastFmSimilar) {
    const similarCount = lastFmSimilar!.length;
    if (similarCount <= 3) {
      // Short list — don't force Gemini to always pick the same top match
      musicDataContext += `\n\nDISCOVERY NUGGET INSTRUCTIONS: The VERIFIED SIMILAR ARTISTS above are confirmed similar artists based on real listener data. You may recommend one of them, OR use your own musical knowledge to recommend a different artist. Name the SPECIFIC connection — a shared producer, real collaboration, sample source, label, scene, or documented influence. Don't just say "similar vibe." The recommended artist MUST exist on Spotify. IMPORTANT: Do NOT mention the data source (e.g. "listener data", "listener overlap", "similar artists list") in the nugget text — write as if YOU know this connection from musical knowledge.${discoveryDedupClause}\n`;
    } else {
      musicDataContext += `\n\nDISCOVERY NUGGET INSTRUCTIONS: The VERIFIED SIMILAR ARTISTS above are confirmed similar artists based on real listener data. For the discovery nugget, recommend one of these artists (or a very closely related artist in the same scene). Name the SPECIFIC connection — a shared producer, real collaboration, sample source, label, scene, or documented influence chain. Don't just describe sonic similarity. The recommended artist MUST exist on Spotify. IMPORTANT: Do NOT mention the data source (e.g. "listener data", "listener overlap", "similar artists list") in the nugget text — write as if YOU know this connection from musical knowledge.${discoveryDedupClause}\n`;
    }
  } else {
    musicDataContext += `\n\nDISCOVERY NUGGET INSTRUCTIONS: Use the track names, album names, and genre tags above to understand "${artist}"'s actual musical style. Then recommend an artist with a SPECIFIC connection — a shared producer, label, scene, sample source, or documented influence. Don't just say "similar vibe." The recommended artist MUST exist on Spotify. Do NOT rely on the Exa discovery research — it is unreliable for lesser-known artists. Use YOUR OWN musical knowledge informed by the catalog data above.${discoveryDedupClause}\n`;
  }

  // Adaptive search guidance: tell Gemini when track/discovery research was skipped
  let adaptiveGuidance = "";

  // Sparse data mode: when very few verified sources exist, change writer behavior
  if (sparseData) {
    adaptiveGuidance += `\nSPARSE DATA MODE: Very little verified information exists about "${artist}". This is a lesser-known or emerging artist.

CRITICAL RULES FOR SPARSE DATA:
- Do NOT fabricate a narrative. If you don't have verified facts, write about what you DO know (even if it's just genre, location, or catalog data).
- Source type MUST be "youtube", "article", or "interview" — NEVER use "internal-data", "database", or invented types.
- Publisher MUST be a real publication or platform (e.g., "Bandcamp", "Spotify", "SoundCloud", "YouTube"). NEVER invent publishers like "Music Data Insights".
- It is BETTER to write a shorter, honest nugget than to fill space with speculation.
- Do NOT frame lack of information as a deliberate artistic choice (e.g., "operates as a digital ghost", "deliberate anti-persona"). A small artist is not automatically mysterious.
- Focus on VERIFIABLE details: where they're from, their genre, their discography, real collaborators.
- For the track nugget: write about the artist's creative context, NOT the track's sound or mood.\n`;
  }

  if (trackSearchSkipped) {
    adaptiveGuidance += `\nTRACK NUGGET GUIDANCE: No track-specific articles exist for "${title}". Do NOT describe the track's sound, mood, or atmosphere.
BANNED: "this track likely reflects..." / "expect to hear..." / "while specific details are scarce..." / "Immerse yourself in..." / "The track offers..." / any sentence describing the track's mood, atmosphere, or sonic texture.\n`;
  }
  if (discoverySearchSkipped) {
    adaptiveGuidance += `\nDISCOVERY NOTE: Use the LAST.FM SIMILAR ARTISTS data and your own musical knowledge for the discovery nugget. No additional discovery research was performed.\n`;
  }

  // ── Agent 1: Curate research ─────────────────────────────────────────
  let curatedFacts: CuratedResearch | null = null;
  if (exaContext) {
    console.time("[Timing] Curator (Agent 1)"); _ts("curator");
    curatedFacts = await curateResearch(artist, title, album, exaContext, transcriptContext, apiKey, spotifyInfo);
    console.timeEnd("[Timing] Curator (Agent 1)"); _te("curator");
  }

  // ── Agent 2: Build writer prompt ───────────────────────────────────
  const imageInstructions = imageCandidates && imageCandidates.length > 0
    ? `
IMAGE SELECTION — at least 1 nugget MUST include an image:
  Visually inspect [IMG-X#] candidates shown after this prompt. Select relevant ones by setting "selectedImageLabel" (e.g., "IMG-A1"). Reject logos, stock photos, placeholders, blank images.
  If no candidate fits, set "imageSearchQuery" — a SPECIFIC Wikipedia-searchable term (e.g., "Bob Ludwig mastering engineer" NOT "Radiohead musician"). For discovery nuggets, search for the RECOMMENDED artist + "musician".
  Include "imageCaption": 6-12 words explaining relevance.`
    : (exaContext
      ? `
IMAGE SELECTION — at least 1 nugget MUST include an image:
  Check [IMG CIT N] URLs in citations. If relevant, set "selectedImageUrl". Otherwise set "imageSearchQuery" (specific subject, NOT the artist).
  For discovery nuggets, search for the RECOMMENDED artist + "musician". Include "imageCaption": 6-12 words.`
      : `
IMAGE SELECTION — at least 1 nugget MUST include an image:
  Set "imageSearchQuery" to a specific search term for the nugget's subject (NOT the artist name).
  For discovery nuggets, search for the RECOMMENDED artist + "musician". Include "imageCaption": 6-12 words.`);

  const imageFieldExample = imageCandidates && imageCandidates.length > 0
    ? `"selectedImageLabel": "IMG-A1 OR omit",`
    : (exaContext ? `"selectedImageUrl": "https://... OR omit",` : "");
  const sourceFieldExample = exaContext ? `"citIndex": 0,` : `"sourceUrl": "https://real-url.com",`;

  let prompt: string;

  // Use curated path only if curator found real substance (>=2 facts).
  // Otherwise fall back to direct path with Google Search grounding.
  const useCuratedPath = curatedFacts && (curatedFacts.artistFacts.length >= 2 || curatedFacts.trackFacts.length >= 1);

  // ── Collaboration bias: lead with collaboration story for Curious/Nerd ──
  const CREATIVE_ROLES = /\b(feat|feature|co-writ|co-produc|producer|produced|band member|vocalist|rapper|singer|songwriter)\b/i;
  const creativeCollabs = curatedFacts?.keyCollaborators.filter(c => CREATIVE_ROLES.test(c)) ?? [];

  // Only keep collaborators mentioned in trackFacts to avoid cross-track contamination.
  // keyCollaborators is artist-level; collab bias must only feature people on THIS track.
  const trackFactsText = (curatedFacts?.trackFacts ?? []).join(" ").toLowerCase();
  const trackSpecificCollabs = creativeCollabs.filter(c => {
    const name = c.split(/\s*[—–-]\s*/)[0].trim().toLowerCase();
    const nameWords = name.split(/\s+/);
    return nameWords.length <= 2
      ? trackFactsText.includes(name)
      : trackFactsText.includes(nameWords[0]) && trackFactsText.includes(nameWords[nameWords.length - 1]);
  });
  const collabsForPrompt = trackSpecificCollabs.length > 0 ? trackSpecificCollabs : [];
  const collabNames = collabsForPrompt.map(c => c.split(/\s*[—–-]\s*/)[0].trim());
  const applyCollabBias = collabsForPrompt.length > 0 && (tier === "curious" || tier === "nerd");

  if (useCuratedPath && curatedFacts) {
    // ── Curated path: research pre-processed by Agent 1 ─────────────
    const curatedContext = [
      `ARTIST ORIGIN: ${curatedFacts.artistOrigin}`,
      curatedFacts.artistBio ? `BIO: ${curatedFacts.artistBio}` : "",
      curatedFacts.artistFacts.length > 0
        ? `\nVERIFIED ARTIST FACTS:\n${curatedFacts.artistFacts.map(f => `- ${f}`).join("\n")}`
        : "",
      curatedFacts.trackFacts.length > 0
        ? `\nVERIFIED TRACK FACTS ("${title}"):\n${curatedFacts.trackFacts.map(f => `- ${f}`).join("\n")}`
        : `\nNo verified facts exist specifically about "${title}".`,
      curatedFacts.albumContext ? `\nALBUM: ${curatedFacts.albumContext}` : "",
      curatedFacts.keyCollaborators.length > 0
        ? `\nCOLLABORATORS:\n${curatedFacts.keyCollaborators.map(c => `- ${c}`).join("\n")}`
        : "",
      curatedFacts.warningsForWriter.length > 0
        ? `\nNOTES:\n${curatedFacts.warningsForWriter.map(w => `- ${w}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    prompt = `You are a music journalist. The listener is PLAYING "${title}" by ${artist}${album ? ` from "${album}"` : ""} RIGHT NOW.

RESEARCH BRIEF (verified — use ONLY these facts, do not add unverified information):
${curatedContext}

${musicDataContext}${adaptiveGuidance}

DEPTH: ${depthInstruction}
ANGLES: ${angles.join(", ")}
${nonRepeatInstruction}
${tasteContext}

VOICE: ${tierConfig.tone}
${tierConfig.assumedKnowledge}

WRITING RULES — NON-NEGOTIABLE:
1. The listener can HEAR the music. Tell them what they CAN'T know from listening — stories, history, people, places, creative context.
2. Dig like Nardwuar — find the specific detail nobody else would. Prioritize "almost didn't happen" stories, unlikely origins, specific people who changed the trajectory.
3. BANNED — never use: "likely" / "suggests" / "might" / "perhaps" / "resonates with" / "a testament to" / "sonic landscape" / "soundscape" / "offers a glimpse" / "captures the essence" / "while details are scarce" / "immerse yourself" / "the track provides" / "this song offers"
4. If uncertain about a fact, OMIT IT. One confident true sentence beats three hedged guesses.
5. Headlines MUST contain a SPECIFIC detail — a name, place, year, or surprising fact.
   GREAT NUGGET: "Mike Will Made-It built the 'HUMBLE.' beat for Gucci Mane's prison release — Kendrick heard it and the phrase 'be humble' hit him instantly."
   BAD NUGGET: "Kendrick Lamar's artistic journey from Compton reflects his deep commitment to authentic storytelling and cultural commentary."
   The difference: great nuggets reveal a specific story. Bad nuggets summarize a career.
6. NO VAGUE FILLER. If a sentence could apply to any artist (e.g., "promoting messages of love and hope", "unique blend of genres", "committed to authentic artistry"), it's worthless. Every sentence must contain a detail that ONLY applies to THIS artist.
7. Do NOT recommend artists who share ANY part of ${artist}'s name.
8. Do NOT use fabricated publisher names like "General Knowledge" or "Music Analysis". Use the artist's real website, Bandcamp, Spotify, or a real music publication.

STRUCTURE — exactly 3 nuggets:
1. **artist** (kind: "artist"): ${applyCollabBias
      ? `Focus on the collaboration behind this track. Key creative partners: ${collabsForPrompt.join("; ")}. ONLY discuss work on "${title}" — do NOT reference other tracks or albums by ${artist}. Tell the story of their creative relationship — how they connected, what each brought to the table, and how this collaboration shaped the music. ${tier === "nerd" ? "Include specific production roles, studio dynamics, and technical contributions." : "Name specific people and moments."}`
      : tierConfig.artistFocus}. listenFor: false.
2. ${curatedFacts.trackFacts.length === 0 ? `**context** (kind: "context"): A DIFFERENT artist story from nugget 1 — a separate chapter of their life/career. If nugget 1 covers their origin, this one covers a turning point, achievement, or collaboration (or vice versa). Pick from the VERIFIED ARTIST FACTS — choose the most surprising fact NOT used in nugget 1. Do NOT describe the track's sound/mood/atmosphere.` : `**track** (kind: "track"): ${tierConfig.trackFocus}`}. listenFor: ${curatedFacts.trackFacts.length === 0 ? "false" : "true"}.
3. **discovery** (kind: "discovery"): ${tierConfig.discoveryFocus}. Be opinionated like a knowledgeable friend. listenFor: false.
${applyCollabBias ? `\nANTI-SATURATION RULE (MANDATORY):
- Nugget 1 already covers: ${collabNames.join(", ")}.
- Nugget 2 (${curatedFacts.trackFacts.length === 0 ? "context" : "track"}) MUST NOT center on ${collabNames.join(" or ")}. They may appear in passing, but the focus must be a different angle entirely.
- Nugget 3 (discovery) MUST recommend an artist who is NOT ${collabNames.join(" and NOT ")}. Do NOT recommend a collaborator from nugget 1 as a solo act.` : ""}
SOURCE RULES: Facts reference [CIT N] citations. Include "citIndex" in each source to match. Do not invent URLs.
${imageInstructions}

ALSO generate "artistSummary": 2-3 punchy sentences about ${artist}.

Return ONLY valid JSON:
{
  "artistSummary": "...",
  "nuggets": [
    {
      "headline": "Specific, surprising hook sentence",
      "text": "2-3 sentences delivering on the headline",
      "kind": "artist|track|discovery",
      "listenFor": false,
      ${imageFieldExample}
      "imageSearchQuery": "specific subject OR omit",
      "imageCaption": "6-12 word caption",
      "source": {
        "type": "youtube|article|interview",
        "title": "Real source title",
        "publisher": "Real publisher",
        ${sourceFieldExample}
        "quoteSnippet": "Real or paraphrased quote",
        "locator": "timestamp or section"
      }
    }
  ]
}`;
  } else {
    // ── Direct path: no curation (no Exa, or curation too thin) ──────
    // Include Exa research if available; also enable Google Search grounding when no Exa
    const hasExaResearch = !!exaContext;
    const exaSection = hasExaResearch
      ? `\nRESEARCH MATERIAL (cite by [CIT N] index):\n${exaContext}\n\nSOURCE RULES: Include "citIndex" in each source. Do not invent URLs.\n`
      : "";
    const curatorBrief = curatedFacts
      ? `\nCURATOR NOTES: Origin=${curatedFacts.artistOrigin}. ${curatedFacts.warningsForWriter.join(". ")}\n`
      : "";
    prompt = `You are a music journalist. The listener is PLAYING "${title}" by ${artist}${album ? ` from "${album}"` : ""} RIGHT NOW. They can hear what it sounds like — tell them things they CAN'T know from listening alone.

"${artist}" is the EXACT artist name. Do NOT use info about other people with similar names. Do NOT confuse the song title with films, games, or other media.
${exaSection}${curatorBrief}
${musicDataContext}${adaptiveGuidance}

DEPTH: ${depthInstruction}
ANGLES: ${angles.join(", ")}
${nonRepeatInstruction}
${tasteContext}

${transcriptContext ? `YOUTUBE TRANSCRIPTS:\n${videoListContext}\n${transcriptContext}\n` : (videoListContext ? `Available YouTube videos:\n${videoListContext}\n` : "")}

VOICE: ${tierConfig.tone}
${tierConfig.assumedKnowledge}

WRITING RULES — NON-NEGOTIABLE:
1. Tell stories, not descriptions. Never describe what the music sounds like.
2. Dig like Nardwuar — find the specific detail nobody else would. Prioritize "almost didn't happen" stories, unlikely origins, specific people who changed the trajectory.
3. BANNED: "likely" / "suggests" / "might" / "perhaps" / "resonates" / "a testament to" / "sonic landscape" / "offers a glimpse" / "captures the essence" / "while details are scarce"
4. If uncertain, OMIT IT rather than hedging.
5. Headlines MUST contain a specific detail (name, place, year, event).
6. NO VAGUE FILLER. If a sentence could apply to any artist (e.g., "promoting messages of love and hope", "unique blend of genres"), it's worthless. Every sentence must contain a detail that ONLY applies to THIS artist.
7. NEVER fabricate collaborations with famous people unless verifiable.
8. Prefer birthplace over current city as the artist's origin.
9. Do NOT recommend artists sharing ANY part of ${artist}'s name.

STRUCTURE — exactly 3 nuggets:
1. **artist** (kind: "artist"): ${applyCollabBias
      ? `Focus on the collaboration behind this track. Key creative partners: ${collabsForPrompt.join("; ")}. ONLY discuss work on "${title}" — do NOT reference other tracks or albums by ${artist}. Tell the story of their creative relationship — how they connected, what each brought to the table, and how this collaboration shaped the music. ${tier === "nerd" ? "Include specific production roles, studio dynamics, and technical contributions." : "Name specific people and moments."}`
      : tierConfig.artistFocus}. listenFor: false.
2. ${trackSearchSkipped ? `**context** (kind: "context"): A DIFFERENT artist story from nugget 1 — a separate chapter of their life/career. If nugget 1 covers their origin, this one covers a turning point, achievement, or collaboration (or vice versa). Pick the most surprising fact NOT used in nugget 1. Do NOT describe the track's sound/mood/atmosphere.` : `**track** (kind: "track"): ${tierConfig.trackFocus}`}. listenFor: ${trackSearchSkipped ? "false" : "true"}.
3. **discovery** (kind: "discovery"): ${tierConfig.discoveryFocus}. listenFor: false.
${applyCollabBias ? `\nANTI-SATURATION RULE (MANDATORY):
- Nugget 1 already covers: ${collabNames.join(", ")}.
- Nugget 2 (${trackSearchSkipped ? "context" : "track"}) MUST NOT center on ${collabNames.join(" or ")}. They may appear in passing, but the focus must be a different angle entirely.
- Nugget 3 (discovery) MUST recommend an artist who is NOT ${collabNames.join(" and NOT ")}. Do NOT recommend a collaborator from nugget 1 as a solo act.` : ""}${imageInstructions}

ALSO generate "artistSummary": 2-3 punchy sentences about ${artist}.

Return ONLY valid JSON:
{
  "artistSummary": "...",
  "nuggets": [
    {
      "headline": "Specific, surprising hook",
      "text": "2-3 sentences",
      "kind": "artist|track|discovery",
      "listenFor": false,
      "imageSearchQuery": "specific search term OR omit",
      "imageCaption": "6-12 word caption",
      "source": {
        "type": "youtube|article|interview",
        "title": "Real source title",
        "publisher": "Real publisher",
        ${sourceFieldExample}
        "quoteSnippet": "Real quote",
        "locator": "timestamp or section"
      }
    }
  ]
}`;
  }

  const parts = buildMultimodalParts(prompt, imageCandidates);
  // Cap temperature at 0.7 for sparse data to reduce hallucination risk.
  // Casual tier normally runs at 1.0 which is too creative when facts are thin.
  const effectiveTemp = sparseData ? Math.min(tierConfig.temperature, 0.7) : tierConfig.temperature;
  const body: any = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: effectiveTemp },
  };

  // Enable Google Search grounding when Exa context is missing OR sparse.
  // Previously this only fired when exaContext was completely empty, which meant
  // even thin/useless Exa results suppressed grounding — causing hallucination
  // for lesser-known artists where Exa returns 1-2 low-quality pages.
  if (!exaContext || sparseData) {
    body.tools = [{ google_search: {} }];
    if (sparseData && exaContext) {
      console.log(`[Grounding] Enabling Google Search grounding despite Exa context — sparse data mode`);
    }
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${tierConfig.model}:generateContent?key=${apiKey}`;

  // Retry up to 3 times on 429
  console.time("[Timing] Writer (Agent 2)"); _ts("writer");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];

      // Check for blocked/empty responses
      const finishReason = candidate?.finishReason;
      if (finishReason === "SAFETY") {
        console.warn("Gemini blocked response due to SAFETY");
        throw new Error("Gemini blocked response: SAFETY");
      }
      if (finishReason === "RECITATION") {
        console.warn("Gemini blocked response due to RECITATION, will retry without transcripts");
        throw new RecitationError();
      }

      const text = candidate?.content?.parts?.[0]?.text || "";
      const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];

      if (!text.trim()) {
        console.error("Gemini returned empty text. Candidate:", JSON.stringify(candidate));
        if (attempt < 2) {
          console.log("Empty response, retrying...");
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new Error("Gemini returned empty response after retries");
      }

      let parsed: { nuggets: GeminiNugget[]; artistSummary?: string };
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse Gemini response:", text.slice(0, 500));
        if (attempt < 2) {
          console.log("Parse failed, retrying...");
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new Error("Failed to parse Gemini response");
      }
      // ── Agent 3: Validate nugget quality ────────────────────────────
      const validation = validateNuggetQuality(parsed.nuggets || []);
      if (!validation.valid) {
        console.log(`[Validator] ${validation.issues.length} quality issues: ${validation.issues.join("; ")}`);
        // If hallucinated sources detected and we haven't retried for quality yet, retry
        if (validation.hallucinated && attempt < 2) {
          console.log(`[Validator] Hallucinated sources detected — retrying with hardened prompt`);
          // Add anti-hallucination reinforcement to the prompt
          const hardenedPart = {
            role: "user",
            parts: [{ text: `CRITICAL CORRECTION: Your previous response contained fabricated sources (fake publishers, made-up source types like "internal-data"). This is unacceptable.

RULES FOR THIS RETRY:
- Source type MUST be one of: "youtube", "article", "interview"
- Publisher MUST be a real, verifiable publication name (e.g. "Pitchfork", "Rolling Stone", "The Guardian", "NME", "Bandcamp Daily")
- If you cannot find a real source for a fact, use the source that informed you (even if it's a Google Search result) and set quoteSnippet to the relevant excerpt
- Do NOT invent publishers like "Music Data Insights" or source types like "internal-data"
- If you truly have NO verifiable information about this artist, write FEWER nuggets with what you can verify rather than fabricating 3 nuggets

Regenerate the nuggets now with REAL sources only.` }],
          };
          body.contents = [...body.contents, hardenedPart];
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        // Retry on banned phrases
        const bannedIssues = validation.issues.filter(i => i.includes("banned phrase"));
        if (bannedIssues.length > 0 && attempt < 2) {
          console.log(`[Validator] Banned phrases detected — retrying`);
          const bannedFound = bannedIssues.map(i => {
            const match = i.match(/"([^"]+)"/);
            return match ? match[1] : "";
          }).filter(Boolean);
          const correctionPart = {
            role: "user",
            parts: [{ text: `CORRECTION: Your response used banned phrases: ${bannedFound.map(b => `"${b}"`).join(", ")}. These phrases are NEVER allowed. Rewrite the affected nuggets with confident, specific language. Return the complete JSON with all 3 nuggets.` }],
          };
          body.contents = [...body.contents, correctionPart];
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
      }

      // Post-process: scrub any surviving banned phrases from nugget text.
      // Gemini sometimes ignores the ban even after retry — this is a code-level guarantee.
      const BANNED_REPLACEMENTS: Record<string, string> = {
        "sonic landscape": "production style", "sonic landscapes": "production styles",
        "soundscape": "production", "soundscapes": "productions",
        "sonic palette": "sound", "musical tapestry": "style",
        "captures the essence": "reflects the spirit",
        "a testament to": "a reflection of",
        "offers a glimpse": "shows",
        "immerse yourself": "dive",
        "love, hope, and perseverance": "creative growth",
        "messages of love": "his creative vision",
        "messages of hope": "his artistic mission",
      };
      for (const nugget of (parsed.nuggets || [])) {
        for (const [banned, replacement] of Object.entries(BANNED_REPLACEMENTS)) {
          const regex = new RegExp(banned, "gi");
          nugget.headline = nugget.headline.replace(regex, replacement);
          nugget.text = nugget.text.replace(regex, replacement);
        }
      }

      // Stamp "context" kind on nugget 2 when no track data exists.
      // Don't rely on Gemini to return the right kind — force it programmatically.
      const noTrackData = !curatedFacts?.trackFacts?.length && trackSearchSkipped;
      if (noTrackData && parsed.nuggets?.[1]) {
        parsed.nuggets[1].kind = "context";
      }

      console.timeEnd("[Timing] Writer (Agent 2)"); _te("writer");
      return { nuggets: parsed.nuggets || [], artistSummary: parsed.artistSummary || "", groundingChunks, exaCitations, noTrackData };
    }

    if (res.status === 429 && attempt < 2) {
      const errData = await res.json().catch(() => null);
      const retryInfo = errData?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
      const retryDelay = retryInfo?.retryDelay || "5s";
      const delaySec = parseFloat(retryDelay.replace("s", "")) || 5;
      const waitMs = Math.min((delaySec + 2) * 1000, 15000);
      console.log(`Rate limited, waiting ${waitMs / 1000}s before retry ${attempt + 1}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const errText = await res.text();
    console.error("Gemini API error:", res.status, errText);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  throw new Error("Gemini API failed after retries");
}

// ── Main handler ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { artist, title, album, deepDive, context, sourceTitle, sourcePublisher, imageCaption, imageQuery, listenCount, previousNuggets, tier: rawTier, userTopArtists: rawTopArtists, userTopTracks: rawTopTracks, spotifyArtistImageUrl: rawSpotifyArtistImageUrl, spotifyTrackId: rawSpotifyTrackId } = body;
    const tier: Tier = (rawTier === "casual" || rawTier === "curious" || rawTier === "nerd") ? rawTier : "casual";

    // ── Input validation ────────────────────────────────────────────
    const MAX_STR = 300;
    const MAX_CONTEXT = 2000;
    const MAX_ARRAY = 50;

    if (!artist || typeof artist !== "string" || artist.trim().length === 0 || artist.length > MAX_STR) {
      return new Response(JSON.stringify({ error: "Invalid artist (max 300 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > MAX_STR) {
      return new Response(JSON.stringify({ error: "Invalid title (max 300 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (album !== undefined && album !== null && (typeof album !== "string" || album.length > MAX_STR)) {
      return new Response(JSON.stringify({ error: "Invalid album" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (context !== undefined && (typeof context !== "string" || context.length > MAX_CONTEXT)) {
      return new Response(JSON.stringify({ error: "Invalid context (max 2000 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const safeListenCount = Math.max(1, Math.min(10, typeof listenCount === "number" ? Math.floor(listenCount) : 1));
    const safePreviousNuggets: string[] = Array.isArray(previousNuggets)
      ? previousNuggets.slice(0, MAX_ARRAY).map((s: unknown) => (typeof s === "string" ? s.slice(0, 200) : "")).filter(Boolean)
      : [];
    const safeSourceTitle = typeof sourceTitle === "string" ? sourceTitle.slice(0, 300) : undefined;
    const safeSourcePublisher = typeof sourcePublisher === "string" ? sourcePublisher.slice(0, 200) : undefined;
    const safeImageCaption = typeof imageCaption === "string" ? imageCaption.slice(0, 300) : undefined;
    const safeImageQuery = typeof imageQuery === "string" ? imageQuery.slice(0, 300) : undefined;
    const safeTopArtists: string[] = Array.isArray(rawTopArtists)
      ? rawTopArtists.slice(0, 10).map((s: unknown) => (typeof s === "string" ? s.slice(0, 100) : "")).filter(Boolean)
      : [];
    const safeTopTracks: string[] = Array.isArray(rawTopTracks)
      ? rawTopTracks.slice(0, 10).map((s: unknown) => (typeof s === "string" ? s.slice(0, 100) : "")).filter(Boolean)
      : [];
    const safeSpotifyArtistImageUrl: string | undefined =
      typeof rawSpotifyArtistImageUrl === "string" && rawSpotifyArtistImageUrl.startsWith("http")
        ? rawSpotifyArtistImageUrl.slice(0, 500)
        : undefined;
    // Spotify track ID for recommendations (e.g., "7mYphBaMfblb6iu1saj3MC")
    const safeSpotifyTrackId: string | undefined =
      typeof rawSpotifyTrackId === "string" && /^[a-zA-Z0-9]{22}$/.test(rawSpotifyTrackId)
        ? rawSpotifyTrackId
        : undefined;

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }
    // YouTube Data API v3 requires a separate Google Cloud API key
    // (different from the Gemini AI key). Falls back to GOOGLE_AI_API_KEY
    // only if the dedicated key isn't set yet.
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") || GOOGLE_AI_API_KEY;

    // ── Deep Dive mode ──────────────────────────────────────────────
    if (deepDive) {
      const deepDivePrompt = `You are a music historian having a fascinating conversation about "${title}" by ${artist}.

The user has been reading this trivia and wants to go deeper:
---
${context}
---
${safeSourceTitle ? `The original source was: "${safeSourceTitle}" by ${safeSourcePublisher}` : ""}
${safeImageCaption ? `An image was shown alongside this nugget: "${safeImageQuery}" with caption "${safeImageCaption}". If relevant, weave in how this visual element connects to the deeper story.` : ""}

Continue this thread of discovery. Provide ONE more paragraph of 2-3 sentences MAX (under 80 words total) that goes deeper — reveal connections, context, or implications that make this even more interesting. Be concise and punchy — this is for a TV screen. Think about WHY this matters, HOW it connects to broader music history, or WHAT it reveals about the creative process.

Be conversational but authoritative. Channel the spirit of a music nerd who can't stop sharing fascinating connections.

End with a brief "followUp" — a one-sentence teaser about what could be explored next.

Return ONLY valid JSON:
{
  "deepDive": {
    "text": "Your deeper exploration paragraph here",
    "followUp": "One-sentence teaser for the next exploration"
  }
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: deepDivePrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 1.0 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Deep dive Gemini error:", res.status, errText);
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";

      if (!text.trim()) {
        console.error("Deep dive returned empty. Candidate:", JSON.stringify(candidate));
        return new Response(JSON.stringify({
          deepDive: {
            text: "This topic is fascinating but I couldn't dig deeper right now. Try again in a moment.",
            followUp: "There's always more to discover."
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let parsed;
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse deep dive:", text.slice(0, 500));
        return new Response(JSON.stringify({
          deepDive: {
            text: "Couldn't process that exploration. Try again in a moment.",
            followUp: "There's always more to discover."
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard nugget generation ──────────────────────────────────
    console.time("[Timing] TOTAL");
    const FUNCTION_TIMEOUT_MS = 90_000;
    const functionStartTime = Date.now();
    const _timings: Record<string, number> = {};
    const _ts = (label: string) => { _timings[`_start_${label}`] = Date.now(); };
    const _te = (label: string) => { const s = _timings[`_start_${label}`]; if (s) { _timings[label] = Date.now() - s; delete _timings[`_start_${label}`]; } };
    const checkTimeout = () => {
      if (Date.now() - functionStartTime > FUNCTION_TIMEOUT_MS) {
        throw new Error(`Function timeout: exceeded ${FUNCTION_TIMEOUT_MS / 1000}s`);
      }
    };
    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
    let exaPromptContext: string | undefined;
    let exaCitations: ExaCitation[] | undefined;
    // Strict-filtered citations: only those mentioning the artist name.
    // Used for images and external links to prevent wrong-person contamination.
    let exaCitationsStrict: ExaCitation[] = [];
    // Track whether track/discovery searches were skipped (for Gemini prompt guidance)
    let trackSearchSkipped = false;
    let discoverySearchSkipped = false;

    // Fetch Spotify + Last.fm artist info in parallel with Exa Phase 1
    // Pass track ID for precise artist resolution (prevents name collisions)
    const spotifyInfoPromise = fetchSpotifyArtistInfo(artist, safeSpotifyTrackId);
    const lastFmSimilarPromise = fetchLastFmSimilarArtists(artist);
    const lastFmTagsPromise = fetchLastFmArtistTags(artist);

    // ── Adaptive Exa Search: Two-Phase Strategy ──────────────────────
    // Phase 1: Artist search + Spotify (in parallel) — provides popularity signal
    // Phase 2: Conditional track/discovery/2nd-artist searches based on Phase 1 results
    if (EXA_API_KEY) {
      console.log(`[Exa] Adaptive search for "${artist} - ${title}" (${tier} tier, listen #${safeListenCount})`);
      const angles = pickAngles(tier, safeListenCount);
      const questions = buildExaQuestions(artist, title, album, tier, angles);

      // ── Phase 1: Scout — artist search + Spotify in parallel ──────
      console.time("[Timing] Exa Phase 1"); _ts("exaPhase1");
      const artistSearchPromise = searchExaPages(questions.artistQ, "artist", EXA_API_KEY, 0, [artist]);

      const [artistSearchResult, phase1SpotifyInfo] = await Promise.all([
        artistSearchPromise,
        spotifyInfoPromise,
      ]);
      console.timeEnd("[Timing] Exa Phase 1"); _te("exaPhase1");

      let artistAnswer = artistSearchResult;
      const followers = phase1SpotifyInfo?.followers || 0;
      let nameCollisionDetected = false;

      // ── Name collision detection ──────────────────────────────────────
      console.time("[Timing] Name collision check"); _ts("nameCollision");
      // If Spotify resolved the correct artist (via track ID), cross-check
      // whether the Exa results actually discuss that artist's work.
      // If the results mention the name but none of the known discography,
      // a name collision is likely — retry with album in includeText.
      if (album && artistAnswer.answer && phase1SpotifyInfo) {
        const ansLower = artistAnswer.answer.toLowerCase();
        const albumLow = album.toLowerCase();
        const titleLow = title.toLowerCase();
        const spAlbums = (phase1SpotifyInfo.albumNames || []).map(a => a.toLowerCase()).filter(a => a.length > 3);
        const spTracks = (phase1SpotifyInfo.topTrackNames || []).map(t => t.toLowerCase()).filter(t => t.length > 3);
        const mentionsAlbum = albumLow.length > 3 && ansLower.includes(albumLow);
        const mentionsTitle = titleLow.length > 3 && ansLower.includes(titleLow);
        const mentionsKnown = spAlbums.some(a => ansLower.includes(a)) || spTracks.some(t => ansLower.includes(t));

        if (!mentionsAlbum && !mentionsTitle && !mentionsKnown) {
          console.log(`[Exa] Name collision detected — Phase 1 results don't mention album "${album}" or any known tracks. Retrying with album filter.`);
          artistAnswer = await searchExaPages(questions.artistQ, "artist", EXA_API_KEY, 0, [artist, album]);
          nameCollisionDetected = true;
        }
      }

      const artistStrictCount = filterRelevantCitations(
        artistAnswer.citations, artist, title, "strict"
      ).length;
      const trackMentioned = trackMentionedInResults(artistAnswer, title);
      console.timeEnd("[Timing] Name collision check"); _te("nameCollision");

      console.log(`[Exa] Phase 1 signals: followers=${followers.toLocaleString()}, strictCitations=${artistStrictCount}, trackMentioned=${trackMentioned}`);

      // ── Phase 2: Adaptive search based on signals ──────────────────
      console.time("[Timing] Exa Phase 2"); _ts("exaPhase2");
      const answers: ExaAnswer[] = [];
      let totalCost = artistAnswer.costDollars;
      if (artistAnswer.answer) answers.push(artistAnswer);

      if (followers > 20_000) {
        // STANDARD: well-known artist — run track + discovery searches in parallel
        console.log(`[Exa] Strategy: STANDARD (${followers.toLocaleString()} followers > 20K)`);
        const [trackResult, discoveryResult] = await Promise.allSettled([
          searchExaPages(questions.trackQ, "track", EXA_API_KEY, 10, [artist]),
          searchExaPages(questions.discoveryQ, "discovery", EXA_API_KEY, 20),
        ]);
        for (const r of [trackResult, discoveryResult]) {
          if (r.status === "fulfilled" && r.value.answer) {
            answers.push(r.value);
            totalCost += r.value.costDollars;
          }
        }
      } else if (artistStrictCount >= 2 && trackMentioned) {
        // SEMI-STANDARD: artist has coverage and track is mentioned — track search may find more
        console.log(`[Exa] Strategy: SEMI-STANDARD (${artistStrictCount} strict cites, track "${title}" mentioned in artist results)`);
        const trackResult = await searchExaPages(questions.trackQ, "track", EXA_API_KEY, 10, [artist]);
        if (trackResult.answer) {
          answers.push(trackResult);
          totalCost += trackResult.costDollars;
        }
        discoverySearchSkipped = true;
        console.log(`[Exa] Skipped discovery search — Last.fm similar artists will handle it`);
      } else if (artistStrictCount >= 2) {
        // ARTIST-HEAVY: has artist coverage but track is not mentioned — 2nd broader artist search
        console.log(`[Exa] Strategy: ARTIST-HEAVY (${artistStrictCount} strict cites, track "${title}" NOT mentioned)`);
        const broadQuery = buildBroadArtistQuery(artist);
        const broadInclude = nameCollisionDetected && album ? [artist, album] : [artist];
        // Use citIndex 10-19 (track range) so image grouping treats this as "track" group
        // More results (8) to maximize coverage for mid-tier artists
        const broadResult = await searchExaPages(broadQuery, "artist-broad", EXA_API_KEY, 10, broadInclude, undefined, { numResults: 8 });
        if (broadResult.answer) {
          answers.push(broadResult);
          totalCost += broadResult.costDollars;
        }
        trackSearchSkipped = true;
        discoverySearchSkipped = true;
        console.log(`[Exa] Skipped track + discovery searches — using 2nd artist search + Last.fm`);
      } else {
        // SPARSE: very little coverage — multi-strategy search to maximize what we find
        console.log(`[Exa] Strategy: SPARSE (${artistStrictCount} strict cites, ${followers.toLocaleString()} followers)`);

        // Run both searches in parallel (they're independent)
        const broadQuery = buildBroadArtistQuery(artist);
        const sparseInclude = nameCollisionDetected && album ? [artist, album] : [artist];
        const keywordQuery = `"${artist}" musician OR artist OR producer OR rapper OR singer`;

        const [broadSettled, keywordSettled] = await Promise.allSettled([
          searchExaPages(broadQuery, "artist-broad", EXA_API_KEY, 10, sparseInclude, undefined, { numResults: 8 }),
          searchExaPages(keywordQuery, "artist-keyword", EXA_API_KEY, 20, undefined, undefined, { numResults: 5, searchType: "keyword" }),
        ]);

        // Strategy A: Broader auto search with more results (catches interview/profile pages)
        const broadResult = broadSettled.status === "fulfilled" ? broadSettled.value : null;
        if (broadResult?.answer) {
          answers.push(broadResult);
          totalCost += broadResult.costDollars;
        }

        // Strategy B: Keyword search fallback — catches exact name matches that neural/auto misses
        const keywordResult = keywordSettled.status === "fulfilled" ? keywordSettled.value : null;
        if (keywordResult?.answer) {
          // Only add if it found different pages than what we already have
          const existingUrls = new Set(answers.flatMap(a => a.citations.map(c => c.url)));
          const newCitations = keywordResult.citations.filter(c => !existingUrls.has(c.url));
          if (newCitations.length > 0) {
            answers.push(keywordResult);
            totalCost += keywordResult.costDollars;
            console.log(`[Exa] Keyword fallback found ${newCitations.length} new pages`);
          } else {
            console.log(`[Exa] Keyword fallback found no new pages`);
          }
        }

        trackSearchSkipped = true;
        discoverySearchSkipped = true;
        console.log(`[Exa] Sparse: ${answers.length} total answer sets, using Gemini knowledge + Last.fm for gaps`);
      }

      console.timeEnd("[Timing] Exa Phase 2"); _te("exaPhase2");

      if (answers.length > 0) {
        const { context, allCitations } = buildExaPromptContext(answers, artist, title, album, phase1SpotifyInfo);
        // Loose filter for prompt context (artist OR title match)
        const filteredCitations = filterRelevantCitations(allCitations, artist, title, "loose");
        // Strict filter for images and external links (artist name must appear)
        exaCitationsStrict = filterRelevantCitations(allCitations, artist, title, "strict");
        exaPromptContext = context;
        exaCitations = filteredCitations;
        console.log(`[Exa] ${answers.length} answers, ${allCitations.length} citations (${filteredCitations.length} loose, ${exaCitationsStrict.length} strict), $${totalCost.toFixed(3)}`);
      } else {
        console.log(`[Exa] No answers returned, falling back to Google grounding`);
      }
    }

    // Start image candidate downloads in parallel with YouTube (they're independent)
    // Use strict-filtered citations for images to avoid wrong-person photos
    console.time("[Timing] Image candidates + YouTube"); _ts("imgAndYT");
    const imageCandidatesPromise = exaCitationsStrict.length
      ? prepareImageCandidates(exaCitationsStrict, artist, safeSpotifyArtistImageUrl)
      : (safeSpotifyArtistImageUrl
          ? prepareImageCandidates([], artist, safeSpotifyArtistImageUrl)
          : Promise.resolve([] as ImageCandidate[]));

    // YouTube search + transcripts only on repeat listens (listenCount >= 2).
    // First listen uses Exa (if configured) or Gemini + Google Search grounding alone.
    let videos: YTVideo[] = [];
    const transcripts = new Map<string, string>();

    if (safeListenCount >= 2) {
      // Step 1: Search YouTube for interviews/breakdowns
      try {
        const searchQuery = `"${artist}" "${title}" interview OR breakdown OR behind the scenes`;
        videos = await searchYouTube(searchQuery, YOUTUBE_API_KEY);
      } catch (e) {
        console.warn("YouTube search skipped:", e);
      }

      console.log(`Found ${videos.length} YouTube videos for "${artist} - ${title}"`);

      // Step 2: Fetch transcripts in parallel (top 3)
      if (videos.length > 0) {
        const results = await Promise.allSettled(
          videos.slice(0, 3).map(async (v) => {
            const t = await fetchTranscript(v.videoId);
            return { videoId: v.videoId, transcript: t };
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.transcript) {
            transcripts.set(r.value.videoId, r.value.transcript);
          }
        }
      }
      console.log(`Fetched ${transcripts.size} transcripts`);
    } else {
      console.log(`First listen — skipping YouTube search, Gemini + grounding only`);
    }

    // Step 3: Generate nuggets with Gemini + Google Search grounding
    const [imageCandidates, resolvedSpotifyInfo, resolvedLastFmSimilar, resolvedLastFmTags] = await Promise.all([
      imageCandidatesPromise,
      spotifyInfoPromise,
      lastFmSimilarPromise,
      lastFmTagsPromise,
    ]);
    console.timeEnd("[Timing] Image candidates + YouTube"); _te("imgAndYT");
    checkTimeout();
    if (resolvedSpotifyInfo) {
      console.log(`[Spotify] Genres: ${resolvedSpotifyInfo.genres.join(", ") || "none"}`);
    }
    if (resolvedLastFmSimilar.length > 0) {
      console.log(`[Last.fm] Similar: ${resolvedLastFmSimilar.slice(0, 5).map(a => a.name).join(", ")}`);
    }
    if (resolvedLastFmTags.length > 0) {
      console.log(`[Last.fm] Tags: ${resolvedLastFmTags.join(", ")}`);
    }
    // Detect sparse data: if very few strict citations mention the artist, tell Gemini to be conservative
    const isSparseData = exaCitationsStrict.length <= 2;
    if (isSparseData) {
      console.log(`[SparseData] Only ${exaCitationsStrict.length} strict citations — enabling conservative mode`);
    }
    let rawNuggets: any[];
    let groundingChunks: any[];
    let artistSummary = "";
    let noTrackData = false;
    console.time("[Timing] Gemini (Curator + Writer)"); _ts("gemini");
    try {
      const _tracker = { ts: _ts, te: _te };
      const result = await generateWithGemini(
        artist, title, album, videos, transcripts, GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier, safeTopArtists, safeTopTracks,
        exaPromptContext, exaCitations, imageCandidates, isSparseData, resolvedSpotifyInfo, resolvedLastFmSimilar, resolvedLastFmTags,
        trackSearchSkipped, discoverySearchSkipped, _tracker
      );
      rawNuggets = result.nuggets;
      groundingChunks = result.groundingChunks;
      artistSummary = result.artistSummary;
      noTrackData = !!result.noTrackData;
    } catch (e) {
      if (e instanceof RecitationError) {
        console.log("Retrying without transcripts to avoid RECITATION block...");
        const result = await generateWithGemini(
          artist, title, album, videos, new Map(), GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier, safeTopArtists, safeTopTracks,
          exaPromptContext, exaCitations, imageCandidates, isSparseData, resolvedSpotifyInfo, resolvedLastFmSimilar, resolvedLastFmTags,
          trackSearchSkipped, discoverySearchSkipped, _tracker
        );
        rawNuggets = result.nuggets;
        groundingChunks = result.groundingChunks;
        artistSummary = result.artistSummary;
        noTrackData = !!result.noTrackData;
      } else {
        throw e;
      }
    }
    console.timeEnd("[Timing] Gemini (Curator + Writer)"); _te("gemini");
    checkTimeout();

    console.log(`[Grounding] ${groundingChunks.length} chunks for "${artist} - ${title}":`,
      groundingChunks.map((c: any) => ({ title: c?.web?.title, uri: c?.web?.uri })));

    // Enforce kind order: [artist, track|context, discovery]
    // Gemini sometimes returns wrong kinds — force them based on position
    const expectedKinds = ["artist", noTrackData ? "context" : "track", "discovery"];
    for (let i = 0; i < rawNuggets.length && i < 3; i++) {
      if (rawNuggets[i].kind !== expectedKinds[i]) {
        console.log(`[KindFix] Nugget ${i}: "${rawNuggets[i].kind}" → "${expectedKinds[i]}"`);
        rawNuggets[i].kind = expectedKinds[i];
      }
    }

    // Step 3.5: Resolve images for each nugget
    // Priority: 1) Gemini visually selected image (selectedImageLabel) — multimodal inspection
    //           2) Gemini text-selected Exa image (selectedImageUrl) — URL-based fallback
    //           3) Wikipedia/Commons via Gemini's imageSearchQuery — specific thing search
    //           4) Exa citation fallback — any unused Exa image from same group
    //           5) Frontend falls back to Spotify album art
    const usedImageUrls = new Set<string>();

    // Build label→URL map from image candidates for multimodal resolution
    const imageLabelMap = new Map<string, { sourceUrl: string; citTitle: string }>();
    for (const c of imageCandidates) {
      imageLabelMap.set(c.label, { sourceUrl: c.sourceUrl, citTitle: c.citTitle });
    }

    // First pass: resolve image labels (multimodal) or selectedImageUrl (text-only fallback)
    for (let i = 0; i < rawNuggets.length; i++) {
      // Multimodal path: Gemini visually selected an image by label
      const selectedLabel = rawNuggets[i].selectedImageLabel;
      if (selectedLabel && imageLabelMap.has(selectedLabel)) {
        const { sourceUrl, citTitle } = imageLabelMap.get(selectedLabel)!;
        if (!usedImageUrls.has(sourceUrl) && !isGarbageImage(sourceUrl)) {
          rawNuggets[i]._resolvedImageUrl = sourceUrl;
          rawNuggets[i]._resolvedImageTitle = rawNuggets[i].imageCaption || citTitle;
          usedImageUrls.add(sourceUrl);
          console.log(`[Image] Gemini visually selected ${selectedLabel} for nugget ${i}: ${sourceUrl}`);
          continue;
        }
      }

      // Legacy text-only fallback: Gemini guessed from URL text
      const selectedUrl = rawNuggets[i].selectedImageUrl;
      if (selectedUrl && !usedImageUrls.has(selectedUrl) && !isGarbageImage(selectedUrl) && isActualImageUrl(selectedUrl)) {
        rawNuggets[i]._resolvedImageUrl = selectedUrl;
        rawNuggets[i]._resolvedImageTitle = rawNuggets[i].imageCaption || "";
        usedImageUrls.add(selectedUrl);
        console.log(`[Image] Gemini selected Exa image for nugget ${i}: ${selectedUrl}`);
      } else if (selectedUrl && !isActualImageUrl(selectedUrl)) {
        console.log(`[Image] Rejected non-image URL for nugget ${i}: ${selectedUrl}`);
      }
    }

    // Genre context for Wikipedia disambiguation (e.g., "Stardust French house musician" vs "Stardust musician" → Alvin Stardust)
    const genreCtx = resolvedLastFmTags.length > 0 ? ` ${resolvedLastFmTags[0]}` : "";

    // Second pass: for nuggets without a Gemini-selected image, search Wikipedia/Commons
    for (const n of rawNuggets) {
      if (n._resolvedImageUrl) continue;
      if (!n.imageSearchQuery) {
        // Generate fallback search queries — try to extract specific subjects from nugget text
        const text = (n.text || "") + " " + (n.headline || "");

        if (n.kind === "discovery") {
          // For discovery: find the recommended artist name, add genre for disambiguation
          const recMatch = text.match(/(?:check out|explore|listen to|hear|dive into|recommend)\s+(?:the\s+)?(?:work of\s+)?(?:the\s+)?([A-Z][\w\s'.&-]+?)(?:\s*[,.'!?]|\s+(?:is|has|was|who|whose|crafts|creates|offers|shares|brings|excels|operates))/i);
          n.imageSearchQuery = recMatch ? `${recMatch[1].trim()}${genreCtx} musician` : `${artist} related artists`;
          n.imageCaption = n.imageCaption || "Recommended artist";
        } else {
          // For artist/track nuggets: look for specific subjects (people, instruments, places, gear)
          const personMatch = text.match(/(?:engineer|producer|drummer|guitarist|bassist|collaborator|designer|director)\s+([A-Z][\w\s'.]+?)(?:\s*[,.]|\s+(?:who|has|was|is|reveals|confirms|stated))/i);
          const gearMatch = text.match(/\b((?:Fender|Gibson|Moog|Roland|Korg|Yamaha|Neve|SSL|Toft|Ondes Martenot|Rhodes|Wurlitzer|Mellotron|Prophet|Juno|Jupiter|TR-808|TR-909|MPC|SP-404|Fairlight|Synclavier)[\w\s-]*(?:Stratocaster|Telecaster|Les Paul|SG|ES-335|Minimoog|Jazzmaster|Jaguar|Mustang|Bass|Piano|Synthesizer|Synth|Drum Machine|Sampler|Console|Desk)?)/i);
          const placeMatch = text.match(/\b(Abbey Road Studios?|Electric Lady Studios?|Sunset Sound|Sound City|Muscle Shoals|Trident Studios?|Olympic Studios?|AIR Studios?|Rockfield Studios?|Glastonbury|Ether Festival|Madison Square Garden|Royal Albert Hall|Wembley|Red Rocks)\b/i);
          const albumArtMatch = text.match(/album (?:art|cover|sleeve|artwork)/i);

          if (personMatch) {
            n.imageSearchQuery = `${personMatch[1].trim()}`;
            n.imageCaption = n.imageCaption || personMatch[1].trim();
          } else if (gearMatch) {
            n.imageSearchQuery = gearMatch[1].trim();
            n.imageCaption = n.imageCaption || gearMatch[1].trim();
          } else if (placeMatch) {
            n.imageSearchQuery = placeMatch[1].trim();
            n.imageCaption = n.imageCaption || placeMatch[1].trim();
          } else if (albumArtMatch) {
            n.imageSearchQuery = `${album || title} album cover ${artist}`;
            n.imageCaption = n.imageCaption || `${album || title} album artwork`;
          } else if (n.kind === "artist") {
            // Include album/genre for disambiguation when artist names may collide
            const albumHint = album ? ` "${album}"` : "";
            n.imageSearchQuery = `${artist}${albumHint}${genreCtx} musician`;
            n.imageCaption = n.imageCaption || artist;
          } else {
            n.imageSearchQuery = `${artist} "${title}" song`;
            n.imageCaption = n.imageCaption || `${title} by ${artist}`;
          }
        }
      }
    }
    console.time("[Timing] Wiki image resolution"); _ts("wikiImages");
    const wikiSearchNeeded = rawNuggets.map((n) =>
      !n._resolvedImageUrl && n.imageSearchQuery ? resolveNuggetImage(n.imageSearchQuery) : Promise.resolve(null)
    );
    const wikiResults = await Promise.allSettled(wikiSearchNeeded);
    console.timeEnd("[Timing] Wiki image resolution"); _te("wikiImages");
    for (let i = 0; i < rawNuggets.length; i++) {
      if (rawNuggets[i]._resolvedImageUrl) continue;
      const result = wikiResults[i];
      if (result.status === "fulfilled" && result.value && !usedImageUrls.has(result.value.url)) {
        rawNuggets[i]._resolvedImageUrl = result.value.url;
        rawNuggets[i]._resolvedImageTitle = result.value.title;
        usedImageUrls.add(result.value.url);
        console.log(`[Image] Wikipedia for nugget ${i} "${rawNuggets[i].imageSearchQuery}" → ${result.value.url}`);
      }
    }

    // Third pass: fallback to any unused strict-filtered Exa citation image.
    // First try same group, then try ANY group (cross-group sharing for indie artists
    // where track/discovery searches return no images but artist search is rich).
    if (exaCitationsStrict.length) {
      for (let i = 0; i < rawNuggets.length; i++) {
        if (rawNuggets[i]._resolvedImageUrl) continue;
        const groupStart = i * 10;
        const groupEnd = groupStart + 10;
        // Try same group first
        let fallbackCit = exaCitationsStrict.find((c) =>
          c.citIndex >= groupStart && c.citIndex < groupEnd &&
          c.imageUrl && !usedImageUrls.has(c.imageUrl) && !isGarbageImage(c.imageUrl) && isActualImageUrl(c.imageUrl)
        );
        // Cross-group: try any strict citation with an image (artist photos work for any nugget)
        if (!fallbackCit) {
          fallbackCit = exaCitationsStrict.find((c) =>
            c.imageUrl && !usedImageUrls.has(c.imageUrl) && !isGarbageImage(c.imageUrl) && isActualImageUrl(c.imageUrl)
          );
        }
        if (fallbackCit?.imageUrl) {
          rawNuggets[i]._resolvedImageUrl = fallbackCit.imageUrl;
          rawNuggets[i]._resolvedImageTitle = fallbackCit.title;
          usedImageUrls.add(fallbackCit.imageUrl);
          const crossGroup = fallbackCit.citIndex < groupStart || fallbackCit.citIndex >= groupEnd;
          console.log(`[Image] Exa fallback${crossGroup ? " (cross-group)" : ""} for nugget ${i}: ${fallbackCit.imageUrl}`);
        } else {
          console.log(`[Image] No image for nugget ${i} — frontend will use album art`);
        }
      }
    }

    // Step 4: Assemble response with real video IDs and grounding-sourced URLs
    // Filter grounding chunks once for reuse across all nuggets
    const realChunks = groundingChunks.filter((chunk: any) => {
      const uri = (chunk?.web?.uri || "").toLowerCase();
      const chunkTitle = (chunk?.web?.title || "").toLowerCase();
      return uri && !chunkTitle.includes("vertex ai") && !chunkTitle.includes("grounding api");
    });

    // Helper: strip leaked citation markers like [CIT 0], [CIT 1, CIT 2] from text
    const stripCitMarkers = (s: string) => s.replace(/\s*\[CIT\s*\d+(?:\s*,\s*CIT\s*\d+)*\]/gi, "").trim();
    // Helper: clean malformed image URLs (strip embedded markdown link syntax like `](url)`)
    const cleanImageUrl = (url: string) => url.replace(/\]\(https?:\/\/.*$/, "").replace(/[)\]}>'"\\]+$/, "");

    const nuggets = rawNuggets.map((n) => {
      const source = n.source || {};
      const result: any = {
        headline: stripCitMarkers(n.headline || ""),
        text: stripCitMarkers(n.text || ""),
        kind: n.kind,
        listenFor: n.listenFor,
        source: {
          type: source.type || "article",
          title: source.title || `${title} by ${artist}`,
          publisher: source.publisher || "Unknown",
          quoteSnippet: source.quoteSnippet || "",
          locator: source.locator,
        },
      };

      // Contextual image resolved from Wikipedia/Commons or Exa
      if (n._resolvedImageUrl) {
        const cleaned = cleanImageUrl(n._resolvedImageUrl);
        if (isActualImageUrl(cleaned) || cleaned.includes("wikipedia.org") || cleaned.includes("wikimedia.org")) {
          result.imageUrl = cleaned;
          result.imageCaption = n.imageCaption || n._resolvedImageTitle || n.imageSearchQuery;
        } else {
          console.log(`[Image] Final check rejected non-image URL for "${n.headline?.slice(0, 40)}": ${cleaned}`);
        }
      }

      // Exa citation resolution — citIndex maps directly to verified URL
      if (exaCitations?.length && source.citIndex != null) {
        const cit = exaCitations.find((c) => c.citIndex === source.citIndex);
        if (cit) {
          result.source.url = cit.url;
          if (cit.title) result.source.title = cit.title;
          result.source.verified = true;
        }
      }

      // Fallback: Gemini didn't use citIndex but Exa citations exist
      if (!result.source.url && exaCitations?.length) {
        const pubLower = (source.publisher || "").toLowerCase();
        const titleLower = (source.title || "").toLowerCase();
        const match = exaCitations.find((c) =>
          (pubLower && c.title.toLowerCase().includes(pubLower)) ||
          (pubLower && c.url.toLowerCase().includes(pubLower)) ||
          (titleLower && c.title.toLowerCase().includes(titleLower))
        );
        if (match) {
          result.source.url = match.url;
          result.source.title = match.title;
          result.source.verified = true;
        }
      }

      // YouTube sources — use verified video IDs
      if (source.type === "youtube" && source.videoIndex != null) {
        const video = videos[source.videoIndex];
        if (video) {
          result.source.embedId = video.videoId;
          result.source.url = `https://www.youtube.com/watch?v=${video.videoId}`;
          result.source.verified = true;
        }
      }

      // For non-YouTube sources, resolve URL from grounding chunks (trusted) first,
      // then Gemini's sourceUrl only if it matches grounding. Never serve unverified Gemini URLs.
      if (!result.source.url) {
        const geminiUrl = source.sourceUrl || "";
        let geminiHost = "";
        try { if (geminiUrl) geminiHost = new URL(geminiUrl).hostname; } catch { /* invalid */ }

        // Try to match Gemini's URL domain against grounding chunks
        if (geminiHost) {
          const match = realChunks.find((chunk: any) => {
            try { return new URL(chunk.web.uri).hostname === geminiHost; } catch { return false; }
          });
          if (match) {
            result.source.url = match.web.uri;
            if (match.web.title) result.source.title = match.web.title;
            result.source.verified = true;
          }
        }

        // No domain match — use best grounding chunk that mentions the artist (from Google Search)
        if (!result.source.url && realChunks.length > 0) {
          const artistLower = artist.toLowerCase();
          const pubLower = (source.publisher || "").toLowerCase();
          // Only use chunks that mention the artist — prevents marking Brian Eno/Omar-S articles as verified Pete Rango sources
          const relevantChunk = realChunks.find((chunk: any) => {
            const chunkTitle = (chunk?.web?.title || "").toLowerCase();
            const chunkUri = (chunk?.web?.uri || "").toLowerCase();
            return pubLower && (chunkTitle.includes(pubLower) || chunkUri.includes(pubLower)) &&
                   (wordBoundaryMatch(chunkTitle, artistLower) || wordBoundaryMatch(chunkUri, artistLower));
          }) || realChunks.find((chunk: any) => {
            const chunkTitle = (chunk?.web?.title || "").toLowerCase();
            const chunkUri = (chunk?.web?.uri || "").toLowerCase();
            return wordBoundaryMatch(chunkTitle, artistLower) || wordBoundaryMatch(chunkUri, artistLower);
          });
          // No blind fallback to realChunks[0] — that causes wrong-article contamination.

          if (relevantChunk) {
            result.source.url = relevantChunk.web.uri;
            if (relevantChunk.web.title) result.source.title = relevantChunk.web.title;
            result.source.verified = true;
          }
        }

        // Final fallback — targeted Google Search so the user can find the real page
        if (!result.source.url) {
          const q = `${source.title || ""} ${source.publisher || ""} ${artist} ${title}`.trim();
          result.source.url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
          result.source.verified = false;
        }
      }

      return result;
    });

    // Build external links from strict-filtered Exa citations only
    // (must mention artist name — prevents Diana Ross, Slackers, etc. from becoming links)
    const externalLinks: { label: string; url: string }[] = [];
    if (exaCitationsStrict.length) {
      const seenDomains = new Set<string>();
      for (const cit of exaCitationsStrict) {
        try {
          const domain = new URL(cit.url).hostname.replace(/^www\./, "");
          if (!seenDomains.has(domain) && externalLinks.length < 5) {
            seenDomains.add(domain);
            externalLinks.push({ label: cit.title || domain, url: cit.url });
          }
        } catch { /* skip invalid URLs */ }
      }
    }
    // Add Wikipedia fallback only if Exa found a Wikipedia citation for this artist
    // (avoids fabricating Wikipedia links for indie/unknown artists who don't have pages)
    if (!externalLinks.some(l => l.url.includes("wikipedia.org"))) {
      // Check if any Exa citation came from Wikipedia AND mentions the artist
      const wikiCit = exaCitations?.find(c =>
        c.url.includes("wikipedia.org") &&
        c.title.toLowerCase().includes(artist.toLowerCase())
      );
      if (wikiCit) {
        externalLinks.push({ label: `${artist} — Wikipedia`, url: wikiCit.url });
      }
    }

    // ── Fix 4: Post-generation source validation ──────────────────────
    // Filter out nuggets with hallucinated/invalid source types or publishers.
    // This is the last line of defense — catches anything the validator retry missed.
    const validatedNuggets = nuggets.filter((n: any) => {
      const sourceType = (n.source?.type || "").toLowerCase();
      const publisher = (n.source?.publisher || "").toLowerCase();
      // Reject hallucinated source types
      if (sourceType === "internal-data" || sourceType === "internal_data" || sourceType === "database" || sourceType === "editorial") {
        console.log(`[SourceFilter] Removed nugget "${n.headline?.slice(0, 50)}" — hallucinated source type "${sourceType}"`);
        return false;
      }
      // Reject hallucinated publishers
      if (HALLUCINATED_PUBLISHERS.some(hp => publisher.includes(hp))) {
        console.log(`[SourceFilter] Removed nugget "${n.headline?.slice(0, 50)}" — hallucinated publisher "${n.source?.publisher}"`);
        return false;
      }
      return true;
    });

    if (validatedNuggets.length < nuggets.length) {
      console.log(`[SourceFilter] Filtered ${nuggets.length - validatedNuggets.length} nuggets with hallucinated sources (${validatedNuggets.length} remaining)`);
    }

    _timings.total = Date.now() - functionStartTime;
    console.timeEnd("[Timing] TOTAL");
    console.log(`[Timing] Breakdown:`, JSON.stringify(_timings));
    return new Response(JSON.stringify({ nuggets: validatedNuggets, artistSummary, externalLinks, noTrackData, _timings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.timeEnd("[Timing] TOTAL");
    console.error("generate-nuggets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
