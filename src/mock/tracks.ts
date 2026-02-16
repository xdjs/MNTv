import { Track, Source, Nugget } from "./types";

export const tracks: Track[] = [
  {
    id: "daft-punk-around-the-world",
    title: "Around the World",
    artist: "Daft Punk",
    album: "Homework",
    durationSec: 210,
    coverArtUrl: "https://picsum.photos/seed/daftpunk/400/400",
  },
  {
    id: "radiohead-everything",
    title: "Everything in Its Right Place",
    artist: "Radiohead",
    album: "Kid A",
    durationSec: 252,
    coverArtUrl: "https://picsum.photos/seed/radiohead/400/400",
  },
  {
    id: "pink-floyd-money",
    title: "Money",
    artist: "Pink Floyd",
    album: "The Dark Side of the Moon",
    durationSec: 383,
    coverArtUrl: "https://picsum.photos/seed/pinkfloyd/400/400",
  },
  {
    id: "bjork-army-of-me",
    title: "Army of Me",
    artist: "Björk",
    album: "Post",
    durationSec: 224,
    coverArtUrl: "https://picsum.photos/seed/bjork/400/400",
  },
  {
    id: "talking-heads-once",
    title: "Once in a Lifetime",
    artist: "Talking Heads",
    album: "Remain in Light",
    durationSec: 264,
    coverArtUrl: "https://picsum.photos/seed/talkingheads/400/400",
  },
  {
    id: "kraftwerk-autobahn",
    title: "Autobahn",
    artist: "Kraftwerk",
    album: "Autobahn",
    durationSec: 270,
    coverArtUrl: "https://picsum.photos/seed/kraftwerk/400/400",
  },
  {
    id: "aphex-twin-xtal",
    title: "Xtal",
    artist: "Aphex Twin",
    album: "Selected Ambient Works 85–92",
    durationSec: 290,
    coverArtUrl: "https://picsum.photos/seed/aphextwin/400/400",
  },
  {
    id: "david-bowie-heroes",
    title: "\"Heroes\"",
    artist: "David Bowie",
    album: "\"Heroes\"",
    durationSec: 370,
    coverArtUrl: "https://picsum.photos/seed/davidbowie/400/400",
  },
  {
    id: "portishead-wandering",
    title: "Wandering Star",
    artist: "Portishead",
    album: "Dummy",
    durationSec: 292,
    coverArtUrl: "https://picsum.photos/seed/portishead/400/400",
  },
  {
    id: "steely-dan-aja",
    title: "Aja",
    artist: "Steely Dan",
    album: "Aja",
    durationSec: 476,
    coverArtUrl: "https://picsum.photos/seed/steelydan/400/400",
  },
];

export const sources: Source[] = [
  // Daft Punk
  { id: "src-dp-yt", type: "youtube", title: "Daft Punk's Homework: The Story Behind the Album", publisher: "YouTube / Polyphonic", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "03:12–03:27", quoteSnippet: "They recorded the entire album in Thomas's bedroom using a Roland TR-909.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-dp-art", type: "article", title: "How Daft Punk Made French House a Global Phenomenon", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 6", quoteSnippet: "The repetition wasn't lazy — it was hypnotic by design." },
  { id: "src-dp-int", type: "interview", title: "Thomas Bangalter on Homework", publisher: "Mixmag", url: "https://mixmag.net", locator: "Section 3", quoteSnippet: "We wanted to strip house music back to its most primal loop." },

  // Radiohead
  { id: "src-rh-yt", type: "youtube", title: "Kid A: How Radiohead Reinvented Themselves", publisher: "YouTube / Middle 8", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "05:44–06:10", quoteSnippet: "Thom fed his lyrics through an Ensoniq vocal processor, intentionally burying meaning.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-rh-art", type: "article", title: "The Making of Kid A", publisher: "The Guardian", url: "https://theguardian.com", locator: "Paragraph 12", quoteSnippet: "The band refused to rehearse the songs live before recording them." },
  { id: "src-rh-int", type: "interview", title: "Jonny Greenwood on Electronic Experimentation", publisher: "Wire Magazine", url: "https://thewire.co.uk", locator: "Section 2", quoteSnippet: "We realized guitars weren't the only way to express dread." },

  // Pink Floyd
  { id: "src-pf-yt", type: "youtube", title: "The Story of Money by Pink Floyd", publisher: "YouTube / Classic Albums", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "02:05–02:30", quoteSnippet: "Roger Waters recorded cash register sounds in his garden shed.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-pf-art", type: "article", title: "Dark Side of the Moon at 50", publisher: "Rolling Stone", url: "https://rollingstone.com", locator: "Paragraph 8", quoteSnippet: "The album spent 937 weeks on the Billboard 200 — a record that still stands." },
  { id: "src-pf-int", type: "interview", title: "Nick Mason on Recording Money", publisher: "Sound on Sound", url: "https://soundonsound.com", locator: "Section 4", quoteSnippet: "The 7/4 time signature wasn't intentional — it just felt right with the loop." },

  // Björk
  { id: "src-bj-yt", type: "youtube", title: "Björk's Post: Pushing Pop into the Unknown", publisher: "YouTube / Trash Theory", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "04:20–04:45", quoteSnippet: "She mailed the album's beats to collaborators on cassette tape from Iceland.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-bj-art", type: "article", title: "How Björk Invented the Future of Pop", publisher: "The New York Times", url: "https://nytimes.com", locator: "Paragraph 5", quoteSnippet: "Post turned vulnerability into a sonic weapon." },
  { id: "src-bj-int", type: "interview", title: "Björk on Army of Me", publisher: "NME", url: "https://nme.com", locator: "Section 2", quoteSnippet: "That bass sound — I wanted it to feel like being inside a tank." },

  // Talking Heads
  { id: "src-th-yt", type: "youtube", title: "Remain in Light: African Polyrhythms Meet New Wave", publisher: "YouTube / Reverb", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "06:00–06:25", quoteSnippet: "Brian Eno made the band play without knowing what song they were building.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-th-art", type: "article", title: "The Afrobeat Roots of Remain in Light", publisher: "Stereogum", url: "https://stereogum.com", locator: "Paragraph 9", quoteSnippet: "Byrne's 'same as it ever was' lyric was improvised in the studio." },
  { id: "src-th-int", type: "interview", title: "Jerry Harrison on the Album's Tensions", publisher: "Uncut", url: "https://uncut.co.uk", locator: "Section 5", quoteSnippet: "We were falling apart as a band, but the music never sounded more together." },

  // Kraftwerk
  { id: "src-kw-yt", type: "youtube", title: "Kraftwerk: The Robots Who Invented Electronic Music", publisher: "YouTube / Vox", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "03:50–04:15", quoteSnippet: "They built custom instruments because nothing on the market could make the sounds they imagined.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-kw-art", type: "article", title: "How Autobahn Changed Music Forever", publisher: "Fact Magazine", url: "https://factmag.com", locator: "Paragraph 3", quoteSnippet: "The 22-minute title track was edited to 3 minutes for U.S. radio — and it still charted." },
  { id: "src-kw-int", type: "interview", title: "Florian Schneider on Sound as Sculpture", publisher: "Electronic Beats", url: "https://electronicbeats.net", locator: "Section 1", quoteSnippet: "We don't play instruments. We play the studio." },

  // Aphex Twin
  { id: "src-at-yt", type: "youtube", title: "Selected Ambient Works: The Blueprint for IDM", publisher: "YouTube / Deep Cuts", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "02:30–02:55", quoteSnippet: "Richard recorded Xtal on equipment he modified himself as a teenager.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-at-art", type: "article", title: "Aphex Twin and the Art of Beautiful Noise", publisher: "Resident Advisor", url: "https://ra.co", locator: "Paragraph 7", quoteSnippet: "SAW 85–92 sounds like dreaming in a language you almost understand." },
  { id: "src-at-int", type: "interview", title: "Richard D. James on His Early Equipment", publisher: "FACT", url: "https://factmag.com", locator: "Section 3", quoteSnippet: "I was 14, soldering circuits. The sounds just appeared." },

  // David Bowie
  { id: "src-db-yt", type: "youtube", title: "Heroes: Bowie and the Berlin Wall", publisher: "YouTube / Rick Beato", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "04:10–04:35", quoteSnippet: "Bowie could see the Berlin Wall from Hansa Studios while recording.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-db-art", type: "article", title: "The Berlin Trilogy: Bowie's Reinvention", publisher: "The Atlantic", url: "https://theatlantic.com", locator: "Paragraph 11", quoteSnippet: "Eno's Oblique Strategies cards guided every creative decision in the studio." },
  { id: "src-db-int", type: "interview", title: "Tony Visconti on Recording Heroes", publisher: "Tape Op", url: "https://tapeop.com", locator: "Section 6", quoteSnippet: "I set up three microphones at different distances — the farthest one was gated. That's the huge sound." },

  // Portishead
  { id: "src-ph-yt", type: "youtube", title: "Dummy: How Portishead Defined Trip-Hop", publisher: "YouTube / Listening In", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "05:15–05:40", quoteSnippet: "Geoff Barrow sampled obscure 60s spy film soundtracks for the album's backbone.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-ph-art", type: "article", title: "Portishead and the Ghosts of Bristol", publisher: "Quietus", url: "https://thequietus.com", locator: "Paragraph 4", quoteSnippet: "Beth Gibbons recorded her vocals in near darkness to capture the right mood." },
  { id: "src-ph-int", type: "interview", title: "Geoff Barrow on Sampling and Paranoia", publisher: "Red Bull Music Academy", url: "https://daily.redbullmusicacademy.com", locator: "Section 2", quoteSnippet: "I was terrified someone would recognize the samples. Nobody did." },

  // Steely Dan
  { id: "src-sd-yt", type: "youtube", title: "Aja: The Most Perfectly Recorded Album Ever", publisher: "YouTube / Rick Beato", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "07:20–07:45", quoteSnippet: "They auditioned 7 different drummers for the title track before choosing Steve Gadd.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-sd-art", type: "article", title: "Inside the Perfectionism of Steely Dan", publisher: "Sound & Vision", url: "https://soundandvision.com", locator: "Paragraph 6", quoteSnippet: "Fagen and Becker spent $1 million — in 1977 dollars — to get every note right." },
  { id: "src-sd-int", type: "interview", title: "Steve Gadd on the Aja Drum Solo", publisher: "Modern Drummer", url: "https://moderndrummer.com", locator: "Section 3", quoteSnippet: "I played it once. They said 'that's the one.' I couldn't believe it." },
];

export const nuggets: Nugget[] = [
  // Daft Punk — Around the World (210s)
  { id: "n-dp-1", trackId: "daft-punk-around-the-world", timestampSec: 42, durationMs: 6000, text: "The entire track uses only one vocal phrase — repeated 144 times. The repetition is the point.", kind: "pattern", sourceId: "src-dp-art" },
  { id: "n-dp-2", trackId: "daft-punk-around-the-world", timestampSec: 105, durationMs: 6000, text: "Thomas Bangalter recorded this in his bedroom with a Roland TR-909 — the same drum machine behind most Chicago house.", kind: "process", sourceId: "src-dp-yt" },
  { id: "n-dp-3", trackId: "daft-punk-around-the-world", timestampSec: 163, durationMs: 5500, text: "🎧 Listen for the bass pattern shifting subtly here — Bangalter wanted 'primal house, nothing more.'", kind: "constraint", listenFor: true, relatedMomentSec: 168, sourceId: "src-dp-int" },

  // Radiohead — Everything in Its Right Place (252s)
  { id: "n-rh-1", trackId: "radiohead-everything", timestampSec: 50, durationMs: 6000, text: "Thom Yorke's vocals are fed through an Ensoniq DP/4 — burying the words was intentional.", kind: "process", sourceId: "src-rh-yt" },
  { id: "n-rh-2", trackId: "radiohead-everything", timestampSec: 126, durationMs: 5500, text: "The band refused to rehearse Kid A's songs before recording. This was the first track cut.", kind: "constraint", sourceId: "src-rh-art" },
  { id: "n-rh-3", trackId: "radiohead-everything", timestampSec: 196, durationMs: 6000, text: "🎧 Listen for the glitchy vocal chops — Jonny realized 'guitars weren't the only way to express dread.'", kind: "human", listenFor: true, relatedMomentSec: 201, sourceId: "src-rh-int" },

  // Pink Floyd — Money (383s)
  { id: "n-pf-1", trackId: "pink-floyd-money", timestampSec: 77, durationMs: 6000, text: "The cash register loop was made from real coins and tills — Roger Waters taped them in his garden shed.", kind: "process", sourceId: "src-pf-yt" },
  { id: "n-pf-2", trackId: "pink-floyd-money", timestampSec: 192, durationMs: 5500, text: "Dark Side of the Moon spent 937 weeks on the Billboard 200. That's nearly 18 years.", kind: "pattern", sourceId: "src-pf-art" },
  { id: "n-pf-3", trackId: "pink-floyd-money", timestampSec: 301, durationMs: 6000, text: "🎧 Listen for the 7/4 time signature — Nick Mason says it 'wasn't intentional, it just felt right.'", kind: "constraint", listenFor: true, relatedMomentSec: 306, sourceId: "src-pf-int" },

  // Björk — Army of Me (224s)
  { id: "n-bj-1", trackId: "bjork-army-of-me", timestampSec: 45, durationMs: 6000, text: "Björk mailed beats to collaborators on cassette tape from Reykjavík. The isolation was part of the sound.", kind: "process", sourceId: "src-bj-yt" },
  { id: "n-bj-2", trackId: "bjork-army-of-me", timestampSec: 112, durationMs: 5500, text: "Post turned vulnerability into a sonic weapon — critics called it 'pop from another planet.'", kind: "influence", sourceId: "src-bj-art" },
  { id: "n-bj-3", trackId: "bjork-army-of-me", timestampSec: 174, durationMs: 6000, text: "🎧 Listen for that massive bass — Björk wanted it to 'feel like being inside a tank.'", kind: "human", listenFor: true, relatedMomentSec: 179, sourceId: "src-bj-int" },

  // Talking Heads — Once in a Lifetime (264s)
  { id: "n-th-1", trackId: "talking-heads-once", timestampSec: 53, durationMs: 6000, text: "Brian Eno made the band play without knowing what song they were building. Structure came last.", kind: "process", sourceId: "src-th-yt" },
  { id: "n-th-2", trackId: "talking-heads-once", timestampSec: 132, durationMs: 5500, text: "Byrne's 'same as it ever was' was improvised — he was channeling televangelists he'd been watching.", kind: "human", sourceId: "src-th-art" },
  { id: "n-th-3", trackId: "talking-heads-once", timestampSec: 206, durationMs: 6000, text: "🎧 Listen for the polyrhythmic layers — the band was 'falling apart, but the music never sounded more together.'", kind: "pattern", listenFor: true, relatedMomentSec: 211, sourceId: "src-th-int" },

  // Kraftwerk — Autobahn (270s)
  { id: "n-kw-1", trackId: "kraftwerk-autobahn", timestampSec: 54, durationMs: 6000, text: "Kraftwerk built custom instruments because nothing commercial could produce the sounds they imagined.", kind: "constraint", sourceId: "src-kw-yt" },
  { id: "n-kw-2", trackId: "kraftwerk-autobahn", timestampSec: 135, durationMs: 5500, text: "The full track is 22 minutes. U.S. radio edited it to 3 — and it still charted at #25.", kind: "pattern", sourceId: "src-kw-art" },
  { id: "n-kw-3", trackId: "kraftwerk-autobahn", timestampSec: 211, durationMs: 6000, text: "🎧 Listen for the synthesizer melody here — Schneider said 'We don't play instruments. We play the studio.'", kind: "process", listenFor: true, relatedMomentSec: 216, sourceId: "src-kw-int" },

  // Aphex Twin — Xtal (290s)
  { id: "n-at-1", trackId: "aphex-twin-xtal", timestampSec: 58, durationMs: 6000, text: "Richard D. James recorded Xtal on equipment he soldered together himself — at age 14.", kind: "process", sourceId: "src-at-yt" },
  { id: "n-at-2", trackId: "aphex-twin-xtal", timestampSec: 145, durationMs: 5500, text: "SAW 85–92 'sounds like dreaming in a language you almost understand' — it defined ambient techno.", kind: "influence", sourceId: "src-at-art" },
  { id: "n-at-3", trackId: "aphex-twin-xtal", timestampSec: 227, durationMs: 6000, text: "🎧 Listen for those ghostly vocal pads — the sounds just 'appeared' from his DIY circuits.", kind: "human", listenFor: true, relatedMomentSec: 232, sourceId: "src-at-int" },

  // David Bowie — Heroes (370s)
  { id: "n-db-1", trackId: "david-bowie-heroes", timestampSec: 74, durationMs: 6000, text: "Bowie could see the Berlin Wall from the studio window. A couple kissing beneath it inspired the lyrics.", kind: "human", sourceId: "src-db-yt" },
  { id: "n-db-2", trackId: "david-bowie-heroes", timestampSec: 185, durationMs: 5500, text: "Eno's Oblique Strategies cards guided every creative decision — random constraints as a creative engine.", kind: "process", sourceId: "src-db-art" },
  { id: "n-db-3", trackId: "david-bowie-heroes", timestampSec: 291, durationMs: 6000, text: "🎧 Listen for the massive guitar wall — Visconti's 3-mic gating technique created that legendary sound.", kind: "pattern", listenFor: true, relatedMomentSec: 296, sourceId: "src-db-int" },

  // Portishead — Wandering Star (292s)
  { id: "n-ph-1", trackId: "portishead-wandering", timestampSec: 58, durationMs: 6000, text: "Geoff Barrow sampled obscure 60s spy film soundtracks to build Dummy's sonic palette.", kind: "process", sourceId: "src-ph-yt" },
  { id: "n-ph-2", trackId: "portishead-wandering", timestampSec: 146, durationMs: 5500, text: "Beth Gibbons recorded vocals in near darkness — the band needed the right emotional atmosphere.", kind: "human", sourceId: "src-ph-art" },
  { id: "n-ph-3", trackId: "portishead-wandering", timestampSec: 228, durationMs: 6000, text: "🎧 Listen for those crackling samples — Barrow was 'terrified someone would recognize them. Nobody did.'", kind: "constraint", listenFor: true, relatedMomentSec: 233, sourceId: "src-ph-int" },

  // Steely Dan — Aja (476s)
  { id: "n-sd-1", trackId: "steely-dan-aja", timestampSec: 95, durationMs: 6000, text: "Fagen and Becker auditioned 7 drummers for this track before Steve Gadd walked in and nailed it.", kind: "process", sourceId: "src-sd-yt" },
  { id: "n-sd-2", trackId: "steely-dan-aja", timestampSec: 238, durationMs: 5500, text: "The album cost $1 million in 1977 — roughly $5 million today. Every single note was scrutinized.", kind: "constraint", sourceId: "src-sd-art" },
  { id: "n-sd-3", trackId: "steely-dan-aja", timestampSec: 376, durationMs: 6000, text: "🎧 Listen for Gadd's legendary drum solo — he played it once. 'That's the one,' they said.", kind: "human", listenFor: true, relatedMomentSec: 381, sourceId: "src-sd-int" },
];

export function getTrackById(id: string): Track | undefined {
  return tracks.find((t) => t.id === id);
}

export function getNuggetsForTrack(trackId: string): Nugget[] {
  return nuggets.filter((n) => n.trackId === trackId);
}

export function getSourceById(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}
