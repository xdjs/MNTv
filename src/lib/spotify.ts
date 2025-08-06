import Spotify from "next-auth/providers/spotify";

export async function getCurrentTrack(accessToken: string) {
     const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: {'Authorization': `Bearer ${accessToken}`}
     });

     if (response.status != 200) return console.error(`Error ${response.status}`);
     
     const data= await response.json();

     return {
          songName: data.item?.name,
          artistName: data.item?.artists?.[0]?.name,
          artistId: data.item?.artists?.[0].id,
          albumName: data.item?.album?.name,
          albumId: data.item?.album?.id,
          allArtists: data.item?.artists?.map((artist: any) => ({
               name: artist.name,
               id: artist.id,
          })),
          coverUrl: data.item?.album?.images?.[0]?.url,
          isPlaying: data.isPlaying,
     }
}

export async function getTimestamp(accessToken: string) {
     const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: {'Authorization': `Bearer ${accessToken}`}
     });

     if (response.status != 200) return console.error(`Error ${response.status}`);
     
     const data= await response.json();

     return {
          timestamp: data.progress_ms
     }
}