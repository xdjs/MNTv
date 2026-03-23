#!/usr/bin/env bash
# add-images.sh — Add one curated image per set of 3 nuggets (on the discovery nugget)
# All URLs manually verified from MusicBrainz Cover Art Archive or Wikimedia Commons.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../src/data/seed"

# Helper: add imageUrl + imageCaption to the "discovery" nugget in a listen JSON file
add_image() {
  local file="$1" url="$2" caption="$3"
  jq --arg url "$url" --arg caption "$caption" '
    .nuggets = [.nuggets[] |
      if .kind == "discovery" then
        . + {imageUrl: $url, imageCaption: $caption}
      else . end
    ]
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  echo "  ✓ $(basename "$file") → $caption"
}

echo "=== Daft Punk — Around the World ==="
echo ""

# casual-listen1: Stardust (Thomas Bangalter's project) — use Daft Punk photo
add_image "$DATA_DIR/daftpunk-casual-listen1.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Daft_Punk_in_2013_2-_centered.jpg/500px-Daft_Punk_in_2013_2-_centered.jpg" \
  "Daft Punk's Thomas Bangalter (right) also produced under the Stardust alias"

# casual-listen2: Cassius — album cover from Cover Art Archive
add_image "$DATA_DIR/daftpunk-casual-listen2.json" \
  "https://coverartarchive.org/release/17fba1f3-3db9-455b-9fd9-c4ab821bad4d/front-500" \
  "Cassius '1999' — French house pioneers and contemporaries of Daft Punk"

# casual-listen3: Etienne de Crécy Super Discount — album cover
add_image "$DATA_DIR/daftpunk-casual-listen3.json" \
  "https://coverartarchive.org/release/cc779631-97ea-49f5-bb12-f69ecfae7f0e/front-500" \
  "Étienne de Crécy 'Super Discount' — a cornerstone of the French house movement"

# curious-listen1: Chic — Risqué album cover
add_image "$DATA_DIR/daftpunk-curious-listen1.json" \
  "https://coverartarchive.org/release/badac899-d2fb-4870-b9ef-efd08b08f2c6/front-500" \
  "Chic 'Risqué' (1979) — the disco-funk foundation that inspired Daft Punk"

# curious-listen2: Giorgio Moroder — artist photo from Wikipedia
add_image "$DATA_DIR/daftpunk-curious-listen2.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Giorgio_Moroder_-_First_Avenue_Minneapolis_-_The_Current_%2844776142702%29.jpg/500px-Giorgio_Moroder_-_First_Avenue_Minneapolis_-_The_Current_%2844776142702%29.jpg" \
  "Giorgio Moroder — the godfather of electronic dance music"

# curious-listen3: Motorbass Pansoul — album cover
add_image "$DATA_DIR/daftpunk-curious-listen3.json" \
  "https://coverartarchive.org/release/af5e8c09-2d26-41ba-8df8-45507052b4f4/front-500" \
  "Motorbass 'Pansoul' — Philippe Zdar's proto-French house classic"

# nerd-listen1: Cerrone — artist photo from Wikipedia
add_image "$DATA_DIR/daftpunk-nerd-listen1.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/CERRONE_Marc_02-24x30-2009.jpg/500px-CERRONE_Marc_02-24x30-2009.jpg" \
  "Cerrone — French disco pioneer whose cosmic grooves shaped Daft Punk's sound"

# nerd-listen2: Cerrone Love in C Minor — album cover
add_image "$DATA_DIR/daftpunk-nerd-listen2.json" \
  "https://coverartarchive.org/release/c74bba16-541e-427f-be81-0bc7cb4718a6/front-500" \
  "Cerrone 'Love in C Minor' (1976) — a blueprint for electronic dance music"

# nerd-listen3: Paul Johnson — use Giorgio Moroder From Here to Eternity as fallback (no Paul Johnson photo available)
add_image "$DATA_DIR/daftpunk-nerd-listen3.json" \
  "https://coverartarchive.org/release/98cc02b1-ac57-4ea6-87ed-749607c3fe01/front-500" \
  "Giorgio Moroder 'From Here to Eternity' — the electronic disco blueprint that connects to Chicago house"

echo ""
echo "=== Radiohead — Weird Fishes/Arpeggi ==="
echo ""

# casual-listen1: Grizzly Bear — band photo from Wikipedia
add_image "$DATA_DIR/radiohead-casual-listen1.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Grizzly-Bear_%28cropped%29.jpg/500px-Grizzly-Bear_%28cropped%29.jpg" \
  "Grizzly Bear — masters of intricate, layered indie rock"

# casual-listen2: Low Roar — artist photo from Wikipedia
add_image "$DATA_DIR/radiohead-casual-listen2.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Ryan_Karazija_%28low_quality%29.jpg/500px-Ryan_Karazija_%28low_quality%29.jpg" \
  "Ryan Karazija of Low Roar — atmospheric Icelandic indie"

# casual-listen3: Sigur Rós — band photo from Wikipedia
add_image "$DATA_DIR/radiohead-casual-listen3.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Sigur_R%C3%B3s_2013.jpg/500px-Sigur_R%C3%B3s_2013.jpg" \
  "Sigur Rós — Icelandic post-rock pioneers"

# curious-listen1: Grizzly Bear Veckatimest — album cover
add_image "$DATA_DIR/radiohead-curious-listen1.json" \
  "https://coverartarchive.org/release/514a2c03-a21d-4665-ae9e-088c1b72dd99/front-500" \
  "Grizzly Bear 'Veckatimest' — lush harmonies meet intricate arrangements"

# curious-listen2: Grizzly Bear Veckatimest again — use Radiohead live photo instead
add_image "$DATA_DIR/radiohead-curious-listen2.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/RadioheadO2211125_composite.jpg/500px-RadioheadO2211125_composite.jpg" \
  "Radiohead live — the band that nearly broke up before creating 'In Rainbows'"

# curious-listen3: Talk Talk Spirit of Eden — album cover
add_image "$DATA_DIR/radiohead-curious-listen3.json" \
  "https://coverartarchive.org/release/f95a4d58-aeaa-4e5c-b198-5e2145020d61/front-500" \
  "Talk Talk 'Spirit of Eden' — the post-rock masterpiece that influenced Radiohead"

# nerd-listen1: Nigel Godrich — no direct photo, use a related image
# Use Radiohead photo since the nugget is about their producer's influence
add_image "$DATA_DIR/radiohead-nerd-listen1.json" \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/RadioheadO2211125_composite.jpg/500px-RadioheadO2211125_composite.jpg" \
  "Radiohead performing live — producer Nigel Godrich shaped their 'In Rainbows' sound"

# nerd-listen2: American Football (interlocking guitars) — album cover
add_image "$DATA_DIR/radiohead-nerd-listen2.json" \
  "https://coverartarchive.org/release/aa4983e3-f20f-48fd-a446-8230a71c470b/front-500" \
  "American Football's iconic debut — interlocking guitar patterns that echo 'Weird Fishes'"

# nerd-listen3: Spiritualized — album cover
add_image "$DATA_DIR/radiohead-nerd-listen3.json" \
  "https://coverartarchive.org/release/120e8aaa-dd52-470c-bacd-b07c948c3024/front-500" \
  "Spiritualized 'Ladies and Gentlemen We Are Floating in Space' — layered sonic grandeur"

echo ""
echo "Done! 18 images added (1 per set of 3 nuggets)."
