import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LogOut } from "lucide-react";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TileRow from "@/components/TileRow";
import SearchOverlay from "@/components/SearchOverlay";
import PageTransition from "@/components/PageTransition";
import { useUserProfile, tierGreeting, tierBadgeLabel, tierBadgeColor, tierGlowClass } from "@/hooks/useMusicNerdState";
import { usePersonalizedCatalog } from "@/hooks/usePersonalizedCatalog";
import { useTierAccent } from "@/hooks/useTierAccent";
import { usePlayer } from "@/contexts/PlayerContext";

export default function Browse() {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { profile, saveProfile, clearProfile } = useUserProfile();
  const tier = profile?.calculatedTier;
  const { currentTrack, isPlaying, nowPlayingFocused, setNowPlayingFocused, setNowPlayingFocusIndex } = usePlayer();

  const cycleTier = useCallback(() => {
    if (!profile) return;
    const tiers: Array<"casual" | "curious" | "nerd"> = ["casual", "curious", "nerd"];
    const currentIdx = tiers.indexOf(tier || "casual");
    const nextTier = tiers[(currentIdx + 1) % tiers.length];
    saveProfile({ ...profile, calculatedTier: nextTier });
  }, [profile, tier, saveProfile]);

  useTierAccent(tier);

  const { rows: allRows } = usePersonalizedCatalog(profile);
  const userName = profile?.displayName || profile?.spotifyDisplayName || "";

  const demoItems = [
    {
      id: "demo-around-the-world",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b2738ac778cc7d88779f74d33311",
      title: "Around the World",
      subtitle: "Daft Punk",
      href: "/listen/real::Daft%20Punk::Around%20the%20World::Homework::spotify:track:1pKYYY0dkg23sQQXi0Q5zN?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b2738ac778cc7d88779f74d33311",
    },
    {
      id: "demo-weird-fishes",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9",
      title: "Weird Fishes/Arpeggi",
      subtitle: "Radiohead",
      href: "/listen/demo-weird-fishes?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b273de3c04b5fc750b68899b20a9",
    },
    {
      id: "demo-oms-at-play",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b27305b43e15352510b1b9c9a5a5",
      title: "Oms at Play",
      subtitle: "Pete Rango",
      href: "/listen/real::Pete%20Rango::Oms%20at%20Play::Savage%20Planet::spotify:track:7mYphBaMfblb6iu1saj3MC?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b27305b43e15352510b1b9c9a5a5",
    },
{
      id: "demo-slack",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b273e9c4a69ecd5c43229cfd03f3",
      title: "SLACK",
      subtitle: "Jamee Cornelia",
      href: "/listen/real::Jamee%20Cornelia::SLACK::HARVEST::spotify:track:5bU8cB57AfhTtO0qj9zy3X?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b273e9c4a69ecd5c43229cfd03f3",
    },
    {
      id: "demo-humble",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b2738b52c6b9bc4e43d873869699",
      title: "HUMBLE.",
      subtitle: "Kendrick Lamar",
      href: "/listen/demo-humble?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b2738b52c6b9bc4e43d873869699",
    },
    {
      id: "demo-bad-guy",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b27350a3147b4edd7701a876c6ce",
      title: "bad guy",
      subtitle: "Billie Eilish",
      href: "/listen/demo-bad-guy?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b27350a3147b4edd7701a876c6ce",
    },
  ];

  // Total tile rows (personalized + demo)
  const totalRows = allRows.length + 1;
  const lastRowIndex = totalRows - 1; // index of Demo Tracks row = allRows.length
  const npbVisible = !!currentTrack;
  const lastRowRef = useRef(0);

  // Auto-return to Listen after 10s idle when track is playing
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenUrl = currentTrack
    ? `/listen/${currentTrack.trackId}?art=${encodeURIComponent(currentTrack.coverArtUrl)}`
    : null;

  useEffect(() => {
    if (!isPlaying || !listenUrl) return;
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => navigate(listenUrl), 10000);
    };
    resetIdle();
    window.addEventListener("keydown", resetIdle);
    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("click", resetIdle);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener("keydown", resetIdle);
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("click", resetIdle);
    };
  }, [isPlaying, listenUrl, navigate]);

  const handleSignOut = () => {
    clearProfile();
    localStorage.removeItem("spotify_playback_token");
    sessionStorage.removeItem("musicnerd_redirect");
    sessionStorage.removeItem("spotify_pending_taste");
    // Hard navigate to avoid ProtectedRoute redirect race — clearProfile()
    // triggers a re-render where ProtectedRoute redirects to /connect before
    // React Router's navigate("/") takes effect.
    window.location.href = "/";
  };

  // Focus state: rowIndex (-1 = header), colIndex
  const [rowIndex, setRowIndex] = useState(-1);
  const [colIndex, setColIndex] = useState(0);

  const HEADER_ITEMS = 3;

  const findClosestColByViewport = useCallback((targetRowLabel: string, currentCenterX: number) => {
    const tiles = document.querySelectorAll<HTMLElement>(`[data-tile-row="${targetRowLabel}"]`);
    let bestCol = 0;
    let bestDist = Infinity;
    tiles.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const dist = Math.abs(cx - currentCenterX);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = parseInt(el.dataset.tileCol || "0", 10);
      }
    });
    return bestCol;
  }, []);

  const getCurrentCenterX = useCallback(() => {
    if (rowIndex === -1) return window.innerWidth / 2;
    const label = rowIndex < allRows.length ? allRows[rowIndex]?.label : "Demo Tracks";
    if (!label) return window.innerWidth / 2;
    const el = document.querySelector<HTMLElement>(`[data-tile-row="${label}"][data-tile-col="${colIndex}"]`);
    if (!el) return window.innerWidth / 2;
    const rect = el.getBoundingClientRect();
    return rect.left + rect.width / 2;
  }, [rowIndex, colIndex, allRows]);

  // ── D-pad keyboard navigation ──────────────────────────────────────
  useEffect(() => {
    if (searchOpen) return; // let search overlay handle its own keys
    if (nowPlayingFocused) return; // NowPlayingBar handles its own keys

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (rowIndex === -1) {
          // Header → first row
          if (allRows.length > 0) {
            const centerX = getCurrentCenterX();
            const nextCol = findClosestColByViewport(allRows[0].label, centerX);
            setRowIndex(0);
            setColIndex(nextCol);
          }
        } else if (rowIndex < lastRowIndex) {
          const centerX = getCurrentCenterX();
          const nextRow = rowIndex + 1;
          const nextLabel = nextRow < allRows.length ? allRows[nextRow].label : "Demo Tracks";
          const nextCol = findClosestColByViewport(nextLabel, centerX);
          setRowIndex(nextRow);
          setColIndex(nextCol);
        } else if (rowIndex === lastRowIndex && npbVisible) {
          // Last tile row → NowPlayingBar
          lastRowRef.current = rowIndex;
          setNowPlayingFocused(true);
          setNowPlayingFocusIndex(0);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (rowIndex > 0) {
          const centerX = getCurrentCenterX();
          const nextRow = rowIndex - 1;
          const nextCol = findClosestColByViewport(allRows[nextRow].label, centerX);
          setRowIndex(nextRow);
          setColIndex(nextCol);
        } else if (rowIndex === 0) {
          setRowIndex(-1);
          setColIndex(0);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (rowIndex === -1) {
          setColIndex((c) => Math.min(c + 1, HEADER_ITEMS - 1));
        } else if (rowIndex >= allRows.length) {
          setColIndex((c) => Math.min(c + 1, demoItems.length - 1));
        } else {
          const maxCol = (allRows[rowIndex]?.items.length || 1) - 1;
          setColIndex((c) => Math.min(c + 1, maxCol));
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setColIndex((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (rowIndex === -1) {
          if (colIndex === 0) cycleTier();
          else if (colIndex === 1) setSearchOpen(true);
          else if (colIndex === 2) handleSignOut();
        } else {
          const items = rowIndex < allRows.length ? allRows[rowIndex]?.items : demoItems;
          const item = items?.[colIndex];
          if (item) navigate(item.href);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, rowIndex, colIndex, allRows, navigate, cycleTier, getCurrentCenterX, findClosestColByViewport, nowPlayingFocused, npbVisible, lastRowIndex, setNowPlayingFocused, setNowPlayingFocusIndex]);

  // When NowPlayingBar releases focus (user pressed Up), restore last tile row
  useEffect(() => {
    if (!nowPlayingFocused && lastRowRef.current >= 0) {
      setRowIndex(lastRowRef.current);
    }
  }, [nowPlayingFocused]);

  const focusGlow = "tv-focus-glow";
  const glowClass = tier ? tierGlowClass(tier) : "";
  const badgeColor = tier ? tierBadgeColor(tier) : "";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-10 pt-6 md:pt-8 pb-4 md:pb-6">
          <button
            onClick={cycleTier}
            title={`Switch tier (currently ${tier || "casual"})`}
            className={`rounded-full transition-all ${rowIndex === -1 && colIndex === 0 ? focusGlow + " scale-110" : ""}`}
          >
            <MusicNerdLogo size={36} glow className="opacity-80" />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              className={`flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-5 text-sm text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
                rowIndex === -1 && colIndex === 1 ? focusGlow + " scale-105" : ""
              }`}
            >
              <Search size={16} />
              <span className="hidden md:inline" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>Search</span>
            </button>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
                rowIndex === -1 && colIndex === 2 ? focusGlow + " scale-105" : ""
              }`}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Hero greeting */}
        <div className={`mx-4 md:mx-10 mb-6 md:mb-8 px-4 md:px-5 py-3 md:py-4 rounded-2xl ${glowClass}`}>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <h1
              className="text-2xl md:text-4xl lg:text-5xl font-black text-foreground tracking-tight"
              style={{ fontFamily: "'Nunito Sans', sans-serif" }}
            >
              {tierGreeting(tier, userName)}
            </h1>
            {tier && (
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeColor}`}>
                ● {tierBadgeLabel(tier)}
              </span>
            )}
          </div>
          <p className="mt-1 text-muted-foreground text-lg">
            {profile?.streamingService
              ? `Listening via ${profile.streamingService}`
              : "What do you want to listen to?"}
          </p>
        </div>

        {/* Rows */}
        {allRows.map((row, i) => (
          <TileRow
            key={row.label}
            label={row.label}
            items={row.items}
            tileSize={row.size}
            focusedIndex={rowIndex === i ? colIndex : null}
          />
        ))}

        {/* Demo Tracks — hardcoded for live demos */}
        <TileRow
          label="Demo Tracks"
          items={demoItems}
          tileSize="md"
          focusedIndex={rowIndex === allRows.length ? colIndex : null}
        />

        <div className="h-28" />

        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </PageTransition>
  );
}
