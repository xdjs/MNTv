"use client" 

import { useState } from "react"
import Link from "next/link";

export default function MainMenu() {
     const [isOpen, setisOpen] = useState(false);

     return (
          <>
               {isOpen && (
                    <div
                     className="fixed inset-0 bg-black/20 backdrop-blur-xs z-40"
                     onClick={() => setisOpen(false)}
                     />
               )}

               <div className="absolute top-1 right-1 rounded-md text-white bg-blue-500 z-70">
                    <button onClick={ () => {setisOpen(!isOpen)} }>Menu</button>
               </div>

               {isOpen && (
                    <div className="absolute right-0 top-0 h-full w-48 bg-blue-700 text-white shadow-md overflow-hidden z-60">
                         <Link className="fixed pl-2 pt-8 text-xl" href="/sign-in">Manage Account</Link>
                    </div>
               )}
          </>
     )
}