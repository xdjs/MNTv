#!/usr/bin/env bash
# seed-daftpunk-radiohead.sh — Regenerate nuggets + companions for Daft Punk and Radiohead.
# Resumes from where it left off — skips any calls that already have a response file.

set -uo pipefail

SUPABASE_URL="https://rglhkxgknszkgdtzopsh.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbGhreGdrbnN6a2dkdHpvcHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzcwNzQsImV4cCI6MjA4ODIxMzA3NH0.Pil_lBTL8nRAWb2R4vLXbjFM4Dy5VPa3QYmtr_k5qcM"

NUGGETS_URL="$SUPABASE_URL/functions/v1/generate-nuggets"
COMPANION_URL="$SUPABASE_URL/functions/v1/generate-companion"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/seed-data"
mkdir -p "$DATA_DIR"

KIND_TO_CATEGORY='{"artist":"history","track":"track","discovery":"explore"}'

# Only Daft Punk and Radiohead
declare -a SLUGS=("daftpunk" "radiohead")
declare -a ARTISTS=("Daft Punk" "Radiohead")
declare -a TITLES=("Around the World" "Weird Fishes/Arpeggi")
declare -a ALBUMS=("Homework" "In Rainbows")
declare -a TRACK_IDS=(
  "real::Daft Punk::Around the World::Homework::spotify:track:1pKYYY0dkg23sQQXi0Q5zN"
  "real::Radiohead::Weird Fishes/Arpeggi::In Rainbows::spotify:track:4tha3dahOS9LhTxKn4JYLC"
)
TIERS=("casual" "curious" "nerd")

echo "========================================"
echo "  Phase 1: Generate nuggets"
echo "  Saving to: $DATA_DIR"
echo "========================================"
echo ""

for i in "${!ARTISTS[@]}"; do
  slug="${SLUGS[$i]}"
  artist="${ARTISTS[$i]}"
  title="${TITLES[$i]}"
  album="${ALBUMS[$i]}"

  # Accumulate headlines across ALL tiers for this track to prevent cross-tier repetition
  all_track_headlines="[]"

  for tier in "${TIERS[@]}"; do
    previous_headlines="$all_track_headlines"

    for listen in 1 2 3; do
      outfile="$DATA_DIR/${slug}-${tier}-listen${listen}.json"

      if [ -f "$outfile" ] && [ -s "$outfile" ]; then
        nugget_count=$(jq '.nuggets | length' "$outfile" 2>/dev/null || echo "0")
        if [ "$nugget_count" -gt 0 ]; then
          echo "  SKIP $slug/$tier/listen$listen — already have $nugget_count nuggets"
          new_hl=$(jq '[.nuggets[]?.headline // empty]' "$outfile" 2>/dev/null || echo '[]')
          previous_headlines=$(echo "$previous_headlines $new_hl" | jq -s 'add' 2>/dev/null || echo '[]')
          all_track_headlines="$previous_headlines"
          continue
        fi
      fi

      echo -n "  CALL $slug/$tier/listen$listen ... "

      response=$(curl -sS --max-time 180 "$NUGGETS_URL" \
        -H "Authorization: Bearer $ANON_KEY" \
        -H "apikey: $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
          --arg artist "$artist" \
          --arg title "$title" \
          --arg album "$album" \
          --arg tier "$tier" \
          --argjson listenCount "$listen" \
          --argjson previousNuggets "$previous_headlines" \
          '{artist: $artist, title: $title, album: $album, tier: $tier, listenCount: $listenCount, previousNuggets: $previousNuggets}'
        )" 2>&1)

      # Check for errors
      error_msg=$(echo "$response" | jq -r '.error // empty' 2>/dev/null || true)
      if [ -n "$error_msg" ]; then
        echo "ERROR: $error_msg"
        sleep 5
        continue
      fi

      nugget_count=$(echo "$response" | jq '.nuggets | length' 2>/dev/null || echo "0")
      if [ "$nugget_count" -eq 0 ]; then
        echo "WARNING: 0 nuggets returned"
        sleep 5
        continue
      fi

      echo "$response" > "$outfile"
      echo "OK ($nugget_count nuggets)"

      new_hl=$(jq '[.nuggets[]?.headline // empty]' "$outfile" 2>/dev/null || echo '[]')
      previous_headlines=$(echo "$previous_headlines $new_hl" | jq -s 'add' 2>/dev/null || echo '[]')
      all_track_headlines="$previous_headlines"

      sleep 5
    done
  done
done

echo ""
echo "========================================"
echo "  Phase 2: Generate companion pages"
echo "========================================"
echo ""

for i in "${!ARTISTS[@]}"; do
  slug="${SLUGS[$i]}"
  artist="${ARTISTS[$i]}"
  title="${TITLES[$i]}"
  album="${ALBUMS[$i]}"

  for tier in "${TIERS[@]}"; do
    comp_outfile="$DATA_DIR/${slug}-${tier}-companion.json"

    if [ -f "$comp_outfile" ] && [ -s "$comp_outfile" ]; then
      has_summary=$(jq 'has("artistSummary")' "$comp_outfile" 2>/dev/null || echo "false")
      if [ "$has_summary" = "true" ]; then
        echo "  SKIP $slug/$tier companion — already cached"
        continue
      fi
    fi

    all_companion_nuggets="[]"
    for listen in 1 2 3; do
      nfile="$DATA_DIR/${slug}-${tier}-listen${listen}.json"
      if [ ! -f "$nfile" ]; then continue; fi

      now_ms=$(date +%s)000
      batch=$(jq --argjson level "$listen" --argjson now "$now_ms" --argjson kindMap "$KIND_TO_CATEGORY" '
        [.nuggets // [] | to_entries[] | {
          id: ("seed-\($level)-\(.key)"),
          timestamp: ($now - (.key * 60000)),
          headline: .value.headline,
          text: .value.text,
          category: ($kindMap[.value.kind] // "track"),
          listenUnlockLevel: $level,
          sourceName: (.value.source.publisher // ""),
          sourceUrl: (.value.source.url // ""),
          imageUrl: (.value.imageUrl // null),
          imageCaption: (.value.imageCaption // null)
        }]' "$nfile" 2>/dev/null || echo '[]')

      all_companion_nuggets=$(echo "$all_companion_nuggets $batch" | jq -s 'add' 2>/dev/null || echo '[]')
    done

    nugget_total=$(echo "$all_companion_nuggets" | jq 'length' 2>/dev/null || echo "0")
    echo -n "  CALL $slug/$tier companion ($nugget_total nuggets) ... "

    comp_response=$(curl -sS --max-time 120 "$COMPANION_URL" \
      -H "Authorization: Bearer $ANON_KEY" \
      -H "apikey: $ANON_KEY" \
      -H "Content-Type: application/json" \
      -d "$(jq -n \
        --arg artist "$artist" \
        --arg title "$title" \
        --arg album "$album" \
        --arg tier "$tier" \
        --argjson prebuiltNuggets "$all_companion_nuggets" \
        '{artist: $artist, title: $title, album: $album, listenCount: 1, tier: $tier, prebuiltNuggets: $prebuiltNuggets}'
      )" 2>&1)

    error_msg=$(echo "$comp_response" | jq -r '.error // empty' 2>/dev/null || true)
    if [ -n "$error_msg" ]; then
      echo "ERROR: $error_msg"
    else
      echo "$comp_response" > "$comp_outfile"
      echo "OK"
    fi

    sleep 3
  done
done

echo ""
echo "========================================"
echo "  Phase 3: Copy to src/data/seed/"
echo "========================================"
echo ""

SRC_SEED_DIR="$SCRIPT_DIR/../src/data/seed"
mkdir -p "$SRC_SEED_DIR"
cp "$DATA_DIR"/{daftpunk,radiohead}-*.json "$SRC_SEED_DIR/" 2>/dev/null && echo "  Copied to src/data/seed/" || echo "  No files to copy"

echo ""
echo "========================================"
echo "  Done! Checking results..."
echo "========================================"
echo ""

echo "Files generated:"
ls -1 "$DATA_DIR"/{daftpunk,radiohead}-*.json 2>/dev/null | sort
echo ""
echo "Nugget counts:"
for f in "$DATA_DIR"/{daftpunk,radiohead}-*-listen*.json; do
  [ -f "$f" ] || continue
  count=$(jq '.nuggets | length' "$f" 2>/dev/null || echo "?")
  img_count=$(jq '[.nuggets[] | select(.imageUrl != null)] | length' "$f" 2>/dev/null || echo "0")
  echo "  $(basename "$f"): $count nuggets, $img_count with images"
done
