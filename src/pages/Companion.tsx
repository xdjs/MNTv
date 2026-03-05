import { useParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTrackById, getArtistById } from "@/mock/tracks";
import { useArtistImage } from "@/hooks/useArtistImage";
import { useUserProfile, tierGlowClass } from "@/hooks/useMusicNerdState";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Music, BookOpen, Play } from "lucide-react";
import CompanionNuggetCard from "@/components/companion/CompanionNuggetCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import type { CompanionNugget } from "@/mock/types";

interface CompanionData {
  artistSummary: string;
  trackStory: string;
  nuggets: CompanionNugget[];
  externalLinks: { label?: string; name?: string; url: string }[];
  coverArtUrl?: string;
  artistImage?: string;
}

const SECTIONS: { key: CompanionNugget["category"]; label: string; color: string }[] = [
  { key: "track", label: "The Track", color: "bg-blue-500/20 text-blue-400" },
  { key: "history", label: "History", color: "bg-primary/20 text-primary" },
  { key: "explore", label: "Explore Next", color: "bg-emerald-500/20 text-emerald-400" },
];

export default function Companion() {
  const { trackId: rawTrackId } = useParams<{ trackId: string }>();

  // ── Real track support (same pattern as Listen.tsx) ──────────────
  const isRealTrack = rawTrackId?.startsWith("real%3A%3A") || rawTrackId?.startsWith("real::");
  const realTrackMeta = useMemo(() => {
    if (!isRealTrack || !rawTrackId) return null;
    const decoded = decodeURIComponent(rawTrackId);
    const parts = decoded.split("::");
    return {
      artist: parts[1] || "",
      title: parts[2] || "",
      album: parts[3] || undefined,
    };
  }, [isRealTrack, rawTrackId]);

  const { profile } = useUserProfile();

  const [data, setData] = useState<CompanionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve track + artist data
  const mockTrack = useMemo(() => getTrackById(rawTrackId || ""), [rawTrackId]);
  const mockArtist = mockTrack ? getArtistById(mockTrack.artistId) : undefined;

  const trackInfo = useMemo(() => {
    if (mockTrack) {
      return {
        title: mockTrack.title,
        artist: mockTrack.artist,
        album: mockTrack.album,
        coverArtUrl: mockTrack.coverArtUrl,
      };
    }
    if (realTrackMeta) {
      // Try to get cover art: cached from companion data > profile > DiceBear fallback
      let coverArtUrl = data?.coverArtUrl || "";
      if (!coverArtUrl && profile?.spotifyTrackImages) {
        const match = profile.spotifyTrackImages.find(
          (t) =>
            t.title.toLowerCase() === realTrackMeta.title.toLowerCase() &&
            t.artist.toLowerCase() === realTrackMeta.artist.toLowerCase()
        );
        if (match?.imageUrl) coverArtUrl = match.imageUrl;
      }
      if (!coverArtUrl && profile?.spotifyArtistImages?.[realTrackMeta.artist]) {
        coverArtUrl = profile.spotifyArtistImages[realTrackMeta.artist];
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
  }, [mockTrack, realTrackMeta, data?.coverArtUrl, profile?.spotifyTrackImages, profile?.spotifyArtistImages]);

  const artistName = trackInfo?.artist || "";
  const artistFallbackImage = data?.artistImage || mockArtist?.imageUrl || profile?.spotifyArtistImages?.[artistName] || "";
  const artistImage = useArtistImage(artistName, artistFallbackImage);
  const artistGenres = mockArtist?.genres || [];
  const artistBio = mockArtist?.bio || "";

  const tier = profile?.calculatedTier ?? "casual";
  const glowClass = tierGlowClass(tier);

  useEffect(() => {
    if (!trackInfo) return;

    async function fetchCompanion() {
      setLoading(true);
      setError(null);

      try {
        // Always use listenCount 1 — RLS blocks unauthenticated reads of
        // nugget_history, and the pre-gen from Listen.tsx uses the same count
        // for the first listen. This guarantees a cache hit.
        const serverListenCount = 1;

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
  }, [rawTrackId, tier]);

  if (!trackInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">Track not found.</p>
      </div>
    );
  }

  // Filter + sort nuggets for a section
  function getSectionNuggets(category: CompanionNugget["category"]): CompanionNugget[] {
    if (!data?.nuggets) return [];
    return data.nuggets
      .filter((n) => n.category === category)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  return (
    <div className={`min-h-screen bg-background ${glowClass}`} style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <MusicNerdLogo size={32} />
        <span className="text-sm font-bold text-foreground/70 tracking-wide">MUSICNERD</span>
        <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full ${
          tier === "nerd" ? "bg-pink-500/20 text-pink-400" :
          tier === "curious" ? "bg-blue-500/20 text-blue-400" :
          "bg-green-500/20 text-green-400"
        }`}>
          {tier === "nerd" ? "● Nerd Mode" : tier === "curious" ? "● Curious" : "● Casual"}
        </span>
      </header>

      {/* Artist Hero */}
      <div className="relative w-full aspect-[16/9] overflow-hidden">
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

            {/* Track Story */}
            {data.trackStory && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-2">About This Track</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">{data.trackStory}</p>
              </section>
            )}

            {/* Three categorized sections */}
            {SECTIONS.map(({ key, label, color }) => {
              const visible = getSectionNuggets(key);
              if (visible.length === 0) return null;
              return (
                <section key={key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${color}`}>{label}</span>
                  </div>
                  {visible.map((nugget) => (
                    <ErrorBoundary key={nugget.id}>
                      <CompanionNuggetCard nugget={nugget} />
                    </ErrorBoundary>
                  ))}
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
