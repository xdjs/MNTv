/**
 * usePersonalizedCatalog
 *
 * Builds Browse rows from the user's connected services:
 * - Spotify top artists / tracks (stored in profile after OAuth)
 * - Last.fm top artists / recent tracks (fetched from lastfm-sync edge fn)
 * - YouTube top artists (stored after Google OAuth)
 * - Real artist recommendations via Last.fm getSimilar (lastfm-recommendations fn)
 *
 * Falls back to the mock catalog ONLY for guests.
 */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/mock/types";
import { artists as mockArtists, tracks as mockTracks } from "@/mock/tracks";

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
interface LastFmTrack { artist: string; name: string; album: string; }
interface RealArtist { name: string; imageUrl: string; tags: string[]; }

// ── Helpers ──────────────────────────────────────────────────────────

function artistImageUrl(name: string): string {
  const found = mockArtists.find(
    (a) => a.name.toLowerCase() === name.toLowerCase()
  );
  if (found) return found.imageUrl;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1a1a2e&textColor=ffffff&fontSize=38`;
}

function trackCoverUrl(trackName: string, artistName: string): string {
  const found = mockTracks.find(
    (t) =>
      t.title.toLowerCase() === trackName.toLowerCase() &&
      t.artist.toLowerCase() === artistName.toLowerCase()
  );
  if (found) return found.coverArtUrl;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artistName + trackName)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
}

function realTrackHref(artist: string, title: string, album?: string): string {
  const parts = ["real", artist, title, album || ""].map(encodeURIComponent);
  return `/listen/${parts.join("::")}`;
}

function artistHref(name: string): string {
  const mock = mockArtists.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (mock) return `/artist/${mock.id}`;
  return `/artist/real::${encodeURIComponent(name)}`;
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

  // Fetch Last.fm data if the user has a username
  useEffect(() => {
    if (!profile?.lastFmUsername) return;
    supabase.functions
      .invoke("lastfm-sync", { body: { username: profile.lastFmUsername } })
      .then(({ data }) => {
        if (data?.topArtists) {
          setLastFmData({
            topArtists: data.topArtists,
            recentTracks: data.recentTracks || [],
          });
        }
      })
      .catch(console.warn);
  }, [profile?.lastFmUsername]);

  // Fetch real artist recommendations based on the user's top artists
  useEffect(() => {
    if (!profile) return;

    const topArtistNames: string[] = [];
    if (profile.spotifyTopArtists?.length) topArtistNames.push(...profile.spotifyTopArtists);
    if (lastFmData?.topArtists?.length) {
      lastFmData.topArtists.forEach((a) => {
        if (!topArtistNames.includes(a.name)) topArtistNames.push(a.name);
      });
    }

    if (!topArtistNames.length) return;

    setLoading(true);
    supabase.functions
      .invoke("lastfm-recommendations", { body: { topArtists: topArtistNames } })
      .then(({ data }) => {
        if (data?.recommendations?.length) {
          setRecommendations(data.recommendations);
        }
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [profile, lastFmData]);

  const rows = useMemo<BrowseRow[]>(() => {
    // ── Guest → mock catalog only ─────────────────────────────────────
    if (!profile) return buildMockRows();

    const allRows: BrowseRow[] = [];

    // Collect top artist names from all connected sources
    const topArtistNames: string[] = [];
    if (profile.spotifyTopArtists?.length) topArtistNames.push(...profile.spotifyTopArtists);
    if (lastFmData?.topArtists?.length) {
      lastFmData.topArtists.forEach((a) => {
        if (!topArtistNames.includes(a.name)) topArtistNames.push(a.name);
      });
    }

    // ── 1. "Jump Back In" ────────────────────────────────────────────
    const recentTiles: BrowseTile[] = [];

    if (lastFmData?.recentTracks?.length) {
      lastFmData.recentTracks.slice(0, 8).forEach((t) => {
        const mockTrack = mockTracks.find(
          (m) =>
            m.title.toLowerCase() === t.name.toLowerCase() &&
            m.artist.toLowerCase() === t.artist.toLowerCase()
        );
        recentTiles.push({
          id: `recent-${t.artist}-${t.name}`,
          imageUrl: trackCoverUrl(t.name, t.artist),
          title: t.name,
          subtitle: t.artist,
          href: mockTrack
            ? `/listen/${mockTrack.id}`
            : realTrackHref(t.artist, t.name, t.album),
          isRealTrack: !mockTrack,
        });
      });
    } else if (profile.spotifyTopTracks?.length) {
      // Use Spotify top tracks as "recently listened" if no Last.fm recent
      profile.spotifyTopTracks.slice(0, 8).forEach((t) => {
        const [trackTitle, artistName] = t.split(" — ");
        const mockTrack = mockTracks.find(
          (m) =>
            m.title.toLowerCase() === (trackTitle || t).toLowerCase() &&
            (!artistName || m.artist.toLowerCase() === artistName.toLowerCase())
        );
        recentTiles.push({
          id: `recent-${t}`,
          imageUrl: mockTrack?.coverArtUrl || trackCoverUrl(trackTitle || t, artistName || ""),
          title: trackTitle || t,
          subtitle: artistName || "",
          href: mockTrack
            ? `/listen/${mockTrack.id}`
            : realTrackHref(artistName || "", trackTitle || t),
          isRealTrack: !mockTrack,
        });
      });
    }

    if (recentTiles.length > 0) {
      allRows.push({ label: "Jump Back In", items: recentTiles, size: "md" });
    }

    // ── 2. "Your Top Artists" ────────────────────────────────────────
    const topArtistTiles: BrowseTile[] = topArtistNames.slice(0, 20).map((name) => ({
      id: `artist-${name}`,
      imageUrl: artistImageUrl(name),
      title: name,
      subtitle: "Artist",
      href: artistHref(name),
    }));

    if (topArtistTiles.length > 0) {
      allRows.push({ label: "Your Top Artists", items: topArtistTiles, size: "lg" });
    }

    // ── 3. "Your Top Tracks" ─────────────────────────────────────────
    if (profile.spotifyTopTracks?.length) {
      const trackTiles: BrowseTile[] = profile.spotifyTopTracks.slice(0, 16).map((t) => {
        const [trackTitle, artistName] = t.split(" — ");
        const mockTrack = mockTracks.find(
          (m) =>
            m.title.toLowerCase() === (trackTitle || t).toLowerCase() &&
            (!artistName || m.artist.toLowerCase() === artistName.toLowerCase())
        );
        return {
          id: `track-${t}`,
          imageUrl: mockTrack?.coverArtUrl || trackCoverUrl(trackTitle || t, artistName || ""),
          title: trackTitle || t,
          subtitle: artistName || "",
          href: mockTrack
            ? `/listen/${mockTrack.id}`
            : realTrackHref(artistName || "", trackTitle || t),
          isRealTrack: !mockTrack,
        };
      });
      allRows.push({ label: "Your Top Tracks", items: trackTiles, size: "md" });
    }

    // ── 4. "Recommended For You" — real Last.fm similar artists ──────
    if (recommendations.length > 0) {
      const recTiles: BrowseTile[] = recommendations.map((a) => ({
        id: `rec-${a.name}`,
        imageUrl: a.imageUrl,
        title: a.name,
        subtitle: a.tags.slice(0, 2).join(", ") || "Artist",
        href: artistHref(a.name),
      }));
      allRows.push({ label: "Recommended For You", items: recTiles, size: "lg" });
    }

    // ── If no connected data yet — show mock catalog as fallback ─────
    if (allRows.length === 0) return buildMockRows();

    return allRows;
  }, [profile, lastFmData, recommendations]);

  return { rows, loading };
}

// ── Mock catalog fallback (guests only) ──────────────────────────────

function buildMockRows(): BrowseRow[] {
  const artistTiles: BrowseTile[] = mockArtists.map((a) => ({
    id: a.id,
    imageUrl: a.imageUrl,
    title: a.name,
    subtitle: a.genres[0],
    href: `/artist/${a.id}`,
  }));

  const recentTiles: BrowseTile[] = mockTracks.slice(0, 8).map((t) => ({
    id: t.id,
    imageUrl: t.coverArtUrl,
    title: t.title,
    subtitle: t.artist,
    href: `/listen/${t.id}`,
  }));

  return [
    { label: "Jump Back In", items: recentTiles, size: "md" },
    { label: "Artists", items: artistTiles, size: "lg" },
  ];
}
