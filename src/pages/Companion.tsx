import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTrackById, getArtistById } from "@/mock/tracks";
import { useArtistImage } from "@/hooks/useArtistImage";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Music, BookOpen, Play } from "lucide-react";

interface CompanionNugget {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery";
  source: {
    type: string;
    title: string;
    publisher: string;
    url: string;
    quoteSnippet?: string;
  };
}

interface CompanionData {
  artistSummary: string;
  trackStory: string;
  nuggets: CompanionNugget[];
  externalLinks: { label: string; url: string }[];
}

const kindLabels: Record<string, string> = {
  artist: "The Artist",
  track: "The Track",
  discovery: "Explore Next",
};

const kindColors: Record<string, string> = {
  artist: "bg-primary/20 text-primary",
  track: "bg-blue-500/20 text-blue-400",
  discovery: "bg-emerald-500/20 text-emerald-400",
};

export default function Companion() {
  const { trackId } = useParams<{ trackId: string }>();
  const track = getTrackById(trackId || "");
  const artist = track ? getArtistById(track.artistId) : undefined;
  const artistImage = useArtistImage(artist?.name || "", artist?.imageUrl || "");

  const [data, setData] = useState<CompanionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!track || !artist) return;

    async function fetchCompanion() {
      setLoading(true);
      setError(null);

      try {
        // Get listen count
        const trackKey = `${track!.artist}::${track!.title}`;
        const { data: historyData } = await supabase
          .from("nugget_history" as any)
          .select("listen_count")
          .eq("track_key", trackKey)
          .maybeSingle();

        const listenCount = (historyData as any)?.listen_count || 1;

        // Call companion edge function
        const { data: companionData, error: fnError } = await supabase.functions.invoke(
          "generate-companion",
          {
            body: {
              artist: track!.artist,
              title: track!.title,
              album: track!.album,
              listenCount,
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
  }, [trackId]);

  if (!track || !artist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">Track not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <MusicNerdLogo size={32} />
        <span className="text-sm font-bold text-foreground/70 tracking-wide">MUSICNERD</span>
      </header>

      {/* Artist Hero */}
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        <img
          src={artistImage}
          alt={artist.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = artist.imageUrl;
          }}
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
          <img
            src={track.coverArtUrl}
            alt={track.title}
            className="w-16 h-16 rounded-lg object-cover shrink-0"
          />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{track.title}</h2>
            {track.album && (
              <p className="text-sm text-muted-foreground truncate">{track.album}</p>
            )}
          </div>
        </section>

        {/* AI Content */}
        {loading ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="apple-glass rounded-2xl p-6 text-center">
            <p className="text-destructive font-semibold">Something went wrong</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Artist Summary */}
            {data.artistSummary && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-2">About the Artist</h3>
                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                  {data.artistSummary}
                </div>
              </section>
            )}

            {/* Track Story */}
            {data.trackStory && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-2">About This Track</h3>
                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                  {data.trackStory}
                </div>
              </section>
            )}

            {/* Nuggets */}
            {data.nuggets?.length > 0 && (
              <section>
                <h3 className="text-lg font-bold text-foreground mb-3">
                  Deep Dive ({data.nuggets.length} nuggets)
                </h3>
                <div className="space-y-3">
                  {data.nuggets.map((nugget, i) => (
                    <div key={i} className="apple-glass rounded-2xl p-4 space-y-2.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          kindColors[nugget.kind] || "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {kindLabels[nugget.kind] || nugget.kind}
                      </span>
                      <p className="text-sm font-bold text-foreground leading-snug">
                        {nugget.headline}
                      </p>
                      <p className="text-sm text-foreground/70 leading-relaxed">
                        {nugget.text}
                      </p>

                      {/* Source Link */}
                      {nugget.source?.url && (
                        <a
                          href={nugget.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 mt-1 px-3 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-colors group"
                        >
                          <ExternalLink size={14} className="text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground/80 truncate group-hover:text-primary transition-colors">
                              {nugget.source.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {nugget.source.publisher}
                            </p>
                          </div>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

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
                        <span className="text-sm font-semibold text-foreground/80">
                          {link.label}
                        </span>
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
