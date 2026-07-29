import { memo } from "react";
import { Play } from "lucide-react";
import type { PlayableTrack } from "@/lib/artistUpdateSplit";

interface Props {
  artistName: string;
  tracks: PlayableTrack[];
  onPlay: (track: PlayableTrack) => void;
}

/**
 * The "Get into" lane under an artist's fact cards — tracks worth
 * starting, one tap from playing.
 *
 * Built as artwork cards rather than text pills so the lane reads as
 * part of the same surface as the update cards above it. Cover art
 * comes from the release the track belongs to; when it's missing the
 * card falls back to a tinted panel rather than collapsing to a
 * different shape, so a row of tracks stays visually even.
 *
 * Renders nothing when there are no tracks — an artist with only facts
 * should look deliberate, not like a lane that failed to load.
 */
function ArtistTrackStripInner({ artistName, tracks, onPlay }: Props) {
  if (tracks.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="px-4 md:px-10 mb-2 text-[10px] uppercase tracking-widest text-white/40">
        Get into
      </p>
      <div
        className="flex gap-3 overflow-x-auto px-4 md:px-10 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tracks.map((track) => (
          <button
            key={`${track.title}::${track.album}`}
            type="button"
            onClick={() => onPlay(track)}
            aria-label={`Play ${track.title} by ${artistName}`}
            className="group relative shrink-0 w-[136px] h-[136px] rounded-2xl overflow-hidden text-left active:scale-[0.98] transition-transform"
          >
            {track.imageUrl ? (
              <img
                src={track.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/30 via-violet-500/20 to-sky-500/15" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />

            <span className="absolute top-2.5 right-2.5 flex items-center justify-center w-8 h-8 rounded-full bg-black/45 backdrop-blur-sm ring-1 ring-white/25">
              <Play size={12} fill="currentColor" className="text-white ml-[1px]" />
            </span>

            <span className="absolute bottom-0 left-0 right-0 p-3">
              <span className="block text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow">
                {track.title}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ArtistTrackStrip = memo(ArtistTrackStripInner);
export default ArtistTrackStrip;
