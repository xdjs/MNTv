import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PlayableTrack } from "@/lib/artistUpdateSplit";
import { buildListenRoute } from "@/lib/listenRoute";
import { withAppleStorefront } from "@/lib/appleStorefront";

/** Start the card's song, resolving an album-only release before navigating. */
export function useArtistUpdatePlayback(streamingService?: string, onStarted?: () => void) {
  const navigate = useNavigate();
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playTrack = useCallback(async (artist: string, target: PlayableTrack) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      let track = target;
      const album = target.uri?.match(/^(spotify|apple):album:([^:]+)$/);
      if (album) {
        const service = album[1] as "spotify" | "apple";
        const { data, error: requestError } = await supabase.functions.invoke("spotify-album", {
          body: withAppleStorefront({ albumId: album[2], service }, service),
        });
        let firstTrack = !requestError && (data?.tracks as PlayableTrack[] | undefined)?.find((t) =>
          t.title && t.uri?.startsWith(service === "apple" ? "apple:song:" : "spotify:track:"),
        );
        if (!mounted.current) return;
        if (!firstTrack) {
          // Some Spotify apps can search but cannot read album details.
          // Only accept a song matching this release AND artist.
          const albumName = target.album || target.title;
          const clean = (value: string) => value.replace(/"/g, "");
          const query = service === "spotify"
            ? `artist:"${clean(artist)}" album:"${clean(albumName)}"`
            : `${artist} ${albumName}`;
          const searched = await supabase.functions.invoke("spotify-search", {
            body: withAppleStorefront({ query, service }, service),
          });
          const normalize = (value: string) => value.trim().toLowerCase();
          firstTrack = !searched.error && (searched.data?.tracks as (PlayableTrack & { artist: string })[] | undefined)?.find((t) =>
            t.title && t.artist && t.album && normalize(t.artist) === normalize(artist) &&
            normalize(t.album) === normalize(albumName) &&
            t.uri?.startsWith(service === "apple" ? "apple:song:" : "spotify:track:"),
          );
        }
        if (!firstTrack) throw new Error("Release tracks unavailable");
        track = { ...firstTrack, album: target.album || target.title };
      }
      if (!mounted.current) return;
      navigate(buildListenRoute({ artist, ...track, streamingService }));
      onStarted?.();
    } catch {
      if (mounted.current) setError("Couldn't load this release. Please try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }, [navigate, streamingService, onStarted]);

  return { playTrack, pending, error };
}
