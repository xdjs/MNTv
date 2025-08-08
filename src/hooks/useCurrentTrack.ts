"use client"

import { useState, useEffect } from "react";
import { ParsedData } from "@/lib/spotify";


interface Props {
     onSongChange?: (track: ParsedData) => void;
}

export default function useCurrentTrack({ onSongChange }: Props) {
     console.log("=== useCurrentTrack HOOK CALLED ===");
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
                try {
                     const res = await fetch("/api/spotify/current-track", {
                          cache: "no-store",
                          credentials: "include",
                     });
                     if (!res.ok) return;
                     const trackInfo: ParsedData = await res.json();
                     if (trackInfo) {
                          setCurrentTrack(trackInfo);
                          onSongChange?.(trackInfo);
                     }
                } catch (e) {
                     // ignore
                }
           };

           fetchTrack();
           const interval = setInterval(fetchTrack, 2000);
           return () => clearInterval(interval);
      }, [onSongChange]); 
     // - This array at the end is called a dependency array and tells the code when to run useEffect
     // - In this case, whenever currentTrack changes

      return currentTrack;
}