import { useParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useArtistImage } from "@/hooks/useArtistImage";
import { useUserProfile, tierGlowClass, tierBadgeColor, tierBadgeLabel } from "@/hooks/useMusicNerdState";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Music, BookOpen, Play } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import type { CompanionNugget } from "@/mock/types";

interface CompanionData {
  artistSummary: string;
  nuggets: CompanionNugget[];
  externalLinks: { label?: string; name?: string; url: string }[];
  coverArtUrl?: string;
  artistImage?: string;
}

const SECTIONS: { key: CompanionNugget["category"]; label: string; color: string }[] = [
  { key: "track", label: "The Track", color: "bg-blue-500/20 text-blue-400" },
  { key: "context", label: "Behind the Music", color: "bg-amber-500/20 text-amber-400" },
  { key: "history", label: "History", color: "bg-primary/20 text-primary" },
  { key: "explore", label: "Explore Next", color: "bg-emerald-500/20 text-emerald-400" },
];

export default function Companion() {
  const { trackId: rawTrackId } = useParams<{ trackId: string }>();

  // ── Real track support (same pattern as Listen.tsx) ──────────────
  const realTrackMeta = useMemo(() => {
    if (!rawTrackId?.startsWith("real%3A%3A") && !rawTrackId?.startsWith("real::")) return null;
    const decoded = decodeURIComponent(rawTrackId);
    const parts = decoded.split("::");
    return {
      artist: parts[1] || "",
      title: parts[2] || "",
      album: parts[3] || undefined,
    };
  }, [rawTrackId]);

  const { profile } = useUserProfile();

  // Read tier and listen count from URL search params (set by QR code from Listen page)
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const urlTier = useMemo(() => {
    const t = urlParams.get("tier");
    return (t === "casual" || t === "curious" || t === "nerd") ? t : null;
  }, [urlParams]);
  const urlListenCount = useMemo(() => {
    const l = parseInt(urlParams.get("listen") || "1", 10);
    return Number.isFinite(l) && l >= 1 ? l : 1;
  }, [urlParams]);

  const [data, setData] = useState<CompanionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Resolve track + artist data
  const trackInfo = useMemo(() => {
    if (realTrackMeta) {
      // Try to get cover art: cached from companion data > profile > DiceBear fallback
      let coverArtUrl = data?.coverArtUrl || "";
      if (!coverArtUrl && profile?.trackImages) {
        const match = profile.trackImages.find(
          (t) =>
            t.title.toLowerCase() === realTrackMeta.title.toLowerCase() &&
            t.artist.toLowerCase() === realTrackMeta.artist.toLowerCase()
        );
        if (match?.imageUrl) coverArtUrl = match.imageUrl;
      }
      if (!coverArtUrl && profile?.artistImages?.[realTrackMeta.artist]) {
        coverArtUrl = profile.artistImages[realTrackMeta.artist];
      }
      if (!coverArtUrl) {
        coverArtUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(realTrackMeta.artist + realTrackMeta.title)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
      }
      return {
        title: realTrackMeta.title,
        artist: realTrackMeta.artist,
        album: realTrackMeta.album,
        coverArtUrl,
      };
    }
    return null;
  }, [realTrackMeta, data?.coverArtUrl, profile?.trackImages, profile?.artistImages]);

  const artistName = trackInfo?.artist || "";
  const artistFallbackImage = data?.artistImage || profile?.artistImages?.[artistName] || "";
  const artistImage = useArtistImage(artistName, artistFallbackImage);

  const artistGenres: string[] = [];
  const artistBio = "";

  const tier = urlTier || (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";
  const glowClass = tierGlowClass(tier);

  useEffect(() => {
    if (!trackInfo) return;

    async function fetchCompanion() {
      setLoading(true);
      setError(null);

      try {
        // Use the listen count from the QR URL so the companion page fetches
        // the correct depth tier from the cache (pre-gen'd by Listen.tsx).
        const serverListenCount = urlListenCount;

        console.log("[Companion] Fetching:", { artist: trackInfo!.artist, title: trackInfo!.title, tier });

        const { data: companionData, error: fnError } = await supabase.functions.invoke(
          "generate-companion",
          {
            body: {
              artist: trackInfo!.artist,
              title: trackInfo!.title,
              album: trackInfo!.album,
              listenCount: serverListenCount,
              tier,
            },
          }
        );

        console.log("[Companion] Response:", { data: !!companionData, error: fnError });

        if (fnError) throw new Error(fnError.message);
        if (!companionData) throw new Error("No data returned from companion API");
        if (companionData.error) throw new Error(companionData.error);
        setData(companionData as CompanionData);
      } catch (e) {
        console.error("Companion fetch error:", e);
        setError(e instanceof Error ? e.message : "Failed to load content");
      } finally {
        setLoading(false);
      }
    }

    fetchCompanion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTrackId, tier, retryKey]);

  if (!trackInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">Track not found.</p>
      </div>
    );
  }

  // Derive effective listen count from the data — the cache may return a higher
  // tier than the URL requested, so use the max across URL param and nugget data.
  const effectiveListenCount = useMemo(() => {
    if (!data?.nuggets?.length) return urlListenCount;
    const maxFromData = Math.max(...data.nuggets.map((n) => n.listenUnlockLevel || 1));
    return Math.max(urlListenCount, maxFromData);
  }, [data?.nuggets, urlListenCount]);

  // Enrich nuggets with fallback images when the edge function returned none.
  // Mirrors the logic in useAINuggets.ts so companion cards aren't blank.
  const enrichedNuggets = useMemo(() => {
    if (!data?.nuggets) return [];
    const coverArt = trackInfo?.coverArtUrl;
    const artistImg = artistImage;
    const isReal = (url?: string) => url && !url.includes("dicebear.com");

    return data.nuggets.map((n) => {
      if (n.imageUrl) return n;
      if ((n.category === "history" || n.category === "context") && isReal(artistImg)) {
        return { ...n, imageUrl: artistImg, imageCaption: artistName };
      }
      if ((n.category === "track" || n.category === "explore") && isReal(coverArt)) {
        return { ...n, imageUrl: coverArt, imageCaption: n.category === "track" ? trackInfo?.title : n.headline };
      }
      return n;
    });
  }, [data?.nuggets, trackInfo?.coverArtUrl, trackInfo?.title, artistImage, artistName]);

  // Return nuggets for a section — show all nuggets up to the effective listen count.
  // Newer listens (higher listenUnlockLevel) appear first so fresh content is prominent.
  function getSectionNuggets(category: CompanionNugget["category"]): CompanionNugget[] {
    if (!enrichedNuggets.length) return [];
    return enrichedNuggets
      .filter((n) => n.category === category && (n.listenUnlockLevel || 1) <= effectiveListenCount)
      .sort((a, b) => {
        const levelDiff = (b.listenUnlockLevel || 1) - (a.listenUnlockLevel || 1);
        if (levelDiff !== 0) return levelDiff;
        return b.timestamp - a.timestamp;
      });
  }

  return (
    <div className={`min-h-screen bg-background ${glowClass}`} style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <MusicNerdLogo size={32} />
        <span className="text-sm font-bold text-foreground/70 tracking-wide">MUSICNERD</span>
        <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full ${tierBadgeColor(tier)}`}>
          ● {tierBadgeLabel(tier)}
        </span>
      </header>

      {/* Artist Hero */}
      <div className="relative w-full aspect-[3/1] max-h-[200px] overflow-hidden">
        {artistImage ? (
          <img
            src={artistImage}
            alt={artistName}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full bg-foreground/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="px-5 pb-12 -mt-16 relative z-10 space-y-6 max-w-2xl mx-auto">
        {/* Artist Info */}
        <section>
          <h1 className="text-3xl font-black text-foreground leading-tight">{artistName}</h1>
          {artistGenres.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {artistGenres.map((g) => (
                <span key={g} className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">
                  {g}
                </span>
              ))}
            </div>
          )}
          {artistBio && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{artistBio}</p>}
        </section>

        {/* Track Details */}
        <section className="apple-glass rounded-2xl p-4 flex items-center gap-4">
          <img src={trackInfo.coverArtUrl} alt={trackInfo.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{trackInfo.title}</h2>
            {trackInfo.album && <p className="text-sm text-muted-foreground truncate">{trackInfo.album}</p>}
          </div>
        </section>

        {/* Loading */}
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="apple-glass rounded-2xl p-6 text-center">
            <p className="text-destructive font-semibold">Something went wrong</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="mt-4 px-4 py-2 rounded-full bg-primary/20 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : data ? (
          <ErrorBoundary fallback={
            <div className="apple-glass rounded-2xl p-6 text-center">
              <p className="text-muted-foreground font-semibold">Something went wrong displaying content</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Try refreshing the page.</p>
            </div>
          }>
          <div className="space-y-8">
            {/* Artist Summary */}
            {data.artistSummary && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-2">About the Artist</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">{data.artistSummary}</p>
              </section>
            )}

            {/* Three categorized sections — nuggets in a scrollable card per section */}
            {SECTIONS.map(({ key, label, color }) => {
              const visible = getSectionNuggets(key);
              if (visible.length === 0) return null;

              return (
                <section key={key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${color}`}>{label}</span>
                    {visible.length > 1 && (
                      <span className="text-[10px] text-muted-foreground/60">{visible.length} insights · swipe →</span>
                    )}
                  </div>
                  <div className="apple-glass rounded-2xl overflow-hidden">
                    <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                      {visible.map((nugget, idx) => (
                        <div
                          key={nugget.id}
                          className={`flex-none w-full snap-center p-4 space-y-3 ${idx > 0 ? "border-l border-foreground/5" : ""}`}
                        >
                          <ErrorBoundary>
                            {nugget.imageUrl && (
                              <div className="-mx-4 -mt-4 mb-3">
                                <img
                                  src={nugget.imageUrl}
                                  alt={nugget.imageCaption || nugget.headline || ""}
                                  className="w-full object-contain max-h-44"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                                {nugget.imageCaption && (
                                  <p className="px-4 py-1.5 text-xs text-muted-foreground italic">{nugget.imageCaption}</p>
                                )}
                              </div>
                            )}
                            {nugget.headline && (
                              <p className="text-sm font-bold text-foreground leading-snug">{nugget.headline}</p>
                            )}
                            {nugget.text && (
                              <p className="text-sm text-foreground/75 leading-relaxed">{nugget.text}</p>
                            )}
                            {nugget.sourceUrl && nugget.sourceName && (
                              <a
                                href={nugget.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/8 border border-foreground/10 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <ExternalLink size={11} />
                                {nugget.sourceName}
                              </a>
                            )}
                            {visible.length > 1 && (
                              <p className="text-[10px] text-muted-foreground/40 text-right">{idx + 1} / {visible.length}</p>
                            )}
                          </ErrorBoundary>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}

            {/* External Links */}
            {data.externalLinks?.length > 0 && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-3">Explore Further</h3>
                <div className="space-y-2">
                  {data.externalLinks.map((link, i) => {
                    const linkLabel = link.label || link.name || "Link";
                    const Icon =
                      linkLabel.toLowerCase().includes("wiki") ? BookOpen :
                      linkLabel.toLowerCase().includes("youtube") ? Play :
                      Music;
                    return (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl apple-glass hover:bg-foreground/10 transition-colors"
                      >
                        <Icon size={18} className="text-primary shrink-0" />
                        <span className="text-sm font-semibold text-foreground/80">{linkLabel}</span>
                        <ExternalLink size={14} className="ml-auto text-muted-foreground" />
                      </a>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
          </ErrorBoundary>
        ) : (
          <div className="apple-glass rounded-2xl p-6 text-center">
            <p className="text-muted-foreground font-semibold">Content unavailable</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Try refreshing the page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
