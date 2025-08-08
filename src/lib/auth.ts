import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import Spotify from "next-auth/providers/spotify";
import type { Provider } from "next-auth/providers/index"; 

const providers: Provider[] = [
     Spotify({
          clientId: process.env.SPOTIFY_CLIENT_ID!,
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
          authorization: {
               params: {
                    // Needed for currently playing endpoints
                    scope: "user-read-currently-playing user-read-playback-state",
               },
          },
     }),
]

export const providerMap = providers
     .map((provider) => {
               return {id: provider.id, name: provider.name}
     })
     .filter((provider) => provider.id !== "credentials")



export const authOptions: NextAuthOptions = {
     adapter: PrismaAdapter(prisma),
     providers: providers,
     secret: process.env.NEXTAUTH_SECRET,
     // Use JWT strategy so the access token is available on the client session
     session: { strategy: "jwt" },
     debug: process.env.NODE_ENV === "development",
     pages: {
          signIn: "/sign-in",
     },
     callbacks: {
          async jwt({ token, account }) {
               console.log("JWT callback - account:", account);
               console.log("JWT callback - token before:", token);
               if (account) {
                    token.accessToken = account.access_token;
                    token.refreshToken = account.refresh_token;
                    // expires_at is seconds since epoch from Spotify
                    if (account.expires_at) {
                         token.accessTokenExpires = account.expires_at * 1000;
                    }
                    console.log("JWT callback - access_token from account:", account.access_token);
               }
               console.log("JWT callback - token after:", token);
               return token;
          },
          session: ({ session, token }) => {
               console.log("Session callback - token:", token);
               console.log("Session callback - token.accessToken:", (token as any).accessToken);
               return {
                    ...session,
                    user: {
                         ...session.user,
                         id: token.sub,
                    },
                    accessToken: (token as any).accessToken as string | undefined,
               };
          },
     },
};

export default NextAuth(authOptions)
