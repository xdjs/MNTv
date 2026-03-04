/**
 * usePersonalizedCatalog
 *
 * Builds Browse rows from the user's connected services:
 * - Spotify top artists / tracks (stored in profile after OAuth)
 * - Last.fm top artists / recent tracks (fetched from lastfm-sync edge fn)
 * - YouTube top artists (stored after Google OAuth)
 *
 * Falls back to the mock catalog for guest users.
 */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/mock/types";
import { artists as mockArtists, albums as mockAlbums, tracks as mockTracks } from "@/mock/tracks";

export interface BrowseTile {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  href: string;
  /** true = open in-app listen; false = external */
  isRealTrack?: boolean;
}

export interface BrowseRow {
  label: string;
  items: BrowseTile[];
  size: "sm" | "md" | "lg";
}

interface LastFmArtist { name: string; playcount: number; }
interface LastFmTrack { artist: string; name: string; album: string; }

// ── Helpers ──────────────────────────────────────────────────────────

function artistImageUrl(name: string): string {
  // Try to find the artist in the mock catalog first (has real assets)
  const found = mockArtists.find(
    (a) => a.name.toLowerCase() === name.toLowerCase()
  );
  if (found) return found.imageUrl;
  // Stable placeholder from DiceBear based on artist name
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1a1a2e&textColor=ffffff&fontSize=38`;
}

function trackCoverUrl(trackName: string, artistName: string): string {
  // Check mock catalog
  const found = mockTracks.find(
    (t) =>
      t.title.toLowerCase() === trackName.toLowerCase() &&
      t.artist.toLowerCase() === artistName.toLowerCase()
  );
  if (found) return found.coverArtUrl;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artistName + trackName)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
}

function realTrackHref(artist: string, title: string, album?: string): string {
  // Encode into a special trackId format: real::artist::title::album
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
  const [lastFmLoading, setLastFmLoading] = useState(false);

  // Fetch Last.fm data if the user has a username
  useEffect(() => {
    if (!profile?.lastFmUsername) return;
    setLastFmLoading(true);
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
      .catch(console.warn)
      .finally(() => setLastFmLoading(false));
  }, [profile?.lastFmUsername]);

  const rows = useMemo<BrowseRow[]>(() => {
    // ── Guest / no profile → mock catalog ────────────────────────────
    if (!profile) {
      return buildMockRows();
    }

    const allRows: BrowseRow[] = [];

    // ── 1. "Jump Back In" — recent tracks from Last.fm or mock ───────
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
    } else {
      // Fall back to mock recent
      mockTracks.slice(0, 8).forEach((t) => {
        recentTiles.push({
          id: t.id,
          imageUrl: t.coverArtUrl,
          title: t.title,
          subtitle: t.artist,
          href: `/listen/${t.id}`,
        });
      });
    }

    if (recentTiles.length > 0) {
      allRows.push({ label: "Jump Back In", items: recentTiles, size: "md" });
    }

    // ── 2. "Your Top Artists" — from Spotify / YouTube / Last.fm ─────
    const topArtistNames: string[] = [];

    if (profile.spotifyTopArtists?.length) {
      topArtistNames.push(...profile.spotifyTopArtists);
    }
    // Add YouTube artists not already included
    // (stored as spotifyTopArtists when signed in with Google)
    if (lastFmData?.topArtists?.length) {
      lastFmData.topArtists.forEach((a) => {
        if (!topArtistNames.includes(a.name)) topArtistNames.push(a.name);
      });
    }

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

    // ── 3. "Recommended For You" — based on related artists in mock ──
    const relatedTiles: BrowseTile[] = [];
    const addedIds = new Set<string>();

    topArtistNames.forEach((name) => {
      const mock = mockArtists.find(
        (a) => a.name.toLowerCase() === name.toLowerCase()
      );
      if (!mock) return;
      mock.relatedArtistIds.forEach((relId) => {
        if (addedIds.has(relId)) return;
        const rel = mockArtists.find((a) => a.id === relId);
        if (!rel) return;
        addedIds.add(relId);
        relatedTiles.push({
          id: `rec-${rel.id}`,
          imageUrl: rel.imageUrl,
          title: rel.name,
          subtitle: rel.genres[0] || "",
          href: `/artist/${rel.id}`,
        });
      });
    });

    if (relatedTiles.length > 0) {
      allRows.push({
        label: "Recommended For You",
        items: relatedTiles.slice(0, 12),
        size: "lg",
      });
    }

    // ── 4. "Your Top Tracks" — Spotify top tracks ─────────────────────
    if (profile.spotifyTopTracks?.length) {
      const trackTiles: BrowseTile[] = profile.spotifyTopTracks.slice(0, 16).map((t) => {
        // Format: "Track Name — Artist Name"
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

    // ── 5. Catalog rows — always show for discovery ───────────────────
    // Show artists from catalog that aren't already in the user's top artists
    const catalogArtistTiles = mockArtists
      .filter(
        (a) =>
          !topArtistNames.some((n) => n.toLowerCase() === a.name.toLowerCase())
      )
      .map((a) => ({
        id: a.id,
        imageUrl: a.imageUrl,
        title: a.name,
        subtitle: a.genres[0],
        href: `/artist/${a.id}`,
      }));

    if (catalogArtistTiles.length > 0) {
      allRows.push({ label: "Discover Artists", items: catalogArtistTiles, size: "lg" });
    }

    // If no personalized data at all, show full mock catalog
    if (allRows.length <= 1) {
      return buildMockRows();
    }

    return allRows;
  }, [profile, lastFmData]);

  return { rows, loading: lastFmLoading };
}

// ── Mock catalog fallback ─────────────────────────────────────────────

function buildMockRows(): BrowseRow[] {
  const artistTiles: BrowseTile[] = mockArtists.map((a) => ({
    id: a.id,
    imageUrl: a.imageUrl,
    title: a.name,
    subtitle: a.genres[0],
    href: `/artist/${a.id}`,
  }));

  const albumTiles: BrowseTile[] = mockAlbums.map((a) => {
    const artist = mockArtists.find((ar) => ar.id === a.artistId);
    return {
      id: a.id,
      imageUrl: a.coverArtUrl,
      title: a.title,
      subtitle: artist?.name || "",
      href: `/album/${a.id}`,
    };
  });

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
    { label: "Albums", items: albumTiles, size: "md" },
  ];
}
