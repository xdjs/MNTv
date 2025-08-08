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

          async jwt({ token, account }) {
               console.log("JWT callback - account:", account);
               console.log("JWT callback - token before:", token);
               if (account) {
                    token.accessToken = account.access_token;
                    console.log("JWT callback - access_token from account:", account.access_token);
               }
               console.log("JWT callback - token after:", token);
               return token;
          },

               session: ({ session, token }) => {
          console.log("Session callback - token:", token);
          console.log("Session callback - token.accessToken:", token.accessToken);
          return {
               ...session,
               user: {
                    ...session.user,
                    id: token.sub,
               },
               accessToken: token.accessToken,
          };
     },
     },
})
