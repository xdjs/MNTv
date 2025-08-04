'use client'

import Link from "next/link"

export default function HomeScreen() {
     return(
          <div className="h-screen flex justify-center items-center">
               <button className="bg-blue-500 text-white px-4 py-2 rounded-md ">
                         <Link href="sign-in">Sign In or else...</Link>
                         
               </button>
          </div>
     )
}














