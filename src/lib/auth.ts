import NextAuth from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import Spotify from "next-auth/providers/spotify";
import type { Provider } from "next-auth/providers/index"; 

const providers: Provider[] = [
     Spotify({
          clientId: process.env.SPOTIFY_CLIENT_ID!,
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
     }),
     
]

export const providerMap = providers
     .map((provider) => {
               return {id: provider.id, name: provider.name}
     })
     .filter((provider) => provider.id !== "credentials")



export default NextAuth({
     adapter: PrismaAdapter(prisma),
     providers: providers,
     secret: process.env.NEXTAUTH_SECRET,
     pages: {
          signIn: "/sign-in"
     },
     callbacks: {
          session: ({ session, token }) => {
               if (token?.sub) {
                    return {
                         ...session,
                         user: {
                              ...session.user,
                              id: token.sub,
                         },
                    };
               }
               return session;
          },
     },
})
