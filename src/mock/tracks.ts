import { Track, Source, Nugget, Artist, Album } from "./types";

// ==================== ARTIST IMAGES ====================
import daftPunkImg from "@/assets/artists/daft-punk.jpg";
import radioheadImg from "@/assets/artists/radiohead.jpg";

// ==================== ARTISTS ====================
export const artists: Artist[] = [
  {
    id: "daft-punk",
    name: "Daft Punk",
    imageUrl: daftPunkImg,
    bio: "French electronic music duo formed in 1993 by Thomas Bangalter and Guy-Manuel de Homem-Christo. Pioneers of French house, they fused funk, disco, and electronic music into a robotic aesthetic that redefined dance music for a generation.",
    genres: ["Electronic", "French House", "Disco"],
    relatedArtistIds: ["radiohead"],
  },
  {
    id: "radiohead",
    name: "Radiohead",
    imageUrl: radioheadImg,
    bio: "English rock band formed in 1985. After the Britpop success of The Bends, they pivoted into experimental electronic territory with Kid A, redefining what a rock band could be in the 21st century.",
    genres: ["Alternative Rock", "Art Rock", "Electronic"],
    relatedArtistIds: ["daft-punk"],
  },
];

// ==================== ALBUMS ====================
// Cover art from the Cover Art Archive (coverartarchive.org)
const CAA = (rgid: string) => `https://coverartarchive.org/release-group/${rgid}/front-500`;

export const albums: Album[] = [
  // Daft Punk
  { id: "alb-dp-homework", artistId: "daft-punk", title: "Homework", year: 1997, coverArtUrl: CAA("00054665-89fa-33d5-a8f0-1728ea8c32c3"), genre: "French House" },
  { id: "alb-dp-discovery", artistId: "daft-punk", title: "Discovery", year: 2001, coverArtUrl: CAA("48117b90-a16e-34ca-a514-19c702df1158"), genre: "French House" },
  { id: "alb-dp-ram", artistId: "daft-punk", title: "Random Access Memories", year: 2013, coverArtUrl: CAA("aa997ea0-2936-40bd-884d-3af8a0e064dc"), genre: "Disco" },
  // Radiohead
  { id: "alb-rh-kida", artistId: "radiohead", title: "Kid A", year: 2000, coverArtUrl: CAA("e75c0549-ad55-39e3-8025-c72c5d4a3c5d"), genre: "Art Rock" },
  { id: "alb-rh-okc", artistId: "radiohead", title: "OK Computer", year: 1997, coverArtUrl: CAA("b1392450-e666-3926-a536-22c65f834433"), genre: "Alternative Rock" },
  { id: "alb-rh-inrainbows", artistId: "radiohead", title: "In Rainbows", year: 2007, coverArtUrl: CAA("6e335887-60ba-38f0-95af-fae7774336bf"), genre: "Art Rock" },
];

// ==================== TRACKS ====================
export const tracks: Track[] = [
  { id: "daft-punk-around-the-world", title: "Around the World", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-homework", album: "Homework", durationSec: 210, coverArtUrl: CAA("00054665-89fa-33d5-a8f0-1728ea8c32c3"), trackNumber: 1 },
  { id: "daft-punk-one-more-time", title: "One More Time", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-discovery", album: "Discovery", durationSec: 320, coverArtUrl: CAA("48117b90-a16e-34ca-a514-19c702df1158"), trackNumber: 1 },
  { id: "daft-punk-get-lucky", title: "Get Lucky", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-ram", album: "Random Access Memories", durationSec: 369, coverArtUrl: CAA("aa997ea0-2936-40bd-884d-3af8a0e064dc"), trackNumber: 1 },
  { id: "radiohead-everything", title: "Everything in Its Right Place", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-kida", album: "Kid A", durationSec: 252, coverArtUrl: CAA("e75c0549-ad55-39e3-8025-c72c5d4a3c5d"), trackNumber: 1 },
  { id: "radiohead-paranoid-android", title: "Paranoid Android", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-okc", album: "OK Computer", durationSec: 386, coverArtUrl: CAA("b1392450-e666-3926-a536-22c65f834433"), trackNumber: 1 },
  { id: "radiohead-reckoner", title: "Reckoner", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-inrainbows", album: "In Rainbows", durationSec: 290, coverArtUrl: CAA("6e335887-60ba-38f0-95af-fae7774336bf"), trackNumber: 1 },
];

// ==================== SOURCES ====================
export const sources: Source[] = [
  // Daft Punk — Around the World
  { id: "src-dp-yt", type: "youtube", title: "Daft Punk - Around The World (Official Music Video Remastered)", publisher: "YouTube / Daft Punk", url: "https://www.youtube.com/watch?v=K0HSD_i2DvA", embedId: "K0HSD_i2DvA", locator: "03:12-03:27", quoteSnippet: "They recorded the entire album in Thomas's bedroom using a Roland TR-909.", thumbnailUrl: "https://img.youtube.com/vi/K0HSD_i2DvA/hqdefault.jpg" },
  { id: "src-dp-art", type: "article", title: "How Daft Punk Made French House a Global Phenomenon", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 6", quoteSnippet: "The repetition wasn't lazy — it was hypnotic by design." },
  { id: "src-dp-int", type: "interview", title: "Thomas Bangalter on Homework", publisher: "Mixmag", url: "https://mixmag.net", locator: "Section 3", quoteSnippet: "We wanted to strip house music back to its most primal loop." },
  // Daft Punk — One More Time
  { id: "src-dp-omt-yt", type: "youtube", title: "Daft Punk - One More Time (Official Video)", publisher: "YouTube / Daft Punk", url: "https://www.youtube.com/watch?v=FGBhQbmPwH8", embedId: "FGBhQbmPwH8", locator: "01:30-01:55", quoteSnippet: "Romanthony's vocal was compressed to distortion — they wanted it 'damaged but joyful.'", thumbnailUrl: "https://img.youtube.com/vi/FGBhQbmPwH8/hqdefault.jpg" },
  { id: "src-dp-omt-art", type: "article", title: "Discovery: Daft Punk's Animated Masterpiece", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 3", quoteSnippet: "Discovery was inspired by childhood memories of Saturday morning cartoons." },
  { id: "src-dp-omt-int", type: "interview", title: "Thomas Bangalter on Discovery", publisher: "Electronic Beats", url: "https://electronicbeats.net", locator: "Section 2", quoteSnippet: "The vocoder is another instrument, not a gimmick." },
  // Daft Punk — Get Lucky
  { id: "src-dp-gl-yt", type: "youtube", title: "Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers", publisher: "YouTube / Daft Punk", url: "https://www.youtube.com/watch?v=h5EofwRzit0", embedId: "h5EofwRzit0", locator: "02:00-02:25", quoteSnippet: "Nile Rodgers played the riff hundreds of times — they comped the final from dozens of takes.", thumbnailUrl: "https://img.youtube.com/vi/h5EofwRzit0/hqdefault.jpg" },
  { id: "src-dp-gl-art", type: "article", title: "Random Access Memories: The Return to Live Music", publisher: "Rolling Stone", url: "https://rollingstone.com", locator: "Paragraph 5", quoteSnippet: "RAM was recorded entirely with live musicians — a deliberate rejection of the laptop era." },
  { id: "src-dp-gl-int", type: "interview", title: "Pharrell Williams on Recording Get Lucky", publisher: "GQ", url: "https://gq.com", locator: "Section 4", quoteSnippet: "Most of my ad-libs were first takes. They refused to let me re-record them." },
  // Radiohead — Everything in Its Right Place
  { id: "src-rh-yt", type: "youtube", title: "Radiohead - Everything In Its Right Place (Live)", publisher: "YouTube / Radiohead", url: "https://www.youtube.com/watch?v=dTFtpuGxOkg", embedId: "dTFtpuGxOkg", locator: "05:44-06:10", quoteSnippet: "Thom fed his lyrics through an Ensoniq vocal processor, intentionally burying meaning.", thumbnailUrl: "https://img.youtube.com/vi/dTFtpuGxOkg/hqdefault.jpg" },
  { id: "src-rh-art", type: "article", title: "The Making of Kid A", publisher: "The Guardian", url: "https://theguardian.com", locator: "Paragraph 12", quoteSnippet: "The band refused to rehearse the songs live before recording them." },
  { id: "src-rh-int", type: "interview", title: "Jonny Greenwood on Electronic Experimentation", publisher: "Wire Magazine", url: "https://thewire.co.uk", locator: "Section 2", quoteSnippet: "We realized guitars weren't the only way to express dread." },
  // Radiohead — Paranoid Android
  { id: "src-rh-pa-yt", type: "youtube", title: "Radiohead - Paranoid Android (Remastered)", publisher: "YouTube / Radiohead", url: "https://www.youtube.com/watch?v=DExBeFCx3mQ", embedId: "DExBeFCx3mQ", locator: "08:10-08:35", quoteSnippet: "Paranoid Android was stitched together from three separate songs.", thumbnailUrl: "https://img.youtube.com/vi/DExBeFCx3mQ/hqdefault.jpg" },
  { id: "src-rh-pa-art", type: "article", title: "The Making of OK Computer", publisher: "NME", url: "https://nme.com", locator: "Paragraph 7", quoteSnippet: "EMI initially refused to release it as a single because of its length." },
  { id: "src-rh-pa-int", type: "interview", title: "Colin Greenwood on Paranoid Android", publisher: "Mojo", url: "https://mojo4music.com", locator: "Section 4", quoteSnippet: "We thought of it as our Bohemian Rhapsody — except angrier." },
  // Radiohead — Reckoner
  { id: "src-rh-re-yt", type: "youtube", title: "Radiohead - Reckoner (From the Basement)", publisher: "YouTube / Radiohead", url: "https://www.youtube.com/watch?v=2FMP-9bn9N8", embedId: "2FMP-9bn9N8", locator: "04:30-04:55", quoteSnippet: "Reckoner went through dozens of radically different versions over 6 years.", thumbnailUrl: "https://img.youtube.com/vi/2FMP-9bn9N8/hqdefault.jpg" },
  { id: "src-rh-re-art", type: "article", title: "The Long Gestation of In Rainbows", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 9", quoteSnippet: "The original Reckoner was a thrashing rock song — nothing like the final version." },
  { id: "src-rh-re-int", type: "interview", title: "Ed O'Brien on In Rainbows Sessions", publisher: "Guitar World", url: "https://guitarworld.com", locator: "Section 2", quoteSnippet: "The guitar harmonics just happened. Thom said 'keep doing that forever.'" },
];

// ==================== NUGGETS ====================
export const nuggets: Nugget[] = [
  // Daft Punk — Around the World
  { id: "n-dp-1", trackId: "daft-punk-around-the-world", timestampSec: 8, durationMs: 7000, headline: "Two Parisian kids turned one vocal phrase into a 7-minute masterclass in hypnosis.", text: "Thomas Bangalter and Guy-Manuel de Homem-Christo built 'Around the World' from a single repeated lyric — 144 times, no variation. It wasn't laziness; it was a deliberate tribute to the trance-inducing repetition of Chicago house and Detroit techno that shaped their teenage years.", kind: "artist", sourceId: "src-dp-art" },
  { id: "n-dp-2", trackId: "daft-punk-around-the-world", timestampSec: 45, durationMs: 7000, headline: "That iconic bassline? It came from a bedroom studio and a $200 synth.", text: "Bangalter recorded the track in his apartment using a Roland TB-303 bassline and a TR-909 drum machine — the exact gear that defined acid house a decade earlier. The production is deliberately sparse: the groove builds not by adding layers, but by subtly shifting the filter cutoff on that bass throughout the track.", kind: "track", listenFor: true, sourceId: "src-dp-yt" },
  { id: "n-dp-3", trackId: "daft-punk-around-the-world", timestampSec: 90, durationMs: 6000, headline: "If this groove locked you in, Armand Van Helden's 'You Don't Know Me' will keep you spinning.", text: "Van Helden was working the same late-90s French touch / NYC house crossover, and his use of pitched-up vocal samples and relentless four-on-the-floor grooves shares DNA with Homework. His remix of Tori Amos's 'Professional Widow' is another gateway into that era's filtered disco revival.", kind: "discovery", sourceId: "src-dp-int" },
  // Daft Punk — One More Time
  { id: "n-dp-omt-1", trackId: "daft-punk-one-more-time", timestampSec: 64, durationMs: 6000, headline: "The voice behind this anthem almost didn't make the album.", text: "Romanthony — a New Jersey house producer and vocalist — recorded the demo on a cheap mic in his home studio. Daft Punk loved the raw, blown-out quality so much they refused to re-record it professionally. Romanthony's vocal was then compressed even further until it distorted, creating that 'damaged but joyful' sound that defined Discovery.", kind: "artist", sourceId: "src-dp-omt-yt" },
  { id: "n-dp-omt-2", trackId: "daft-punk-one-more-time", timestampSec: 160, durationMs: 5500, headline: "Discovery wasn't just an album — it was a Saturday morning cartoon brought to life.", text: "Thomas and Guy-Manuel built the entire album around childhood nostalgia for anime and 70s/80s pop. They commissioned Leiji Matsumoto (creator of Galaxy Express 999) to direct Interstella 5555, a feature-length anime where each track is a chapter. The album was the soundtrack first; the film came second.", kind: "track", listenFor: true, sourceId: "src-dp-omt-art" },
  { id: "n-dp-omt-3", trackId: "daft-punk-one-more-time", timestampSec: 256, durationMs: 6000, headline: "If this track's euphoric rush hit you, Stardust's 'Music Sounds Better with You' is its twin.", text: "Thomas Bangalter co-produced 'Music Sounds Better with You' as one half of Stardust just two years before Discovery. It shares the same filtered disco DNA and vocal-driven euphoria. The track was a massive one-off hit that proved the French touch formula before Daft Punk scaled it into a full album concept.", kind: "discovery", sourceId: "src-dp-omt-int" },
  // Daft Punk — Get Lucky
  { id: "n-dp-gl-1", trackId: "daft-punk-get-lucky", timestampSec: 74, durationMs: 6000, headline: "Daft Punk spent millions to make a robot album that sounds entirely human.", text: "For Random Access Memories, they booked Capitol Studios, Henson Recording, and Electric Lady — the same rooms where Sinatra, Stevie Wonder, and Hendrix recorded. They hired session legends like Nathan East, Omar Hakim, and Paul Jackson Jr. The duo who defined electronic music deliberately built their final album without a single programmed beat.", kind: "artist", sourceId: "src-dp-gl-yt" },
  { id: "n-dp-gl-2", trackId: "daft-punk-get-lucky", timestampSec: 184, durationMs: 5500, headline: "That guitar riff was played hundreds of times — and the magic was in the comping.", text: "Nile Rodgers ran through the riff for hours across multiple sessions. Daft Punk then comped the final from dozens of takes, picking individual bars where Rodgers's feel was most alive. Pharrell's vocal ad-libs were mostly first takes — the duo believed spontaneity couldn't be manufactured, only captured.", kind: "track", listenFor: true, sourceId: "src-dp-gl-art" },
  { id: "n-dp-gl-3", trackId: "daft-punk-get-lucky", timestampSec: 295, durationMs: 6000, headline: "If this groove made you move, Nile Rodgers's work on Chic's 'I Want Your Love' is the blueprint.", text: "Rodgers's guitar style — crisp, rhythmically precise, harmonically rich — defined disco and shaped everything from Bowie's 'Let's Dance' to Madonna's 'Like a Virgin.' 'I Want Your Love' is the purest expression of his technique: every note serves the groove, nothing wasted. Daft Punk specifically sought him out because of this track.", kind: "discovery", sourceId: "src-dp-gl-int" },
  // Radiohead — Everything in Its Right Place
  { id: "n-rh-1", trackId: "radiohead-everything", timestampSec: 50, durationMs: 6000, headline: "Radiohead almost broke up before making the album that redefined them.", text: "After the grueling OK Computer tour, Thom Yorke suffered a creative breakdown — he couldn't write guitar music anymore. Instead of splitting, the band retreated to a converted shed in the Cotswolds and threw out everything they knew. Kid A was the result: a rejection of rock stardom that accidentally made them bigger.", kind: "artist", sourceId: "src-rh-yt" },
  { id: "n-rh-2", trackId: "radiohead-everything", timestampSec: 126, durationMs: 5500, headline: "Those warped vocals aren't a filter — Thom literally fed his voice through a keyboard.", text: "Yorke ran his vocals through an Ensoniq DP/4 effects processor, chopping and pitch-shifting syllables in real time. The words 'everything in its right place' dissolve into abstract texture — the meaning buried on purpose. The band refused to rehearse before recording; this was the first thing they captured.", kind: "track", listenFor: true, sourceId: "src-rh-art" },
  { id: "n-rh-3", trackId: "radiohead-everything", timestampSec: 196, durationMs: 6000, headline: "If this track's electronic unease grabbed you, Autechre's 'Gantz Graf' will take you further down the rabbit hole.", text: "Autechre were one of Yorke's key obsessions during the Kid A sessions — their Warp Records output pushed electronic abstraction to its limit while keeping an emotional core. 'Gantz Graf' from 2002's EP7 shares that sense of structured chaos, and Jonny Greenwood has cited them as the reason he stopped thinking of guitars as Radiohead's only voice.", kind: "discovery", sourceId: "src-rh-int" },
  // Radiohead — Paranoid Android
  { id: "n-rh-pa-1", trackId: "radiohead-paranoid-android", timestampSec: 77, durationMs: 6000, headline: "Radiohead were so exhausted by fame they wrote a 6-minute nervous breakdown.", text: "After touring OK Computer's predecessor The Bends for two years, Thom Yorke was consumed by alienation and anxiety. Paranoid Android emerged from a miserable night at an LA bar where he watched people 'behaving like they were in a zombie movie.' The title — borrowed from Douglas Adams's depressed robot — was Yorke's way of saying he felt like the only conscious person in the room.", kind: "artist", sourceId: "src-rh-pa-yt" },
  { id: "n-rh-pa-2", trackId: "radiohead-paranoid-android", timestampSec: 193, durationMs: 5500, headline: "This track is actually three unfinished songs welded together — and the label begged them not to release it.", text: "The band stitched together three separate fragments in the studio with Nigel Godrich, calling it their 'Bohemian Rhapsody, but angry.' At 6:23, EMI said radio wouldn't touch it. Radiohead insisted it be the lead single anyway. It became their signature track and proved that a prog-length song could break through in the Britpop era.", kind: "track", listenFor: true, sourceId: "src-rh-pa-art" },
  { id: "n-rh-pa-3", trackId: "radiohead-paranoid-android", timestampSec: 309, durationMs: 6000, headline: "If this track's shape-shifting ambition grabbed you, Deerhunter's 'Nothing Ever Happened' carries the same restless energy.", text: "Bradford Cox cited OK Computer as foundational to Deerhunter's approach — long songs that shift mood without warning, built on anxiety that never quite resolves. 'Nothing Ever Happened' from Halcyon Digest has a similar slow-burn structure and that same sense of beautiful dread that Radiohead perfected here.", kind: "discovery", sourceId: "src-rh-pa-int" },
  // Radiohead — Reckoner
  { id: "n-rh-re-1", trackId: "radiohead-reckoner", timestampSec: 58, durationMs: 6000, headline: "This song existed as a completely different track for six years before Radiohead let it become what it wanted to be.", text: "The original Reckoner — debuted live in 2001 — was an aggressive, thrashing rocker. The band kept trying to force it into that shape across multiple album sessions. It wasn't until In Rainbows that they surrendered and let it become this delicate, shimmering thing. Thom Yorke later said 'some songs just refuse to be what you want them to be.'", kind: "artist", sourceId: "src-rh-re-yt" },
  { id: "n-rh-re-2", trackId: "radiohead-reckoner", timestampSec: 145, durationMs: 5500, headline: "Those cascading guitar harmonics? Ed O'Brien found them by accident.", text: "O'Brien was experimenting with natural harmonics during a jam session when Yorke stopped everyone and said 'keep doing that forever.' The shimmering, bell-like guitar layer became the emotional backbone of the track. Nigel Godrich recorded it with the room mics wide open to capture the natural reverb of the space.", kind: "track", listenFor: true, sourceId: "src-rh-re-art" },
  { id: "n-rh-re-3", trackId: "radiohead-reckoner", timestampSec: 232, durationMs: 6000, headline: "If Reckoner's fragile beauty moved you, Sufjan Stevens's 'Fourth of July' will quietly wreck you.", text: "Stevens shares Radiohead's ability to find transcendence in restraint — 'Fourth of July' from Carrie & Lowell uses sparse instrumentation and devastating intimacy in the same way Reckoner does. Both tracks prove that the quietest moments in music can hit the hardest. Yorke has cited Stevens as one of the few contemporary songwriters he genuinely admires.", kind: "discovery", sourceId: "src-rh-re-int" },
];

// ==================== HELPERS ====================
export function getTrackById(id: string): Track | undefined {
  return tracks.find((t) => t.id === id);
}

// ── DEV-gated static nuggets/sources ─────────────────────────────────────────
// These functions return real data ONLY in development builds.
// In production, AI (Gemini) is the sole source of nuggets and sources — the
// static arrays are scaffolding only.

export function getNuggetsForTrack(trackId: string): Nugget[] {
  if (!import.meta.env.DEV) return [];
  return nuggets.filter((n) => n.trackId === trackId);
}

export function getSourceById(id: string): Source | undefined {
  if (!import.meta.env.DEV) return undefined;
  return sources.find((s) => s.id === id);
}

export function getAdjacentTrackIds(currentId: string, shuffle = false): { prev: string | null; next: string | null } {
  if (shuffle) {
    const others = tracks.filter((t) => t.id !== currentId);
    const random = others[Math.floor(Math.random() * others.length)];
    return { prev: null, next: random?.id || null };
  }
  const idx = tracks.findIndex((t) => t.id === currentId);
  return {
    prev: idx > 0 ? tracks[idx - 1].id : null,
    next: idx < tracks.length - 1 ? tracks[idx + 1].id : null,
  };
}

export function getArtistById(id: string): Artist | undefined {
  return artists.find((a) => a.id === id);
}

export function getAlbumById(id: string): Album | undefined {
  return albums.find((a) => a.id === id);
}

export function getAlbumsForArtist(artistId: string): Album[] {
  return albums.filter((a) => a.artistId === artistId);
}

export function getTracksForAlbum(albumId: string): Track[] {
  return tracks.filter((t) => t.albumId === albumId);
}

export function getTracksForArtist(artistId: string): Track[] {
  return tracks.filter((t) => t.artistId === artistId);
}

export function getYouTubeSourceForTrack(trackId: string): Source | undefined {
  const trackNuggets = getNuggetsForTrack(trackId);
  for (const n of trackNuggets) {
    const src = getSourceById(n.sourceId);
    if (src?.type === "youtube" && src.embedId) return src;
  }
  return undefined;
}

export function searchCatalog(query: string): { artists: Artist[]; albums: Album[]; tracks: Track[] } {
  const q = query.toLowerCase().trim();
  if (!q) return { artists: [], albums: [], tracks: [] };
  return {
    artists: artists.filter((a) => a.name.toLowerCase().includes(q) || a.genres.some((g) => g.toLowerCase().includes(q))),
    albums: albums.filter((a) => a.title.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q)),
    tracks: tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.album || "").toLowerCase().includes(q)),
  };
}
