import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Smartphone } from "lucide-react";
// mock/tracks kept as reference — no longer imported for runtime use
import { useThemeSync } from "@/hooks/useThemeSync";
import { QRCode } from "react-qrcode-logo";
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import MusicNerdLoadingOrchestrator from "@/components/MusicNerdLoadingOrchestrator";
import NuggetCard from "@/components/NuggetCard";
const MediaOverlay = lazy(() => import("@/components/overlays/MediaOverlay"));
const ReadingOverlay = lazy(() => import("@/components/overlays/ReadingOverlay"));
const NuggetDeepDive = lazy(() => import("@/components/overlays/NuggetDeepDive"));
import DevPanel from "@/components/DevPanel";
import PlaybackBar from "@/components/PlaybackBar";
import { useIsMobile } from "@/hooks/use-mobile";
const ImmersiveNuggetView = lazy(() => import("@/components/immersive/ImmersiveNuggetView"));
import ErrorBoundary from "@/components/ErrorBoundary";
import { useAINuggets } from "@/hooks/useAINuggets";
import { getSeedCompanion, getDemoTrackById, getDemoTrackUri } from "@/data/seedNuggets";
import { useSpotifyToken } from "@/hooks/useSpotifyToken";
import { usePlayer } from "@/contexts/PlayerContext";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { withAppleStorefront } from "@/lib/appleStorefront";
import { isNuggetOnScreen } from "@/lib/nuggetVisibility";
import { pickNextTrack, type SpotifyTrackResult } from "@/lib/skipCascade";
import { useTierAccent } from "@/hooks/useTierAccent";
import PageTransition from "@/components/PageTransition";
import type { Nugget, Source, AnimationStyle } from "@/mock/types";

const HIDE_DELAY = 3000;

export default function Listen() {
  // Use wildcard param — `:trackId` breaks when titles contain "/" (e.g. "Weird Fishes/Arpeggi")
  const params = useParams();
  const rawTrackId = params["*"] || "";
  const navigate = useNavigate();

  const { profile, saveProfile } = useUserProfile();

  // ── Track parsing — demo IDs or real::<artist>::<title>::<album>::<uri> ──
  const realTrackMeta = useMemo(() => {
    // Demo track lookup (e.g. "demo-weird-fishes"). Pick the URI for the
    // user's active service so Apple Music users get apple:song:X instead
    // of the Spotify default URI.
    const demo = rawTrackId ? getDemoTrackById(rawTrackId) : null;
    if (demo) return {
      artist: demo.artist,
      title: demo.title,
      album: demo.album,
      trackUri: getDemoTrackUri(demo, profile?.streamingService),
    };

    if (!rawTrackId?.startsWith("real%3A%3A") && !rawTrackId?.startsWith("real::")) return null;
    const decoded = decodeURIComponent(rawTrackId);
    const parts = decoded.split("::");
    return {
      artist: decodeURIComponent(parts[1] || ""),
      title: decodeURIComponent(parts[2] || ""),
      album: decodeURIComponent(parts[3] || "") || undefined,
      trackUri: decodeURIComponent(parts[4] || "") || undefined,
    };
  }, [rawTrackId, profile?.streamingService]);

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
    // Side-effect of the same scan: recover collaborators. The URL
    // format (`real::artist::title::album::uri`) doesn't carry them,
    // so the only client-side source is the user's own taste data
    // where spotify-taste populated `collaborators` from
    // `track.artists.slice(1)`. Without this lookup, wave-2 on
    // collab tracks (e.g. "Better" by Ty Symph, Pete Rango) loses
    // the secondary research target and falls back to thin content
    // grounded only in the primary artist.
    let collaborators: string[] | undefined;
    const titleLower = realTrackMeta.title.toLowerCase();
    const artistLower = realTrackMeta.artist.toLowerCase();
    if (profile?.trackImages) {
      const match = profile.trackImages.find(
        (t) =>
          t.title.toLowerCase() === titleLower &&
          t.artist.toLowerCase() === artistLower
      );
      if (match?.imageUrl) coverArtUrl = coverArtUrl || match.imageUrl;
      if (match?.collaborators?.length) collaborators = match.collaborators;
    }
    if (!collaborators && profile?.likedTracks) {
      const liked = profile.likedTracks.find(
        (t) =>
          t.title.toLowerCase() === titleLower &&
          t.artist.toLowerCase() === artistLower
      );
      if (liked?.collaborators?.length) collaborators = liked.collaborators;
    }
    if (!coverArtUrl && profile?.artistImages?.[realTrackMeta.artist]) {
      coverArtUrl = profile.artistImages[realTrackMeta.artist];
    }
    if (!coverArtUrl) {
      coverArtUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(realTrackMeta.artist + realTrackMeta.title)}&backgroundColor=111827&textColor=ffffff&fontSize=30`;
    }
    return {
      id: trackId,
      title: realTrackMeta.title,
      artist: realTrackMeta.artist,
      collaborators,
      artistId: "",
      albumId: "",
      album: realTrackMeta.album,
      durationSec: 300,
      coverArtUrl,
      trackNumber: 1,
    };
  }, [realTrackMeta, trackId, urlArt, profile?.trackImages, profile?.likedTracks, profile?.artistImages]);

  // ── Playback source resolution ───────────────────────────────────────
  const { hasSpotifyToken } = useSpotifyToken();
  const [trackUri, setTrackUri] = useState<string | null>(null);
  const isAppleMusicUser = profile?.streamingService === "Apple Music";

  // Resolve track URI — from route (real tracks) or by searching the
  // active service's catalog. Spotify-search now handles both services
  // via the service param (Phase 6b), so Apple users can resolve URIs
  // by {artist, title} the same way Spotify users can.
  useEffect(() => {
    setTrackUri(null);

    // Real track with URI baked into the route — works for both services
    if (realTrackMeta?.trackUri) {
      setTrackUri(realTrackMeta.trackUri);
      return;
    }

    // Need a track to search by {artist, title}. Spotify users additionally
    // need a playback token; Apple users use the MusicKit instance for
    // playback so no extra gating here.
    if (!track) return;
    if (!isAppleMusicUser && !hasSpotifyToken) return;

    const service: "apple" | "spotify" = isAppleMusicUser ? "apple" : "spotify";

    let cancelled = false;
    async function findCatalogUri() {
      try {
        // Pass artist + title separately so the Spotify path can use its
        // field filters. The Apple path concatenates them into a free-form
        // term — both return the same normalized { tracks } shape.
        // withAppleStorefront attaches the current MusicKit storefront
        // when service === "apple" so non-US users get region-correct
        // catalog IDs.
        const body = withAppleStorefront(
          { artist: track!.artist, title: track!.title, service },
          service,
        );
        const { data, error } = await supabase.functions.invoke("spotify-search", { body });
        if (cancelled) return;
        if (error) { console.error(`[Listen] ${service} search error:`, error); return; }

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
          console.log(`[Listen] ${service} match: "${match.artist} - ${match.title}" for "${track!.artist} - ${track!.title}"`);
          setTrackUri(match.uri);
        } else {
          console.warn(`[Listen] No ${service} match for "${track!.artist} - ${track!.title}"`);
        }
      } catch (err) {
        console.error(`[Listen] ${service} URI search failed:`, err);
      }
    }
    findCatalogUri();
    return () => { cancelled = true; };
  }, [hasSpotifyToken, isAppleMusicUser, realTrackMeta?.trackUri, track?.artist, track?.title]);

  const [shuffleOn, setShuffleOn] = useState(false); // kept for PlaybackBar UI only
  const isMobile = useIsMobile();
  const [regenerateKey, setRegenerateKey] = useState(0);
  const [skipLoading, setSkipLoading] = useState(false);


  // Push current track to global history (persists across Listen re-mounts)
  // Include ?art= query param so prev navigation preserves artwork
  const player = usePlayer();
  useEffect(() => {
    const artParam = urlArt ? `?art=${encodeURIComponent(urlArt)}` : "";
    player.pushTrackHistory(`/listen/${rawTrackId}${artParam}`);
    // Add current track to session history so it won't be picked again by navigateToRelated
    if (track) player.addToSessionHistory(track.artist, track.title);
  }, [rawTrackId, urlArt, player, track]);

  // If this track was previously listened to in this session, restore the listen depth.
  // This handles both track completion (onEnded) and returning to a track via prev/browse.
  // Guard: run at most once per track mount to prevent mid-visit re-runs caused by
  // async profile load changing the `track` object reference.
  const completionCheckedRef = useRef(false);
  useEffect(() => {
    completionCheckedRef.current = false;
  }, [trackId]);

  useEffect(() => {
    if (!track || completionCheckedRef.current) return;
    completionCheckedRef.current = true;
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
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  const lastLoadedTrackRef = useRef<string | null>(null);
  const prevRawTrackIdRef = useRef<string | undefined>(rawTrackId);
  // Timestamp of last track load — suppresses false external detection during the
  // brief window where the SDK still reports the OLD track after loadTrack is called.
  const trackLoadTimestampRef = useRef(0);

  // Reset navigation lock + load guard when the route changes (new track mounted).
  // Note: player.pause() was intentionally removed here — loadTrack() already
  // pauses internally, and an extra pause() from this effect was racing with
  // the PlayerContext autoplay, causing the old track to briefly resume via
  // the Listen.tsx play() effect before the API call loaded the new one.
  useEffect(() => {
    const isTrackSwitch = prevRawTrackIdRef.current !== undefined &&
      prevRawTrackIdRef.current !== rawTrackId;
    prevRawTrackIdRef.current = rawTrackId;

    isNavigatingRef.current = false;
    lastLoadedTrackRef.current = null;
    trackLoadTimestampRef.current = Date.now();

    // Always clear overlays on navigation — even same-track re-navigation
    // (back/forward) should dismiss any open deep-dive or media overlay.
    setDeepDiveNugget(null);
    setMediaOverlay(null);
    setReadingOverlay(null);

    if (isTrackSwitch) {
      if (isExternalListenMode) setExternalListenMode(false);
    }
  }, [rawTrackId]);

  const navigateToRelated = useCallback(async () => {
    if (!track) return;
    isNavigatingRef.current = true;
    setSkipLoading(true);

    const enc = encodeURIComponent;
    try {
      const pick = await pickNextTrack({
        track,
        trackUri,
        profile,
        isAppleMusicUser,
        spotifyAlbumUri: player.spotifyStateTrack?.spotifyAlbumUri,
        isInSessionHistory: player.isInSessionHistory,
        invoke: supabase.functions.invoke.bind(supabase.functions),
      });
      if (pick && mountedRef.current) {
        player.addToSessionHistory(pick.artist, pick.title);
        navigate(`/listen/real::${enc(pick.artist)}::${enc(pick.title)}::${enc(pick.album)}::${enc(pick.uri)}`);
      } else if (!pick) {
        console.warn("[Listen] No next track found");
      }
    } catch (err) {
      console.warn("[Listen] Skip next failed:", err);
    } finally {
      isNavigatingRef.current = false;
      setSkipLoading(false);
    }
  }, [track, trackUri, navigate, player, profile, isAppleMusicUser]);

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

  // 5-second listen threshold — counts as a "listen" for DB progression only.
  // Does NOT mark track as completed — that only happens on actual track end
  // (handleTrackEnd). Otherwise, navigating Browse → Listen mid-track would
  // incorrectly bump regenerateKey and trigger fresh generation.
  const listenThresholdMetRef = useRef(false);
  useEffect(() => {
    listenThresholdMetRef.current = false;
  }, [trackId]);

  useEffect(() => {
    if (!track || !isPlaying || currentTime < 5 || listenThresholdMetRef.current) return;
    listenThresholdMetRef.current = true;

    // Capture trackId at threshold time so we can verify the track
    // hasn't changed by the time async DB writes complete. trackId is
    // derived from the route param (stable within a single track load).
    // Because Listen stays mounted across track changes (stable route key
    // in App.tsx), trackId updates via re-render — the closure comparison
    // reliably detects skips between awaits.
    const thresholdTrackId = trackId;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? localStorage.getItem("musicnerd_anon_id") ?? (() => {
        const id = crypto.randomUUID();
        localStorage.setItem("musicnerd_anon_id", id);
        return id;
      })();
      // Bail if user already skipped to a different track
      if (thresholdTrackId !== trackId) return;
      const trackKey = `${track.artist}::${track.title}`;
      const { data: historyRow } = await supabase
        .from("nugget_history")
        .select("listen_count, previous_nuggets")
        .eq("track_key", trackKey)
        .eq("user_id", userId)
        .maybeSingle();
      if (thresholdTrackId !== trackId) return;
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
        const { error: insertErr } = await supabase
          .from("nugget_history")
          .insert({
            track_key: trackKey,
            user_id: userId,
            listen_count: 2,
            previous_nuggets: [],
          });
        if (insertErr?.code === "23505") {
          await supabase
            .from("nugget_history")
            .update({
              listen_count: 2,
              updated_at: new Date().toISOString(),
            })
            .eq("track_key", trackKey)
            .eq("user_id", userId);
        }
      }
    })();
  }, [track, isPlaying, currentTime, player, trackId]);

  // Use Spotify SDK album art when available. Pete 2026-05-08: cover
  // art was showing the PREVIOUS song's album art (Aaron Doh's "Love
  // Lies" art for "Not Yourself"). Cause: track.coverArtUrl is locked
  // in by the URL params at mount, but the SDK can switch tracks
  // (auto-next, queue advance) without a route change. Previously we
  // only swapped to the SDK's albumArtUrl when track.coverArtUrl was a
  // DiceBear placeholder — which left real-but-stale URLs untouched.
  // New rule: if the SDK is reporting a DIFFERENT track than what the
  // route says, trust the SDK's albumArtUrl (it matches what's
  // actually playing).
  const effectiveCoverArt = useMemo(() => {
    if (!spotifyStateTrack?.albumArtUrl) {
      return track?.coverArtUrl || "";
    }
    // SDK reports a different URI than what the route encoded — the
    // user has crossed into a different track via SDK queue
    // advancement. Use the SDK's art.
    if (trackUri && spotifyStateTrack.spotifyUri && spotifyStateTrack.spotifyUri !== trackUri) {
      return spotifyStateTrack.albumArtUrl;
    }
    // Title/artist mismatch is a softer signal that we're on a
    // different track than expected; still trust the SDK.
    if (
      track?.title && spotifyStateTrack.title &&
      track.title.trim().toLowerCase() !== spotifyStateTrack.title.trim().toLowerCase()
    ) {
      return spotifyStateTrack.albumArtUrl;
    }
    // Original DiceBear-replacement guard.
    if (track?.coverArtUrl?.includes("dicebear.com")) {
      return spotifyStateTrack.albumArtUrl;
    }
    return track?.coverArtUrl || "";
  }, [spotifyStateTrack?.albumArtUrl, spotifyStateTrack?.spotifyUri, spotifyStateTrack?.title, trackUri, track?.coverArtUrl, track?.title]);

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
  // IMPORTANT: Only depend on spotifyStateTrack changes, NOT player.currentTrackUri.
  // Otherwise loadTrack (which sets currentTrackUri) causes the effect to fire while
  // the SDK still reports the OLD track, creating a false "external skip" → bounce loop.
  // Also require isPlaying — when loadTrack pauses the old track, the SDK fires a state
  // change for the OLD track (paused). Without the isPlaying guard, this is misinterpreted
  // as an external skip, causing a false redirect back to the old track's page.
  useEffect(() => {
    if (!spotifyStateTrack) return;
    if (isNavigatingRef.current) return;
    if (!isPlaying) return;
    if (!player.currentTrackUri) return;
    // Suppress during the brief window after a track load where the SDK still
    // reports the OLD track — prevents false redirect back to the previous track.
    if (Date.now() - trackLoadTimestampRef.current < 2000) return;
    if (spotifyStateTrack.spotifyUri === player.currentTrackUri) return;
    // Also skip if the SDK is reporting what we're about to load (route resolved but loadTrack pending)
    if (trackUri && spotifyStateTrack.spotifyUri === trackUri) return;
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
      trackUri: trackUri || undefined,
    });
  }, [track?.title, track?.artist, trackId, trackUri, effectiveCoverArt]);

  // Load track into global player when sources resolve
  // Skip if the same track is already playing (e.g. returning from Browse via mini-player)
  useEffect(() => {
    if (isExternalListenMode) return;
    if (!trackUri) return;
    if (player.currentTrackUri === trackUri) return;
    if (lastLoadedTrackRef.current === trackUri) return;
    lastLoadedTrackRef.current = trackUri;

    // If the SDK is already playing this track (external skip on Spotify),
    // just sync state — don't pause and restart playback.
    if (spotifyStateTrack?.spotifyUri === trackUri) {
      player.syncExternalTrack(trackUri);
      return;
    }

    player.loadTrack({ trackUri });
  }, [trackUri, isExternalListenMode]);

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
  useTierAccent(tier);
  const artistImageUrl = (track?.artist && profile?.artistImages?.[track.artist]) || track?.coverArtUrl || "";
  // Display string for the UI — joins primary + collaborators with ", ".
  // Kept separate from `track.artist` because the latter is the cache
  // key + lookup anchor everywhere else (search by primary artist
  // only). Display contexts (mini player, title block, deep dive) want
  // the full credit so it matches what the user sees on Spotify.
  const artistDisplay = track?.artist
    ? track.collaborators?.length
      ? `${track.artist}, ${track.collaborators.join(", ")}`
      : track.artist
    : "";
  const { nuggets: aiNuggets, sources: aiSources, loading: aiLoading, error: aiError, listenCount, artistSummary, fromCache: aiFromCache, waveLoading } = useAINuggets(
    trackId,
    track?.artist || "",
    track?.title || "",
    track?.album,
    track?.durationSec || 300,
    regenerateKey,
    track?.coverArtUrl,
    artistImageUrl,
    tier,
    profile?.topArtists,
    profile?.topTracks,
    track?.collaborators,
  );

  // Log AI nugget errors for debugging
  useEffect(() => {
    if (aiError) console.error("[Listen] AI nugget error:", aiError);
  }, [aiError]);

  // Pre-generate companion content so QR code only shows when ready
  const [companionReady, setCompanionReady] = useState(false);
  const [shortId, setShortId] = useState<string | null>(null);
  // Reset companion readiness when track changes OR when listen depth changes
  // (regenerateKey bumps on each new listen). Without this, the QR code stays
  // visible with a stale listen= URL while the new companion pre-gen is in flight,
  // causing the companion page to fetch the previous listen's cached data.
  useEffect(() => {
    setCompanionReady(false);
    setShortId(null);
  }, [rawTrackId, regenerateKey]);

  // Per-trackKey count of nuggets last uploaded to companion_cache.
  // Used to dedupe — we re-upload only when the count grows. Lives at
  // module-instance scope so it survives effect re-runs but not Listen
  // remounts (which is fine — a remount means a new session and a
  // potentially new shortId anyway).
  const lastCompanionUploadCountRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (aiLoading || aiNuggets.length === 0 || !track) return;
    const trackKey = `${track.artist}::${track.title}`;

    // Restore cached shortId immediately if we have one — but DON'T
    // early-return. The previous version bailed here, which meant the
    // companion content was frozen at whatever nugget count existed
    // on the first run (typically just the pre-gen nugget). Wave-2
    // nuggets that landed later never made it to companion_cache, so
    // the QR-code companion page only ever showed the original bland
    // first nugget. Now we keep going to re-upload the latest nugget
    // set to companion_cache (the shortId stays the same).
    const cachedSid = player.getCompanionShortId(trackKey);
    if (cachedSid) {
      setShortId(cachedSid);
      setCompanionReady(true);
    }

    // Length-based debounce: skip the regen if the nugget count hasn't
    // grown since the last upload to companion. Initial SSE streams
    // one nugget at a time and would otherwise fire 4-5 redundant
    // edge-function calls per fresh generation.
    const lastSent = lastCompanionUploadCountRef.current.get(trackKey) ?? 0;
    if (aiNuggets.length === lastSent) return;
    lastCompanionUploadCountRef.current.set(trackKey, aiNuggets.length);

    let cancelled = false;
    (async () => {
      try {
        // Build prebuilt nuggets for the companion page.
        // Both demo (seed) and AI tracks go through the edge function — direct
        // DB writes from the client are blocked by RLS (service_role only).
        const seedCompanion = await getSeedCompanion(track.artist, track.title, tier);

        let prebuiltNuggets: any[];
        if (seedCompanion) {
          // Demo tracks: use seed companion data, filter by listen depth
          const filteredNuggets = seedCompanion.nuggets.filter(
            (n) => n.listenUnlockLevel <= listenCount
          );
          player.appendCompanionNuggets(trackKey, filteredNuggets);
          prebuiltNuggets = player.getCompanionNuggets(trackKey);
          console.log("[SeedCompanion] Sending", prebuiltNuggets.length, "accumulated nuggets for", trackKey);
        } else {
          // AI tracks: transform listen page nuggets to companion format
          const kindToCategory: Record<string, string> = {
            artist: "history",
            track: "track",
            context: "context",
            discovery: "explore",
          };
          const now = Date.now();
          const transformed = aiNuggets.map((n, i) => {
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
          player.appendCompanionNuggets(trackKey, transformed);
          prebuiltNuggets = player.getCompanionNuggets(trackKey);
        }

        // Route through edge function (has service_role for DB writes)
        // Retry once on failure after a short delay.
        const companionBody = {
          artist: track.artist,
          title: track.title,
          album: track.album,
          listenCount,
          tier,
          prebuiltNuggets,
          coverArtUrl: effectiveCoverArt || undefined,
          artistImage: artistImageUrl || effectiveCoverArt || undefined,
          artistSummary,
        };
        let { error } = await supabase.functions.invoke("generate-companion", { body: companionBody });
        if (error && !cancelled) {
          console.warn("[Listen] Companion pre-gen failed, retrying in 3s:", error);
          await new Promise((r) => setTimeout(r, 3000));
          if (cancelled) return;
          ({ error } = await supabase.functions.invoke("generate-companion", { body: companionBody }));
        }
        if (cancelled) return;
        if (error) console.warn("[Listen] Companion pre-gen retry also failed:", error);

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

          let resolvedShortId: string | null = null;
          if (existing) {
            resolvedShortId = existing.short_id;
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
            if (!insErr) resolvedShortId = newId;
          }

          if (!cancelled && resolvedShortId) {
            setShortId(resolvedShortId);
            player.setCompanionShortId(trackKey, resolvedShortId);
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

  // Intentionally NOT gated on aiLoading — SSE streaming appends nuggets
  // one at a time, and each append triggers a downstream re-render.
  // Both desktop and immersive views only display nuggets whose
  // timestampSec <= currentTime, so partial arrays are safe.
  const rawTrackNuggets = aiNuggets;

  // Redistribute nugget timestamps based on actual player duration instead
  // of the hardcoded 300s default. The formula MUST mirror
  // `makeTimestamp` in src/hooks/useAINuggets.ts and the server-side
  // cache builder in supabase/functions/generate-nuggets/index.ts —
  // first nugget pinned at earlyStart=0 (so a tap-on-pink-ring story
  // shows nugget #0 the moment the song starts), last at
  // durationSec - endBuffer, middle distributed evenly. The previous
  // earlyStart=10 + spacing*(i+1) formula was overriding the server's
  // cached timestamps and pushing nugget #0 to ~65s into a 4-min
  // track — Pete: "I clicked the story and the song started playing
  // but I was presented with no Nugget."
  const trackNuggets = useMemo(() => {
    if (rawTrackNuggets.length === 0 || realDuration <= 0) return rawTrackNuggets;
    // Aligned with makeTimestamp + server cache builder —
    // endBuffer=15, usable-min=30.
    const earlyStart = 0;
    const endBuffer = 15;
    const usable = Math.max(realDuration - earlyStart - endBuffer, 30);
    const denom = Math.max(rawTrackNuggets.length - 1, 1);
    // Cap spacing tight enough that wave-2 nuggets unlock close to
    // when they arrive from the server (not 75s after). Pete: "why
    // should it take 1 minute and 15 seconds for the first nugget
    // of wave 2 to arrive?" Wave-2 typically returns at T~25-35s
    // after the track starts; with a 45s cap and 3 nuggets, the
    // second nugget unlocks at T=45 — much closer to "as soon as
    // it's available." For high-count wave success (9 nuggets),
    // even spacing = 25s, which is below the cap and stays as-is.
    const MAX_SPACING_SEC = 45;
    const spacing = Math.min(usable / denom, MAX_SPACING_SEC);
    return rawTrackNuggets.map((n, i) => ({
      ...n,
      timestampSec: Math.min(Math.floor(earlyStart + spacing * i), realDuration - 10),
    }));
  }, [rawTrackNuggets, realDuration]);

  // DEV-ONLY: inject a recommendedArtist via URL query so the
  // "Open {Artist}" button can be visually verified without a
  // server-side deploy. Usage: append ?injectArtist=Lunch%20$pecial
  // (optionally &injectArtistId=SPOTIFY_ID) to any /listen URL.
  // Stripped from production builds — guarded on import.meta.env.DEV.
  const trackNuggetsWithDevInjection = useMemo(() => {
    if (!import.meta.env.DEV) return trackNuggets;
    if (typeof window === "undefined") return trackNuggets;
    const params = new URLSearchParams(window.location.search);
    const injectArtist = params.get("injectArtist");
    if (!injectArtist) return trackNuggets;
    const injectArtistId = params.get("injectArtistId") || undefined;
    return trackNuggets.map((n, i) => (i === 0 ? {
      ...n,
      recommendedArtist: { name: injectArtist, spotifyArtistId: injectArtistId },
    } : n));
  }, [trackNuggets]);

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

  // What the loading pill waits on. NOT `trackNuggets.length > 0` — that
  // means nuggets landed in state, while the pill promises "researching…"
  // until the user can actually see a fact. The reveal effect below gates
  // display on nerdActive and, for cached tracks, on playback crossing
  // each timestamp, so the two can diverge and the pill dismisses onto a
  // blank screen.
  const nuggetOnScreen = isNuggetOnScreen({
    nerdActive,
    activeNuggetId: activeNugget?.id,
    trackNuggets,
  });

  // --- Auto-hide bar logic ---
  const [barVisible, setBarVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBar = useCallback((keepVisible?: boolean) => {
    setBarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!keepVisible) {
      hideTimerRef.current = setTimeout(() => setBarVisible(false), HIDE_DELAY);
    }
  }, []);

  // Brief auto-show on mount for discoverability (desktop/TV first-time visitors)
  useEffect(() => {
    showBar();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [showBar]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight * 0.85) showBar();
    };
    // Show bar on keyboard/remote interaction (TV-style devices)
    const onKeyDown = () => showBar();
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
    };
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

  // D-pad left/right: cycle through shown nuggets on the timeline
  const handleNuggetNav = useCallback((direction: 'left' | 'right') => {
    const navigable = trackNuggets.filter(n => shownNuggetIds.has(n.id));
    if (navigable.length <= 1) return;

    const currentIdx = activeNugget
      ? navigable.findIndex(n => n.id === activeNugget.id)
      : -1;

    const nextIdx = direction === 'left'
      ? (currentIdx <= 0 ? navigable.length - 1 : currentIdx - 1)
      : (currentIdx >= navigable.length - 1 ? 0 : currentIdx + 1);

    const target = navigable[nextIdx];
    if (!target || target.id === activeNugget?.id) return;

    // Swap: dismiss current → mini-logo, activate target
    setDismissedNuggets(prev => {
      const next = new Map(prev);
      if (activeNugget) next.set(activeNugget.id, activeNugget);
      next.delete(target.id);
      return next;
    });
    setNuggetQueue([]);
    setActiveNugget(target);
    setReopenedNuggetId(target.id);
  }, [trackNuggets, shownNuggetIds, activeNugget]);

  const [nuggetFocused, setNuggetFocused] = useState(false);
  const nuggetRef = useRef<HTMLDivElement>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dwelling, setDwelling] = useState(false);
  const activeNuggetRef = useRef<Nugget | null>(null);
  useEffect(() => { activeNuggetRef.current = activeNugget; }, [activeNugget]);

  // Clear dwell timer helper
  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    setDwelling(false);
  }, []);

  // Enter nugget zone: re-activate most recent dismissed nugget if none active
  const enterNuggetZone = useCallback(() => {
    if (!activeNuggetRef.current && dismissedNuggets.size > 0) {
      let mostRecent: Nugget | null = null;
      for (const [, n] of dismissedNuggets) {
        if (n.timestampSec <= currentTime && (!mostRecent || n.timestampSec > mostRecent.timestampSec))
          mostRecent = n;
      }
      if (!mostRecent) {
        for (const [, n] of dismissedNuggets) {
          if (!mostRecent || n.timestampSec < mostRecent.timestampSec) mostRecent = n;
        }
      }
      if (mostRecent) {
        setDismissedNuggets(prev => { const next = new Map(prev); next.delete(mostRecent!.id); return next; });
        setActiveNugget(mostRecent);
        setReopenedNuggetId(mostRecent.id);
      }
    }
    nuggetRef.current?.focus();
    setDwelling(true);
    dwellTimerRef.current = setTimeout(() => {
      if (activeNuggetRef.current) handleNuggetClick(activeNuggetRef.current);
      setDwelling(false);
    }, 1500);
  }, [dismissedNuggets, currentTime, handleNuggetClick]);

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
    if (activeNugget || dismissedNuggets.size > 0) zones.push('nugget');
    zones.push('bar');
    return zones;
  }, [activeNugget, dismissedNuggets.size]);

  // Stable refs for keydown handler — avoids re-registering the listener
  // on every state change (15+ deps previously caused constant re-attach).
  const keyStateRef = useRef({
    focusZone, barFocusIndex, topFocusIndex, activeNugget,
    deepDiveNugget, mediaOverlay, readingOverlay, isExternalListenMode,
  });
  keyStateRef.current = {
    focusZone, barFocusIndex, topFocusIndex, activeNugget,
    deepDiveNugget, mediaOverlay, readingOverlay, isExternalListenMode,
  };
  const keyHandlersRef = useRef({
    showBar, toggle, clearDwell, getZonesInOrder,
    handleNuggetClick, handleNuggetNav, handleBarAction, handleTopAction, enterNuggetZone,
  });
  keyHandlersRef.current = {
    showBar, toggle, clearDwell, getZonesInOrder,
    handleNuggetClick, handleNuggetNav, handleBarAction, handleTopAction, enterNuggetZone,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = keyStateRef.current;
      const h = keyHandlersRef.current;
      // Let overlay handle its own keys when open
      if (s.deepDiveNugget || s.mediaOverlay || s.readingOverlay) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        h.clearDwell();
        const zones = h.getZonesInOrder();
        const idx = zones.indexOf(s.focusZone);
        if (idx > 0) {
          const newZone = zones[idx - 1];
          setFocusZone(newZone);
          setNuggetFocused(newZone === 'nugget');
          if (newZone === 'nugget') h.enterNuggetZone();
          if (newZone !== 'nugget') h.showBar();
        } else {
          h.showBar();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        h.clearDwell();
        const zones = h.getZonesInOrder();
        const idx = zones.indexOf(s.focusZone);
        if (idx < zones.length - 1) {
          const newZone = zones[idx + 1];
          setFocusZone(newZone);
          setNuggetFocused(newZone === 'nugget');
          if (newZone === 'nugget') h.enterNuggetZone();
          if (newZone === 'bar') h.showBar();
        } else {
          h.showBar();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        h.clearDwell();
        if (s.focusZone === 'nugget') {
          h.handleNuggetNav('left');
        } else if (s.focusZone === 'bar') setBarFocusIndex((i) => Math.max(0, i - 1));
        else if (s.focusZone === 'top') setTopFocusIndex((i) => Math.max(0, i - 1));
        h.showBar();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        h.clearDwell();
        if (s.focusZone === 'nugget') {
          h.handleNuggetNav('right');
        } else if (s.focusZone === 'bar') setBarFocusIndex((i) => Math.min(BAR_BUTTON_COUNT - 1, i + 1));
        else if (s.focusZone === 'top') setTopFocusIndex((i) => Math.min(TOP_BUTTON_COUNT - 1, i + 1));
        h.showBar();
      } else if (e.key === "Enter") {
        e.preventDefault();
        h.clearDwell();
        if (s.focusZone === 'nugget' && s.activeNugget) {
          h.handleNuggetClick(s.activeNugget);
        } else if (s.focusZone === 'bar') {
          h.handleBarAction(s.barFocusIndex);
          h.showBar();
        } else if (s.focusZone === 'top') {
          h.handleTopAction(s.topFocusIndex);
          h.showBar();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        h.showBar();
        if (s.isExternalListenMode) {
          setExternalListenMode(false);
          lastLoadedTrackRef.current = null;
        } else {
          h.toggle();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []); // stable — reads from refs

  // Clean up dwell timer on unmount or nugget change
  useEffect(() => {
    return () => clearDwell();
  }, [activeNugget, clearDwell]);

  // Capture once: was the track ALREADY loaded into PlayerContext when
  // this Listen instance mounted? If so, the user is returning to a
  // track that's been playing (or paused) in the background — don't
  // force resume on mount, respect the existing playback state.
  // Without this guard, a paused user clicking the mini-player to
  // return would have the song auto-unpause on them.
  const wasTrackAlreadyLoadedAtMount = useRef(
    !isExternalListenMode && !!trackUri && player.currentTrackUri === trackUri,
  ).current;

  // Auto-resume only after the correct track has been loaded into the SDK.
  // Without the trackUri guard, this fires on mount and resumes the PREVIOUS
  // track (still in the SDK) before loadTrack has a chance to swap it out.
  // Skip during the brief window after a track load — let PlayerContext's
  // autoplay effect handle it via the Spotify API to avoid resuming the old track.
  useEffect(() => {
    if (!isExternalListenMode && trackUri && player.currentTrackUri === trackUri) {
      // 2s guard: after a fresh track load, let PlayerContext's autoplay
      // handle playback via the Spotify API. Calling resume() too early
      // would briefly play the OLD track. On very slow SDK loads (>2s)
      // this guard expires and resume() acts as a safety net.
      if (Date.now() - trackLoadTimestampRef.current < 2000) return;
      // Respect user's deliberate pause state on remount. If the track
      // was already loaded before THIS mount (mini-player return), the
      // user owns the playback state — don't force resume.
      if (wasTrackAlreadyLoadedAtMount) return;
      play();
    }
  }, [play, isExternalListenMode, trackUri, player.currentTrackUri, wasTrackAlreadyLoadedAtMount]);

  // Delayed safety-net: if the track was loaded but NEVER started playing
  // after 4s (autoPlay PUT failed or auto-resume fired in the 2s guard),
  // retry play(). Skips if the track has played at any point since the URI
  // changed — so a deliberate pause within 4s won't be force-resumed.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const currentTrackUriRef = useRef(player.currentTrackUri);
  useEffect(() => { currentTrackUriRef.current = player.currentTrackUri; }, [player.currentTrackUri]);
  const hasEverPlayedRef = useRef(false);
  useEffect(() => { hasEverPlayedRef.current = false; }, [trackUri]);
  useEffect(() => { if (isPlaying) hasEverPlayedRef.current = true; }, [isPlaying]);

  useEffect(() => {
    if (isExternalListenMode || !trackUri) return;
    // Same respect-user-pause gate as the auto-resume effect above.
    // The safety-net is for "track never started after fresh load,
    // retry play()" — not for re-mounts where the user deliberately
    // paused before navigating away.
    if (wasTrackAlreadyLoadedAtMount) return;
    const capturedUri = trackUri;
    const timer = setTimeout(() => {
      if (currentTrackUriRef.current === capturedUri && !isPlayingRef.current && !hasEverPlayedRef.current) {
        console.log("[Listen] Safety-net: track never started after 4s — retrying play()");
        play();
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [trackUri, isExternalListenMode, play, wasTrackAlreadyLoadedAtMount]);

  useEffect(() => {
    if (trackNuggets.length === 0) return;
    setReopenedNuggetId(null);

    if (aiFromCache && currentTime > 5) {
      // Re-navigation (cache hit, mid-track): restore past nuggets as mini-logos
      const shown = new Set<string>();
      const dismissed = new Map<string, Nugget>();
      let mostRecent: typeof trackNuggets[0] | null = null;
      for (const n of trackNuggets) {
        if (n.timestampSec <= currentTime) {
          shown.add(n.id);
          // Previous "mostRecent" becomes a dismissed nugget → mini-logo
          if (mostRecent) dismissed.set(mostRecent.id, mostRecent);
          mostRecent = n;
        }
      }
      setShownNuggetIds(shown);
      setDismissedNuggets(dismissed);
      setNuggetQueue([]);
      setActiveNugget(mostRecent); // Most recent past nugget shows as card
    } else {
      // Fresh generation or start of track: clear everything and let the
      // trigger effect handle nuggets as playback reaches each timestamp.
      setShownNuggetIds(new Set());
      setDismissedNuggets(new Map());
      setNuggetQueue([]);
      setActiveNugget(null);
    }
  }, [trackNuggets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nerdActive) { setActiveNugget(null); setNuggetQueue([]); }
  }, [nerdActive]);

  const handleSeek = useCallback((t: number) => {
    // Find the nearest nugget within 5s of the seek position (bidirectional).
    // Clicking slightly before OR after a marker dot should show that nugget.
    const PROXIMITY_THRESHOLD = 5;
    let targetNugget: typeof trackNuggets[0] | null = null;
    let bestDist = Infinity;
    for (const n of trackNuggets) {
      const dist = Math.abs(t - n.timestampSec);
      if (dist < bestDist && dist <= PROXIMITY_THRESHOLD) {
        bestDist = dist;
        targetNugget = n;
      }
    }

    setNuggetQueue([]);
    seek(t);

    // Mark nuggets at/before seek position as shown (won't re-trigger on tick).
    // Also mark the target since we're showing it directly.
    const newShown = new Set<string>();
    for (const n of trackNuggets) {
      if (n.timestampSec <= t) newShown.add(n.id);
    }
    if (targetNugget) newShown.add(targetNugget.id);
    setShownNuggetIds(newShown);

    // Directly show target nugget (bypasses trigger effect's isPlaying guard).
    if (targetNugget) {
      setActiveNugget(targetNugget);
      setReopenedNuggetId(null);
    } else {
      setActiveNugget(null);
    }

    // Prune dismissedNuggets: keep before seek point, remove target + future
    setDismissedNuggets((prev) => {
      const next = new Map<string, Nugget>();
      for (const [id, nugget] of prev) {
        if (nugget.timestampSec <= t && id !== targetNugget?.id) next.set(id, nugget);
      }
      return next;
    });
  }, [seek, trackNuggets]);

  // Nugget trigger logic — fires on playback tick or when new nuggets arrive.
  // INVARIANT (Pete's spec, 2026-05-06): nugget #0 always shows
  // immediately when nuggets land — no timestamp gating, no isPlaying
  // gating, no aiFromCache gating. The user just tapped a story and
  // expects content on screen as the song starts. Subsequent nuggets
  // pace through the track via timestampSec.
  //
  // Reveal rule for nuggets[1..N]:
  //   - No 8s auto-dismiss, no queue.
  //   - When a new nugget triggers and one is already active, push
  //     the active one into `dismissedNuggets` (so the playback-bar
  //     re-open chip renders for it) and replace it.
  //   - Last nugget stays on screen until track end / navigation.
  useEffect(() => {
    if (!nerdActive) return;
    if (trackNuggets.length === 0) return;

    // First nugget — always trigger immediately if not yet shown.
    const first = trackNuggets[0];
    if (first && !shownNuggetIds.has(first.id)) {
      if (activeNugget && activeNugget.id !== first.id) {
        setDismissedNuggets((prev) => new Map(prev).set(activeNugget.id, activeNugget));
      }
      setActiveNugget(first);
      setReopenedNuggetId(null);
      setShownNuggetIds((s) => new Set(s).add(first.id));
      return; // give state a tick before evaluating subsequent nuggets
    }

    // Subsequent nuggets — wait for playback to cross each timestamp
    // (cached tracks) or arrive from SSE (fresh tracks). The
    // `!isPlaying && aiFromCache` guard keeps cached-track unlock
    // tied to actual playback so a paused track doesn't dump the
    // whole rail at once.
    if (!isPlaying && aiFromCache) return;
    const shouldTrigger = (n: typeof trackNuggets[0]) =>
      !aiFromCache || currentTime >= n.timestampSec;
    // Collect every newly-eligible nugget for this tick first, then
    // commit state once. If two nuggets' timestamps were both crossed
    // in the same tick (e.g. after a seek or cache restore), the
    // previous per-iter setActiveNugget calls clobbered each other
    // and only the last one rendered — intermediates landed in
    // shownNuggetIds but never showed as the active card. Now the
    // intermediates are explicitly pushed into dismissedNuggets so
    // they appear in the dismissed strip / nerd reel.
    const newlyEligible: typeof trackNuggets = [];
    for (let i = 1; i < trackNuggets.length; i++) {
      const n = trackNuggets[i];
      if (shownNuggetIds.has(n.id)) continue;
      if (!shouldTrigger(n)) continue;
      newlyEligible.push(n);
    }
    if (newlyEligible.length === 0) return;
    const finalActive = newlyEligible[newlyEligible.length - 1];
    const intermediates = newlyEligible.slice(0, -1);
    setDismissedNuggets((prev) => {
      const next = new Map(prev);
      if (activeNugget && activeNugget.id !== finalActive.id) {
        next.set(activeNugget.id, activeNugget);
      }
      for (const n of intermediates) next.set(n.id, n);
      return next;
    });
    setActiveNugget(finalActive);
    setReopenedNuggetId(null);
    setShownNuggetIds((s) => {
      const next = new Set(s);
      for (const n of newlyEligible) next.add(n.id);
      return next;
    });
  }, [currentTime, isPlaying, nerdActive, trackNuggets, activeNugget, shownNuggetIds, reopenedNuggetId, aiFromCache]);


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

  const activeNuggetPct = activeNugget
    ? nuggetPositionMap.get(activeNugget.id)
      ?? ((activeNugget.timestampSec / (realDuration || 300)) * 100)
    : null;

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
  useThemeSync(effectiveCoverArt || "", tier);

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
            loading="eager"
            decoding="async"
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
            <MusicNerdLoadingOrchestrator
              aiLoading={aiLoading}
            waveLoading={waveLoading}
              aiError={aiError}
              hasNuggets={nuggetOnScreen}
              shortId={shortId}
              trackId={trackId}
              tier={tier}
              listenCount={listenCount}
              focusZone={focusZone}
              topFocusIndex={topFocusIndex}
              onCompanionClick={() => {
                if (shortId) {
                  window.open(`${window.location.origin}/c/${shortId}?tier=${tier}&listen=${listenCount}`, "_blank");
                }
              }}
            />
            {!isMobile && (
              <button
                onClick={() => setDevOpen((o) => !o)}
                className="rounded-md bg-foreground/5 px-2.5 py-0.5 text-[10px] text-muted-foreground/50 hover:bg-foreground/10 hover:text-muted-foreground transition-colors"
              >
                DEV
              </button>
            )}
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
            {artistDisplay}
          </p>
          {track.album && (
            <p className="mt-0.5 text-sm text-foreground/25 font-medium" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
              {track.album}
            </p>
          )}
        </motion.div>

        {/* URI resolving indicator — shown while the active service's
            catalog search is resolving the track URI. Apple Music
            users now resolve through the same spotify-search path
            (Phase 6b), so both paths show the indicator. */}
        {(isAppleMusicUser || hasSpotifyToken) && !trackUri && !isExternalListenMode && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 mx-10 mt-2 text-xs text-foreground/40 animate-pulse"
          >
            Connecting to {isAppleMusicUser ? "Apple Music" : "Spotify"}...
          </motion.p>
        )}

        {/* Spotify reconnect UI is now the root-mounted
            <SpotifyReconnectBanner />, so the old inline prompt was
            removed to avoid two overlapping toasts during the same
            refresh-failure event. */}

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

        {/* Centered album art — responsive sizing scales with viewport so
            it fills the frame on phones (where there's no foreground card
            of its own) and on TVs. Sized off the smaller viewport axis
            (min(70vw, 70vh)) so it stays square regardless of orientation
            and never gets cropped against the playback bar. */}
        <motion.div
          className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none"
          animate={{ opacity: barVisible ? 0.9 : 1, scale: barVisible ? 0.96 : 1 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
          <motion.img
            key={effectiveCoverArt}
            src={effectiveCoverArt}
            alt={`${track.title} cover art`}
            loading="eager"
            decoding="async"
            className="rounded-2xl object-cover shadow-2xl shadow-black/50"
            style={{ width: "min(70vw, 70vh)", height: "min(70vw, 70vh)" }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Floating nugget card — independent of bar visibility, anchored to timeline position.
            Bottom offsets must keep the card's bottom edge ABOVE the
            playback bar's top edge or the headline's lower lines render
            in the same vertical band as the timeline-marker dots. Live
            measurement (vh=628): bar top sits at ~y=560, so anything
            with bottom<68 ends up overlapping. 90/240 give a clear gap
            in both states (bar hidden → mini-bar at bottom; bar visible
            → full controls). */}
        <div
          className="fixed left-0 right-0 z-30 pointer-events-none transition-[bottom] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ bottom: barVisible ? 240 : 90 }}
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
                player.setTrackListenCount(trackKey, 0);
                player.clearTrackCompleted(trackKey);
                player.clearCompanionNuggets(trackKey);
                player.clearNuggetCache();
                setRegenerateKey(0);
              }}
              onResetAllHistory={async () => {
                if (!window.confirm("Delete ALL listening history? This cannot be undone.")) return;
                await supabase.from("nugget_history").delete().neq("track_key", "");
                if (track) {
                  const trackKey = `${track.artist}::${track.title}`;
                  player.setTrackListenCount(trackKey, 0);
                  player.clearTrackCompleted(trackKey);
                  player.clearCompanionNuggets(trackKey);
                }
                player.clearNuggetCache();
                setRegenerateKey(0);
              }}
              activePlayer={activePlayer}
              trackUri={trackUri}
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

        {/* Overlays (lazy-loaded — only fetched when opened) */}
        <Suspense fallback={null}>
          <AnimatePresence>
            {mediaOverlay && (
              <MediaOverlay
                source={mediaOverlay}
                onClose={() => { setMediaOverlay(null); resumeWithFade(); }}
              />
            )}
          </AnimatePresence>
        </Suspense>
        <Suspense fallback={null}>
          <AnimatePresence>
            {readingOverlay && (
              <ReadingOverlay
                source={readingOverlay}
                onClose={() => setReadingOverlay(null)}
              />
            )}
          </AnimatePresence>
        </Suspense>
        <Suspense fallback={null}>
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
                  artist={artistDisplay}
                  trackTitle={track.title}
                  onClose={() => { setDeepDiveNugget(null); setFocusZone('bar'); setNuggetFocused(false); }}
                />
              </ErrorBoundary>
            )}
          </AnimatePresence>
        </Suspense>
        {/* Immersive nugget overlay — always covers the full screen on mobile
            (fixed inset-0 z-50). There is no non-immersive mobile Listen view;
            onClose navigates to /browse. Desktop nuggets use inline NuggetCard
            positioned above the playback bar instead. */}
        {isMobile && track && (
          <Suspense fallback={null}>
            <ImmersiveNuggetView
              nuggets={trackNuggetsWithDevInjection}
              sources={aiSources}
              coverArtUrl={effectiveCoverArt}
              trackTitle={track?.title || ""}
              artist={artistDisplay}
              onClose={() => navigate("/browse")}
              onPrev={handlePrev}
              onNext={handleNext}
              spotifyAlbumArt={spotifyStateTrack?.albumArtUrl}
              researching={aiLoading || waveLoading}
              isFresh={!aiFromCache}
            />
          </Suspense>
        )}

      </div>

      {/* Orchestrator for immersive mode — fixed top-right so its anchor
          is visible and the morph-fly animation lands correctly */}
      {isMobile && track && (
        <div className="fixed top-3 right-3 z-[60]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <MusicNerdLoadingOrchestrator
            aiLoading={aiLoading}
            waveLoading={waveLoading}
            aiError={aiError}
            hasNuggets={nuggetOnScreen}
            shortId={shortId}
            trackId={trackId}
            tier={tier}
            listenCount={listenCount}
            focusZone={focusZone}
            topFocusIndex={topFocusIndex}
            onCompanionClick={() => {
              if (shortId) {
                window.open(`${window.location.origin}/c/${shortId}?tier=${tier}&listen=${listenCount}`, "_blank");
              }
            }}
          />
        </div>
      )}

      {/* "More coming…" pill removed — the timeline-marker dots in
          the playback bar already communicate how many nuggets are
          on deck, and the pill was overlapping the active nugget's
          headline on mobile. `waveLoading` state stays in
          useAINuggets for any future use that doesn't compete with
          content for screen real estate. */}
    </PageTransition>
  );
}

