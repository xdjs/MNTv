"use client"

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { getCurrentTrack, getTimestamp } from "@/lib/spotify";


interface Props {
     onSongChange?: (track: any) => void;
}

export default function currentTrackInfo({ onSongChange }: Props) {
     const { data: session } = useSession();
     const [currentTrack, setCurrentTrack] = useState({
          songName: null,
          artistName: null,
          artistId: null,
          albumName: null,
          albumId: null,
          coverUrl: null,
          isPlaying: null,
     })

     useEffect(() => {
          const fetchTrack = async () => {
            if (session?.accessToken) {
               const trackInfo = await getCurrentTrack(session.accessToken); //this is the actual api call, should be obvious but im retarded and will forget
               if (trackInfo) {
                  setCurrentTrack(trackInfo)
                  onSongChange?.(trackInfo)
              }
          }
        }; 
        fetchTrack();
     }, [session]); 
     // - This array at the end is called a dependency array and tells the code when to run useEffect
     // - In this case, whenever user signs in or out or currentTrack changes

     return (
          <div>
               {currentTrack === null && (
                    <h3>Loading</h3>
               )}
               <h3>Current Track Info *DEBUG*</h3>
               <p><strong>Song:</strong> {currentTrack.songName}</p>
               <p><strong>Artist:</strong> {currentTrack.artistName}</p>
               <p><strong>Artist ID:</strong> {currentTrack.artistId}</p>
               <p><strong>Album:</strong> {currentTrack.albumName}</p>
               <p><strong>Album ID:</strong> {currentTrack.albumId}</p>
          </div>
     )
}