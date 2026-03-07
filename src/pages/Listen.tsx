import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Smartphone } from "lucide-react";
// mock/tracks kept as reference — no longer imported for runtime use
import { useThemeSync } from "@/hooks/useThemeSync";
import { QRCode } from "react-qrcode-logo";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import NuggetCard from "@/components/NuggetCard";
import MediaOverlay from "@/components/overlays/MediaOverlay";
import ReadingOverlay from "@/components/overlays/ReadingOverlay";
import NuggetDeepDive from "@/components/overlays/NuggetDeepDive";
import DevPanel from "@/components/DevPanel";
import PlaybackBar from "@/components/PlaybackBar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useAINuggets } from "@/hooks/useAINuggets";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import { usePlayer } from "@/contexts/PlayerContext";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import PageTransition from "@/components/PageTransition";
import type { Nugget, Source, AnimationStyle } from "@/mock/types";

/** Shape of a track result returned by the spotify-search edge function. */
interface SpotifyTrackResult {
  title: string;
  artist: string;
  album?: string;
  uri?: string;
}

const HIDE_DELAY = 3000;

export default function Listen() {
  const { trackId: rawTrackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();

  const { profile, saveProfile } = useUserProfile();

  // ── Track parsing — all tracks encoded as: real::<artist>::<title>::<album>::<uri> ──
  const realTrackMeta = useMemo(() => {
    if (!rawTrackId?.startsWith("real%3A%3A") && !rawTrackId?.startsWith("real::")) return null;
    const decoded = decodeURIComponent(rawTrackId);
    const parts = decoded.split("::");
    return {
      artist: decodeURIComponent(parts[1] || ""),
      title: decodeURIComponent(parts[2] || ""),
      album: decodeURIComponent(parts[3] || "") || undefined,
      spotifyUri: decodeURIComponent(parts[4] || "") || undefined,
    };
  }, [rawTrackId]);

  const trackId = rawTrackId || "";

  // Read cover art from URL query param (set by Browse demo tiles)
  const urlArt = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("art") || "";
  }, []);

  const track = useMemo(() => {
    if (!realTrackMeta) return null;
    // Try URL query param first (demo tiles pass ?art=), then profile, then DiceBear
    let coverArtUrl = urlArt;
    if (!coverArtUrl && profile?.spotifyTrackImages) {
      const match = profile.spotifyTrackImages.find(
        (t) =>
          t.title.toLowerCase() === realTrackMeta.title.toLowerCase() &&
          t.artist.toLowerCase() === realTrackMeta.artist.toLowerCase()
      );
      if (match?.imageUrl) coverArtUrl = match.imageUrl;
    }
    if (!coverArtUrl && profile?.spotifyArtistImages?.[realTrackMeta.artist]) {
      coverArtUrl = profile.spotifyArtistImages[realTrackMeta.artist];
    }
    if (!coverArtUrl) {
      coverArtUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(realTrackMeta.artist + realTrackMeta.title)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
    }
    return {
      id: trackId,
      title: realTrackMeta.title,
      artist: realTrackMeta.artist,
      artistId: "",
      albumId: "",
      album: realTrackMeta.album,
      durationSec: 300,
      coverArtUrl,
      trackNumber: 1,
    };
  }, [realTrackMeta, trackId, urlArt, profile?.spotifyTrackImages, profile?.spotifyArtistImages]);

  // ── Playback source resolution ───────────────────────────────────────
  const { hasSpotifyToken } = useSpotifyToken();
  const [spotifyUri, setSpotifyUri] = useState<string | null>(null);

  // Resolve Spotify URI — from route (real tracks) or by searching Spotify
  useEffect(() => {
    setSpotifyUri(null);

    // Real track with URI baked into the route
    if (realTrackMeta?.spotifyUri) {
      setSpotifyUri(realTrackMeta.spotifyUri);
      return;
    }

    // No Spotify token → skip Spotify search
    if (!hasSpotifyToken || !track) return;

    let cancelled = false;
    async function findSpotifyUri() {
      try {
        // Pass artist + title separately for precise Spotify field filtering
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { artist: track!.artist, title: track!.title },
        });
        if (cancelled) return;
        if (error) { console.error("[Listen] Spotify search error:", error); return; }

        const tracks = data?.tracks || [];
        const titleLower = track!.title.toLowerCase();
        const artistLower = track!.artist.toLowerCase();

        // 1. Exact match (case-insensitive)
        let match = (tracks as SpotifyTrackResult[]).find((t) =>
          t.title.toLowerCase() === titleLower &&
          t.artist.toLowerCase() === artistLower
        );
        // 2. Title contains match + artist match
        if (!match) {
          match = (tracks as SpotifyTrackResult[]).find((t) =>
            t.artist.toLowerCase() === artistLower &&
            (t.title.toLowerCase().includes(titleLower) || titleLower.includes(t.title.toLowerCase()))
          );
        }
        // 3. Partial artist match + exact title
        if (!match) {
          match = (tracks as SpotifyTrackResult[]).find((t) =>
            t.title.toLowerCase() === titleLower &&
            (t.artist.toLowerCase().includes(artistLower) || artistLower.includes(t.artist.toLowerCase()))
          );
        }
        // 4. Only fall back to first result if artist partially matches
        if (!match && tracks.length > 0) {
          const firstTrack = tracks[0] as SpotifyTrackResult;
          if (firstTrack.artist.toLowerCase().includes(artistLower) || artistLower.includes(firstTrack.artist.toLowerCase())) {
            match = firstTrack;
          }
        }

        if (match?.uri) {
          console.log(`[Listen] Spotify match: "${match.artist} - ${match.title}" for "${track!.artist} - ${track!.title}"`);
          setSpotifyUri(match.uri);
        } else {
          console.warn(`[Listen] No Spotify match for "${track!.artist} - ${track!.title}"`);
        }
      } catch (err) {
        console.error("[Listen] Spotify URI search failed:", err);
      }
    }
    findSpotifyUri();
    return () => { cancelled = true; };
  }, [hasSpotifyToken, realTrackMeta?.spotifyUri, track?.artist, track?.title]);

  const [shuffleOn, setShuffleOn] = useState(false); // kept for PlaybackBar UI only
  const [regenerateKey, setRegenerateKey] = useState(0);
  const [skipLoading, setSkipLoading] = useState(false);


  // Push current track to global history (persists across Listen re-mounts)
  // Include ?art= query param so prev navigation preserves artwork
  const player = usePlayer();
  useEffect(() => {
    const artParam = urlArt ? `?art=${encodeURIComponent(urlArt)}` : "";
    player.pushTrackHistory(`/listen/${rawTrackId}${artParam}`);
  }, [rawTrackId, urlArt, player]);

  // If this track was previously listened to in this session, restore the listen depth.
  // This handles both track completion (onEnded) and returning to a track via prev/browse.
  useEffect(() => {
    if (!track) return;
    const key = `${track.artist}::${track.title}`;
    if (player.isTrackCompleted(key)) {
      // Track ended naturally — clear flag and force fresh generation
      player.clearTrackCompleted(key);
      setRegenerateKey((k) => k + 1);
    } else {
      // Check if we already listened to this track earlier in this session.
      // The session listen count was stored by useAINuggets after resolving from DB.
      const sessionCount = player.getTrackListenCount(key);
      if (sessionCount > 1) {
        // Set regenerateKey to match the prior listen depth so useAINuggets
        // skips the first-listen cache and generates at the correct depth.
        setRegenerateKey(sessionCount - 1);
      }
    }
  }, [trackId, track, player]);

  // For real tracks: next is always available (we fetch on demand), prev uses global history
  const hasPrev = !!player.prevTrackRoute;
  const hasNext = true;

  // Suppress external track detection during our own navigation (track end, next/prev)
  const isNavigatingRef = useRef(false);
  const lastLoadedTrackRef = useRef<string | null>(null);
  const prevRawTrackIdRef = useRef<string | undefined>(rawTrackId);

  // Reset navigation lock + load guard when the route changes (new track mounted).
  // Also pause the current track immediately so the old track doesn't keep playing
  // while the new URI resolves, and clear external listen mode so the load effect
  // isn't blocked on subsequent track switches.
  useEffect(() => {
    const isTrackSwitch = prevRawTrackIdRef.current !== undefined &&
      prevRawTrackIdRef.current !== rawTrackId;
    prevRawTrackIdRef.current = rawTrackId;

    isNavigatingRef.current = false;
    lastLoadedTrackRef.current = null;

    if (isTrackSwitch) {
      player.pause();
      if (isExternalListenMode) setExternalListenMode(false);
    }
  }, [rawTrackId]);

  // Fetch a related track from Spotify and navigate to it
  const navigateToRelated = useCallback(async () => {
    if (!track) return;
    isNavigatingRef.current = true;
    setSkipLoading(true);
    try {
      const titleLower = track.title.toLowerCase();

      const navigateTo = (pick: SpotifyTrackResult) => {
        navigate(
          `/listen/real::${encodeURIComponent(pick.artist)}::${encodeURIComponent(pick.title)}::${encodeURIComponent(pick.album || "")}::${encodeURIComponent(pick.uri || "")}`
        );
      };

      // Attempt 1: Spotify Recommendations (best — returns related artists + tracks)
      if (spotifyUri) {
        const { data: recData } = await supabase.functions.invoke("spotify-search", {
          body: { recommend: spotifyUri },
        });
        const recs = (recData?.tracks as SpotifyTrackResult[] || []).filter(
          (t) => t.title.toLowerCase() !== titleLower
        );
        if (recs.length > 0) {
          navigateTo(recs[Math.floor(Math.random() * Math.min(recs.length, 5))]);
          return;
        }
      }

      // Attempt 2: search for more tracks by same artist
      const { data } = await supabase.functions.invoke("spotify-search", {
        body: { query: track.artist },
      });
      const artistLower = track.artist.toLowerCase();
      const sameArtist = (data?.tracks as SpotifyTrackResult[] || []).filter(
        (t) =>
          t.title.toLowerCase() !== titleLower &&
          t.artist.toLowerCase().includes(artistLower)
      );
      if (sameArtist.length > 0) {
        navigateTo(sameArtist[Math.floor(Math.random() * Math.min(sameArtist.length, 5))]);
        return;
      }

      // No results at all — reset navigation lock
      console.warn("[Listen] No related tracks found for", track.artist);
      isNavigatingRef.current = false;
    } catch (err) {
      console.warn("[Listen] Skip next failed:", err);
      isNavigatingRef.current = false;
    } finally {
      setSkipLoading(false);
    }
  }, [track?.artist, track?.title, spotifyUri, navigate]);

  const handlePrev = useCallback(() => {
    isNavigatingRef.current = true;
    const prev = player.popTrackHistory();
    if (prev) navigate(prev);
  }, [navigate, player]);

  const handleNext = useCallback(() => {
    isNavigatingRef.current = true;
    navigateToRelated();
  }, [navigateToRelated]);

  const handleTrackEnd = useCallback(() => {
    if (track) player.markTrackCompleted(`${track.artist}::${track.title}`);
    isNavigatingRef.current = true;
    navigateToRelated();
  }, [navigateToRelated, track, player]);

  const {
    isPlaying, currentTime, duration: playerDuration, activePlayer,
    isExternalListenMode, setExternalListenMode, externalPlayback, spotifyStateTrack,
  } = player;
  const realDuration = playerDuration > 0 ? playerDuration : (track?.durationSec || 300);

  // 5-second listen threshold — counts as a "listen" for progression purposes.
  // Marks the track as completed in session so next visit triggers fresh nuggets.
  // Also increments the DB listen_count so the backend knows the depth.
  const listenThresholdMetRef = useRef(false);
  useEffect(() => {
    listenThresholdMetRef.current = false;
  }, [trackId]);

  useEffect(() => {
    if (!track || !isPlaying || currentTime < 5 || listenThresholdMetRef.current) return;
    listenThresholdMetRef.current = true;
    const key = `${track.artist}::${track.title}`;
    player.markTrackCompleted(key);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? localStorage.getItem("musicnerd_anon_id") ?? (() => {
        const id = crypto.randomUUID();
        localStorage.setItem("musicnerd_anon_id", id);
        return id;
      })();
      const trackKey = `${track.artist}::${track.title}`;
      const { data: historyRow } = await supabase
        .from("nugget_history")
        .select("listen_count, previous_nuggets")
        .eq("track_key", trackKey)
        .eq("user_id", userId)
        .maybeSingle();
      if (historyRow) {
        await supabase
          .from("nugget_history")
          .update({
            listen_count: (historyRow.listen_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("track_key", trackKey)
          .eq("user_id", userId);
      } else {
        await supabase
          .from("nugget_history")
          .insert({
            track_key: trackKey,
            user_id: userId,
            listen_count: 2,
            previous_nuggets: [],
          });
      }
    })();
  }, [track, isPlaying, currentTime, player, trackId]);

  // Use Spotify SDK album art when available (better than DiceBear for externally-changed tracks)
  const effectiveCoverArt = useMemo(() => {
    if (spotifyStateTrack?.albumArtUrl && track?.coverArtUrl?.includes("dicebear.com")) {
      return spotifyStateTrack.albumArtUrl;
    }
    return track?.coverArtUrl || "";
  }, [spotifyStateTrack?.albumArtUrl, track?.coverArtUrl]);

  // Register track-end handler on the global player
  useEffect(() => {
    player.setOnEnded(handleTrackEnd);
    return () => player.setOnEnded(null);
  }, [handleTrackEnd]);

  // Reset external listen mode when leaving the Listen page
  useEffect(() => {
    return () => setExternalListenMode(false);
  }, [setExternalListenMode]);

  // Navigate when Spotify plays a different track (e.g. user changed song on phone).
  // IMPORTANT: Only depend on spotifyStateTrack changes, NOT player.currentSpotifyUri.
  // Otherwise loadTrack (which sets currentSpotifyUri) causes the effect to fire while
  // the SDK still reports the OLD track, creating a false "external skip" → bounce loop.
  // Also require isPlaying — when loadTrack pauses the old track, the SDK fires a state
  // change for the OLD track (paused). Without the isPlaying guard, this is misinterpreted
  // as an external skip, causing a false redirect back to the old track's page.
  useEffect(() => {
    if (!spotifyStateTrack) return;
    if (isNavigatingRef.current) return;
    if (!isPlaying) return;
    if (!player.currentSpotifyUri) return;
    if (spotifyStateTrack.spotifyUri === player.currentSpotifyUri) return;
    // Also skip if the SDK is reporting what we're about to load (route resolved but loadTrack pending)
    if (spotifyUri && spotifyStateTrack.spotifyUri === spotifyUri) return;
    console.log(`[Listen] Spotify track changed externally: "${spotifyStateTrack.artist} - ${spotifyStateTrack.title}"`);
    isNavigatingRef.current = true;
    const newRoute = `/listen/real::${encodeURIComponent(spotifyStateTrack.artist)}::${encodeURIComponent(spotifyStateTrack.title)}::${encodeURIComponent(spotifyStateTrack.album)}::${encodeURIComponent(spotifyStateTrack.spotifyUri)}`;
    navigate(newRoute);
  }, [spotifyStateTrack?.spotifyUri, isPlaying]);

  // Fading state for overlay transitions
  const [fadingIn, setFadingIn] = useState(false);

  // Set track metadata on the global player
  useEffect(() => {
    if (!track) return;
    player.setCurrentTrack({
      trackId,
      title: track.title,
      artist: track.artist,
      coverArtUrl: effectiveCoverArt,
      album: track.album,
      spotifyUri: spotifyUri || undefined,
    });
  }, [track?.title, track?.artist, trackId, spotifyUri, effectiveCoverArt]);

  // Load track into global player when sources resolve
  // Skip if the same track is already playing (e.g. returning from Browse via mini-player)
  useEffect(() => {
    if (isExternalListenMode) return;
    if (!spotifyUri) return;
    if (player.currentSpotifyUri === spotifyUri) return;
    if (lastLoadedTrackRef.current === spotifyUri) return;
    lastLoadedTrackRef.current = spotifyUri;

    // If the SDK is already playing this track (external skip on Spotify),
    // just sync state — don't pause and restart playback.
    if (spotifyStateTrack?.spotifyUri === spotifyUri) {
      player.syncExternalTrack(spotifyUri);
      return;
    }

    player.loadTrack({ spotifyUri });
  }, [spotifyUri, isExternalListenMode]);

  const play = player.play;
  const seek = player.seek;
  const toggle = player.toggle;
  const pauseForOverlay = player.pause;
  const resumeWithFade = useCallback(() => {
    setFadingIn(true);
    player.play();
    setTimeout(() => setFadingIn(false), 1000);
  }, [player.play]);

  // AI-generated nuggets with real sources
  const tier = (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";
  const artistImageUrl = (track?.artist && profile?.spotifyArtistImages?.[track.artist]) || track?.coverArtUrl || "";
  const { nuggets: aiNuggets, sources: aiSources, loading: aiLoading, error: aiError, listenCount } = useAINuggets(
    trackId,
    track?.artist || "",
    track?.title || "",
    track?.album,
    track?.durationSec || 300,
    regenerateKey,
    track?.coverArtUrl,
    artistImageUrl,
    tier,
    profile?.spotifyTopArtists,
    profile?.spotifyTopTracks
  );

  // Log AI nugget errors for debugging
  useEffect(() => {
    if (aiError) console.error("[Listen] AI nugget error:", aiError);
  }, [aiError]);

  // Pre-generate companion content so QR code only shows when ready
  const [companionReady, setCompanionReady] = useState(false);
  const [shortId, setShortId] = useState<string | null>(null);
  useEffect(() => {
    setCompanionReady(false);
    setShortId(null);
  }, [rawTrackId]);

  useEffect(() => {
    if (aiLoading || aiNuggets.length === 0 || !track) return;
    let cancelled = false;
    (async () => {
      try {
        // Transform Listen page nuggets into CompanionNugget format so the
        // companion page shows the exact same content — no separate Gemini call.
        const kindToCategory: Record<string, string> = {
          artist: "history",
          track: "track",
          discovery: "explore",
        };
        const now = Date.now();
        const prebuiltNuggets = aiNuggets.map((n, i) => {
          const source = aiSources.get(n.sourceId);
          return {
            id: n.id,
            timestamp: now - i * 60000,
            headline: n.headline || "",
            text: n.text,
            category: kindToCategory[n.kind] || "track",
            listenUnlockLevel: listenCount,
            sourceName: source?.publisher || "",
            sourceUrl: source?.url || "",
            imageUrl: n.imageUrl,
            imageCaption: n.imageCaption,
          };
        });

        // Accumulate nuggets across listens within this session
        const trackKey = `${track.artist}::${track.title}`;
        player.appendCompanionNuggets(trackKey, prebuiltNuggets);
        const allAccumulatedNuggets = player.getCompanionNuggets(trackKey);

        // Pre-generate companion content so the QR companion page loads instantly.
        // Use actual tier so each tier's companion is cached separately.
        // Pass image URLs so the companion page works for unauthenticated QR users.
        const { error } = await supabase.functions.invoke("generate-companion", {
          body: {
            artist: track.artist,
            title: track.title,
            album: track.album,
            listenCount,
            tier,
            prebuiltNuggets: allAccumulatedNuggets,
            coverArtUrl: effectiveCoverArt || undefined,
            artistImage: artistImageUrl || effectiveCoverArt || undefined,
          },
        });
        if (cancelled) return;
        if (error) console.warn("[Listen] Companion pre-gen error:", error);

        // Create or reuse a short URL for the QR code (even if pre-gen failed,
        // the companion page will generate on demand)
        try {
          const { data: existing, error: selErr } = await supabase
            .from("companion_links")
            .select("short_id")
            .eq("artist", track.artist)
            .eq("title", track.title)
            .maybeSingle();

          if (cancelled) return;
          if (selErr) console.warn("[Listen] companion_links select error:", selErr);

          if (existing) {
            setShortId(existing.short_id);
          } else {
            const arr = new Uint8Array(6);
            crypto.getRandomValues(arr);
            const newId = Array.from(arr, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62]).join("");
            const { error: insErr } = await supabase.from("companion_links").insert({
              short_id: newId,
              artist: track.artist,
              title: track.title,
              album: track.album || null,
            });
            if (insErr) console.warn("[Listen] companion_links insert error:", insErr);
            if (!cancelled && !insErr) setShortId(newId);
          }
        } catch (linkErr) {
          console.warn("[Listen] Short link creation failed:", linkErr);
        }

        if (!cancelled) setCompanionReady(true);
      } catch {
        // Companion pre-gen failed — QR just won't show
      }
    })();
    return () => { cancelled = true; };
  }, [aiLoading, aiNuggets, aiSources, track?.artist, track?.title, tier, listenCount]);

  const rawTrackNuggets = useMemo(
    () => aiLoading ? [] : aiNuggets,
    [aiLoading, aiNuggets]
  );

  // Redistribute nugget timestamps based on actual player duration instead of
  // the hardcoded 300s default. This ensures nuggets are evenly spaced across
  // the real track length so all 3 show up even on short tracks.
  const trackNuggets = useMemo(() => {
    if (rawTrackNuggets.length === 0 || realDuration <= 0) return rawTrackNuggets;
    const earlyStart = 10;
    const endBuffer = 10;
    const usable = Math.max(realDuration - earlyStart - endBuffer, 20);
    const spacing = usable / (rawTrackNuggets.length + 1);
    return rawTrackNuggets.map((n, i) => ({
      ...n,
      timestampSec: Math.floor(earlyStart + spacing * (i + 1)),
    }));
  }, [rawTrackNuggets, realDuration]);

  const [animStyle, setAnimStyle] = useState<AnimationStyle>("A");
  const [activeNugget, setActiveNugget] = useState<Nugget | null>(null);
  const [nuggetQueue, setNuggetQueue] = useState<Nugget[]>([]);
  const [shownNuggetIds, setShownNuggetIds] = useState<Set<string>>(new Set());
  const [dismissedNuggets, setDismissedNuggets] = useState<Map<string, Nugget>>(new Map());
  const [reopenedNuggetId, setReopenedNuggetId] = useState<string | null>(null);
  const [mediaOverlay, setMediaOverlay] = useState<Source | null>(null);
  const [readingOverlay, setReadingOverlay] = useState<Source | null>(null);
  const [deepDiveNugget, setDeepDiveNugget] = useState<Nugget | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [nerdActive, setNerdActive] = useState(true);
  const [liked, setLiked] = useState<boolean | null>(null);

  // --- Auto-hide bar logic ---
  const [barVisible, setBarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBar = useCallback((keepVisible?: boolean) => {
    setBarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!keepVisible) {
      hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
    }
  }, []);

  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight * 0.85) showBar();
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [showBar]);

  // Click nugget card to open deep dive
  const handleNuggetClick = useCallback((nugget: Nugget) => {
    setDeepDiveNugget(nugget);
    setNuggetFocused(false);
  }, []);

  // Re-open a dismissed nugget from its mini-logo (does NOT seek)
  const handleMiniLogoClick = useCallback((id: string) => {
    const nugget = dismissedNuggets.get(id);
    if (!nugget) return;
    setDismissedNuggets((prev) => { const next = new Map(prev); next.delete(id); return next; });
    setNuggetQueue([]);
    setActiveNugget(nugget);
    setReopenedNuggetId(id);
    showBar(true);
  }, [dismissedNuggets, showBar]);

  const [nuggetFocused, setNuggetFocused] = useState(false);
  const nuggetRef = useRef<HTMLDivElement>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dwelling, setDwelling] = useState(false);

  // Clear dwell timer helper
  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    setDwelling(false);
  }, []);

  // Focus zones: top (back=0, nerd=1), nugget, bar (dislike=0..like=4)
  type FocusZone = 'top' | 'nugget' | 'bar';
  const [focusZone, setFocusZone] = useState<FocusZone>('bar');
  const [barFocusIndex, setBarFocusIndex] = useState(2);
  const [topFocusIndex, setTopFocusIndex] = useState(0); // 0=back, 1=nerd

  const BAR_BUTTON_COUNT = 6;
  const TOP_BUTTON_COUNT = 2;

  const handleBarAction = useCallback((index: number) => {
    switch (index) {
      case 0: setLiked((v) => v === false ? null : false); break;
      case 1: handlePrev(); break;
      case 2: toggle(); break;
      case 3: handleNext(); break;
      case 4: setLiked((v) => v === true ? null : true); break;
      case 5: setShuffleOn((v) => !v); break;
    }
  }, [handlePrev, handleNext, toggle]);

  const handleTopAction = useCallback((index: number) => {
    if (index === 0) navigate("/browse");
    else setNerdActive((v) => !v);
  }, [navigate]);

  // Zone ordering for Up/Down navigation
  const getZonesInOrder = useCallback((): FocusZone[] => {
    const zones: FocusZone[] = ['top'];
    if (activeNugget) zones.push('nugget');
    zones.push('bar');
    return zones;
  }, [activeNugget]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Let overlay handle its own keys when open
      if (deepDiveNugget || mediaOverlay || readingOverlay) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        clearDwell();
        const zones = getZonesInOrder();
        const idx = zones.indexOf(focusZone);
        if (idx > 0) {
          const newZone = zones[idx - 1];
          setFocusZone(newZone);
          setNuggetFocused(newZone === 'nugget');
          if (newZone === 'nugget') {
            nuggetRef.current?.focus();
            // Start dwell timer
            setDwelling(true);
            dwellTimerRef.current = setTimeout(() => {
              if (activeNugget) handleNuggetClick(activeNugget);
              setDwelling(false);
            }, 1500);
          }
          if (newZone !== 'nugget') showBar();
        } else {
          showBar();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        clearDwell();
        const zones = getZonesInOrder();
        const idx = zones.indexOf(focusZone);
        if (idx < zones.length - 1) {
          const newZone = zones[idx + 1];
          setFocusZone(newZone);
          setNuggetFocused(newZone === 'nugget');
          if (newZone === 'nugget') {
            nuggetRef.current?.focus();
            setDwelling(true);
            dwellTimerRef.current = setTimeout(() => {
              if (activeNugget) handleNuggetClick(activeNugget);
              setDwelling(false);
            }, 1500);
          }
          if (newZone === 'bar') showBar();
        } else {
          showBar();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        clearDwell();
        if (focusZone === 'bar') setBarFocusIndex((i) => Math.max(0, i - 1));
        else if (focusZone === 'top') setTopFocusIndex((i) => Math.max(0, i - 1));
        showBar();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        clearDwell();
        if (focusZone === 'bar') setBarFocusIndex((i) => Math.min(BAR_BUTTON_COUNT - 1, i + 1));
        else if (focusZone === 'top') setTopFocusIndex((i) => Math.min(TOP_BUTTON_COUNT - 1, i + 1));
        showBar();
      } else if (e.key === "Enter") {
        e.preventDefault();
        clearDwell();
        if (focusZone === 'nugget' && activeNugget) {
          handleNuggetClick(activeNugget);
          // Don't show bar when entering deep dive
        } else if (focusZone === 'bar') {
          handleBarAction(barFocusIndex);
          showBar();
        } else if (focusZone === 'top') {
          handleTopAction(topFocusIndex);
          showBar();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        showBar();
        if (isExternalListenMode) {
          setExternalListenMode(false);
          lastLoadedTrackRef.current = null;
        } else {
          toggle();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBar, toggle, focusZone, barFocusIndex, topFocusIndex, activeNugget, handleNuggetClick, handleBarAction, handleTopAction, getZonesInOrder, deepDiveNugget, mediaOverlay, readingOverlay, clearDwell]);

  // Clean up dwell timer on unmount or nugget change
  useEffect(() => {
    return () => clearDwell();
  }, [activeNugget, clearDwell]);

  useEffect(() => { if (!isExternalListenMode) play(); }, [play, isExternalListenMode]);

  useEffect(() => {
    if (aiNuggets.length === 0) return;
    setActiveNugget(null);
    setNuggetQueue([]);
    setDismissedNuggets(new Map());
    setReopenedNuggetId(null);
    // Don't skip any nuggets on arrival — show all of them sequentially.
    // The trigger logic below will fire them one by one via the queue.
    setShownNuggetIds(new Set());
  }, [aiNuggets]);

  useEffect(() => {
    if (!nerdActive) { setActiveNugget(null); setNuggetQueue([]); }
  }, [nerdActive]);

  const handleSeek = useCallback((t: number) => {
    // Find the nugget whose window contains the seek position
    const targetNugget = trackNuggets.reduce<typeof trackNuggets[0] | null>((best, n) => {
      if (t < n.timestampSec) return best; // haven't reached this nugget yet
      if (!best) return n;
      // Pick the nugget closest to (but not past) the seek time
      return (t - n.timestampSec) < (t - best.timestampSec) ? n : best;
    }, null);

    setNuggetQueue([]);
    seek(t);

    // Mark nuggets before the seek position as "shown" so they don't
    // re-trigger. Exclude the target nugget (closest to seek time) so the
    // trigger effect can fire it naturally when playback ticks.
    const newShown = new Set<string>();
    for (const n of trackNuggets) {
      if (n.timestampSec <= t && n !== targetNugget) newShown.add(n.id);
    }
    setShownNuggetIds(newShown);
    setActiveNugget(null);

    // Preserve dismissed nuggets before seek point (except the target, which
    // should re-trigger), clear ones after
    setDismissedNuggets((prev) => {
      const next = new Map<string, Nugget>();
      for (const [id, nugget] of prev) {
        if (nugget.timestampSec <= t && id !== targetNugget?.id) next.set(id, nugget);
      }
      return next;
    });
  }, [seek, trackNuggets]);

  // Nugget trigger logic — fires on playback tick
  useEffect(() => {
    if (!isPlaying || !nerdActive) return;
    for (const n of trackNuggets) {
      if (shownNuggetIds.has(n.id)) continue;
      if (currentTime >= n.timestampSec) {
        if (activeNugget) {
          setNuggetQueue((q) => (q.find((x) => x.id === n.id) ? q : [...q, n]));
        } else {
          setActiveNugget(n);
          setReopenedNuggetId(null);
          setShownNuggetIds((s) => new Set(s).add(n.id));
        }
      }
    }
  }, [currentTime, isPlaying, nerdActive, trackNuggets, activeNugget, shownNuggetIds]);

  // Auto-dismiss nugget: quick swap if queued, otherwise fade after 8s
  useEffect(() => {
    if (!activeNugget || deepDiveNugget || nuggetFocused) return;
    const delay = nuggetQueue.length > 0 ? 6000 : 8000;
    const timer = setTimeout(() => {
      setDismissedNuggets((prev) => new Map(prev).set(activeNugget.id, activeNugget));
      setActiveNugget(null);
      setReopenedNuggetId(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [activeNugget, deepDiveNugget, nuggetFocused, nuggetQueue.length]);

  useEffect(() => {
    if (!activeNugget && nuggetQueue.length > 0) {
      const next = nuggetQueue[0];
      setNuggetQueue((q) => q.slice(1));
      setActiveNugget(next);
      setReopenedNuggetId(null);
      setShownNuggetIds((s) => new Set(s).add(next.id));
    }
  }, [activeNugget, nuggetQueue]);

  const getSource = useCallback((sourceId: string): Source | undefined => {
    return aiSources.get(sourceId);
  }, [aiSources]);

  const handleSourceClick = useCallback(
    (nugget: Nugget) => {
      const source = getSource(nugget.sourceId);
      if (!source) return;
      if (source.type === "youtube") {
        pauseForOverlay();
        setMediaOverlay(source);
      } else {
        setReadingOverlay(source);
      }
    },
    [pauseForOverlay, getSource]
  );


  const jumpToNugget = useCallback(
    (idx: number) => {
      const n = trackNuggets[idx];
      if (!n) return;
      // Directly set the nugget — no setTimeout race condition
      setNuggetQueue([]);
      setShownNuggetIds(new Set([n.id]));
      setActiveNugget(n);
      seek(n.timestampSec);
    },
    [trackNuggets, seek]
  );

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // Nugget timeline position map: nugget ID → % position along timeline
  const nuggetPositionMap = useMemo(() => {
    if (realDuration <= 0) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const n of trackNuggets) {
      map.set(n.id, (n.timestampSec / realDuration) * 100);
    }
    return map;
  }, [trackNuggets, realDuration]);

  const activeNuggetPct = activeNugget ? nuggetPositionMap.get(activeNugget.id) ?? null : null;

  // Dismissed markers array for PlaybackBar
  const dismissedMarkers = useMemo(() => {
    const markers: Array<{ id: string; pct: number }> = [];
    for (const [id] of dismissedNuggets) {
      const pct = nuggetPositionMap.get(id);
      if (pct != null) markers.push({ id, pct });
    }
    return markers;
  }, [dismissedNuggets, nuggetPositionMap]);

  // Must be called unconditionally — before any early returns
  useThemeSync(effectiveCoverArt || "");

  if (!track) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center flex-col gap-4">
          <p className="text-foreground">Track not found.</p>
          <button onClick={() => navigate("/browse")} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Browse
          </button>
        </div>
      </PageTransition>
    );
  }

  const effectiveDuration = realDuration > 0 ? realDuration : track.durationSec;
  const progress = (currentTime / effectiveDuration) * 100;

  return (
    <PageTransition>
      <div className="relative flex h-screen flex-col overflow-hidden">
        {/* Background: ambient color wash */}
        <div className="absolute inset-0">
          <img
            src={effectiveCoverArt}
            alt=""
            className="h-full w-full object-cover scale-[1.3] transition-all duration-1000 ease-out"
            style={{
              filter: barVisible
                ? "blur(64px) brightness(0.35) saturate(1.4)"
                : "blur(48px) brightness(0.55) saturate(1.3)",
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <div className="vignette absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-10 pt-8">
          <button
            onClick={() => navigate("/browse")}
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 ${
              focusZone === 'top' && topFocusIndex === 0 ? "tv-focus-glow scale-110" : ""
            }`}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          {focusZone === 'top' && (
            <motion.p
              key={topFocusIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute left-1/2 -translate-x-1/2 top-14 text-xs text-muted-foreground"
            >
              {topFocusIndex === 0 ? "Back" : "Open Companion"}
            </motion.p>
          )}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => {
                if (shortId) {
                  window.open(`${window.location.origin}/c/${shortId}?tier=${tier}&listen=${listenCount}`, "_blank");
                }
              }}
              disabled={!shortId}
              className={`transition-all duration-300 outline-none rounded-full ${
                focusZone === 'top' && topFocusIndex === 1 ? "tv-focus-glow scale-110" : ""
              }`}
              aria-label="Open companion page"
              style={{
                filter: shortId
                  ? "drop-shadow(0 0 8px hsl(var(--neon-glow) / 0.7)) drop-shadow(0 0 24px hsl(var(--neon-glow) / 0.35))"
                  : "grayscale(1) opacity(0.4)",
                transition: "filter 0.4s ease",
              }}
            >
              <MusicNerdLogo size={40} glow={false} />
            </button>
            <button
              onClick={() => setDevOpen((o) => !o)}
              className="rounded-md bg-foreground/5 px-2.5 py-0.5 text-[10px] text-muted-foreground/50 hover:bg-foreground/10 hover:text-muted-foreground transition-colors"
            >
              DEV
            </button>
          </div>
        </div>

        {/* Track info — fixed bottom-left, visible when playback bar is hidden */}
        <motion.div
          className={`fixed bottom-8 left-6 md:left-10 z-10 ${barVisible ? 'pointer-events-none' : ''}`}
          animate={{ opacity: barVisible ? 0 : 1, y: barVisible ? 10 : 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1 className="text-2xl font-black text-foreground/80 leading-tight tracking-tight md:text-3xl" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {track.title}
          </h1>
          <p className="mt-0.5 text-base font-bold text-foreground/50 md:text-lg" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
            {track.artist}
          </p>
          {track.album && (
            <p className="mt-0.5 text-sm text-foreground/25 font-medium" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
              {track.album}
            </p>
          )}
        </motion.div>

        {/* Spotify URI resolving indicator */}
        {hasSpotifyToken && !spotifyUri && !isExternalListenMode && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 mx-10 mt-2 text-xs text-foreground/40 animate-pulse"
          >
            Connecting to Spotify...
          </motion.p>
        )}

        {/* External listen mode banner */}
        {isExternalListenMode && externalPlayback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 mx-10 mt-3"
          >
            <div className="flex items-center gap-3 rounded-xl bg-foreground/10 backdrop-blur-md px-4 py-2.5">
              <Smartphone size={16} className="text-primary shrink-0" />
              <p className="text-sm text-foreground/70 flex-1">
                Playing on <span className="font-semibold text-foreground/90">{externalPlayback.deviceName}</span>
              </p>
              <button
                onClick={() => {
                  setExternalListenMode(false);
                  lastLoadedTrackRef.current = null;
                  // loadTrack + play will trigger from the effects
                }}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              >
                Play here instead
              </button>
            </div>
          </motion.div>
        )}

        {/* Centered album art */}
        <motion.div
          className="hidden md:flex absolute inset-0 z-[5] items-center justify-center pointer-events-none"
          animate={{ opacity: barVisible ? 0.85 : 1, scale: barVisible ? 0.95 : 1 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
          <motion.img
            key={effectiveCoverArt}
            src={effectiveCoverArt}
            alt={`${track.title} cover art`}
            className="w-[400px] h-[400px] rounded-2xl object-cover shadow-2xl shadow-black/50"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Floating nugget card — independent of bar visibility, anchored to timeline position */}
        <div
          className="fixed left-0 right-0 z-30 pointer-events-none transition-[bottom] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ bottom: barVisible ? 160 : 48 }}
        >
          {/* Layout wrapper matching progress bar track horizontal bounds */}
          <div className="px-4 md:px-10">
            <div className="flex gap-4">
              <div className="w-14 shrink-0" />
              <div className="relative flex-1">
                <AnimatePresence mode="wait">
                  {activeNugget && activeNuggetPct != null && (
                    <motion.div
                      key={activeNugget.id}
                      initial={reopenedNuggetId === activeNugget.id
                        ? { scale: 0.3, y: 10, opacity: 0 }
                        : { y: 30, opacity: 0 }
                      }
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ y: 15, opacity: 0, scale: 0.7 }}
                      transition={reopenedNuggetId === activeNugget.id
                        ? { type: "spring", stiffness: 300, damping: 22 }
                        : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
                      }
                      className="pointer-events-auto"
                      style={{
                        // Left edge aligns with the timeline marker dot.
                        // Clamp so card doesn't overflow the right edge.
                        marginLeft: `clamp(0px, ${activeNuggetPct}%, calc(100% - 420px))`,
                        width: "min(420px, 100%)",
                      }}
                    >
                      <div
                        ref={nuggetRef}
                        tabIndex={0}
                        className="cursor-pointer outline-none"
                        onClick={() => !deepDiveNugget && handleNuggetClick(activeNugget)}
                        onFocus={() => setNuggetFocused(true)}
                        onBlur={() => setNuggetFocused(false)}
                        style={{
                          opacity: deepDiveNugget ? 0 : 1,
                          transform: deepDiveNugget ? "scale(0.95)" : "scale(1)",
                          pointerEvents: deepDiveNugget ? "none" : "auto",
                          transition: "opacity 0.3s ease, transform 0.3s ease",
                        }}
                      >
                        <ErrorBoundary>
                          <NuggetCard
                            nugget={activeNugget}
                            animationStyle={animStyle}
                            onSourceClick={() => handleSourceClick(activeNugget)}
                            currentTime={formatTime(activeNugget.timestampSec)}
                            sourceOverride={getSource(activeNugget.sourceId) || null}
                            focused={nuggetFocused && !deepDiveNugget}
                          />
                        </ErrorBoundary>
                        {nuggetFocused && !deepDiveNugget && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-2 text-center text-xs text-muted-foreground"
                          >
                            {dwelling ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                Exploring...
                              </span>
                            ) : (
                              "Press Enter to explore"
                            )}
                          </motion.p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="w-14 shrink-0" />
            </div>
          </div>
        </div>

        {/* Playback controls */}
        <PlaybackBar
          isPlaying={isPlaying}
          fadingIn={fadingIn}
          progress={progress}
          currentTimeFormatted={formatTime(currentTime)}
          durationFormatted={formatTime(effectiveDuration)}
          visible={barVisible}
          hasPrev={hasPrev}
          hasNext={hasNext}
          liked={liked}
          shuffle={shuffleOn}
          nuggetMarkers={trackNuggets.map((n) => ({ id: n.id, pct: (n.timestampSec / effectiveDuration) * 100 }))}
          focusedIndex={focusZone === 'bar' ? barFocusIndex : null}
          onToggle={() => {
            showBar();
            if (isExternalListenMode) {
              setExternalListenMode(false);
              lastLoadedTrackRef.current = null;
              return;
            }
            toggle();
          }}
          onSeek={(pct) => { showBar(); handleSeek(pct * effectiveDuration); }}
          onPrev={handlePrev}
          onNext={handleNext}
          onLike={() => setLiked((v) => v === true ? null : true)}
          onDislike={() => setLiked((v) => v === false ? null : false)}
          onShuffle={() => setShuffleOn((v) => !v)}
          dismissedMarkers={dismissedMarkers}
          onMiniLogoClick={handleMiniLogoClick}
          activeNuggetId={activeNugget?.id ?? null}
          dismissedNuggetIds={new Set(dismissedNuggets.keys())}
        />

        {/* QR Code — only shown once companion content is pre-generated */}
        {companionReady && shortId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.6, scale: 1 }}
            className="fixed bottom-6 right-6 z-10 hover:opacity-90 transition-opacity rounded-xl overflow-hidden"
          >
            <QRCode
              value={`${window.location.origin}/c/${shortId}?tier=${tier}&listen=${listenCount}`}
              size={100}
              qrStyle="dots"
              fgColor="#ffffff"
              bgColor="transparent"
              ecLevel="M"
              quietZone={8}
            />
          </motion.div>
        )}

        {/* Dev panel */}
        <AnimatePresence>
          {devOpen && (
            <DevPanel
              animStyle={animStyle}
              setAnimStyle={setAnimStyle}
              onJumpToNugget={jumpToNugget}
              nuggetCount={trackNuggets.length}
              listenCount={listenCount}
              trackKey={track ? `${track.artist}::${track.title}` : undefined}
              onClose={() => setDevOpen(false)}
              currentTier={tier}
              onTierChange={(newTier) => {
                if (profile) {
                  saveProfile({ ...profile, calculatedTier: newTier });
                }
              }}
              onResetHistory={async () => {
                if (!track) return;
                const trackKey = `${track.artist}::${track.title}`;
                await supabase.from("nugget_history").delete().eq("track_key", trackKey);
                setRegenerateKey((k) => k + 1);
              }}
              onResetAllHistory={async () => {
                if (!window.confirm("Delete ALL listening history? This cannot be undone.")) return;
                await supabase.from("nugget_history").delete().neq("track_key", "");
                setRegenerateKey((k) => k + 1);
              }}
              activePlayer={activePlayer}
              spotifyUri={spotifyUri}
              onIncrementListen={async () => {
                if (!track) return;
                const trackKey = `${track.artist}::${track.title}`;
                const { data } = await supabase.from("nugget_history").select("listen_count").eq("track_key", trackKey).maybeSingle();
                if (data) {
                  await supabase.from("nugget_history").update({ listen_count: (data.listen_count || 1) + 1, updated_at: new Date().toISOString() }).eq("track_key", trackKey);
                }
                setRegenerateKey((k) => k + 1);
              }}
            />
          )}
        </AnimatePresence>

        {/* Overlays */}
        <AnimatePresence>
          {mediaOverlay && (
            <MediaOverlay
              source={mediaOverlay}
              onClose={() => { setMediaOverlay(null); resumeWithFade(); }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {readingOverlay && (
            <ReadingOverlay
              source={readingOverlay}
              onClose={() => setReadingOverlay(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {deepDiveNugget && (
            <ErrorBoundary fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="apple-glass rounded-2xl p-6 text-center max-w-sm mx-4">
                  <p className="text-sm text-muted-foreground mb-3">Couldn't load deep dive.</p>
                  <button
                    onClick={() => { setDeepDiveNugget(null); setFocusZone('bar'); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Close
                  </button>
                </div>
              </div>
            }>
              <NuggetDeepDive
                nugget={deepDiveNugget}
                source={getSource(deepDiveNugget.sourceId) || null}
                artist={track.artist}
                trackTitle={track.title}
                onClose={() => { setDeepDiveNugget(null); setFocusZone('bar'); setNuggetFocused(false); }}
              />
            </ErrorBoundary>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

