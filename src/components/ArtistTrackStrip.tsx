import { memo } from "react";
import { Play } from "lucide-react";
import type { PlayableTrack } from "@/lib/artistUpdateSplit";

interface Props {
  artistName: string;
  tracks: PlayableTrack[];
  onPlay: (track: PlayableTrack) => void;
}

/**
 * The "Get into" lane under an artist's fact cards — the tracks worth
 * starting, one tap from playing.
 *
 * Renders nothing when there are no tracks. An artist with only facts
 * should look deliberate, not like a lane that failed to load.
 */
function ArtistTrackStripInner({ artistName, tracks, onPlay }: Props) {
  if (tracks.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="px-4 md:px-10 mb-2 text-[10px] uppercase tracking-widest text-white/30">
        Get into
      </p>
      <div
        className="flex gap-2 overflow-x-auto px-4 md:px-10 pb-1 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tracks.map((track) => (
          <button
            key={`${track.title}::${track.album}`}
            type="button"
            onClick={() => onPlay(track)}
            aria-label={`Play ${track.title} by ${artistName}`}
            className="shrink-0 flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/[0.16] active:scale-95 transition pl-2 pr-4 py-2"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white text-black">
              <Play size={11} fill="currentColor" className="ml-[1px]" />
            </span>
            <span className="text-sm font-medium text-white/90 whitespace-nowrap max-w-[10rem] truncate">
              {track.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ArtistTrackStrip = memo(ArtistTrackStripInner);
export default ArtistTrackStrip;
