import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSpotifyToken } from "./useSpotifyToken";
import { useAppleMusicToken } from "./useAppleMusicToken";
import { readAppleStorefront } from "@/lib/appleStorefront";

// Single source of truth for bookmark data shape returned by the
// bookmark-nugget edge function. Mirrors the DB schema.
export interface Bookmark {
  id: string;
  service: "spotify" | "apple";
  track_id: string;
  artist: string;
  title: string;
  album: string | null;
  nugget_kind: string;
  headline: string;
  body: string;
  source: unknown;
  image_url: string | null;
  created_at: string;
}

// Minimal payload the client sends to the edge function for a new
// bookmark. The edge function reads only these fields.
export interface BookmarkPayload {
  trackId: string;
  artist: string;
  title: string;
  album?: string;
  kind: "artist" | "track" | "discovery" | "context" | string;
  headline: string;
  body: string;
  source?: unknown;
  imageUrl?: string;
}

const QUERY_KEY = ["bookmarks"] as const;

// Build the service-identity portion of the edge function payload. The
// edge function accepts either a Spotify access token (preferred for
// Spotify users) or an Apple Music user token + storefront. We try
// Spotify first because it's the more common streaming service in this
// app; Apple is the fallback. Returns null if neither service is
// authenticated — callers must treat this as "not signed in."
async function resolveServiceAuth(
  getSpotifyToken: () => Promise<string | null>,
  hasSpotifyToken: boolean,
  hasAppleToken: boolean,
): Promise<Record<string, string> | null> {
  if (hasSpotifyToken) {
    const spotifyToken = await getSpotifyToken();
    if (spotifyToken) return { spotifyToken };
  }
  if (hasAppleToken) {
    try {
      const raw = localStorage.getItem("apple_music_token");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.musicUserToken) {
          return {
            appleUserToken: parsed.musicUserToken,
            appleStorefront: readAppleStorefront(),
          };
        }
      }
    } catch {
      // fall through to null
    }
  }
  return null;
}

export function useBookmarks() {
  const { hasSpotifyToken, getValidToken } = useSpotifyToken();
  const { hasMusicToken: hasAppleToken } = useAppleMusicToken();
  const qc = useQueryClient();

  const isSignedIn = hasSpotifyToken || hasAppleToken;

  const listQuery = useQuery<Bookmark[]>({
    queryKey: QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 60_000,
    queryFn: async () => {
      const auth = await resolveServiceAuth(getValidToken, hasSpotifyToken, hasAppleToken);
      if (!auth) return [];
      const { data, error } = await supabase.functions.invoke("bookmark-nugget", {
        body: { action: "list", ...auth },
      });
      if (error) throw new Error(error.message || "list failed");
      return (data?.bookmarks as Bookmark[]) || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (nugget: BookmarkPayload) => {
      const auth = await resolveServiceAuth(getValidToken, hasSpotifyToken, hasAppleToken);
      if (!auth) throw new Error("Not signed in to Spotify or Apple Music");
      const { data, error } = await supabase.functions.invoke("bookmark-nugget", {
        body: { action: "add", nugget, ...auth },
      });
      if (error) throw new Error(error.message || "add failed");
      return data;
    },
    // Optimistic — heart fills before the server confirms. If the server
    // rejects, onError rolls back. A background refetch after settle
    // reconciles with server truth (inserts/updates DB-assigned UUIDs).
    onMutate: async (nugget) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Bookmark[]>(QUERY_KEY);
      const optimistic: Bookmark = {
        id: `optimistic-${Date.now()}`,
        service: hasSpotifyToken ? "spotify" : "apple",
        track_id: nugget.trackId,
        artist: nugget.artist,
        title: nugget.title,
        album: nugget.album ?? null,
        nugget_kind: nugget.kind,
        headline: nugget.headline,
        body: nugget.body,
        source: nugget.source ?? null,
        image_url: nugget.imageUrl ?? null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<Bookmark[]>(QUERY_KEY, (old) => [optimistic, ...(old || [])]);
      return { prev };
    },
    onError: (_err, _nugget, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (bookmarkId: string) => {
      const auth = await resolveServiceAuth(getValidToken, hasSpotifyToken, hasAppleToken);
      if (!auth) throw new Error("Not signed in to Spotify or Apple Music");
      const { data, error } = await supabase.functions.invoke("bookmark-nugget", {
        body: { action: "remove", bookmarkId, ...auth },
      });
      if (error) throw new Error(error.message || "remove failed");
      return data;
    },
    onMutate: async (bookmarkId) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Bookmark[]>(QUERY_KEY);
      qc.setQueryData<Bookmark[]>(QUERY_KEY, (old) =>
        (old || []).filter((b) => b.id !== bookmarkId),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const bookmarks = listQuery.data || [];

  // Natural-key lookup — same headline + track + kind = same bookmark
  // from the user's perspective, even if the DB row has a different UUID.
  const findBookmark = useMemo(
    () =>
      (headline: string, trackId: string, kind: string): Bookmark | undefined =>
        bookmarks.find(
          (b) => b.headline === headline && b.track_id === trackId && b.nugget_kind === kind,
        ),
    [bookmarks],
  );

  function isBookmarked(headline: string, trackId: string, kind: string): boolean {
    return !!findBookmark(headline, trackId, kind);
  }

  function toggle(nugget: BookmarkPayload) {
    // Rapid double-taps during an in-flight add would find the optimistic
    // row via natural-key lookup, then call removeMutation with the fake
    // `optimistic-${Date.now()}` id — the server's `.eq("id", ...)` query
    // fails Postgres UUID parsing, the remove rolls back to the cache
    // snapshot (still containing the optimistic row), and the subsequent
    // add-mutation invalidation refetches the real row — so the user sees
    // their remove silently undone. Short-circuiting here is the cheapest
    // fix; the long-term fix is swapping the optimistic id for the
    // server-assigned UUID in addMutation.onSuccess.
    if (addMutation.isPending || removeMutation.isPending) return;
    const existing = findBookmark(nugget.headline, nugget.trackId, nugget.kind);
    if (existing) {
      removeMutation.mutate(existing.id);
    } else {
      addMutation.mutate(nugget);
    }
  }

  return {
    bookmarks,
    loading: listQuery.isLoading,
    signedIn: isSignedIn,
    isBookmarked,
    findBookmark,
    toggle,
    adding: addMutation.isPending,
    removing: removeMutation.isPending,
  };
}
