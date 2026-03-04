import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTrackById, getArtistById } from "@/mock/tracks";
import { useArtistImage } from "@/hooks/useArtistImage";
import { useUserProfile, useListenCount, tierGlowClass } from "@/hooks/useMusicNerdState";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Music, BookOpen, Play, Lock } from "lucide-react";
import CompanionNuggetCard from "@/components/companion/CompanionNuggetCard";
import type { CompanionNugget } from "@/mock/types";

interface CompanionData {
  artistSummary: string;
  trackStory: string;
  nuggets: CompanionNugget[];
  externalLinks: { label: string; url: string }[];
}

const SECTIONS: { key: CompanionNugget["category"]; label: string; color: string }[] = [
  { key: "track", label: "The Track", color: "bg-blue-500/20 text-blue-400" },
  { key: "history", label: "History", color: "bg-primary/20 text-primary" },
  { key: "explore", label: "Explore Next", color: "bg-emerald-500/20 text-emerald-400" },
];

export default function Companion() {
  const { trackId } = useParams<{ trackId: string }>();
  const track = getTrackById(trackId || "");
  const artist = track ? getArtistById(track.artistId) : undefined;
  const artistImage = useArtistImage(artist?.name || "", artist?.imageUrl || "");
  const { profile } = useUserProfile();
  const { count: listenCount } = useListenCount(trackId || "");

  const [data, setData] = useState<CompanionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tier = profile?.calculatedTier ?? "casual";
  const glowClass = tierGlowClass(tier);

  useEffect(() => {
    if (!track || !artist) return;

    async function fetchCompanion() {
      setLoading(true);
      setError(null);

      try {
        const trackKey = `${track!.artist}::${track!.title}`;
        const { data: historyData } = await supabase
          .from("nugget_history" as any)
          .select("listen_count")
          .eq("track_key", trackKey)
          .maybeSingle();

        const serverListenCount = (historyData as any)?.listen_count || listenCount;

        const { data: companionData, error: fnError } = await supabase.functions.invoke(
          "generate-companion",
          {
            body: {
              artist: track!.artist,
              title: track!.title,
              album: track!.album,
              listenCount: serverListenCount,
              tier,
              // Taste profile — send everything available; edge fn merges them
              lastFmUsername: profile?.lastFmUsername || null,
              spotifyTopArtists: profile?.spotifyTopArtists || null,
              spotifyTopTracks: profile?.spotifyTopTracks || null,
              streamingService: profile?.streamingService || null,
            },
          }
        );

        if (fnError) throw new Error(fnError.message);
        setData(companionData as CompanionData);
      } catch (e) {
        console.error("Companion fetch error:", e);
        setError(e instanceof Error ? e.message : "Failed to load content");
      } finally {
        setLoading(false);
      }
    }

    fetchCompanion();
  }, [trackId, tier]);

  if (!track || !artist) {
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
      .filter((n) => n.category === category && n.listenUnlockLevel <= listenCount)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  function getLockedCount(category: CompanionNugget["category"]): number {
    if (!data?.nuggets) return 0;
    return data.nuggets.filter((n) => n.category === category && n.listenUnlockLevel > listenCount).length;
  }

  return (
    <div className={`min-h-screen bg-background ${glowClass}`} style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <MusicNerdLogo size={32} />
        <span className="text-sm font-bold text-foreground/70 tracking-wide">MUSICNERD</span>
        {/* Tier badge */}
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
        <img
          src={artistImage}
          alt={artist.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = artist.imageUrl; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="px-5 pb-12 -mt-16 relative z-10 space-y-6 max-w-2xl mx-auto">
        {/* Artist Info */}
        <section>
          <h1 className="text-3xl font-black text-foreground leading-tight">{artist.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {artist.genres.map((g) => (
              <span key={g} className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">
                {g}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{artist.bio}</p>
        </section>

        {/* Track Details */}
        <section className="apple-glass rounded-2xl p-4 flex items-center gap-4">
          <img src={track.coverArtUrl} alt={track.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{track.title}</h2>
            {track.album && <p className="text-sm text-muted-foreground truncate">{track.album}</p>}
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
              const locked = getLockedCount(key);
              if (visible.length === 0 && locked === 0) return null;
              return (
                <section key={key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${color}`}>{label}</span>
                  </div>
                  {visible.map((nugget) => (
                    <CompanionNuggetCard key={nugget.id} nugget={nugget} />
                  ))}
                  {locked > 0 && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-foreground/15 text-muted-foreground text-xs">
                      <Lock size={12} className="shrink-0 opacity-50" />
                      Listen again to unlock {locked} more insight{locked > 1 ? "s" : ""}
                    </div>
                  )}
                </section>
              );
            })}

            {/* External Links */}
            {data.externalLinks?.length > 0 && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-3">Explore Further</h3>
                <div className="space-y-2">
                  {data.externalLinks.map((link, i) => {
                    const Icon =
                      link.label.toLowerCase().includes("wiki") ? BookOpen :
                      link.label.toLowerCase().includes("youtube") ? Play :
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
                        <span className="text-sm font-semibold text-foreground/80">{link.label}</span>
                        <ExternalLink size={14} className="ml-auto text-muted-foreground" />
                      </a>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
