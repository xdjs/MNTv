import { PlaybackState, SimplifiedArtist, Track  } from "@spotify/web-api-ts-sdk";

export interface ParsedData {
     songName: string | null;
     artistName: string | null;
     artistId: string | null;
     albumName: string | null;
     albumId: string | null;
     coverUrl: string | null;
     isPlaying: boolean | null;
     progressMs: number | null;
}


export async function getCurrentTrack(accessToken: string) {
     const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: {'Authorization': `Bearer ${accessToken}`}
     });

     if (response.status != 200) return console.error(`Error ${response.status} ${response.statusText}`);
     
     const data: PlaybackState= await response.json();
     const track = data.item as Track;

     return {
          songName: track?.name,
          artistName: track?.artists?.[0]?.name,
          artistId: track?.artists?.[0].id,
          albumName: track?.album?.name,
          albumId: track?.album?.id,
          allArtists: track?.artists?.map((artist: SimplifiedArtist) => ({
               name: artist.name,
               id: artist.id,
          })),
          coverUrl: track.album?.images?.[0]?.url,
          isPlaying: data.is_playing,
          progressMs: data.progress_ms,
     }
}
