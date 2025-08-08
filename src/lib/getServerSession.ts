import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import type { Session } from "next-auth";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions) as Session | null;
  return session?.user || null;
}

export async function requireAuth() {
  const session = await getServerSession(authOptions) as Session | null;
  
  if (!session?.user) {
    throw new Error("Authentication required");
  }
  
  return session;
}

// Example usage in API routes or server components
export async function getUserInfo() {
  const user = await getCurrentUser();
  
  if (!user) {
    return null;
  }

  return {
    name: user.name,
    email: user.email,
    image: user.image,
    isSignedIn: true
  };
} 