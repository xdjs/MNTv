import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LogOut, Heart, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import TileRow from "@/components/TileRow";
import SearchOverlay from "@/components/SearchOverlay";
import PageTransition from "@/components/PageTransition";
import StoriesRail from "@/components/StoriesRail";
import ArtistUpdatesSection from "@/components/ArtistUpdatesSection";
import { useUserProfile, tierGreeting, tierBadgeLabel, tierGlowClass } from "@/hooks/useMusicNerdState";
import { usePersonalizedCatalog } from "@/hooks/usePersonalizedCatalog";
import { useTierAccent } from "@/hooks/useTierAccent";
import { useSignOut } from "@/hooks/useSignOut";
import { usePlayer } from "@/contexts/PlayerContext";
import { useStoriesContext } from "@/contexts/StoriesContext";
import { useArtistUpdatesContext } from "@/contexts/ArtistUpdatesContext";
import { useTierGate } from "@/contexts/TierGateContext";

export default function Browse() {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { profile, saveProfile } = useUserProfile();
  const { tierConfirmed } = useTierGate();
  // Direct-navigating to /browse (refresh, bookmark, new tab) skips
  // PreparingExperience and lands here with tierConfirmed=false.
  // StoriesProvider + ArtistUpdatesProvider both gate pre-gen on
  // tierConfirmed, so Browse would render empty rails. Route through
  // /preparing for the picker.
  //
  // One-shot guard: fire the redirect at most once per mount. Without
  // this, if a transient context re-emit ever flipped tierConfirmed
  // false→true→false the user could be yanked out of Browse mid-
  // session. The legitimate "needs to confirm tier" case happens
  // exactly at mount; later flips during an active session are
  // either bugs or expected (sign-out clears the flag, which is its
  // own navigation path).
  const tierRedirectFiredRef = useRef(false);
  useEffect(() => {
    if (tierRedirectFiredRef.current) return;
    if (profile && !tierConfirmed) {
      tierRedirectFiredRef.current = true;
      navigate("/preparing?next=/browse", { replace: true });
    }
  }, [profile, tierConfirmed, navigate]);
  const { signOut } = useSignOut();
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

  // Pre-gen happens up at StoriesProvider (mounted in App), so stories start
  // warming as soon as the profile is hydrated — not when the user reaches
  // this page. Browse just reads the shared state.
  const { stories } = useStoriesContext();

  // "Your artists, lately" — nested rows, one per top artist. Pre-gen
  // is hoisted into `ArtistUpdatesProvider` at app root so warmup
  // starts on profile hydration (returning user) OR immediately after
  // handleTierSelect saves the profile (new user), rather than waiting
  // for Browse to mount. Browse just reads the shared state.
  const {
    groups: artistUpdateGroups,
    totalCount: artistUpdatesTotal,
    readyCount: artistUpdatesReady,
  } = useArtistUpdatesContext();

  const demoItems = [
    {
      id: "demo-around-the-world",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b2738ac778cc7d88779f74d33311",
      title: "Around the World",
      subtitle: "Daft Punk",
      href: "/listen/demo-around-the-world?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b2738ac778cc7d88779f74d33311",
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
      href: "/listen/demo-oms-at-play?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b27305b43e15352510b1b9c9a5a5",
    },
    {
      id: "demo-slack",
      imageUrl: "https://i.scdn.co/image/ab67616d0000b273e9c4a69ecd5c43229cfd03f3",
      title: "SLACK",
      subtitle: "Jamee Cornelia",
      href: "/listen/demo-slack?art=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b273e9c4a69ecd5c43229cfd03f3",
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

  // removed the 10s-idle auto-return to /listen.
  // It was forcing users out of Browse mid-scroll any time a new
  // nugget arrived for the playing track. The mini-player tap is
  // already a clear opt-in path back to the immersive view; new
  // nuggets that arrived while away will be shown on return.
  const listenUrl = currentTrack
    ? `/listen/${currentTrack.trackId}?art=${encodeURIComponent(currentTrack.coverArtUrl)}`
    : null;

  // Sign-out goes through the shared useSignOut hook so every caller
  // (this button, future settings menu, session-expired flows) ends the
  // Supabase session, clears every per-user storage key, and hard-reloads
  // through the same code path. See src/hooks/useSignOut.ts for why each
  // step exists. The .catch fallback guarantees the user lands on / even
  // if a synchronous throw inside the hook (e.g. QuotaExceededError on
  // localStorage in Safari private mode) bypasses the hook's own reload.
  const handleSignOut = () => {
    signOut().catch((err) => {
      console.error("[Browse] signOut failed, forcing reload:", err);
      window.location.href = "/";
    });
  };

  // Focus state: rowIndex (-1 = header), colIndex
  const [rowIndex, setRowIndex] = useState(-1);
  const [colIndex, setColIndex] = useState(0);
  // Hide the TV-style focus glow until the user actually presses an
  // arrow key. Touch users (mobile) never trigger it, so the glow
  // doesn't sit glued to the first tile while they scroll. Flips true
  // on the first keydown handled below; never flips back (a touch
  // session that briefly used a keyboard still has tactile cues, and
  // re-hiding mid-session would feel like a bug).
  const [kbNavActive, setKbNavActive] = useState(false);

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
      // First arrow press promotes us to "kb nav" mode; until then,
      // focusedIndex is null on every TileRow (no glow on mobile).
      if (
        !kbNavActive &&
        (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        setKbNavActive(true);
      }
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

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-10 pt-6 md:pt-8 pb-4 md:pb-6">
          <button
            onClick={cycleTier}
            title={`Switch tier (currently ${tier || "casual"})`}
            className={`rounded-full transition-all ${kbNavActive && rowIndex === -1 && colIndex === 0 ? focusGlow + " scale-110" : ""}`}
          >
            <MusicNerdLogo size={36} glow className="opacity-80" />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              className={`flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-5 text-sm text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
                kbNavActive && rowIndex === -1 && colIndex === 1 ? focusGlow + " scale-105" : ""
              }`}
            >
              <Search size={16} />
              <span className="hidden md:inline" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>Search</span>
            </button>
            <Link
              to="/profile"
              title="Saved nuggets"
              aria-label="Saved nuggets"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
            >
              <Heart size={16} />
            </Link>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
                kbNavActive && rowIndex === -1 && colIndex === 2 ? focusGlow + " scale-105" : ""
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
            {/* Tier picker — surfaces tier choice on every Browse mount so
                returning users can change tier without going back through
                Connect. Pete: "I should be able to pick my tier every
                time I log in." */}
            <TierPicker
              tier={tier}
              onSelect={(t) => {
                if (!profile) return;
                if (t !== tier) saveProfile({ ...profile, calculatedTier: t });
              }}
            />
          </div>
          <p className="mt-1 text-muted-foreground text-lg">
            {profile?.streamingService
              ? `Listening via ${profile.streamingService}`
              : "What do you want to listen to?"}
          </p>
        </div>

        {/* Stories rail — pre-generated nuggets for your top tracks. Tapping
            a story opens Listen with the first nugget instant from cache. */}
        <StoriesRail stories={stories} />

        {/* "Your artists, lately" — nested per-artist rows of updates.
            Replaces the old Jump-Back-In + Top-Artists rows; moves Browse
            away from the Spotify-shaped layout. */}
        <ArtistUpdatesSection
          groups={artistUpdateGroups}
          profile={profile}
          artistIds={profile?.artistIds}
          totalCount={artistUpdatesTotal}
          readyCount={artistUpdatesReady}
        />

        {/* Rows */}
        {allRows.map((row, i) => (
          <TileRow
            key={row.label}
            label={row.label}
            items={row.items}
            tileSize={row.size}
            focusedIndex={kbNavActive && rowIndex === i ? colIndex : null}
          />
        ))}

        {/* Demo Tracks — hardcoded for live demos */}
        <TileRow
          label="Demo Tracks"
          items={demoItems}
          tileSize="md"
          focusedIndex={kbNavActive && rowIndex === allRows.length ? colIndex : null}
        />

        <div className="h-28" />

        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </PageTransition>
  );
}

// ── Tier picker ─────────────────────────────────────────────────────────
// Pulled out of the header MusicNerdLogo (which "cycled" the tier on
// click — a hidden interaction nobody discovered) into an explicit
// dropdown inline with the greeting. Always visible on Browse so the
// user can change tier on every login without going through Connect.

interface TierPickerProps {
  tier: "casual" | "curious" | "nerd" | undefined;
  onSelect: (t: "casual" | "curious" | "nerd") => void;
}

const TIER_OPTIONS: Array<{ id: "casual" | "curious" | "nerd"; label: string; desc: string; color: string }> = [
  { id: "casual", label: "Casual", desc: "Just here for the vibes", color: "text-green-400" },
  { id: "curious", label: "Curious", desc: "I like the backstory", color: "text-blue-400" },
  { id: "nerd", label: "Nerd Mode", desc: "Give me every detail", color: "text-pink-400" },
];

function TierPicker({ tier, onSelect }: TierPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!tier) return null;
  const current = TIER_OPTIONS.find((t) => t.id === tier);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors ${current?.color ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change tier"
      >
        <span>● {current?.label ?? tierBadgeLabel(tier)}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-2 z-30 w-56 rounded-xl bg-background/95 backdrop-blur-xl ring-1 ring-foreground/10 shadow-2xl py-1.5"
        >
          {TIER_OPTIONS.map((opt) => {
            const selected = opt.id === tier;
            return (
              <button
                key={opt.id}
                onClick={() => { onSelect(opt.id); setOpen(false); }}
                role="option"
                aria-selected={selected}
                className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-foreground/5 transition-colors ${selected ? "bg-foreground/[0.04]" : ""}`}
              >
                <span className={`text-sm font-bold ${opt.color}`}>● {opt.label}{selected ? " — current" : ""}</span>
                <span className="text-xs text-muted-foreground">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
