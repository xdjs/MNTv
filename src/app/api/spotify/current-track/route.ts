import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SimplifiedArtist } from "@spotify/web-api-ts-sdk";

export async function GET(req: NextRequest) {
     try {
          console.log("[current-track] start");
          const session = await getServerSession(authOptions);
          let userId = session?.user?.id;
          console.log("[current-track] session userId:", userId);

    if (!userId) {
          // Fallback: read JWT directly (helps when session parsing fails)
           const token = await getToken({ req, secret: authOptions.secret });
           console.log("[current-track] getToken sub:", token?.sub);
          if (token?.sub) userId = token.sub;
    }

    if (!userId) {
               console.warn("[current-track] unauthorized: no userId");
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
          where: {
            userId,
            provider: "spotify",
          },
          select: {
            access_token: true,
          },
     });
     console.log("[current-track] found account token?", !!account?.access_token);

    if (!account?.access_token) {
          console.warn("[current-track] spotify account not linked");
          return NextResponse.json({ error: "Spotify account not linked" }, { status: 404 });
    }

    const resp = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: { Authorization: `Bearer ${account.access_token}` },
          cache: "no-store",
    });
     console.log("[current-track] spotify status:", resp.status);

    if (resp.status === 204) {
          // No content: nothing is currently playing
          return NextResponse.json(null, { status: 200 });
    }

    if (!resp.ok) {
           console.error("[current-track] spotify error", resp.status, await resp.text());
          return NextResponse.json({ error: `Spotify error ${resp.status}` }, { status: resp.status });
    }

    const data = await resp.json();
    const track = data?.item;

    const parsed = track
          ? {
               songName: track?.name ?? null,
               artistName: track?.artists?.[0]?.name ?? null,
               artistId: track?.artists?.[0]?.id ?? null,
               albumName: track?.album?.name ?? null,
               albumId: track?.album?.id ?? null,
               allArtists: (track?.artists ?? []).map((a: SimplifiedArtist) => ({ name: a?.name, id: a?.id })),
               coverUrl: track?.album?.images?.[0]?.url ?? null,
               isPlaying: data?.is_playing ?? null,
               progressMs: data?.progress_ms ?? null,
         }
          : null;

     return NextResponse.json(parsed, { status: 200 });
    } catch (err) {
          console.error("/api/spotify/current-track error", err);

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


