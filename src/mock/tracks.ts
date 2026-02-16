import { Track, Source, Nugget, Artist, Album } from "./types";

// ==================== ARTIST IMAGES ====================
import daftPunkImg from "@/assets/artists/daft-punk.jpg";
import radioheadImg from "@/assets/artists/radiohead.jpg";
import pinkFloydImg from "@/assets/artists/pink-floyd.jpg";
import bjorkImg from "@/assets/artists/bjork.jpg";
import talkingHeadsImg from "@/assets/artists/talking-heads.jpg";
import kraftwerkImg from "@/assets/artists/kraftwerk.jpg";
import aphexTwinImg from "@/assets/artists/aphex-twin.jpg";
import davidBowieImg from "@/assets/artists/david-bowie.jpg";
import portisheadImg from "@/assets/artists/portishead.jpg";
import steelyDanImg from "@/assets/artists/steely-dan.jpg";
import ryuichiSakamotoImg from "@/assets/artists/ryuichi-sakamoto.jpg";
import moeShopImg from "@/assets/artists/moe-shop.jpg";
import peteRangoImg from "@/assets/artists/pete-rango.jpg";
import jameeCorneliaImg from "@/assets/artists/jamee-cornelia.jpg";

// ==================== ARTISTS ====================
export const artists: Artist[] = [
  {
    id: "daft-punk",
    name: "Daft Punk",
    imageUrl: daftPunkImg,
    bio: "French electronic music duo formed in 1993 by Thomas Bangalter and Guy-Manuel de Homem-Christo. Pioneers of French house, they fused funk, disco, and electronic music into a robotic aesthetic that redefined dance music for a generation.",
    genres: ["Electronic", "French House", "Disco"],
    relatedArtistIds: ["kraftwerk", "aphex-twin", "moe-shop"],
  },
  {
    id: "radiohead",
    name: "Radiohead",
    imageUrl: radioheadImg,
    bio: "English rock band formed in 1985. After the Britpop success of The Bends, they pivoted into experimental electronic territory with Kid A, redefining what a rock band could be in the 21st century.",
    genres: ["Alternative Rock", "Art Rock", "Electronic"],
    relatedArtistIds: ["portishead", "bjork"],
  },
  {
    id: "pink-floyd",
    name: "Pink Floyd",
    imageUrl: pinkFloydImg,
    bio: "English rock band formed in 1965, known for philosophical lyrics, sonic experimentation, and elaborate live shows. The Dark Side of the Moon remains one of the best-selling albums of all time.",
    genres: ["Progressive Rock", "Psychedelic Rock", "Art Rock"],
    relatedArtistIds: ["david-bowie", "talking-heads"],
  },
  {
    id: "bjork",
    name: "Björk",
    imageUrl: bjorkImg,
    bio: "Icelandic singer, songwriter, and producer known for her eclectic musical style and avant-garde visual artistry. From the Sugarcubes to her solo career, she's consistently pushed the boundaries of pop.",
    genres: ["Art Pop", "Electronic", "Experimental"],
    relatedArtistIds: ["radiohead", "portishead"],
  },
  {
    id: "talking-heads",
    name: "Talking Heads",
    imageUrl: talkingHeadsImg,
    bio: "American new wave band formed in 1975. Led by David Byrne, they blended punk energy with African polyrhythms, funk, and art school sensibility into some of the most inventive music of the late 20th century.",
    genres: ["New Wave", "Post-Punk", "Art Rock"],
    relatedArtistIds: ["david-bowie", "kraftwerk"],
  },
  {
    id: "kraftwerk",
    name: "Kraftwerk",
    imageUrl: kraftwerkImg,
    bio: "German electronic band formed in 1970. Widely regarded as the godfathers of electronic music, they pioneered the use of synthesizers, drum machines, and vocoders to create a futuristic, minimalist sound.",
    genres: ["Electronic", "Krautrock", "Synth-Pop"],
    relatedArtistIds: ["daft-punk", "aphex-twin", "ryuichi-sakamoto"],
  },
  {
    id: "aphex-twin",
    name: "Aphex Twin",
    imageUrl: aphexTwinImg,
    bio: "Richard D. James, known as Aphex Twin, is an Irish-born English electronic musician. A central figure in IDM, his work ranges from lush ambient soundscapes to frenetic, abrasive drill 'n' bass.",
    genres: ["IDM", "Ambient", "Electronic"],
    relatedArtistIds: ["kraftwerk", "daft-punk"],
  },
  {
    id: "david-bowie",
    name: "David Bowie",
    imageUrl: davidBowieImg,
    bio: "English singer-songwriter and actor, one of the most influential musicians of the 20th century. From Ziggy Stardust to the Berlin Trilogy, Bowie reinvented himself relentlessly across five decades.",
    genres: ["Art Rock", "Glam Rock", "Electronic"],
    relatedArtistIds: ["talking-heads", "pink-floyd"],
  },
  {
    id: "portishead",
    name: "Portishead",
    imageUrl: portisheadImg,
    bio: "English band from Bristol, formed in 1991. Alongside Massive Attack, they defined trip-hop — a dark, cinematic fusion of hip-hop beats, jazz samples, and Beth Gibbons' hauntingly fragile vocals.",
    genres: ["Trip-Hop", "Electronic", "Downtempo"],
    relatedArtistIds: ["radiohead", "bjork"],
  },
  {
    id: "steely-dan",
    name: "Steely Dan",
    imageUrl: steelyDanImg,
    bio: "American rock band founded by Walter Becker and Donald Fagen. Known for meticulous studio craft, jazz-inflected harmonies, and sardonic lyrics, they pursued perfection at a level few bands have matched.",
    genres: ["Jazz Rock", "Soft Rock", "Pop"],
    relatedArtistIds: ["pink-floyd", "david-bowie"],
  },
  {
    id: "ryuichi-sakamoto",
    name: "Ryuichi Sakamoto",
    imageUrl: ryuichiSakamotoImg,
    bio: "Japanese composer, pianist, and actor who shaped the intersection of electronic and classical music across five decades. From Yellow Magic Orchestra to Oscar-winning film scores, Sakamoto's work is a meditation on beauty, technology, and impermanence.",
    genres: ["Ambient", "Electronic", "Classical"],
    relatedArtistIds: ["kraftwerk", "bjork"],
  },
  {
    id: "moe-shop",
    name: "Moe Shop",
    imageUrl: moeShopImg,
    bio: "French-Japanese electronic producer known for blending future funk, French house, and J-pop into irresistibly catchy, high-energy productions. A key figure in the online future funk and kawaii bass scene.",
    genres: ["Future Funk", "Electronic", "Kawaii Bass"],
    relatedArtistIds: ["daft-punk", "kraftwerk"],
  },
  {
    id: "pete-rango",
    name: "Pete Rango",
    imageUrl: peteRangoImg,
    bio: "Colombian-born music producer, creative director, and artist development strategist based in Richmond, Virginia. Co-founder of Life Is Valuable (L.I.V.) and an AI researcher at MUSICNERD, Pete bridges art, technology, and community — producing genre-fluid tracks under XUE Records while empowering underserved youth through creative mentorship.",
    genres: ["Hip-Hop", "R&B", "Electronic"],
    relatedArtistIds: ["daft-punk", "jamee-cornelia"],
  },
  {
    id: "jamee-cornelia",
    name: "Jamee Cornelia",
    imageUrl: jameeCorneliaImg,
    bio: "Atlanta-based rapper, producer, and visual artist whose work blurs the line between hip-hop, art-rap, and spoken word. With projects like BIG HOMIE and Art School Dropout, Cornelia builds dense, self-referential worlds with raw honesty and DIY conviction.",
    genres: ["Hip-Hop", "Art Rap", "Alternative Hip-Hop"],
    relatedArtistIds: ["talking-heads", "portishead"],
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
  // Pink Floyd
  { id: "alb-pf-dsotm", artistId: "pink-floyd", title: "The Dark Side of the Moon", year: 1973, coverArtUrl: CAA("f5093c06-23e3-404f-aeaa-40f72885ee3a"), genre: "Progressive Rock" },
  { id: "alb-pf-wish", artistId: "pink-floyd", title: "Wish You Were Here", year: 1975, coverArtUrl: CAA("1a272023-10d3-38ee-bab3-317b55fcc21d"), genre: "Progressive Rock" },
  { id: "alb-pf-wall", artistId: "pink-floyd", title: "The Wall", year: 1979, coverArtUrl: CAA("f2026101-945b-3d05-9ef4-aa718fc3feef"), genre: "Progressive Rock" },
  // Björk
  { id: "alb-bj-post", artistId: "bjork", title: "Post", year: 1995, coverArtUrl: CAA("b2a6e057-087d-3ae5-a6e5-7f5fa39808ff"), genre: "Art Pop" },
  { id: "alb-bj-homogenic", artistId: "bjork", title: "Homogenic", year: 1997, coverArtUrl: CAA("810272e0-aef1-3d85-b2d3-e512e87fc38c"), genre: "Electronic" },
  { id: "alb-bj-vespertine", artistId: "bjork", title: "Vespertine", year: 2001, coverArtUrl: CAA("271faeb3-fdd1-3ebb-80aa-97b3116e9341"), genre: "Art Pop" },
  // Talking Heads
  { id: "alb-th-ril", artistId: "talking-heads", title: "Remain in Light", year: 1980, coverArtUrl: CAA("f6b1b900-6108-32f0-abbd-2855af9151eb"), genre: "New Wave" },
  { id: "alb-th-sf", artistId: "talking-heads", title: "Speaking in Tongues", year: 1983, coverArtUrl: CAA("8a7a9db3-f87b-37d5-96a6-67485a8792e6"), genre: "New Wave" },
  // Kraftwerk
  { id: "alb-kw-autobahn", artistId: "kraftwerk", title: "Autobahn", year: 1974, coverArtUrl: CAA("f73729e8-4501-3088-aa20-44945296036e"), genre: "Electronic" },
  { id: "alb-kw-tee", artistId: "kraftwerk", title: "Trans-Europe Express", year: 1977, coverArtUrl: CAA("62900ac2-120a-3fae-90af-1f9fe4372a50"), genre: "Electronic" },
  { id: "alb-kw-cw", artistId: "kraftwerk", title: "Computer World", year: 1981, coverArtUrl: CAA("d3e06b04-4e60-3a5b-90e3-f2fc4bfa7788"), genre: "Synth-Pop" },
  // Aphex Twin
  { id: "alb-at-saw", artistId: "aphex-twin", title: "Selected Ambient Works 85–92", year: 1992, coverArtUrl: CAA("6842c81d-ea77-3dfd-abf7-4323add3f4d4"), genre: "Ambient" },
  { id: "alb-at-rdj", artistId: "aphex-twin", title: "Richard D. James Album", year: 1996, coverArtUrl: CAA("84d79dbe-7ac1-3ebc-9b36-238ddfb8229c"), genre: "IDM" },
  // David Bowie
  { id: "alb-db-heroes", artistId: "david-bowie", title: '"Heroes"', year: 1977, coverArtUrl: CAA("1f5ef8d3-10ca-30eb-b41e-85b16987d412"), genre: "Art Rock" },
  { id: "alb-db-ziggy", artistId: "david-bowie", title: "The Rise and Fall of Ziggy Stardust", year: 1972, coverArtUrl: CAA("6c9ae3dd-32ad-472c-96be-69d0a3536261"), genre: "Glam Rock" },
  { id: "alb-db-low", artistId: "david-bowie", title: "Low", year: 1977, coverArtUrl: CAA("0c9aab88-e5a1-3bf9-88c2-55527d8fb1f3"), genre: "Art Rock" },
  // Portishead
  { id: "alb-ph-dummy", artistId: "portishead", title: "Dummy", year: 1994, coverArtUrl: CAA("48140466-cff6-3222-bd55-63c27e43190d"), genre: "Trip-Hop" },
  { id: "alb-ph-third", artistId: "portishead", title: "Third", year: 2008, coverArtUrl: CAA("2a118b78-8a40-3e13-964f-b1d88a7da5ba"), genre: "Experimental" },
  // Steely Dan
  { id: "alb-sd-aja", artistId: "steely-dan", title: "Aja", year: 1977, coverArtUrl: CAA("8588c5a5-b491-37a4-8d51-2227346a072e"), genre: "Jazz Rock" },
  { id: "alb-sd-gaucho", artistId: "steely-dan", title: "Gaucho", year: 1980, coverArtUrl: CAA("953426ac-0f78-3845-a968-87140cb6db17"), genre: "Jazz Rock" },
  // Ryuichi Sakamoto
  { id: "alb-rs-mcml", artistId: "ryuichi-sakamoto", title: "Merry Christmas Mr. Lawrence", year: 1983, coverArtUrl: CAA("3870eb3e-3447-384e-8d8a-aeddab4ef00b"), genre: "Ambient" },
  { id: "alb-rs-async", artistId: "ryuichi-sakamoto", title: "async", year: 2017, coverArtUrl: "https://picsum.photos/seed/sakamoto-async/500/500", genre: "Ambient" },
  { id: "alb-rs-12", artistId: "ryuichi-sakamoto", title: "12", year: 2023, coverArtUrl: CAA("30514031-8561-4338-b9bf-8970e1e2a214"), genre: "Classical" },
  // Moe Shop
  { id: "alb-ms-moemoe", artistId: "moe-shop", title: "Moe Moe", year: 2018, coverArtUrl: "https://picsum.photos/seed/moeshop-moemoe/500/500", genre: "Future Funk" },
  { id: "alb-ms-evoevo", artistId: "moe-shop", title: "EVO EVO", year: 2025, coverArtUrl: "https://picsum.photos/seed/moeshop-evoevo/500/500", genre: "Electronic" },
  // Pete Rango
  { id: "alb-pr-lillil", artistId: "pete-rango", title: "LIL LIL", year: 2024, coverArtUrl: "https://i.ytimg.com/vi/hi0CsuFxrvg/hqdefault.jpg", genre: "Hip-Hop" },
  // Jamee Cornelia
  { id: "alb-jc-bighomie", artistId: "jamee-cornelia", title: "BIG HOMIE", year: 2020, coverArtUrl: "https://picsum.photos/seed/jameecornelia-bighomie/500/500", genre: "Hip-Hop" },
  { id: "alb-jc-asd", artistId: "jamee-cornelia", title: "Art School Dropout", year: 2023, coverArtUrl: "https://picsum.photos/seed/jameecornelia-asd/500/500", genre: "Art Rap" },
];

// ==================== TRACKS ====================
export const tracks: Track[] = [
  { id: "daft-punk-around-the-world", title: "Around the World", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-homework", album: "Homework", durationSec: 210, coverArtUrl: CAA("00054665-89fa-33d5-a8f0-1728ea8c32c3"), trackNumber: 1 },
  { id: "daft-punk-one-more-time", title: "One More Time", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-discovery", album: "Discovery", durationSec: 320, coverArtUrl: CAA("48117b90-a16e-34ca-a514-19c702df1158"), trackNumber: 1 },
  { id: "daft-punk-get-lucky", title: "Get Lucky", artist: "Daft Punk", artistId: "daft-punk", albumId: "alb-dp-ram", album: "Random Access Memories", durationSec: 369, coverArtUrl: CAA("aa997ea0-2936-40bd-884d-3af8a0e064dc"), trackNumber: 1 },
  { id: "radiohead-everything", title: "Everything in Its Right Place", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-kida", album: "Kid A", durationSec: 252, coverArtUrl: CAA("e75c0549-ad55-39e3-8025-c72c5d4a3c5d"), trackNumber: 1 },
  { id: "radiohead-paranoid-android", title: "Paranoid Android", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-okc", album: "OK Computer", durationSec: 386, coverArtUrl: CAA("b1392450-e666-3926-a536-22c65f834433"), trackNumber: 1 },
  { id: "radiohead-reckoner", title: "Reckoner", artist: "Radiohead", artistId: "radiohead", albumId: "alb-rh-inrainbows", album: "In Rainbows", durationSec: 290, coverArtUrl: CAA("6e335887-60ba-38f0-95af-fae7774336bf"), trackNumber: 1 },
  { id: "pink-floyd-money", title: "Money", artist: "Pink Floyd", artistId: "pink-floyd", albumId: "alb-pf-dsotm", album: "The Dark Side of the Moon", durationSec: 383, coverArtUrl: CAA("f5093c06-23e3-404f-aeaa-40f72885ee3a"), trackNumber: 1 },
  { id: "pink-floyd-shine-on", title: "Shine On You Crazy Diamond", artist: "Pink Floyd", artistId: "pink-floyd", albumId: "alb-pf-wish", album: "Wish You Were Here", durationSec: 516, coverArtUrl: CAA("1a272023-10d3-38ee-bab3-317b55fcc21d"), trackNumber: 1 },
  { id: "pink-floyd-comfortably-numb", title: "Comfortably Numb", artist: "Pink Floyd", artistId: "pink-floyd", albumId: "alb-pf-wall", album: "The Wall", durationSec: 382, coverArtUrl: CAA("f2026101-945b-3d05-9ef4-aa718fc3feef"), trackNumber: 1 },
  { id: "bjork-army-of-me", title: "Army of Me", artist: "Björk", artistId: "bjork", albumId: "alb-bj-post", album: "Post", durationSec: 224, coverArtUrl: CAA("b2a6e057-087d-3ae5-a6e5-7f5fa39808ff"), trackNumber: 1 },
  { id: "bjork-joga", title: "Jóga", artist: "Björk", artistId: "bjork", albumId: "alb-bj-homogenic", album: "Homogenic", durationSec: 305, coverArtUrl: CAA("810272e0-aef1-3d85-b2d3-e512e87fc38c"), trackNumber: 1 },
  { id: "talking-heads-once", title: "Once in a Lifetime", artist: "Talking Heads", artistId: "talking-heads", albumId: "alb-th-ril", album: "Remain in Light", durationSec: 264, coverArtUrl: CAA("f6b1b900-6108-32f0-abbd-2855af9151eb"), trackNumber: 1 },
  { id: "kraftwerk-autobahn", title: "Autobahn", artist: "Kraftwerk", artistId: "kraftwerk", albumId: "alb-kw-autobahn", album: "Autobahn", durationSec: 270, coverArtUrl: CAA("f73729e8-4501-3088-aa20-44945296036e"), trackNumber: 1 },
  { id: "kraftwerk-tee", title: "Trans-Europe Express", artist: "Kraftwerk", artistId: "kraftwerk", albumId: "alb-kw-tee", album: "Trans-Europe Express", durationSec: 407, coverArtUrl: CAA("62900ac2-120a-3fae-90af-1f9fe4372a50"), trackNumber: 1 },
  { id: "aphex-twin-xtal", title: "Xtal", artist: "Aphex Twin", artistId: "aphex-twin", albumId: "alb-at-saw", album: "Selected Ambient Works 85–92", durationSec: 290, coverArtUrl: CAA("6842c81d-ea77-3dfd-abf7-4323add3f4d4"), trackNumber: 1 },
  { id: "david-bowie-heroes", title: '"Heroes"', artist: "David Bowie", artistId: "david-bowie", albumId: "alb-db-heroes", album: '"Heroes"', durationSec: 370, coverArtUrl: CAA("1f5ef8d3-10ca-30eb-b41e-85b16987d412"), trackNumber: 1 },
  { id: "david-bowie-ziggy", title: "Ziggy Stardust", artist: "David Bowie", artistId: "david-bowie", albumId: "alb-db-ziggy", album: "The Rise and Fall of Ziggy Stardust", durationSec: 194, coverArtUrl: CAA("6c9ae3dd-32ad-472c-96be-69d0a3536261"), trackNumber: 1 },
  { id: "portishead-wandering", title: "Wandering Star", artist: "Portishead", artistId: "portishead", albumId: "alb-ph-dummy", album: "Dummy", durationSec: 292, coverArtUrl: CAA("48140466-cff6-3222-bd55-63c27e43190d"), trackNumber: 1 },
  { id: "steely-dan-aja", title: "Aja", artist: "Steely Dan", artistId: "steely-dan", albumId: "alb-sd-aja", album: "Aja", durationSec: 476, coverArtUrl: CAA("8588c5a5-b491-37a4-8d51-2227346a072e"), trackNumber: 1 },
  // Ryuichi Sakamoto
  { id: "sakamoto-mcml", title: "Merry Christmas Mr. Lawrence", artist: "Ryuichi Sakamoto", artistId: "ryuichi-sakamoto", albumId: "alb-rs-mcml", album: "Merry Christmas Mr. Lawrence", durationSec: 285, coverArtUrl: CAA("3870eb3e-3447-384e-8d8a-aeddab4ef00b"), trackNumber: 1 },
  { id: "sakamoto-andata", title: "andata", artist: "Ryuichi Sakamoto", artistId: "ryuichi-sakamoto", albumId: "alb-rs-async", album: "async", durationSec: 340, coverArtUrl: "https://picsum.photos/seed/sakamoto-async/500/500", trackNumber: 1 },
  // Moe Shop
  { id: "moe-shop-love-taste", title: "Love Taste", artist: "Moe Shop", artistId: "moe-shop", albumId: "alb-ms-moemoe", album: "Moe Moe", durationSec: 176, coverArtUrl: "https://picsum.photos/seed/moeshop-moemoe/500/500", trackNumber: 1 },
  { id: "moe-shop-baby-pink", title: "Baby Pink", artist: "Moe Shop", artistId: "moe-shop", albumId: "alb-ms-moemoe", album: "Moe Moe", durationSec: 198, coverArtUrl: "https://picsum.photos/seed/moeshop-moemoe/500/500", trackNumber: 2 },
  // Pete Rango (producer)
  { id: "pete-rango-off-the-leash", title: "OFF THE LEASH", artist: "LIL LIL & Pete Rango", artistId: "pete-rango", albumId: "alb-pr-lillil", album: "LIL LIL", durationSec: 182, coverArtUrl: "https://i.ytimg.com/vi/hi0CsuFxrvg/hqdefault.jpg", trackNumber: 1 },
  // Jamee Cornelia
  { id: "jamee-cornelia-husky", title: "Husky", artist: "Jamee Cornelia", artistId: "jamee-cornelia", albumId: "alb-jc-bighomie", album: "BIG HOMIE", durationSec: 195, coverArtUrl: "https://picsum.photos/seed/jameecornelia-bighomie/500/500", trackNumber: 1 },
  { id: "jamee-cornelia-routine", title: "Routine", artist: "Jamee Cornelia", artistId: "jamee-cornelia", albumId: "alb-jc-asd", album: "Art School Dropout", durationSec: 210, coverArtUrl: "https://picsum.photos/seed/jameecornelia-asd/500/500", trackNumber: 1 },
];

// ==================== SOURCES ====================
export const sources: Source[] = [
  // Daft Punk — Around the World
  { id: "src-dp-yt", type: "youtube", title: "Daft Punk - Around The World (Official Music Video Remastered)", publisher: "YouTube / Daft Punk", url: "https://www.youtube.com/watch?v=K0HSD_i2DvA", embedId: "K0HSD_i2DvA", locator: "03:12–03:27", quoteSnippet: "They recorded the entire album in Thomas's bedroom using a Roland TR-909.", thumbnailUrl: "https://img.youtube.com/vi/K0HSD_i2DvA/hqdefault.jpg" },
  { id: "src-dp-art", type: "article", title: "How Daft Punk Made French House a Global Phenomenon", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 6", quoteSnippet: "The repetition wasn't lazy — it was hypnotic by design." },
  { id: "src-dp-int", type: "interview", title: "Thomas Bangalter on Homework", publisher: "Mixmag", url: "https://mixmag.net", locator: "Section 3", quoteSnippet: "We wanted to strip house music back to its most primal loop." },
  // Daft Punk — One More Time
  { id: "src-dp-omt-yt", type: "youtube", title: "Daft Punk - One More Time (Official Video)", publisher: "YouTube / Daft Punk", url: "https://www.youtube.com/watch?v=FGBhQbmPwH8", embedId: "FGBhQbmPwH8", locator: "01:30–01:55", quoteSnippet: "Romanthony's vocal was compressed to distortion — they wanted it 'damaged but joyful.'", thumbnailUrl: "https://img.youtube.com/vi/FGBhQbmPwH8/hqdefault.jpg" },
  { id: "src-dp-omt-art", type: "article", title: "Discovery: Daft Punk's Animated Masterpiece", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 3", quoteSnippet: "Discovery was inspired by childhood memories of Saturday morning cartoons." },
  { id: "src-dp-omt-int", type: "interview", title: "Thomas Bangalter on Discovery", publisher: "Electronic Beats", url: "https://electronicbeats.net", locator: "Section 2", quoteSnippet: "The vocoder is another instrument, not a gimmick." },
  // Daft Punk — Get Lucky
  { id: "src-dp-gl-yt", type: "youtube", title: "Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers", publisher: "YouTube / Daft Punk", url: "https://www.youtube.com/watch?v=h5EofwRzit0", embedId: "h5EofwRzit0", locator: "02:00–02:25", quoteSnippet: "Nile Rodgers played the riff hundreds of times — they comped the final from dozens of takes.", thumbnailUrl: "https://img.youtube.com/vi/h5EofwRzit0/hqdefault.jpg" },
  { id: "src-dp-gl-art", type: "article", title: "Random Access Memories: The Return to Live Music", publisher: "Rolling Stone", url: "https://rollingstone.com", locator: "Paragraph 5", quoteSnippet: "RAM was recorded entirely with live musicians — a deliberate rejection of the laptop era." },
  { id: "src-dp-gl-int", type: "interview", title: "Pharrell Williams on Recording Get Lucky", publisher: "GQ", url: "https://gq.com", locator: "Section 4", quoteSnippet: "Most of my ad-libs were first takes. They refused to let me re-record them." },
  // Radiohead — Everything in Its Right Place
  { id: "src-rh-yt", type: "youtube", title: "Radiohead - Everything In Its Right Place (Live)", publisher: "YouTube / Radiohead", url: "https://www.youtube.com/watch?v=dTFtpuGxOkg", embedId: "dTFtpuGxOkg", locator: "05:44–06:10", quoteSnippet: "Thom fed his lyrics through an Ensoniq vocal processor, intentionally burying meaning.", thumbnailUrl: "https://img.youtube.com/vi/dTFtpuGxOkg/hqdefault.jpg" },
  { id: "src-rh-art", type: "article", title: "The Making of Kid A", publisher: "The Guardian", url: "https://theguardian.com", locator: "Paragraph 12", quoteSnippet: "The band refused to rehearse the songs live before recording them." },
  { id: "src-rh-int", type: "interview", title: "Jonny Greenwood on Electronic Experimentation", publisher: "Wire Magazine", url: "https://thewire.co.uk", locator: "Section 2", quoteSnippet: "We realized guitars weren't the only way to express dread." },
  // Pink Floyd — Money
  { id: "src-pf-yt", type: "youtube", title: "Pink Floyd - Money (Official Music Video)", publisher: "YouTube / Pink Floyd", url: "https://www.youtube.com/watch?v=-0kcet4aPpQ", embedId: "-0kcet4aPpQ", locator: "02:05–02:30", quoteSnippet: "Roger Waters recorded cash register sounds in his garden shed.", thumbnailUrl: "https://img.youtube.com/vi/-0kcet4aPpQ/hqdefault.jpg" },
  { id: "src-pf-art", type: "article", title: "Dark Side of the Moon at 50", publisher: "Rolling Stone", url: "https://rollingstone.com", locator: "Paragraph 8", quoteSnippet: "The album spent 937 weeks on the Billboard 200 — a record that still stands." },
  { id: "src-pf-int", type: "interview", title: "Nick Mason on Recording Money", publisher: "Sound on Sound", url: "https://soundonsound.com", locator: "Section 4", quoteSnippet: "The 7/4 time signature wasn't intentional — it just felt right with the loop." },
  // Björk — Army of Me
  { id: "src-bj-yt", type: "youtube", title: "björk: army of me (Official Video HD)", publisher: "YouTube / björk", url: "https://www.youtube.com/watch?v=jPeheoBa2_Y", embedId: "jPeheoBa2_Y", locator: "04:20–04:45", quoteSnippet: "She mailed the album's beats to collaborators on cassette tape from Iceland.", thumbnailUrl: "https://img.youtube.com/vi/jPeheoBa2_Y/hqdefault.jpg" },
  { id: "src-bj-art", type: "article", title: "How Björk Invented the Future of Pop", publisher: "The New York Times", url: "https://nytimes.com", locator: "Paragraph 5", quoteSnippet: "Post turned vulnerability into a sonic weapon." },
  { id: "src-bj-int", type: "interview", title: "Björk on Army of Me", publisher: "NME", url: "https://nme.com", locator: "Section 2", quoteSnippet: "That bass sound — I wanted it to feel like being inside a tank." },
  // Talking Heads — Once in a Lifetime
  { id: "src-th-yt", type: "youtube", title: "Talking Heads - Once in a Lifetime (Official Video)", publisher: "YouTube / Talking Heads", url: "https://www.youtube.com/watch?v=5IsSpAOD6K8", embedId: "5IsSpAOD6K8", locator: "06:00–06:25", quoteSnippet: "Brian Eno made the band play without knowing what song they were building.", thumbnailUrl: "https://img.youtube.com/vi/5IsSpAOD6K8/hqdefault.jpg" },
  { id: "src-th-art", type: "article", title: "The Afrobeat Roots of Remain in Light", publisher: "Stereogum", url: "https://stereogum.com", locator: "Paragraph 9", quoteSnippet: "Byrne's 'same as it ever was' lyric was improvised in the studio." },
  { id: "src-th-int", type: "interview", title: "Jerry Harrison on the Album's Tensions", publisher: "Uncut", url: "https://uncut.co.uk", locator: "Section 5", quoteSnippet: "We were falling apart as a band, but the music never sounded more together." },
  // Kraftwerk — Autobahn
  { id: "src-kw-yt", type: "youtube", title: "Kraftwerk - Autobahn (Official Music Video)", publisher: "YouTube / Kraftwerk", url: "https://www.youtube.com/watch?v=FLoqr70JvVU", embedId: "FLoqr70JvVU", locator: "03:50–04:15", quoteSnippet: "They built custom instruments because nothing on the market could make the sounds they imagined.", thumbnailUrl: "https://img.youtube.com/vi/FLoqr70JvVU/hqdefault.jpg" },
  { id: "src-kw-art", type: "article", title: "How Autobahn Changed Music Forever", publisher: "Fact Magazine", url: "https://factmag.com", locator: "Paragraph 3", quoteSnippet: "The 22-minute title track was edited to 3 minutes for U.S. radio — and it still charted." },
  { id: "src-kw-int", type: "interview", title: "Florian Schneider on Sound as Sculpture", publisher: "Electronic Beats", url: "https://electronicbeats.net", locator: "Section 1", quoteSnippet: "We don't play instruments. We play the studio." },
  // Aphex Twin — Xtal
  { id: "src-at-yt", type: "youtube", title: "Aphex Twin - Xtal", publisher: "YouTube / R&S Records", url: "https://www.youtube.com/watch?v=sWcLccMuCA8", embedId: "sWcLccMuCA8", locator: "02:30–02:55", quoteSnippet: "Richard recorded Xtal on equipment he modified himself as a teenager.", thumbnailUrl: "https://img.youtube.com/vi/sWcLccMuCA8/hqdefault.jpg" },
  { id: "src-at-art", type: "article", title: "Aphex Twin and the Art of Beautiful Noise", publisher: "Resident Advisor", url: "https://ra.co", locator: "Paragraph 7", quoteSnippet: "SAW 85–92 sounds like dreaming in a language you almost understand." },
  { id: "src-at-int", type: "interview", title: "Richard D. James on His Early Equipment", publisher: "FACT", url: "https://factmag.com", locator: "Section 3", quoteSnippet: "I was 14, soldering circuits. The sounds just appeared." },
  // David Bowie — Heroes
  { id: "src-db-yt", type: "youtube", title: "David Bowie - Heroes (Official Video)", publisher: "YouTube / David Bowie", url: "https://www.youtube.com/watch?v=lXgkuM2NhYI", embedId: "lXgkuM2NhYI", locator: "04:10–04:35", quoteSnippet: "Bowie could see the Berlin Wall from Hansa Studios while recording.", thumbnailUrl: "https://img.youtube.com/vi/lXgkuM2NhYI/hqdefault.jpg" },
  { id: "src-db-art", type: "article", title: "The Berlin Trilogy: Bowie's Reinvention", publisher: "The Atlantic", url: "https://theatlantic.com", locator: "Paragraph 11", quoteSnippet: "Eno's Oblique Strategies cards guided every creative decision in the studio." },
  { id: "src-db-int", type: "interview", title: "Tony Visconti on Recording Heroes", publisher: "Tape Op", url: "https://tapeop.com", locator: "Section 6", quoteSnippet: "I set up three microphones at different distances — the farthest one was gated. That's the huge sound." },
  // Portishead — Wandering Star
  { id: "src-ph-yt", type: "youtube", title: "Portishead - Wandering Star (Official Video)", publisher: "YouTube / Portishead", url: "https://www.youtube.com/watch?v=xF4RhDWs2DA", embedId: "xF4RhDWs2DA", locator: "05:15–05:40", quoteSnippet: "Geoff Barrow sampled obscure 60s spy film soundtracks for the album's backbone.", thumbnailUrl: "https://img.youtube.com/vi/xF4RhDWs2DA/hqdefault.jpg" },
  { id: "src-ph-art", type: "article", title: "Portishead and the Ghosts of Bristol", publisher: "Quietus", url: "https://thequietus.com", locator: "Paragraph 4", quoteSnippet: "Beth Gibbons recorded her vocals in near darkness to capture the right mood." },
  { id: "src-ph-int", type: "interview", title: "Geoff Barrow on Sampling and Paranoia", publisher: "Red Bull Music Academy", url: "https://daily.redbullmusicacademy.com", locator: "Section 2", quoteSnippet: "I was terrified someone would recognize the samples. Nobody did." },
  // Steely Dan — Aja
  { id: "src-sd-yt", type: "youtube", title: "Steely Dan - Aja", publisher: "YouTube / Steely Dan", url: "https://www.youtube.com/watch?v=D-FMrz7OwLo", embedId: "D-FMrz7OwLo", locator: "07:20–07:45", quoteSnippet: "They auditioned 7 different drummers for the title track before choosing Steve Gadd.", thumbnailUrl: "https://img.youtube.com/vi/D-FMrz7OwLo/hqdefault.jpg" },
  { id: "src-sd-art", type: "article", title: "Inside the Perfectionism of Steely Dan", publisher: "Sound & Vision", url: "https://soundandvision.com", locator: "Paragraph 6", quoteSnippet: "Fagen and Becker spent $1 million — in 1977 dollars — to get every note right." },
  { id: "src-sd-int", type: "interview", title: "Steve Gadd on the Aja Drum Solo", publisher: "Modern Drummer", url: "https://moderndrummer.com", locator: "Section 3", quoteSnippet: "I played it once. They said 'that's the one.' I couldn't believe it." },
  // Radiohead — Paranoid Android
  { id: "src-rh-pa-yt", type: "youtube", title: "Radiohead - Paranoid Android (Remastered)", publisher: "YouTube / Radiohead", url: "https://www.youtube.com/watch?v=DExBeFCx3mQ", embedId: "DExBeFCx3mQ", locator: "08:10–08:35", quoteSnippet: "Paranoid Android was stitched together from three separate songs.", thumbnailUrl: "https://img.youtube.com/vi/DExBeFCx3mQ/hqdefault.jpg" },
  { id: "src-rh-pa-art", type: "article", title: "The Making of OK Computer", publisher: "NME", url: "https://nme.com", locator: "Paragraph 7", quoteSnippet: "EMI initially refused to release it as a single because of its length." },
  { id: "src-rh-pa-int", type: "interview", title: "Colin Greenwood on Paranoid Android", publisher: "Mojo", url: "https://mojo4music.com", locator: "Section 4", quoteSnippet: "We thought of it as our Bohemian Rhapsody — except angrier." },
  // Radiohead — Reckoner
  { id: "src-rh-re-yt", type: "youtube", title: "Radiohead - Reckoner (From the Basement)", publisher: "YouTube / Radiohead", url: "https://www.youtube.com/watch?v=2FMP-9bn9N8", embedId: "2FMP-9bn9N8", locator: "04:30–04:55", quoteSnippet: "Reckoner went through dozens of radically different versions over 6 years.", thumbnailUrl: "https://img.youtube.com/vi/2FMP-9bn9N8/hqdefault.jpg" },
  { id: "src-rh-re-art", type: "article", title: "The Long Gestation of In Rainbows", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 9", quoteSnippet: "The original Reckoner was a thrashing rock song — nothing like the final version." },
  { id: "src-rh-re-int", type: "interview", title: "Ed O'Brien on In Rainbows Sessions", publisher: "Guitar World", url: "https://guitarworld.com", locator: "Section 2", quoteSnippet: "The guitar harmonics just happened. Thom said 'keep doing that forever.'" },
  // Pink Floyd — Shine On You Crazy Diamond
  { id: "src-pf-sh-yt", type: "youtube", title: "Pink Floyd - Shine On You Crazy Diamond (Official Music Video)", publisher: "YouTube / Pink Floyd", url: "https://www.youtube.com/watch?v=cWGE9Gi0bB0", embedId: "cWGE9Gi0bB0", locator: "03:00–03:25", quoteSnippet: "The four-note guitar motif was David Gilmour's first take.", thumbnailUrl: "https://img.youtube.com/vi/cWGE9Gi0bB0/hqdefault.jpg" },
  { id: "src-pf-sh-art", type: "article", title: "The Ghost of Syd Barrett", publisher: "Uncut", url: "https://uncut.co.uk", locator: "Paragraph 5", quoteSnippet: "A strange, bloated man walked into the studio during recording. It was Syd Barrett." },
  { id: "src-pf-sh-int", type: "interview", title: "Roger Waters on Syd's Visit", publisher: "Q Magazine", url: "https://qmagazine.com", locator: "Section 3", quoteSnippet: "Nobody recognized him at first. When we realized, we all broke down." },
  // Pink Floyd — Comfortably Numb
  { id: "src-pf-cn-yt", type: "youtube", title: "Pink Floyd - Comfortably Numb (Live 8)", publisher: "YouTube / Pink Floyd", url: "https://www.youtube.com/watch?v=P_4uEaZQ2Kg", embedId: "P_4uEaZQ2Kg", locator: "05:30–05:55", quoteSnippet: "Gilmour and Waters had completely different visions for the song.", thumbnailUrl: "https://img.youtube.com/vi/P_4uEaZQ2Kg/hqdefault.jpg" },
  { id: "src-pf-cn-art", type: "article", title: "Comfortably Numb: The Perfect Rock Song", publisher: "Rolling Stone", url: "https://rollingstone.com", locator: "Paragraph 4", quoteSnippet: "The guitar solo was recorded in one take. Gilmour did several, but the first was best." },
  { id: "src-pf-cn-int", type: "interview", title: "David Gilmour on That Solo", publisher: "Guitar Player", url: "https://guitarplayer.com", locator: "Section 2", quoteSnippet: "I just closed my eyes and played. The first take had something the others didn't." },
  // Björk — Jóga
  { id: "src-bj-jo-yt", type: "youtube", title: "björk: jóga (Official Video)", publisher: "YouTube / björk", url: "https://www.youtube.com/watch?v=loB0kmz_0MM", embedId: "loB0kmz_0MM", locator: "03:40–04:05", quoteSnippet: "The string arrangements were inspired by the tectonic plates beneath Iceland.", thumbnailUrl: "https://img.youtube.com/vi/loB0kmz_0MM/hqdefault.jpg" },
  { id: "src-bj-jo-art", type: "article", title: "Homogenic at 25", publisher: "The Guardian", url: "https://theguardian.com", locator: "Paragraph 8", quoteSnippet: "Jóga was a love letter to Iceland itself — the landscape is the melody." },
  { id: "src-bj-jo-int", type: "interview", title: "Björk on Homogenic's Emotional Core", publisher: "Dazed", url: "https://dazeddigital.com", locator: "Section 1", quoteSnippet: "I wanted to make music that sounded like volcanoes and glaciers at the same time." },
  // Kraftwerk — Trans-Europe Express
  { id: "src-kw-te-yt", type: "youtube", title: "Kraftwerk - Trans-Europe Express", publisher: "YouTube / Kraftwerk", url: "https://www.youtube.com/watch?v=DWSceMtAjPw", embedId: "DWSceMtAjPw", locator: "02:15–02:40", quoteSnippet: "Afrika Bambaataa sampled this directly for Planet Rock — the birth of electro.", thumbnailUrl: "https://img.youtube.com/vi/DWSceMtAjPw/hqdefault.jpg" },
  { id: "src-kw-te-art", type: "article", title: "How Kraftwerk Accidentally Invented Hip-Hop", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 4", quoteSnippet: "The train rhythm was a sequencer accident that they decided to keep." },
  { id: "src-kw-te-int", type: "interview", title: "Ralf Hütter on Travel as Music", publisher: "Wire Magazine", url: "https://thewire.co.uk", locator: "Section 2", quoteSnippet: "We traveled by train across Europe. The rhythm of the rails became the song." },
  // David Bowie — Ziggy Stardust
  { id: "src-db-zi-yt", type: "youtube", title: "David Bowie - Ziggy Stardust (Official Video)", publisher: "YouTube / David Bowie", url: "https://www.youtube.com/watch?v=na8xgu-KLAk", embedId: "na8xgu-KLAk", locator: "04:50–05:15", quoteSnippet: "Bowie borrowed from Iggy Pop, Vince Taylor, and a Japanese fashion designer to build Ziggy.", thumbnailUrl: "https://img.youtube.com/vi/na8xgu-KLAk/hqdefault.jpg" },
  { id: "src-db-zi-art", type: "article", title: "The Invention of Ziggy Stardust", publisher: "The Atlantic", url: "https://theatlantic.com", locator: "Paragraph 6", quoteSnippet: "Bowie became so consumed by Ziggy that his friends couldn't tell where the character ended." },
  { id: "src-db-zi-int", type: "interview", title: "Mick Ronson on Playing with Bowie", publisher: "Classic Rock", url: "https://classicrock.com", locator: "Section 3", quoteSnippet: "He'd show up as David. By the second take, he was Ziggy. You could see the switch happen." },
  // Ryuichi Sakamoto — Merry Christmas Mr. Lawrence
  { id: "src-rs-mcml-yt", type: "youtube", title: "Ryuichi Sakamoto - Merry Christmas, Mr. Lawrence (Official Video)", publisher: "YouTube / Decca Records", url: "https://www.youtube.com/watch?v=LGs_vGt0MY8", embedId: "LGs_vGt0MY8", locator: "01:20–01:45", quoteSnippet: "Sakamoto composed the theme in a single night, drawing on a simple repeating arpeggio that evokes both longing and stillness.", thumbnailUrl: "https://img.youtube.com/vi/LGs_vGt0MY8/hqdefault.jpg" },
  { id: "src-rs-mcml-art", type: "article", title: "Ryuichi Sakamoto's Score for Merry Christmas Mr. Lawrence", publisher: "The Guardian", url: "https://theguardian.com", locator: "Paragraph 4", quoteSnippet: "The theme became one of the most recognized piano pieces of the 20th century — and Sakamoto almost didn't write it." },
  { id: "src-rs-mcml-int", type: "interview", title: "Sakamoto on Acting and Composing for Oshima", publisher: "Sight & Sound", url: "https://bfi.org.uk", locator: "Section 2", quoteSnippet: "Oshima told me: 'You are the score.' I had to act in the film and compose it — both at the same time." },
  // Ryuichi Sakamoto — andata
  { id: "src-rs-an-yt", type: "youtube", title: "Ryuichi Sakamoto - andata (from async)", publisher: "YouTube / Milan Records", url: "https://www.youtube.com/watch?v=pygwK0sBUdM", embedId: "pygwK0sBUdM", locator: "02:00–02:30", quoteSnippet: "async was composed during Sakamoto's recovery from cancer — each sound chosen as if it might be his last.", thumbnailUrl: "https://img.youtube.com/vi/pygwK0sBUdM/hqdefault.jpg" },
  { id: "src-rs-an-art", type: "article", title: "async: Sakamoto's Meditation on Mortality", publisher: "Pitchfork", url: "https://pitchfork.com", locator: "Paragraph 6", quoteSnippet: "He recorded rain, wind, and the hum of an empty room — nature became his collaborator." },
  { id: "src-rs-an-int", type: "interview", title: "Sakamoto on Making Music After Cancer", publisher: "The New York Times", url: "https://nytimes.com", locator: "Section 3", quoteSnippet: "I wanted to make the sound of a world without me in it. That became async." },
  // Moe Shop — Love Taste
  { id: "src-ms-lt-yt", type: "youtube", title: "Moe Shop - Love Taste (ft. Jamie Paige & Shiki)", publisher: "YouTube / Moe Shop", url: "https://www.youtube.com/watch?v=pJTmt83Njuk", embedId: "pJTmt83Njuk", locator: "01:10–01:35", quoteSnippet: "The track was originally a SoundCloud upload that went viral — it defined the future funk sound for a generation of online listeners.", thumbnailUrl: "https://img.youtube.com/vi/pJTmt83Njuk/hqdefault.jpg" },
  { id: "src-ms-lt-art", type: "article", title: "Future Funk and the Art of the Internet Groove", publisher: "Bandcamp Daily", url: "https://daily.bandcamp.com", locator: "Paragraph 5", quoteSnippet: "Moe Shop takes 80s city pop, French house, and anime aesthetics and fuses them into pure serotonin." },
  { id: "src-ms-lt-int", type: "interview", title: "Moe Shop on Building a Sound from Samples", publisher: "The Fader", url: "https://thefader.com", locator: "Section 2", quoteSnippet: "I wanted something that sounds like falling in love in a convenience store at 2 AM." },
  // Moe Shop — Baby Pink
  { id: "src-ms-bp-yt", type: "youtube", title: "Moe Shop - Baby Pink (ft. YUC'e)", publisher: "YouTube / Moe Shop", url: "https://www.youtube.com/watch?v=sWbD5q769Ms", embedId: "sWbD5q769Ms", locator: "00:45–01:10", quoteSnippet: "YUC'e's vocal chops are pitched and re-sequenced — the human voice becomes a synthesizer.", thumbnailUrl: "https://img.youtube.com/vi/sWbD5q769Ms/hqdefault.jpg" },
  { id: "src-ms-bp-art", type: "article", title: "Kawaii Bass: The Genre That Shouldn't Work", publisher: "Resident Advisor", url: "https://ra.co", locator: "Paragraph 3", quoteSnippet: "It's aggressively cute — and somehow that makes it hit harder." },
  { id: "src-ms-bp-int", type: "interview", title: "Moe Shop on the Moe Moe EP", publisher: "Anime News Network", url: "https://animenewsnetwork.com", locator: "Section 1", quoteSnippet: "Every track on Moe Moe started as a joke. Then the jokes got really good." },
  // Pete Rango — OFF THE LEASH
  { id: "src-pr-ot-yt", type: "youtube", title: "LIL LIL & Pete Rango - OFF THE LEASH", publisher: "YouTube / XUE Records", url: "https://www.youtube.com/watch?v=hi0CsuFxrvg", embedId: "hi0CsuFxrvg", locator: "01:00–01:25", quoteSnippet: "Released via XUE Records in late 2024, the track showcases Pete Rango's production chops alongside LIL LIL's raw delivery.", thumbnailUrl: "https://i.ytimg.com/vi/hi0CsuFxrvg/hqdefault.jpg" },
  { id: "src-pr-ot-art", type: "article", title: "Pete Rango: Producer, Mentor, Community Builder", publisher: "Campfire Music Foundation", url: "https://www.cfmusic.org/pete-arango", locator: "Bio section", quoteSnippet: "With over a decade of experience in the music industry, Pete has collaborated with artists such as DJ Jazzy Jeff, A$AP Ferg, and Kodak Black." },
  { id: "src-pr-ot-int", type: "article", title: "Life is Valuable: Pete Rango & Gabriel Williams", publisher: "CultureWorks Richmond", url: "https://richmondcultureworks.org/spotlights/spotlight-life-is-valuable-with-pete-rango-amp-gabriel-williams", locator: "Spotlight feature", quoteSnippet: "LIV's undeniable momentum has brought their hands-on Dream Labs to Petersburg schools, pairing mentors with young students." },
  // Jamee Cornelia — Husky
  { id: "src-jc-hu-yt", type: "youtube", title: "Jamee Cornelia - Husky (Music Video)", publisher: "YouTube / Jamee Cornelia", url: "https://www.youtube.com/watch?v=AtCJa1s1Lkc", embedId: "AtCJa1s1Lkc", locator: "01:00–01:25", quoteSnippet: "The video was self-directed on a shoestring budget — Cornelia edited it alone, staying true to the DIY ethos.", thumbnailUrl: "https://img.youtube.com/vi/AtCJa1s1Lkc/hqdefault.jpg" },
  { id: "src-jc-hu-art", type: "article", title: "Atlanta's Underground Rap Renaissance", publisher: "Bandcamp Daily", url: "https://daily.bandcamp.com", locator: "Paragraph 7", quoteSnippet: "Jamee Cornelia makes music that sounds like a conversation with yourself at 3 AM." },
  { id: "src-jc-hu-int", type: "interview", title: "Jamee Cornelia on BIG HOMIE", publisher: "Passion of the Weiss", url: "https://passionweiss.com", locator: "Section 3", quoteSnippet: "I rap because I have to. It's cheaper than therapy and more honest than a journal." },
  // Jamee Cornelia — Routine
  { id: "src-jc-ro-yt", type: "youtube", title: "Jamee Cornelia - Art School Dropout (Visualizer)", publisher: "YouTube / Jamee Cornelia", url: "https://www.youtube.com/watch?v=TnqqV_bTHC8", embedId: "TnqqV_bTHC8", locator: "02:30–02:55", quoteSnippet: "Art School Dropout was recorded in bedrooms and basements across Atlanta — the lo-fi sound is intentional.", thumbnailUrl: "https://img.youtube.com/vi/TnqqV_bTHC8/hqdefault.jpg" },
  { id: "src-jc-ro-art", type: "article", title: "Art Rap's DIY Manifesto", publisher: "The Quietus", url: "https://thequietus.com", locator: "Paragraph 4", quoteSnippet: "Cornelia treats albums like exhibitions — each track a different room in the same building." },
  { id: "src-jc-ro-int", type: "interview", title: "Jamee Cornelia on Art School Dropout", publisher: "Okayplayer", url: "https://okayplayer.com", locator: "Section 2", quoteSnippet: "I dropped out to make the art they said I couldn't. This album is the receipt." },
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
  { id: "n-dp-omt-1", trackId: "daft-punk-one-more-time", timestampSec: 64, durationMs: 6000, text: "Romanthony's vocal was intentionally compressed to the point of distortion — Daft Punk wanted it to sound 'damaged but joyful.'", kind: "process", sourceId: "src-dp-omt-yt" },
  { id: "n-dp-omt-2", trackId: "daft-punk-one-more-time", timestampSec: 160, durationMs: 5500, text: "Discovery was inspired by childhood memories of Saturday morning cartoons — they even made an anime film for it.", kind: "influence", sourceId: "src-dp-omt-art" },
  { id: "n-dp-omt-3", trackId: "daft-punk-one-more-time", timestampSec: 256, durationMs: 6000, text: "🎧 Listen for the filtered vocal breakdown here — Thomas said 'the vocoder is another instrument, not a gimmick.'", kind: "pattern", listenFor: true, relatedMomentSec: 261, sourceId: "src-dp-omt-int" },
  // Daft Punk — Get Lucky
  { id: "n-dp-gl-1", trackId: "daft-punk-get-lucky", timestampSec: 74, durationMs: 6000, text: "Nile Rodgers played the guitar riff hundreds of times — they comped the final version from dozens of takes.", kind: "process", sourceId: "src-dp-gl-yt" },
  { id: "n-dp-gl-2", trackId: "daft-punk-get-lucky", timestampSec: 184, durationMs: 5500, text: "Random Access Memories was recorded entirely with live musicians — a deliberate rejection of the laptop era.", kind: "constraint", sourceId: "src-dp-gl-art" },
  { id: "n-dp-gl-3", trackId: "daft-punk-get-lucky", timestampSec: 295, durationMs: 6000, text: "🎧 Listen for Pharrell's vocal ad-libs — most were first takes that the duo refused to re-record.", kind: "human", listenFor: true, relatedMomentSec: 300, sourceId: "src-dp-gl-int" },
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
  // Ryuichi Sakamoto — Merry Christmas Mr. Lawrence
  { id: "n-rs-mcml-1", trackId: "sakamoto-mcml", timestampSec: 57, durationMs: 6000, text: "Sakamoto composed this theme in a single night — a simple repeating arpeggio that became one of the most recognized piano pieces of the century.", kind: "process", sourceId: "src-rs-mcml-yt" },
  { id: "n-rs-mcml-2", trackId: "sakamoto-mcml", timestampSec: 142, durationMs: 5500, text: "Oshima told Sakamoto: 'You are the score.' He had to act in the film and compose it simultaneously.", kind: "human", sourceId: "src-rs-mcml-int" },
  { id: "n-rs-mcml-3", trackId: "sakamoto-mcml", timestampSec: 228, durationMs: 6000, text: "🎧 Listen for how the melody builds through repetition — Sakamoto almost didn't write it, calling the theme 'too simple.'", kind: "pattern", listenFor: true, relatedMomentSec: 233, sourceId: "src-rs-mcml-art" },
  // Ryuichi Sakamoto — andata
  { id: "n-rs-an-1", trackId: "sakamoto-andata", timestampSec: 68, durationMs: 6000, text: "async was composed during Sakamoto's recovery from throat cancer — each sound chosen as if it might be his last.", kind: "human", sourceId: "src-rs-an-yt" },
  { id: "n-rs-an-2", trackId: "sakamoto-andata", timestampSec: 170, durationMs: 5500, text: "He recorded rain, wind, and the hum of empty rooms — nature became his primary collaborator on async.", kind: "process", sourceId: "src-rs-an-art" },
  { id: "n-rs-an-3", trackId: "sakamoto-andata", timestampSec: 272, durationMs: 6000, text: "🎧 Listen for the silence between notes — Sakamoto said 'I wanted to make the sound of a world without me in it.'", kind: "constraint", listenFor: true, relatedMomentSec: 277, sourceId: "src-rs-an-int" },
  // Moe Shop — Love Taste
  { id: "n-ms-lt-1", trackId: "moe-shop-love-taste", timestampSec: 35, durationMs: 6000, text: "Love Taste started as a SoundCloud upload that went viral — it defined the future funk sound for a generation of online listeners.", kind: "influence", sourceId: "src-ms-lt-yt" },
  { id: "n-ms-lt-2", trackId: "moe-shop-love-taste", timestampSec: 88, durationMs: 5500, text: "Moe Shop fuses 80s city pop, French house, and anime aesthetics into what they call 'pure serotonin.'", kind: "pattern", sourceId: "src-ms-lt-art" },
  { id: "n-ms-lt-3", trackId: "moe-shop-love-taste", timestampSec: 141, durationMs: 6000, text: "🎧 Listen for the vocal chop breakdown — Moe Shop wanted 'something that sounds like falling in love in a convenience store at 2 AM.'", kind: "human", listenFor: true, relatedMomentSec: 146, sourceId: "src-ms-lt-int" },
  // Moe Shop — Baby Pink
  { id: "n-ms-bp-1", trackId: "moe-shop-baby-pink", timestampSec: 40, durationMs: 6000, text: "YUC'e's vocals are pitched and re-sequenced until the human voice becomes a synthesizer — kawaii bass at its most inventive.", kind: "process", sourceId: "src-ms-bp-yt" },
  { id: "n-ms-bp-2", trackId: "moe-shop-baby-pink", timestampSec: 99, durationMs: 5500, text: "Kawaii bass is 'aggressively cute — and somehow that makes it hit harder.' Baby Pink is the genre's thesis statement.", kind: "influence", sourceId: "src-ms-bp-art" },
  { id: "n-ms-bp-3", trackId: "moe-shop-baby-pink", timestampSec: 158, durationMs: 6000, text: "🎧 Listen for that bouncy bass drop — every track on Moe Moe 'started as a joke. Then the jokes got really good.'", kind: "human", listenFor: true, relatedMomentSec: 163, sourceId: "src-ms-bp-int" },
  // Pete Rango — OFF THE LEASH
  { id: "n-pr-ot-1", trackId: "pete-rango-off-the-leash", timestampSec: 36, durationMs: 6000, text: "Pete Rango produced this track for LIL LIL under XUE Records — his production blends hard-hitting hip-hop with atmospheric textures.", kind: "process", sourceId: "src-pr-ot-yt" },
  { id: "n-pr-ot-2", trackId: "pete-rango-off-the-leash", timestampSec: 91, durationMs: 5500, text: "Beyond producing, Rango has collaborated with DJ Jazzy Jeff, A$AP Ferg, and Kodak Black over a decade-long career.", kind: "influence", sourceId: "src-pr-ot-art" },
  { id: "n-pr-ot-3", trackId: "pete-rango-off-the-leash", timestampSec: 146, durationMs: 6000, text: "🎧 Listen for the production layers — Rango also runs Dream Labs, teaching music production to students in Petersburg, VA.", kind: "human", listenFor: true, relatedMomentSec: 151, sourceId: "src-pr-ot-int" },
  // Jamee Cornelia — Husky
  { id: "n-jc-hu-1", trackId: "jamee-cornelia-husky", timestampSec: 39, durationMs: 6000, text: "The Husky video was self-directed on a shoestring budget — Cornelia edited it alone, staying true to the DIY ethos.", kind: "process", sourceId: "src-jc-hu-yt" },
  { id: "n-jc-hu-2", trackId: "jamee-cornelia-husky", timestampSec: 97, durationMs: 5500, text: "Cornelia makes music that 'sounds like a conversation with yourself at 3 AM' — raw, unfiltered, and uncomfortably honest.", kind: "human", sourceId: "src-jc-hu-art" },
  { id: "n-jc-hu-3", trackId: "jamee-cornelia-husky", timestampSec: 156, durationMs: 6000, text: "🎧 Listen for the flow shift here — Cornelia says 'I rap because I have to. It's cheaper than therapy and more honest than a journal.'", kind: "constraint", listenFor: true, relatedMomentSec: 161, sourceId: "src-jc-hu-int" },
  // Jamee Cornelia — Routine
  { id: "n-jc-ro-1", trackId: "jamee-cornelia-routine", timestampSec: 42, durationMs: 6000, text: "Art School Dropout was recorded in bedrooms and basements across Atlanta — the lo-fi sound isn't a limitation, it's a statement.", kind: "process", sourceId: "src-jc-ro-yt" },
  { id: "n-jc-ro-2", trackId: "jamee-cornelia-routine", timestampSec: 105, durationMs: 5500, text: "Cornelia treats albums like art exhibitions — each track is a different room in the same building.", kind: "pattern", sourceId: "src-jc-ro-art" },
  { id: "n-jc-ro-3", trackId: "jamee-cornelia-routine", timestampSec: 168, durationMs: 6000, text: "🎧 Listen for the beat switch — Cornelia says 'I dropped out to make the art they said I couldn't. This album is the receipt.'", kind: "human", listenFor: true, relatedMomentSec: 173, sourceId: "src-jc-ro-int" },
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
