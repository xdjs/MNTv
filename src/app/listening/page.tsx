"use client"

import useCurrentTrack from "@/hooks/useCurrentTrack"
import { useSession } from "next-auth/react"




export default function Listening() {

     //for future use; can be used to notify other components that the song changed (such as slide components)
     const handleSongChange = (track: any) => {
          
     }

     const currentTrack = useCurrentTrack({ onSongChange: handleSongChange });

     return (
          <div>
               <div className="justify-center items-center">
                    <img src={currentTrack.coverUrl!} alt="ya mum" />
                    <h1>{currentTrack.songName}</h1>
                    <p>{currentTrack.artistName}</p>
                    <p>{currentTrack.albumName}</p>
               </div>
          </div>
     )
}