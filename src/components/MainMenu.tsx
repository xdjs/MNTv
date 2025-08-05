"use client" 

import { useState } from "react"
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { userAgent } from "next/server";

export default function MainMenu() {
     const [isOpen, setisOpen] = useState(false);
     const {data: session, status} = useSession();

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
                    <div className="absolute right-0 top-0 h-full w-48 bg-green-500 text-black shadow-md overflow-hidden z-60">
                         <div className="flex w-full py-12">
                              <Link className="absolute w-full px-2 text-xl border-4 border-white-500 rounded-md bg-white" href="/sign-in">
                                   Manage Account
                              </Link>
                         </div>
                         
                         {status==="authenticated" && session?.user && (
                              <div className="flex w-full py-12">
                                   <button
                                        onClick={() => signOut({callbackUrl:"/"})}
                                        className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-700 transition-colors">
                                        Sign Out
                                   </button>
                              </div>
                         )} 
                    </div>
               )}
          </>
     )
}