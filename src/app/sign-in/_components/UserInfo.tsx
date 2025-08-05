'use client';

import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import SpotifySignIn from "@/components/SpotifySignIn";

export default function UserInfo() {
     const {data: session, status} = useSession();

     // if (status === "loading") {
     //      return (
     //           //loading symbol
     //      )
     // }

     if (status === "authenticated" && session?.user) {
          return (
               <div id="background" className="flex items-center rounded-lg">
                    {session.user.image ? (
                         <Image src={session.user.image} alt={session.user.name || "User Avatar"} width={48} height={48} className="rounded-full" />
                    ) : (
                         <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                              <span className="text-gray-600 font-bold">
                                   {session.user.name?.charAt(0) || "?"}
                              </span>
                         </div>
                    )}

                    <div className="flex-1">
                         <h3 className="font-semibold text-gray-900">
                              {session.user.name || "Unknown User"}
                         </h3>
                         <p className="text-s text-green-600">Connected via Spotify</p>
                    </div>

                    <button
                       onClick={() => signOut({callbackUrl:"/"})}
                       className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-700 transition-colors">
                       Sign Out
                    </button>
               </div>
          );
     }

     return (
          <div>
               <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                 Sign in to your account
               </h2>
               <p className="mt-2 text-center text-sm text-gray-600">
                 Connect your Spotify account to get started
               </p>
             <div className="flex justify-center mt-2">
               <SpotifySignIn />
             </div>
        </div>
     )
}
