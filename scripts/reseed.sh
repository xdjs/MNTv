#!/bin/bash
# Re-seed all demo track nuggets by calling the live generate-nuggets edge function.
# Outputs JSON files to src/data/seed/

set -e

API_URL="https://rglhkxgknszkgdtzopsh.supabase.co/functions/v1/generate-nuggets"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbGhreGdrbnN6a2dkdHpvcHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzcwNzQsImV4cCI6MjA4ODIxMzA3NH0.Pil_lBTL8nRAWb2R4vLXbjFM4Dy5VPa3QYmtr_k5qcM"
SEED_DIR="$(dirname "$0")/../src/data/seed"

mkdir -p "$SEED_DIR"

# Demo tracks: slug|artist|title|album
TRACKS=(
  "daftpunk|Daft Punk|Around the World|Homework"
  "radiohead|Radiohead|Weird Fishes/Arpeggi|In Rainbows"
  "peterango|Pete Rango|Oms at Play|Savage Planet"
  "jameecornelia|Jamee Cornelia|SLACK|HARVEST"
  "kendrick|Kendrick Lamar|HUMBLE.|DAMN."
  "billie|Billie Eilish|bad guy|WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?"
)

TIERS=("casual" "curious" "nerd")
LISTENS=(1 2 3)

total=${#TRACKS[@]}
count=0

for entry in "${TRACKS[@]}"; do
  IFS='|' read -r slug artist title album <<< "$entry"
  count=$((count + 1))

  for tier in "${TIERS[@]}"; do
    prev_nuggets="[]"

    for listen in "${LISTENS[@]}"; do
      outfile="${SEED_DIR}/${slug}-${tier}-listen${listen}.json"
      echo "[$count/$total] ${artist} - ${title} (${tier}, listen ${listen})..."

      body=$(cat <<ENDJSON
{
  "artist": "$artist",
  "title": "$title",
  "album": "$album",
  "tier": "$tier",
  "listenCount": $listen,
  "previousNuggets": $prev_nuggets
}
ENDJSON
)

      response=$(curl -s --max-time 180 \
        -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -H "apikey: $API_KEY" \
        -H "Authorization: Bearer $API_KEY" \
        -d "$body")

      # Check for error
      if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'nuggets' in d else 1)" 2>/dev/null; then
        echo "$response" | python3 -m json.tool > "$outfile"
        echo "  -> Saved $outfile"

        # Extract headlines for previousNuggets on next listen
        prev_nuggets=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
headlines = [n.get('headline','') for n in d.get('nuggets',[])]
# Merge with existing
existing = json.loads('$prev_nuggets')
print(json.dumps(existing + headlines))
")
      else
        echo "  !! FAILED: $response"
        echo "$response" > "${outfile}.error"
      fi

      # Rate limit: wait between calls
      sleep 2
    done
  done
done

echo ""
echo "Done! Seeded files in $SEED_DIR"
