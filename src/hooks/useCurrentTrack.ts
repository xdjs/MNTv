"use client"

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { getCurrentTrack, ParsedData } from "@/lib/spotify";


interface Props {
     onSongChange?: (track: ParsedData) => void;
}

export default function useCurrentTrack({ onSongChange }: Props) {
     console.log("=== useCurrentTrack HOOK CALLED ===");
     const { data: session } = useSession();
     console.log("Session in hook:", session);
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
          console.log("useEffect triggered, session:", session);
          const fetchTrack = async () => {
            if (session?.accessToken) {
               console.log("Making API call with access token");
               const trackInfo = await getCurrentTrack(session.accessToken); //this is the actual api call, should be obvious but im retarded and will forget
               console.log("API response:", trackInfo);
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