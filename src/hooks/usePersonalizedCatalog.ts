/**
 * usePersonalizedCatalog
 *
 * Builds Browse rows from the user's connected services:
 * - Spotify top artists / tracks (stored in profile after OAuth)
 * - Last.fm top artists / recent tracks (fetched from lastfm-sync edge fn)
 * - Real artist recommendations via Last.fm getSimilar (lastfm-recommendations fn)
 *
 * Falls back to the mock catalog ONLY for guests.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/mock/types";

// ── Artist image cache (persists across re-renders, cleared on page reload) ──
const artistImageCache = new Map<string, string>();

export interface BrowseTile {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  href: string;
  isRealTrack?: boolean;
}

export interface BrowseRow {
  label: string;
  items: BrowseTile[];
  size: "sm" | "md" | "lg";
}

interface LastFmArtist { name: string; playcount: number; }
interface LastFmTrack { artist: string; name: string; album: string; imageUrl?: string; }
interface RealArtist { name: string; imageUrl: string; tags: string[]; }

// ── Helpers ──────────────────────────────────────────────────────────

function artistImageUrl(
  name: string,
  spotifyImages?: Record<string, string>,
  resolved?: Map<string, string>,
): string {
  if (spotifyImages?.[name]) return spotifyImages[name];
  const cached = resolved?.get(name) || artistImageCache.get(name);
  if (cached) return cached;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1a1a2e&textColor=ffffff&fontSize=38`;
}

function trackCoverUrl(
  trackName: string,
  artistName: string,
  spotifyTrackImages?: { title: string; artist: string; imageUrl: string; uri?: string }[],
): string {
  if (spotifyTrackImages) {
    const match = spotifyTrackImages.find(
      (t) =>
        t.title.toLowerCase() === trackName.toLowerCase() &&
        t.artist.toLowerCase() === artistName.toLowerCase()
    );
    if (match?.imageUrl) return match.imageUrl;
  }
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artistName + trackName)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
}

function realTrackHref(artist: string, title: string, album?: string, trackUri?: string): string {
  const parts = ["real", artist, title, album || "", trackUri || ""].map(encodeURIComponent);
  return `/listen/${parts.join("::")}`;
}

function artistHref(name: string, spotifyId?: string): string {
  if (spotifyId) return `/artist/spotify::${spotifyId}::${encodeURIComponent(name)}`;
  return `/artist/real::${encodeURIComponent(name)}`;
}

function parseTrackString(t: string): { trackTitle: string; artistName: string } {
  const [trackTitle, artistName] = t.split(" — ");
  return { trackTitle: trackTitle || t, artistName: artistName || "" };
}

function trackTile(
  t: string,
  idPrefix: string,
  spotifyTrackImages?: { title: string; artist: string; imageUrl: string; uri?: string }[],
): BrowseTile {
  const { trackTitle, artistName } = parseTrackString(t);
  const trackInfo = spotifyTrackImages?.find(
    (img) => img.title.toLowerCase() === trackTitle.toLowerCase() && img.artist.toLowerCase() === artistName.toLowerCase()
  );
  return {
    id: `${idPrefix}-${t}`,
    imageUrl: trackCoverUrl(trackTitle, artistName, spotifyTrackImages),
    title: trackTitle,
    subtitle: artistName,
    href: realTrackHref(artistName, trackTitle, undefined, trackInfo?.uri),
    isRealTrack: true,
  };
}

// ── Main hook ─────────────────────────────────────────────────────────

export function usePersonalizedCatalog(profile: UserProfile | null): {
  rows: BrowseRow[];
  loading: boolean;
} {
  const [lastFmData, setLastFmData] = useState<{
    topArtists: LastFmArtist[];
    recentTracks: LastFmTrack[];
  } | null>(null);

  const [recommendations, setRecommendations] = useState<RealArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Map<string, string>>(new Map());
  const [resolvedIds, setResolvedIds] = useState<Map<string, string>>(new Map());
  const pendingFetches = useRef(new Set<string>());

  // Merged top-artist list
  const topArtistNames = useMemo<string[]>(() => {
    const names: string[] = [];
    if (profile?.spotifyTopArtists?.length) names.push(...profile.spotifyTopArtists);
    if (lastFmData?.topArtists?.length) {
      lastFmData.topArtists.forEach((a) => {
        if (!names.includes(a.name)) names.push(a.name);
      });
    }
    return names;
  }, [profile?.spotifyTopArtists, lastFmData?.topArtists]);

  // Fetch Last.fm data
  useEffect(() => {
    if (!profile?.lastFmUsername) return;
    let cancelled = false;
    supabase.functions
      .invoke("lastfm-sync", { body: { username: profile.lastFmUsername } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.topArtists) {
          setLastFmData({
            topArtists: data.topArtists,
            recentTracks: data.recentTracks || [],
          });
        }
      })
      .catch(console.warn);
    return () => { cancelled = true; };
  }, [profile?.lastFmUsername]);

  // Fetch recommendations
  useEffect(() => {
    if (!topArtistNames.length) return;
    let cancelled = false;
    setLoading(true);
    supabase.functions
      .invoke("lastfm-recommendations", { body: { topArtists: topArtistNames } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.recommendations?.length) {
          setRecommendations(data.recommendations);
        }
      })
      .catch(console.warn)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topArtistNames]);

  // Resolve artist images + IDs via Spotify for artists without Spotify images
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const spotifyImages = profile.spotifyArtistImages || {};
    const spotifyIds = profile.spotifyArtistIds || {};
    const artistNames = [
      ...(profile.spotifyTopArtists || []),
      ...(lastFmData?.topArtists?.map((a) => a.name) || []),
      ...recommendations.map((a) => a.name),
    ];
    const unique = [...new Set(artistNames)];
    const toFetch = unique.filter(
      (name) =>
        !spotifyImages[name] &&
        !spotifyIds[name] &&
        !artistImageCache.has(name) &&
        !pendingFetches.current.has(name)
    );
    if (toFetch.length === 0) return;

    toFetch.forEach((name) => pendingFetches.current.add(name));

    // Resolve all artists in batches of 20 (spotify-resolve caps at 20 per call)
    for (let i = 0; i < toFetch.length; i += 20) {
      const batch = toFetch.slice(i, i + 20);
      supabase.functions
        .invoke("spotify-resolve", { body: { artists: batch } })
        .then(({ data }) => {
          if (cancelled || !data?.resolved) return;
          setResolvedImages((prev) => {
            const next = new Map(prev);
            for (const [name, info] of Object.entries(data.resolved as Record<string, { id: string; imageUrl: string }>)) {
              if (info.imageUrl) {
                artistImageCache.set(name, info.imageUrl);
                next.set(name, info.imageUrl);
              }
            }
            return next;
          });
          setResolvedIds((prev) => {
            const next = new Map(prev);
            for (const [name, info] of Object.entries(data.resolved as Record<string, { id: string; imageUrl: string }>)) {
              if (info.id) {
                next.set(name, info.id);
              }
            }
            return next;
          });
        })
        .catch(console.warn);
    }
    return () => {
      cancelled = true;
      toFetch.forEach((name) => pendingFetches.current.delete(name));
    };
  }, [profile, lastFmData, recommendations]);

  const rows = useMemo<BrowseRow[]>(() => {
    if (!profile) return [];

    const allRows: BrowseRow[] = [];
    const spotifyTracks = profile.spotifyTopTracks || [];
    const spotifyTrackImgs = profile.spotifyTrackImages;
    const spotifyArtistImgs = profile.spotifyArtistImages;

    // ── 1. "Jump Back In" — recent tracks or top tracks ──────────────
    const recentTiles: BrowseTile[] = [];

      if (lastFmData?.recentTracks?.length) {
        lastFmData.recentTracks.slice(0, 10).forEach((t) => {
          const image = t.imageUrl || trackCoverUrl(t.name, t.artist, spotifyTrackImgs);
          const spotifyMatch = spotifyTrackImgs?.find(
            (img) => img.title.toLowerCase() === t.name.toLowerCase() && img.artist.toLowerCase() === t.artist.toLowerCase()
          );
          recentTiles.push({
            id: `recent-${t.artist}-${t.name}`,
            imageUrl: image,
            title: t.name,
            subtitle: t.artist,
            href: realTrackHref(t.artist, t.name, t.album, spotifyMatch?.uri),
            isRealTrack: true,
          });
        });
    } else if (spotifyTracks.length) {
      spotifyTracks.slice(0, 8).forEach((t) => {
        recentTiles.push(trackTile(t, "recent", spotifyTrackImgs));
      });
    }

    if (recentTiles.length > 0) {
      allRows.push({ label: "Jump Back In", items: recentTiles, size: "md" });
    }

    // ── 2. "Your Top Artists" ────────────────────────────────────────
    if (topArtistNames.length > 0) {
      const spotifyIds = profile.spotifyArtistIds || {};
      const topArtistTiles: BrowseTile[] = topArtistNames.slice(0, 20).map((name) => ({
        id: `artist-${name}`,
        imageUrl: artistImageUrl(name, spotifyArtistImgs, resolvedImages),
        title: name,
        subtitle: "Artist",
        href: artistHref(name, spotifyIds[name] || resolvedIds.get(name)),
      }));
      allRows.push({ label: "Your Top Artists", items: topArtistTiles, size: "lg" });
    }

    // ── 3. "Your Top Tracks" ─────────────────────────────────────────
    if (spotifyTracks.length > 0) {
      const trackTiles = spotifyTracks.slice(0, 15).map((t) =>
        trackTile(t, "track", spotifyTrackImgs)
      );
      allRows.push({ label: "Your Top Tracks", items: trackTiles, size: "md" });
    }

    // ── 4. "Recommended For You" — Last.fm similar artists ───────────
    if (recommendations.length > 0) {
      const recTiles: BrowseTile[] = recommendations.slice(0, 15).map((a) => ({
        id: `rec-${a.name}`,
        imageUrl: artistImageUrl(a.name, spotifyArtistImgs, resolvedImages),
        title: a.name,
        subtitle: a.tags.slice(0, 2).join(", ") || "Artist",
        href: artistHref(a.name, resolvedIds.get(a.name)),
      }));
      allRows.push({ label: "Recommended For You", items: recTiles, size: "lg" });
    }

    // ── 5. "Deep Cuts" — later Spotify top tracks (positions 8–15) ───
    if (spotifyTracks.length > 8) {
      const deepCuts = spotifyTracks.slice(8, 15).map((t) =>
        trackTile(t, "deep", spotifyTrackImgs)
      );
      allRows.push({ label: "Deep Cuts", items: deepCuts, size: "sm" });
    }

    // ── 6. "Artists You Might Like" — from recommendations, grouped by genre ─
    if (recommendations.length > 5) {
      // Find the most common genre tag across recommendations
      const tagCounts: Record<string, number> = {};
      recommendations.forEach((a) => {
        a.tags.forEach((tag) => {
          const t = tag.toLowerCase();
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      });
      const topTag = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .find(([tag]) => tag.length > 2)?.[0];

      if (topTag) {
        const genreArtists = recommendations
          .filter((a) => a.tags.some((t) => t.toLowerCase() === topTag))
          .slice(0, 10);
        if (genreArtists.length >= 3) {
          const genreTiles: BrowseTile[] = genreArtists.map((a) => ({
            id: `genre-${a.name}`,
            imageUrl: artistImageUrl(a.name, spotifyArtistImgs, resolvedImages),
            title: a.name,
            subtitle: a.tags.slice(0, 2).join(", ") || "Artist",
            href: artistHref(a.name, resolvedIds.get(a.name)),
          }));
          const label = topTag.charAt(0).toUpperCase() + topTag.slice(1);
          allRows.push({ label: `More ${label}`, items: genreTiles, size: "lg" });
        }
      }
    }

    return allRows;
  }, [profile, lastFmData, recommendations, topArtistNames, resolvedImages, resolvedIds]);

  return { rows, loading };
}
