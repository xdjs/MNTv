import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Headphones } from "lucide-react";
import type { Nugget } from "@/mock/types";

/**
 * "Open {Artist}" CTA — appears in the nugget body when the server
 * attaches a recommendedArtist (typical for `discovery` and `collab`
 * kind nuggets that name a specific artist). Routes to the artist's
 * profile when we have a Spotify ID, otherwise falls back to a
 * search by name (`/artist/real::{name}` → server-side resolution).
 *
 * Extracted from ImmersiveNuggetView so the buttons stay unit-
 * testable without rendering the full immersive view (which mounts
 * the player, pacer, bookmarks, etc.).
 */
export const RecommendedArtistButton = memo(function RecommendedArtistButton({
  recommendedArtist,
}: {
  recommendedArtist: NonNullable<Nugget["recommendedArtist"]>;
}) {
  const navigate = useNavigate();
  const { name, spotifyArtistId } = recommendedArtist;
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (spotifyArtistId) {
      navigate(`/artist/spotify::${spotifyArtistId}::${encodeURIComponent(name)}`);
    } else {
      // Fallback: artist name route resolved server-side via search.
      navigate(`/artist/real::${encodeURIComponent(name)}`);
    }
  };
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/60 active:scale-95 transition-transform flex items-center gap-1.5"
      aria-label={`Open ${name}`}
    >
      <Headphones className="w-3 h-3" />
      Open {name}
    </button>
  );
});

/**
 * "Listen to {Track}" CTA — same idea but for a specific track.
 * Routes to /listen/real::artist::title::::uri so PlayerContext picks
 * the right engine (Spotify URI for Spotify users; Apple Music
 * users hit the URL with no URI and Listen's findCatalogUri effect
 * resolves the Apple equivalent via {artist, title}).
 */
export const RecommendedTrackButton = memo(function RecommendedTrackButton({
  recommendedTrack,
}: {
  recommendedTrack: NonNullable<Nugget["recommendedTrack"]>;
}) {
  const navigate = useNavigate();
  const { artist, title, spotifyTrackUri } = recommendedTrack;
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const uri = spotifyTrackUri ?? "";
    navigate(
      `/listen/real::${encodeURIComponent(artist)}::${encodeURIComponent(title)}::${encodeURIComponent("")}::${encodeURIComponent(uri)}`,
    );
  };
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/60 active:scale-95 transition-transform flex items-center gap-1.5"
      aria-label={`Listen to ${title} by ${artist}`}
    >
      <Headphones className="w-3 h-3" />
      Listen to "{title}"
    </button>
  );
});
