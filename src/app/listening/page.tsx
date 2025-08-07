"use client"

import useCurrentTrack from "@/hooks/useCurrentTrack"
import { ParsedData } from "@/lib/spotify";


export default function Listening() {

     //for future use; can be used to notify other components that the song changed (such as slide components)
     const handleSongChange = (track: ParsedData) => {
          // Future: notify other components about song changes
     }

     const currentTrack = useCurrentTrack({ onSongChange: handleSongChange });

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