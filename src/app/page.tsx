'use client'

import Link from "next/link"
import MainMenu from "@/components/MainMenu";

export default function HomeScreen() {

     return(
          <div className="flex">
               <div className="h-screen justify-center items-center">
                    <button className="bg-blue-500 text-white px-4 py-2 rounded-md ">
                              <Link href="https://mn-tv-git-staging-musicnerd.vercel.app/sign-in">Sign In or else...</Link>
                    </button>
                    <MainMenu />
               </div>

               
          </div>
     )
}














