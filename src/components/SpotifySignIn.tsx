"use client";

import { signIn } from "next-auth/react";

export default function SpotifySignIn() {
     const handleSignIn = async () => {
          try {
               console.log("=== Starting Spotify Sign In ===");
               console.log("Environment check:");
               console.log("- Attempting signIn with explicit settings...");
               
               const result = await signIn("spotify", { 
                    callbackUrl: window.location.origin,
                    redirect: true 
               });
               
               console.log("SignIn result:", result);
               
               if (result?.error) {
                    console.error("SignIn error:", result.error);
               }
               
               if (result?.url) {
                    console.log("Redirecting to:", result.url);
               }
               
          } catch (error) {
               console.error("SignIn exception:", error);
          }
     };

     return (
          <button 
               onClick={handleSignIn}
               className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
          >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.348-1.434-5.304-1.76-8.785-.964-.335.077-.67-.133-.746-.47-.077-.334.132-.67.47-.745 3.809-.871 7.077-.496 9.713 1.115.294.18.386.563.205.857zm1.223-2.723c-.226.367-.706.482-1.073.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.849-.106-.975-.517-.127-.413.106-.849.517-.975 3.632-1.102 8.147-.568 11.238 1.328.366.226.481.707.258 1.073zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.622-.149-.492.129-1.016.622-1.165 3.532-1.073 9.404-.865 13.115 1.338.445.264.591.842.327 1.287-.264.446-.842.592-1.287.328z"/>
               </svg>
               Sign in with Spotify
          </button>
     );
}