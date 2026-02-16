import { Track, Source, Nugget, Artist, Album } from "./types";

// ==================== ARTISTS ====================
export const artists: Artist[] = [
  {
    id: "daft-punk",
    name: "Daft Punk",
    imageUrl: "https://picsum.photos/seed/daftpunk-artist/600/600",
    bio: "French electronic music duo formed in 1993 by Thomas Bangalter and Guy-Manuel de Homem-Christo. Pioneers of French house, they fused funk, disco, and electronic music into a robotic aesthetic that redefined dance music for a generation.",
    genres: ["Electronic", "French House", "Disco"],
    relatedArtistIds: ["kraftwerk", "aphex-twin"],
  },
  {
    id: "radiohead",
    name: "Radiohead",
    imageUrl: "https://picsum.photos/seed/radiohead-artist/600/600",
    bio: "English rock band formed in 1985. After the Britpop success of The Bends, they pivoted into experimental electronic territory with Kid A, redefining what a rock band could be in the 21st century.",
    genres: ["Alternative Rock", "Art Rock", "Electronic"],
    relatedArtistIds: ["portishead", "bjork"],
  },
  {
    id: "pink-floyd",
    name: "Pink Floyd",
    imageUrl: "https://picsum.photos/seed/pinkfloyd-artist/600/600",
    bio: "English rock band formed in 1965, known for philosophical lyrics, sonic experimentation, and elaborate live shows. The Dark Side of the Moon remains one of the best-selling albums of all time.",
    genres: ["Progressive Rock", "Psychedelic Rock", "Art Rock"],
    relatedArtistIds: ["david-bowie", "talking-heads"],
  },
  {
    id: "bjork",
    name: "Björk",
    imageUrl: "https://picsum.photos/seed/bjork-artist/600/600",
    bio: "Icelandic singer, songwriter, and producer known for her eclectic musical style and avant-garde visual artistry. From the Sugarcubes to her solo career, she's consistently pushed the boundaries of pop.",
    genres: ["Art Pop", "Electronic", "Experimental"],
    relatedArtistIds: ["radiohead", "portishead"],
  },
  {
    id: "talking-heads",
    name: "Talking Heads",
    imageUrl: "https://picsum.photos/seed/talkingheads-artist/600/600",
    bio: "American new wave band formed in 1975. Led by David Byrne, they blended punk energy with African polyrhythms, funk, and art school sensibility into some of the most inventive music of the late 20th century.",
    genres: ["New Wave", "Post-Punk", "Art Rock"],
    relatedArtistIds: ["david-bowie", "kraftwerk"],
  },
  {
    id: "kraftwerk",
    name: "Kraftwerk",
    imageUrl: "https://picsum.photos/seed/kraftwerk-artist/600/600",
    bio: "German electronic band formed in 1970. Widely regarded as the godfathers of electronic music, they pioneered the use of synthesizers, drum machines, and vocoders to create a futuristic, minimalist sound.",
    genres: ["Electronic", "Krautrock", "Synth-Pop"],
    relatedArtistIds: ["daft-punk", "aphex-twin"],
  },
  {
    id: "aphex-twin",
    name: "Aphex Twin",
    imageUrl: "https://picsum.photos/seed/aphextwin-artist/600/600",
    bio: "Richard D. James, known as Aphex Twin, is an Irish-born English electronic musician. A central figure in IDM, his work ranges from lush ambient soundscapes to frenetic, abrasive drill 'n' bass.",
    genres: ["IDM", "Ambient", "Electronic"],
    relatedArtistIds: ["kraftwerk", "daft-punk"],
  },
  {
    id: "david-bowie",
    name: "David Bowie",
    imageUrl: "https://picsum.photos/seed/davidbowie-artist/600/600",
    bio: "English singer-songwriter and actor, one of the most influential musicians of the 20th century. From Ziggy Stardust to the Berlin Trilogy, Bowie reinvented himself relentlessly across five decades.",
    genres: ["Art Rock", "Glam Rock", "Electronic"],
    relatedArtistIds: ["talking-heads", "pink-floyd"],
  },
  {
    id: "portishead",
    name: "Portishead",
    imageUrl: "https://picsum.photos/seed/portishead-artist/600/600",
    bio: "English band from Bristol, formed in 1991. Alongside Massive Attack, they defined trip-hop — a dark, cinematic fusion of hip-hop beats, jazz samples, and Beth Gibbons' hauntingly fragile vocals.",
    genres: ["Trip-Hop", "Electronic", "Downtempo"],
    relatedArtistIds: ["radiohead", "bjork"],
  },
  {
    id: "steely-dan",
    name: "Steely Dan",
    imageUrl: "https://picsum.photos/seed/steelydan-artist/600/600",
    bio: "American rock band founded by Walter Becker and Donald Fagen. Known for meticulous studio craft, jazz-inflected harmonies, and sardonic lyrics, they pursued perfection at a level few bands have matched.",
    genres: ["Jazz Rock", "Soft Rock", "Pop"],
    relatedArtistIds: ["pink-floyd", "david-bowie"],
  },
];

// ==================== ALBUMS ====================
export const albums: Album[] = [
  // Daft Punk
  { id: "alb-dp-homework", artistId: "daft-punk", title: "Homework", year: 1997, coverArtUrl: "https://picsum.photos/seed/daftpunk/400/400", genre: "French House" },
  { id: "alb-dp-discovery", artistId: "daft-punk", title: "Discovery", year: 2001, coverArtUrl: "https://picsum.photos/seed/daftpunk-discovery/400/400", genre: "French House" },
  { id: "alb-dp-ram", artistId: "daft-punk", title: "Random Access Memories", year: 2013, coverArtUrl: "https://picsum.photos/seed/daftpunk-ram/400/400", genre: "Disco" },
  // Radiohead
  { id: "alb-rh-kida", artistId: "radiohead", title: "Kid A", year: 2000, coverArtUrl: "https://picsum.photos/seed/radiohead/400/400", genre: "Art Rock" },
  { id: "alb-rh-okc", artistId: "radiohead", title: "OK Computer", year: 1997, coverArtUrl: "https://picsum.photos/seed/radiohead-okc/400/400", genre: "Alternative Rock" },
  { id: "alb-rh-inrainbows", artistId: "radiohead", title: "In Rainbows", year: 2007, coverArtUrl: "https://picsum.photos/seed/radiohead-ir/400/400", genre: "Art Rock" },
  // Pink Floyd
  { id: "alb-pf-dsotm", artistId: "pink-floyd", title: "The Dark Side of the Moon", year: 1973, coverArtUrl: "https://picsum.photos/seed/pinkfloyd/400/400", genre: "Progressive Rock" },
  { id: "alb-pf-wish", artistId: "pink-floyd", title: "Wish You Were Here", year: 1975, coverArtUrl: "https://picsum.photos/seed/pinkfloyd-wish/400/400", genre: "Progressive Rock" },
  { id: "alb-pf-wall", artistId: "pink-floyd", title: "The Wall", year: 1979, coverArtUrl: "https://picsum.photos/seed/pinkfloyd-wall/400/400", genre: "Progressive Rock" },
  // Björk
  { id: "alb-bj-post", artistId: "bjork", title: "Post", year: 1995, coverArtUrl: "https://picsum.photos/seed/bjork/400/400", genre: "Art Pop" },
  { id: "alb-bj-homogenic", artistId: "bjork", title: "Homogenic", year: 1997, coverArtUrl: "https://picsum.photos/seed/bjork-homogenic/400/400", genre: "Electronic" },
  { id: "alb-bj-vespertine", artistId: "bjork", title: "Vespertine", year: 2001, coverArtUrl: "https://picsum.photos/seed/bjork-vespertine/400/400", genre: "Art Pop" },
  // Talking Heads
  { id: "alb-th-ril", artistId: "talking-heads", title: "Remain in Light", year: 1980, coverArtUrl: "https://picsum.photos/seed/talkingheads/400/400", genre: "New Wave" },
  { id: "alb-th-sf", artistId: "talking-heads", title: "Speaking in Tongues", year: 1983, coverArtUrl: "https://picsum.photos/seed/talkingheads-sit/400/400", genre: "New Wave" },
  // Kraftwerk
  { id: "alb-kw-autobahn", artistId: "kraftwerk", title: "Autobahn", year: 1974, coverArtUrl: "https://picsum.photos/seed/kraftwerk/400/400", genre: "Electronic" },
  { id: "alb-kw-tee", artistId: "kraftwerk", title: "Trans-Europe Express", year: 1977, coverArtUrl: "https://picsum.photos/seed/kraftwerk-tee/400/400", genre: "Electronic" },
  { id: "alb-kw-cw", artistId: "kraftwerk", title: "Computer World", year: 1981, coverArtUrl: "https://picsum.photos/seed/kraftwerk-cw/400/400", genre: "Synth-Pop" },
  // Aphex Twin
  { id: "alb-at-saw", artistId: "aphex-twin", title: "Selected Ambient Works 85–92", year: 1992, coverArtUrl: "https://picsum.photos/seed/aphextwin/400/400", genre: "Ambient" },
  { id: "alb-at-rdj", artistId: "aphex-twin", title: "Richard D. James Album", year: 1996, coverArtUrl: "https://picsum.photos/seed/aphextwin-rdj/400/400", genre: "IDM" },
  // David Bowie
  { id: "alb-db-heroes", artistId: "david-bowie", title: '"Heroes"', year: 1977, coverArtUrl: "https://picsum.photos/seed/davidbowie/400/400", genre: "Art Rock" },
  { id: "alb-db-ziggy", artistId: "david-bowie", title: "The Rise and Fall of Ziggy Stardust", year: 1972, coverArtUrl: "https://picsum.photos/seed/davidbowie-ziggy/400/400", genre: "Glam Rock" },
  { id: "alb-db-low", artistId: "david-bowie", title: "Low", year: 1977, coverArtUrl: "https://picsum.photos/seed/davidbowie-low/400/400", genre: "Art Rock" },
  // Portishead
  { id: "alb-ph-dummy", artistId: "portishead", title: "Dummy", year: 1994, coverArtUrl: "https://picsum.photos/seed/portishead/400/400", genre: "Trip-Hop" },
  { id: "alb-ph-third", artistId: "portishead", title: "Third", year: 2008, coverArtUrl: "https://picsum.photos/seed/portishead-third/400/400", genre: "Experimental" },
  // Steely Dan
  { id: "alb-sd-aja", artistId: "steely-dan", title: "Aja", year: 1977, coverArtUrl: "https://picsum.photos/seed/steelydan/400/400", genre: "Jazz Rock" },
  { id: "alb-sd-gaucho", artistId: "steely-dan", title: "Gaucho", year: 1980, coverArtUrl: "https://picsum.photos/seed/steelydan-gaucho/400/400", genre: "Jazz Rock" },
];

// ==================== TRACKS ====================
export const tracks: Track[] = [
  { id: "daft-punk-around-the-world", title: "Around the World", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-homework", album: "Homework", durationSec: 210, coverArtUrl: "https://picsum.photos/seed/daftpunk/400/400", trackNumber: 1 },
  { id: "daft-punk-one-more-time", title: "One More Time", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-discovery", album: "Discovery", durationSec: 320, coverArtUrl: "https://picsum.photos/seed/daftpunk-discovery/400/400", trackNumber: 1 },
  { id: "daft-punk-get-lucky", title: "Get Lucky", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-ram", album: "Random Access Memories", durationSec: 369, coverArtUrl: "https://picsum.photos/seed/daftpunk-ram/400/400", trackNumber: 1 },
  { id: "radiohead-everything", title: "Everything in Its Right Place", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-kida", album: "Kid A", durationSec: 252, coverArtUrl: "https://picsum.photos/seed/radiohead/400/400", trackNumber: 1 },
  { id: "radiohead-paranoid-android", title: "Paranoid Android", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-okc", album: "OK Computer", durationSec: 386, coverArtUrl: "https://picsum.photos/seed/radiohead-okc/400/400", trackNumber: 1 },
  { id: "radiohead-reckoner", title: "Reckoner", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-inrainbows", album: "In Rainbows", durationSec: 290, coverArtUrl: "https://picsum.photos/seed/radiohead-ir/400/400", trackNumber: 1 },
  { id: "pink-floyd-money", title: "Money", artist: "Pink Floyd", artistId: "pink-floyd", albumId: "alb-pf-dsotm", album: "The Dark Side of the Moon", durationSec: 383, coverArtUrl: "https://picsum.photos/seed/pinkfloyd/400/400", trackNumber: 1 },
  { id: "pink-floyd-shine-on", title: "Shine On You Crazy Diamond", artist: "Pink Floyd", artistId: "pink-floyd", albumId: "alb-pf-wish", album: "Wish You Were Here", durationSec: 516, coverArtUrl: "https://picsum.photos/seed/pinkfloyd-wish/400/400", trackNumber: 1 },
  { id: "pink-floyd-comfortably-numb", title: "Comfortably Numb", artist: "Pink Floyd", artistId: "pink-floyd", albumId: "alb-pf-wall", album: "The Wall", durationSec: 382, coverArtUrl: "https://picsum.photos/seed/pinkfloyd-wall/400/400", trackNumber: 1 },
  { id: "bjork-army-of-me", title: "Army of Me", artist: "Björk", artistId: "bjork", albumId: "alb-bj-post", album: "Post", durationSec: 224, coverArtUrl: "https://picsum.photos/seed/bjork/400/400", trackNumber: 1 },
  { id: "bjork-joga", title: "Jóga", artist: "Björk", artistId: "bjork", albumId: "alb-bj-homogenic", album: "Homogenic", durationSec: 305, coverArtUrl: "https://picsum.photos/seed/bjork-homogenic/400/400", trackNumber: 1 },
  { id: "talking-heads-once", title: "Once in a Lifetime", artist: "Talking Heads", artistId: "talking-heads", albumId: "alb-th-ril", album: "Remain in Light", durationSec: 264, coverArtUrl: "https://picsum.photos/seed/talkingheads/400/400", trackNumber: 1 },
  { id: "kraftwerk-autobahn", title: "Autobahn", artist: "Kraftwerk", artistId: "kraftwerk", albumId: "alb-kw-autobahn", album: "Autobahn", durationSec: 270, coverArtUrl: "https://picsum.photos/seed/kraftwerk/400/400", trackNumber: 1 },
  { id: "kraftwerk-tee", title: "Trans-Europe Express", artist: "Kraftwerk", artistId: "kraftwerk", albumId: "alb-kw-tee", album: "Trans-Europe Express", durationSec: 407, coverArtUrl: "https://picsum.photos/seed/kraftwerk-tee/400/400", trackNumber: 1 },
  { id: "aphex-twin-xtal", title: "Xtal", artist: "Aphex Twin", artistId: "aphex-twin", albumId: "alb-at-saw", album: "Selected Ambient Works 85–92", durationSec: 290, coverArtUrl: "https://picsum.photos/seed/aphextwin/400/400", trackNumber: 1 },
  { id: "david-bowie-heroes", title: '"Heroes"', artist: "David Bowie", artistId: "david-bowie", albumId: "alb-db-heroes", album: '"Heroes"', durationSec: 370, coverArtUrl: "https://picsum.photos/seed/davidbowie/400/400", trackNumber: 1 },
  { id: "david-bowie-ziggy", title: "Ziggy Stardust", artist: "David Bowie", artistId: "david-bowie", albumId: "alb-db-ziggy", album: "The Rise and Fall of Ziggy Stardust", durationSec: 194, coverArtUrl: "https://picsum.photos/seed/davidbowie-ziggy/400/400", trackNumber: 1 },
  { id: "portishead-wandering", title: "Wandering Star", artist: "Portishead", artistId: "portishead", albumId: "alb-ph-dummy", album: "Dummy", durationSec: 292, coverArtUrl: "https://picsum.photos/seed/portishead/400/400", trackNumber: 1 },
  { id: "steely-dan-aja", title: "Aja", artist: "Steely Dan", artistId: "steely-dan", albumId: "alb-sd-aja", album: "Aja", durationSec: 476, coverArtUrl: "https://picsum.photos/seed/steelydan/400/400", trackNumber: 1 },
];

// ==================== SOURCES ====================
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
  // Radiohead — Paranoid Android
  { id: "src-rh-pa-yt", type: "youtube", title: "OK Computer: A Track-by-Track Breakdown", publisher: "YouTube / Middle 8", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "08:10–08:35", quoteSnippet: "Paranoid Android was stitched together from three separate songs.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-rh-pa-art", type: "article", title: "The Making of OK Computer", publisher: "NME", url: "https://nme.com", locator: "Paragraph 7", quoteSnippet: "EMI initially refused to release it as a single because of its length." },
  { id: "src-rh-pa-int", type: "interview", title: "Colin Greenwood on Paranoid Android", publisher: "Mojo", url: "https://mojo4music.com", locator: "Section 4", quoteSnippet: "We thought of it as our Bohemian Rhapsody — except angrier." },
  // Radiohead — Reckoner
  { id: "src-rh-re-yt", type: "youtube", title: "In Rainbows: The Pay-What-You-Want Experiment", publisher: "YouTube / Polyphonic", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "04:30–04:55", quoteSnippet: "Reckoner went through dozens of radically different versions over 6 years.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-rh-re-art", type: "article", title: "The Long Gestation of In Rainbows", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 9", quoteSnippet: "The original Reckoner was a thrashing rock song — nothing like the final version." },
  { id: "src-rh-re-int", type: "interview", title: "Ed O'Brien on In Rainbows Sessions", publisher: "Guitar World", url: "https://guitarworld.com", locator: "Section 2", quoteSnippet: "The guitar harmonics just happened. Thom said 'keep doing that forever.'" },
  // Pink Floyd — Shine On You Crazy Diamond
  { id: "src-pf-sh-yt", type: "youtube", title: "Wish You Were Here: A Tribute to Syd Barrett", publisher: "YouTube / Classic Albums", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "03:00–03:25", quoteSnippet: "The four-note guitar motif was David Gilmour's first take.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-pf-sh-art", type: "article", title: "The Ghost of Syd Barrett", publisher: "Uncut", url: "https://uncut.co.uk", locator: "Paragraph 5", quoteSnippet: "A strange, bloated man walked into the studio during recording. It was Syd Barrett." },
  { id: "src-pf-sh-int", type: "interview", title: "Roger Waters on Syd's Visit", publisher: "Q Magazine", url: "https://qmagazine.com", locator: "Section 3", quoteSnippet: "Nobody recognized him at first. When we realized, we all broke down." },
  // Pink Floyd — Comfortably Numb
  { id: "src-pf-cn-yt", type: "youtube", title: "The Wall: Behind the Madness", publisher: "YouTube / Rick Beato", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "05:30–05:55", quoteSnippet: "Gilmour and Waters had completely different visions for the song.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-pf-cn-art", type: "article", title: "Comfortably Numb: The Perfect Rock Song", publisher: "Rolling Stone", url: "https://rollingstone.com", locator: "Paragraph 4", quoteSnippet: "The guitar solo was recorded in one take. Gilmour did several, but the first was best." },
  { id: "src-pf-cn-int", type: "interview", title: "David Gilmour on That Solo", publisher: "Guitar Player", url: "https://guitarplayer.com", locator: "Section 2", quoteSnippet: "I just closed my eyes and played. The first take had something the others didn't." },
  // Björk — Jóga
  { id: "src-bj-jo-yt", type: "youtube", title: "Homogenic: Björk's Volcanic Masterpiece", publisher: "YouTube / Trash Theory", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "03:40–04:05", quoteSnippet: "The string arrangements were inspired by the tectonic plates beneath Iceland.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-bj-jo-art", type: "article", title: "Homogenic at 25", publisher: "The Guardian", url: "https://theguardian.com", locator: "Paragraph 8", quoteSnippet: "Jóga was a love letter to Iceland itself — the landscape is the melody." },
  { id: "src-bj-jo-int", type: "interview", title: "Björk on Homogenic's Emotional Core", publisher: "Dazed", url: "https://dazeddigital.com", locator: "Section 1", quoteSnippet: "I wanted to make music that sounded like volcanoes and glaciers at the same time." },
  // Kraftwerk — Trans-Europe Express
  { id: "src-kw-te-yt", type: "youtube", title: "Trans-Europe Express: The Track That Launched Hip-Hop", publisher: "YouTube / Vox", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "02:15–02:40", quoteSnippet: "Afrika Bambaataa sampled this directly for Planet Rock — the birth of electro.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-kw-te-art", type: "article", title: "How Kraftwerk Accidentally Invented Hip-Hop", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 4", quoteSnippet: "The train rhythm was a sequencer accident that they decided to keep." },
  { id: "src-kw-te-int", type: "interview", title: "Ralf Hütter on Travel as Music", publisher: "Wire Magazine", url: "https://thewire.co.uk", locator: "Section 2", quoteSnippet: "We traveled by train across Europe. The rhythm of the rails became the song." },
  // David Bowie — Ziggy Stardust
  { id: "src-db-zi-yt", type: "youtube", title: "Ziggy Stardust: Bowie's Greatest Character", publisher: "YouTube / Polyphonic", url: "https://youtube.com", embedId: "dQw4w9WgXcQ", locator: "04:50–05:15", quoteSnippet: "Bowie borrowed from Iggy Pop, Vince Taylor, and a Japanese fashion designer to build Ziggy.", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "src-db-zi-art", type: "article", title: "The Invention of Ziggy Stardust", publisher: "The Atlantic", url: "https://theatlantic.com", locator: "Paragraph 6", quoteSnippet: "Bowie became so consumed by Ziggy that his friends couldn't tell where the character ended." },
  { id: "src-db-zi-int", type: "interview", title: "Mick Ronson on Playing with Bowie", publisher: "Classic Rock", url: "https://classicrock.com", locator: "Section 3", quoteSnippet: "He'd show up as David. By the second take, he was Ziggy. You could see the switch happen." },
];

// ==================== NUGGETS ====================
export const nuggets: Nugget[] = [
  // Daft Punk — Around the World
  { id: "n-dp-1", trackId: "daft-punk-around-the-world", timestampSec: 8, durationMs: 7000, text: "The entire track uses only one vocal phrase — repeated 144 times. The repetition is the point.", kind: "pattern", sourceId: "src-dp-art" },
  { id: "n-dp-2", trackId: "daft-punk-around-the-world", timestampSec: 45, durationMs: 7000, text: "Thomas Bangalter recorded this in his bedroom with a Roland TR-909 — the same drum machine behind most Chicago house.", kind: "process", sourceId: "src-dp-yt" },
  { id: "n-dp-3", trackId: "daft-punk-around-the-world", timestampSec: 90, durationMs: 6000, text: "🎧 Listen for the bass pattern shifting subtly here — Bangalter wanted 'primal house, nothing more.'", kind: "constraint", listenFor: true, relatedMomentSec: 95, sourceId: "src-dp-int" },
  // Radiohead — Everything in Its Right Place
  { id: "n-rh-1", trackId: "radiohead-everything", timestampSec: 50, durationMs: 6000, text: "Thom Yorke's vocals are fed through an Ensoniq DP/4 — burying the words was intentional.", kind: "process", sourceId: "src-rh-yt" },
  { id: "n-rh-2", trackId: "radiohead-everything", timestampSec: 126, durationMs: 5500, text: "The band refused to rehearse Kid A's songs before recording. This was the first track cut.", kind: "constraint", sourceId: "src-rh-art" },
  { id: "n-rh-3", trackId: "radiohead-everything", timestampSec: 196, durationMs: 6000, text: "🎧 Listen for the glitchy vocal chops — Jonny realized 'guitars weren't the only way to express dread.'", kind: "human", listenFor: true, relatedMomentSec: 201, sourceId: "src-rh-int" },
  // Pink Floyd — Money
  { id: "n-pf-1", trackId: "pink-floyd-money", timestampSec: 77, durationMs: 6000, text: "The cash register loop was made from real coins and tills — Roger Waters taped them in his garden shed.", kind: "process", sourceId: "src-pf-yt" },
  { id: "n-pf-2", trackId: "pink-floyd-money", timestampSec: 192, durationMs: 5500, text: "Dark Side of the Moon spent 937 weeks on the Billboard 200. That's nearly 18 years.", kind: "pattern", sourceId: "src-pf-art" },
  { id: "n-pf-3", trackId: "pink-floyd-money", timestampSec: 301, durationMs: 6000, text: "🎧 Listen for the 7/4 time signature — Nick Mason says it 'wasn't intentional, it just felt right.'", kind: "constraint", listenFor: true, relatedMomentSec: 306, sourceId: "src-pf-int" },
  // Björk — Army of Me
  { id: "n-bj-1", trackId: "bjork-army-of-me", timestampSec: 45, durationMs: 6000, text: "Björk mailed beats to collaborators on cassette tape from Reykjavík. The isolation was part of the sound.", kind: "process", sourceId: "src-bj-yt" },
  { id: "n-bj-2", trackId: "bjork-army-of-me", timestampSec: 112, durationMs: 5500, text: "Post turned vulnerability into a sonic weapon — critics called it 'pop from another planet.'", kind: "influence", sourceId: "src-bj-art" },
  { id: "n-bj-3", trackId: "bjork-army-of-me", timestampSec: 174, durationMs: 6000, text: "🎧 Listen for that massive bass — Björk wanted it to 'feel like being inside a tank.'", kind: "human", listenFor: true, relatedMomentSec: 179, sourceId: "src-bj-int" },
  // Talking Heads — Once in a Lifetime
  { id: "n-th-1", trackId: "talking-heads-once", timestampSec: 53, durationMs: 6000, text: "Brian Eno made the band play without knowing what song they were building. Structure came last.", kind: "process", sourceId: "src-th-yt" },
  { id: "n-th-2", trackId: "talking-heads-once", timestampSec: 132, durationMs: 5500, text: "Byrne's 'same as it ever was' was improvised — he was channeling televangelists he'd been watching.", kind: "human", sourceId: "src-th-art" },
  { id: "n-th-3", trackId: "talking-heads-once", timestampSec: 206, durationMs: 6000, text: "🎧 Listen for the polyrhythmic layers — the band was 'falling apart, but the music never sounded more together.'", kind: "pattern", listenFor: true, relatedMomentSec: 211, sourceId: "src-th-int" },
  // Kraftwerk — Autobahn
  { id: "n-kw-1", trackId: "kraftwerk-autobahn", timestampSec: 54, durationMs: 6000, text: "Kraftwerk built custom instruments because nothing commercial could produce the sounds they imagined.", kind: "constraint", sourceId: "src-kw-yt" },
  { id: "n-kw-2", trackId: "kraftwerk-autobahn", timestampSec: 135, durationMs: 5500, text: "The full track is 22 minutes. U.S. radio edited it to 3 — and it still charted at #25.", kind: "pattern", sourceId: "src-kw-art" },
  { id: "n-kw-3", trackId: "kraftwerk-autobahn", timestampSec: 211, durationMs: 6000, text: "🎧 Listen for the synthesizer melody here — Schneider said 'We don't play instruments. We play the studio.'", kind: "process", listenFor: true, relatedMomentSec: 216, sourceId: "src-kw-int" },
  // Aphex Twin — Xtal
  { id: "n-at-1", trackId: "aphex-twin-xtal", timestampSec: 58, durationMs: 6000, text: "Richard D. James recorded Xtal on equipment he soldered together himself — at age 14.", kind: "process", sourceId: "src-at-yt" },
  { id: "n-at-2", trackId: "aphex-twin-xtal", timestampSec: 145, durationMs: 5500, text: "SAW 85–92 'sounds like dreaming in a language you almost understand' — it defined ambient techno.", kind: "influence", sourceId: "src-at-art" },
  { id: "n-at-3", trackId: "aphex-twin-xtal", timestampSec: 227, durationMs: 6000, text: "🎧 Listen for those ghostly vocal pads — the sounds just 'appeared' from his DIY circuits.", kind: "human", listenFor: true, relatedMomentSec: 232, sourceId: "src-at-int" },
  // David Bowie — Heroes
  { id: "n-db-1", trackId: "david-bowie-heroes", timestampSec: 74, durationMs: 6000, text: "Bowie could see the Berlin Wall from the studio window. A couple kissing beneath it inspired the lyrics.", kind: "human", sourceId: "src-db-yt" },
  { id: "n-db-2", trackId: "david-bowie-heroes", timestampSec: 185, durationMs: 5500, text: "Eno's Oblique Strategies cards guided every creative decision — random constraints as a creative engine.", kind: "process", sourceId: "src-db-art" },
  { id: "n-db-3", trackId: "david-bowie-heroes", timestampSec: 291, durationMs: 6000, text: "🎧 Listen for the massive guitar wall — Visconti's 3-mic gating technique created that legendary sound.", kind: "pattern", listenFor: true, relatedMomentSec: 296, sourceId: "src-db-int" },
  // Portishead — Wandering Star
  { id: "n-ph-1", trackId: "portishead-wandering", timestampSec: 58, durationMs: 6000, text: "Geoff Barrow sampled obscure 60s spy film soundtracks to build Dummy's sonic palette.", kind: "process", sourceId: "src-ph-yt" },
  { id: "n-ph-2", trackId: "portishead-wandering", timestampSec: 146, durationMs: 5500, text: "Beth Gibbons recorded vocals in near darkness — the band needed the right emotional atmosphere.", kind: "human", sourceId: "src-ph-art" },
  { id: "n-ph-3", trackId: "portishead-wandering", timestampSec: 228, durationMs: 6000, text: "🎧 Listen for those crackling samples — Barrow was 'terrified someone would recognize them. Nobody did.'", kind: "constraint", listenFor: true, relatedMomentSec: 233, sourceId: "src-ph-int" },
  // Steely Dan — Aja
  { id: "n-sd-1", trackId: "steely-dan-aja", timestampSec: 95, durationMs: 6000, text: "Fagen and Becker auditioned 7 drummers for this track before Steve Gadd walked in and nailed it.", kind: "process", sourceId: "src-sd-yt" },
  { id: "n-sd-2", trackId: "steely-dan-aja", timestampSec: 238, durationMs: 5500, text: "The album cost $1 million in 1977 — roughly $5 million today. Every single note was scrutinized.", kind: "constraint", sourceId: "src-sd-art" },
  { id: "n-sd-3", trackId: "steely-dan-aja", timestampSec: 376, durationMs: 6000, text: "🎧 Listen for Gadd's legendary drum solo — he played it once. 'That's the one,' they said.", kind: "human", listenFor: true, relatedMomentSec: 381, sourceId: "src-sd-int" },
  // Daft Punk — One More Time
  { id: "n-dp-omt-1", trackId: "daft-punk-one-more-time", timestampSec: 64, durationMs: 6000, text: "Romanthony's vocal was intentionally compressed to the point of distortion — Daft Punk wanted it to sound 'damaged but joyful.'", kind: "process", sourceId: "src-dp-yt" },
  { id: "n-dp-omt-2", trackId: "daft-punk-one-more-time", timestampSec: 160, durationMs: 5500, text: "Discovery was inspired by childhood memories of Saturday morning cartoons — they even made an anime film for it.", kind: "influence", sourceId: "src-dp-art" },
  { id: "n-dp-omt-3", trackId: "daft-punk-one-more-time", timestampSec: 256, durationMs: 6000, text: "🎧 Listen for the filtered vocal breakdown here — Thomas said 'the vocoder is another instrument, not a gimmick.'", kind: "pattern", listenFor: true, relatedMomentSec: 261, sourceId: "src-dp-int" },
  // Daft Punk — Get Lucky
  { id: "n-dp-gl-1", trackId: "daft-punk-get-lucky", timestampSec: 74, durationMs: 6000, text: "Nile Rodgers played the guitar riff hundreds of times — they comped the final version from dozens of takes.", kind: "process", sourceId: "src-dp-yt" },
  { id: "n-dp-gl-2", trackId: "daft-punk-get-lucky", timestampSec: 184, durationMs: 5500, text: "Random Access Memories was recorded entirely with live musicians — a deliberate rejection of the laptop era.", kind: "constraint", sourceId: "src-dp-art" },
  { id: "n-dp-gl-3", trackId: "daft-punk-get-lucky", timestampSec: 295, durationMs: 6000, text: "🎧 Listen for Pharrell's vocal ad-libs — most were first takes that the duo refused to re-record.", kind: "human", listenFor: true, relatedMomentSec: 300, sourceId: "src-dp-int" },
  // Radiohead — Paranoid Android
  { id: "n-rh-pa-1", trackId: "radiohead-paranoid-android", timestampSec: 77, durationMs: 6000, text: "Paranoid Android was stitched from three unfinished songs — the band called it their 'Bohemian Rhapsody, but angry.'", kind: "process", sourceId: "src-rh-pa-yt" },
  { id: "n-rh-pa-2", trackId: "radiohead-paranoid-android", timestampSec: 193, durationMs: 5500, text: "EMI refused to release it as a single — at 6:23, radio wouldn't play it. Radiohead insisted and it became their signature.", kind: "constraint", sourceId: "src-rh-pa-art" },
  { id: "n-rh-pa-3", trackId: "radiohead-paranoid-android", timestampSec: 309, durationMs: 6000, text: "🎧 Listen for the savage guitar attack — Jonny Greenwood played it so hard his fingers bled on the fretboard.", kind: "human", listenFor: true, relatedMomentSec: 314, sourceId: "src-rh-pa-int" },
  // Radiohead — Reckoner
  { id: "n-rh-re-1", trackId: "radiohead-reckoner", timestampSec: 58, durationMs: 6000, text: "The original Reckoner was a thrashing rock song from 2001 — this gentle version took 6 years to emerge.", kind: "process", sourceId: "src-rh-re-yt" },
  { id: "n-rh-re-2", trackId: "radiohead-reckoner", timestampSec: 145, durationMs: 5500, text: "In Rainbows was released as pay-what-you-want — the average payment was about £4, but it outsold their previous album.", kind: "pattern", sourceId: "src-rh-re-art" },
  { id: "n-rh-re-3", trackId: "radiohead-reckoner", timestampSec: 232, durationMs: 6000, text: "🎧 Listen for those shimmering guitar harmonics — Ed O'Brien stumbled on them accidentally and Thom said 'keep doing that forever.'", kind: "human", listenFor: true, relatedMomentSec: 237, sourceId: "src-rh-re-int" },
  // Pink Floyd — Shine On You Crazy Diamond
  { id: "n-pf-sh-1", trackId: "pink-floyd-shine-on", timestampSec: 103, durationMs: 6000, text: "The iconic four-note guitar motif was Gilmour's first take — he played it once and the band knew instantly.", kind: "process", sourceId: "src-pf-sh-yt" },
  { id: "n-pf-sh-2", trackId: "pink-floyd-shine-on", timestampSec: 258, durationMs: 5500, text: "During recording, a bloated stranger walked into the studio. Nobody recognized him — it was Syd Barrett.", kind: "human", sourceId: "src-pf-sh-art" },
  { id: "n-pf-sh-3", trackId: "pink-floyd-shine-on", timestampSec: 413, durationMs: 6000, text: "🎧 Listen for the synth wash building here — Wright's keyboard parts were a 'cathedral of sound' for their lost friend.", kind: "influence", listenFor: true, relatedMomentSec: 418, sourceId: "src-pf-sh-int" },
  // Pink Floyd — Comfortably Numb
  { id: "n-pf-cn-1", trackId: "pink-floyd-comfortably-numb", timestampSec: 76, durationMs: 6000, text: "Waters wrote the lyrics about a childhood fever; Gilmour's music came from a completely separate demo — they barely spoke while making it.", kind: "human", sourceId: "src-pf-cn-yt" },
  { id: "n-pf-cn-2", trackId: "pink-floyd-comfortably-numb", timestampSec: 191, durationMs: 5500, text: "The band was so fractured during The Wall sessions that an inflatable wall literally separated them in the studio.", kind: "constraint", sourceId: "src-pf-cn-art" },
  { id: "n-pf-cn-3", trackId: "pink-floyd-comfortably-numb", timestampSec: 306, durationMs: 6000, text: "🎧 Listen for the second guitar solo — Gilmour recorded several takes, but the first was always the one. 'I just closed my eyes and played.'", kind: "process", listenFor: true, relatedMomentSec: 311, sourceId: "src-pf-cn-int" },
  // Björk — Jóga
  { id: "n-bj-jo-1", trackId: "bjork-joga", timestampSec: 61, durationMs: 6000, text: "The string arrangements were inspired by Iceland's tectonic plates — Björk wanted the music to sound like 'the earth splitting open.'", kind: "process", sourceId: "src-bj-jo-yt" },
  { id: "n-bj-jo-2", trackId: "bjork-joga", timestampSec: 152, durationMs: 5500, text: "Jóga is a love letter to Iceland itself — the landscape isn't a metaphor, it IS the melody.", kind: "influence", sourceId: "src-bj-jo-art" },
  { id: "n-bj-jo-3", trackId: "bjork-joga", timestampSec: 244, durationMs: 6000, text: "🎧 Listen for the beat drop with those massive strings — Björk wanted 'volcanoes and glaciers at the same time.'", kind: "human", listenFor: true, relatedMomentSec: 249, sourceId: "src-bj-jo-int" },
  // Kraftwerk — Trans-Europe Express
  { id: "n-kw-te-1", trackId: "kraftwerk-tee", timestampSec: 81, durationMs: 6000, text: "Afrika Bambaataa sampled this track for Planet Rock — accidentally inventing electro and launching hip-hop into the electronic age.", kind: "influence", sourceId: "src-kw-te-yt" },
  { id: "n-kw-te-2", trackId: "kraftwerk-tee", timestampSec: 203, durationMs: 5500, text: "The train rhythm was a sequencer accident — the tempo drifted and they decided the imperfection was the song.", kind: "process", sourceId: "src-kw-te-art" },
  { id: "n-kw-te-3", trackId: "kraftwerk-tee", timestampSec: 326, durationMs: 6000, text: "🎧 Listen for that hypnotic pulse — Hütter said 'we traveled by train across Europe. The rhythm of the rails became the song.'", kind: "human", listenFor: true, relatedMomentSec: 331, sourceId: "src-kw-te-int" },
  // David Bowie — Ziggy Stardust
  { id: "n-db-zi-1", trackId: "david-bowie-ziggy", timestampSec: 39, durationMs: 6000, text: "Ziggy was a composite of Iggy Pop, Vince Taylor, and a Japanese fashion designer — Bowie fused them into rock's greatest character.", kind: "human", sourceId: "src-db-zi-yt" },
  { id: "n-db-zi-2", trackId: "david-bowie-ziggy", timestampSec: 97, durationMs: 5500, text: "Bowie became so consumed by Ziggy that friends said they couldn't tell where the character ended and David began.", kind: "influence", sourceId: "src-db-zi-art" },
  { id: "n-db-zi-3", trackId: "david-bowie-ziggy", timestampSec: 155, durationMs: 6000, text: "🎧 Listen for Mick Ronson's guitar tone — he said 'David would show up as himself. By the second take, he was Ziggy.'", kind: "process", listenFor: true, relatedMomentSec: 160, sourceId: "src-db-zi-int" },
];

// ==================== HELPERS ====================
export function getTrackById(id: string): Track | undefined {
  return tracks.find((t) => t.id === id);
}

export function getNuggetsForTrack(trackId: string): Nugget[] {
  return nuggets.filter((n) => n.trackId === trackId);
}

export function getSourceById(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

export function getAdjacentTrackIds(currentId: string): { prev: string | null; next: string | null } {
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
