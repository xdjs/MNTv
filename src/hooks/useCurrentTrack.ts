"use client"

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { getCurrentTrack, ParsedData } from "@/lib/spotify";


interface Props {
     onSongChange?: (track: ParsedData) => void;
}

export default function useCurrentTrack({ onSongChange }: Props) {
     const { data: session } = useSession();
     const [currentTrack, setCurrentTrack] = useState<ParsedData>({
          songName: null,
          artistName: null,
          artistId: null,
          albumName: null,
          albumId: null,
          coverUrl: null,
          isPlaying: null,
          progressMs: null,
     })

     useEffect(() => {
          const fetchTrack = async () => {
            if (session?.accessToken) {
               const trackInfo = await getCurrentTrack(session.accessToken); //this is the actual api call, should be obvious but im retarded and will forget
               if (trackInfo) {
                  setCurrentTrack(trackInfo)
                  console.log("Current Track:", trackInfo.songName, " by ", trackInfo.artistName)
                  onSongChange?.(trackInfo)
                  console.log("Song changed")
              }
          }
        }; 
        fetchTrack();

        const interval = setInterval(fetchTrack, 1000);
        return () => clearInterval(interval);
        
     }, [session, onSongChange]); 
     // - This array at the end is called a dependency array and tells the code when to run useEffect
     // - In this case, whenever user signs in or out or currentTrack changes

     return currentTrack;
}