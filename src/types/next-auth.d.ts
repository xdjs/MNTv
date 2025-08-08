import "next-auth"
import { DefaultSession } from "next-auth";

declare module "next-auth" {
     interface Session extends DefaultSession {
          user: DefaultSession["user"] & { id: string };
          accessToken?: string;
     }
}

declare module "next-auth/jwt" {
     interface JWT {
          accessToken?: string;
          refreshToken?: string;
          accessTokenExpires?: number;
     }
}
