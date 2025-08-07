"use client"

import useCurrentTrack from "@/hooks/useCurrentTrack"
import { ParsedData } from "@/lib/spotify";


export default function Listening() {
     console.log("=== LISTENING COMPONENT RENDERED ===");

     //for future use; can be used to notify other components that the song changed (such as slide components)
     const handleSongChange = (track: ParsedData) => {
          console.log("Song changed:", track);
     }

     console.log("About to call useCurrentTrack...");
     const currentTrack = useCurrentTrack({ onSongChange: handleSongChange });
     console.log("Current track state:", currentTrack);

     return (
          <div className="w-full h-full">
               <div className="justify-center items-center">
                    {currentTrack ? (
                         <>
                              <img src={currentTrack.coverUrl!} alt="" />
                              <h1>{currentTrack.songName}</h1>
                              <p>{currentTrack.artistName}</p>
                              <p>{currentTrack.albumName}</p>
                         </>
                    ) : (
                         <p className="text-black-500 font-semibold">No song</p>
                    )}
               </div>
          </div>
     )
}