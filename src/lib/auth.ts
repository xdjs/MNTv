import NextAuth from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import Spotify from "next-auth/providers/spotify";
import type { Provider } from "next-auth/providers/index"; 
import Credentials from "next-auth/providers/credentials";

const providers: Provider[] = [
     Credentials({
          credentials: { password: {label: "Password", type: "password" } },
          authorize(c) {
               if (c!.password !== "password") return null
               return {
                    id: "test",
                    name: "testname",
                    email: "test@email.com",
               }
          },
     }),
     Spotify({
          clientId: process.env.SPOTIFY_CLIENT_ID!,
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
     }),
]




export const { handlers, auth, signIn, signOut } = NextAuth({
     adapter: PrismaAdapter(prisma),
     providers: providers,
     pages: {
          signIn: "/sign-in"
     },
})
