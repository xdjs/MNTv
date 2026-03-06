#!/usr/bin/env bash
# seed-demo.sh — Pre-generate nugget + companion caches for 2 demo tracks × 3 tiers.
#
# This script calls the Supabase edge functions to populate:
#   - nugget_cache (tier-scoped: trackId::tier)
#   - companion_cache (artist::title::tier::listenTier)
#
# After running, switching tiers in the demo loads from cache instantly (no API calls).
#
# Usage:  ./scripts/seed-demo.sh
# Requires: curl, jq

set -euo pipefail

SUPABASE_URL="https://rglhkxgknszkgdtzopsh.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbGhreGdrbnN6a2dkdHpvcHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzcwNzQsImV4cCI6MjA4ODIxMzA3NH0.Pil_lBTL8nRAWb2R4vLXbjFM4Dy5VPa3QYmtr_k5qcM"

NUGGETS_URL="$SUPABASE_URL/functions/v1/generate-nuggets"
COMPANION_URL="$SUPABASE_URL/functions/v1/generate-companion"
REST_URL="$SUPABASE_URL/rest/v1"

# Demo tracks
declare -a ARTISTS=("Daft Punk"         "Radiohead")
declare -a TITLES=("Around the World"   "Weird Fishes/Arpeggi")
declare -a ALBUMS=("Homework"           "In Rainbows")
declare -a TRACK_IDS=(
  "real::Daft%20Punk::Around%20the%20World::Homework::spotify:track:1pKYYY0dkg23sQQXi0Q5zN"
  "real::Radiohead::Weird%20Fishes%2FArpeggi::In%20Rainbows::spotify:track:4tha3dahOS9LhTxKn4JYLC"
)

TIERS=("casual" "curious" "nerd")

KIND_TO_CATEGORY='{"artist":"history","track":"track","discovery":"explore"}'

call_nuggets() {
  local artist="$1" title="$2" album="$3" tier="$4" listen_count="$5"
  local previous_nuggets="$6"  # JSON array string

  echo "  [nuggets] $artist — $title | tier=$tier listen=$listen_count" >&2

  curl -sS "$NUGGETS_URL" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg artist "$artist" \
      --arg title "$title" \
      --arg album "$album" \
      --arg tier "$tier" \
      --argjson listenCount "$listen_count" \
      --argjson previousNuggets "$previous_nuggets" \
      '{artist: $artist, title: $title, album: $album, tier: $tier, listenCount: $listenCount, previousNuggets: $previousNuggets}'
    )"
}

call_companion() {
  local artist="$1" title="$2" album="$3" tier="$4" prebuilt_nuggets="$5"

  echo "  [companion] $artist — $title | tier=$tier ($(echo "$prebuilt_nuggets" | jq 'length') nuggets)" >&2

  curl -sS "$COMPANION_URL" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg artist "$artist" \
      --arg title "$title" \
      --arg album "$album" \
      --arg tier "$tier" \
      --argjson prebuiltNuggets "$prebuilt_nuggets" \
      '{artist: $artist, title: $title, album: $album, listenCount: 1, tier: $tier, prebuiltNuggets: $prebuiltNuggets}'
    )" > /dev/null
}

# Write nuggets directly to nugget_cache via Supabase REST API.
# The generate-nuggets edge function does NOT write to nugget_cache — the client does.
# For seeding, we write directly using the tier-scoped key format: trackId::tier
write_nugget_cache() {
  local track_id="$1" tier="$2" nuggets_json="$3"
  local cache_key="${track_id}::${tier}"

  # Build the nuggets array and sources map in the format useAINuggets.ts expects
  local nuggets_for_cache sources_for_cache
  nuggets_for_cache=$(echo "$nuggets_json" | jq --arg tid "$track_id" '
    [.nuggets // [] | to_entries[] | {
      id: "ai-nug-\($tid)-\(.key)",
      trackId: $tid,
      timestampSec: (20 + ((.key + 1) * 60)),
      durationMs: 7000,
      headline: .value.headline,
      text: .value.text,
      kind: .value.kind,
      listenFor: (.value.listenFor // false),
      sourceId: "ai-src-\($tid)-\(.key)",
      imageUrl: (.value.imageUrl // null),
      imageCaption: (.value.imageCaption // null)
    }]')

  sources_for_cache=$(echo "$nuggets_json" | jq --arg tid "$track_id" '
    [.nuggets // [] | to_entries[] | {
      key: "ai-src-\($tid)-\(.key)",
      value: {
        id: "ai-src-\($tid)-\(.key)",
        type: .value.source.type,
        title: .value.source.title,
        publisher: .value.source.publisher,
        url: (.value.source.url // null),
        embedId: (.value.source.embedId // null),
        quoteSnippet: (.value.source.quoteSnippet // null),
        locator: (.value.source.locator // null)
      }
    }] | from_entries')

  # Upsert into nugget_cache
  local upsert_body
  upsert_body=$(jq -n \
    --arg track_id "$cache_key" \
    --argjson nuggets "$nuggets_for_cache" \
    --argjson sources "$sources_for_cache" \
    '{track_id: $track_id, nuggets: $nuggets, sources: $sources, status: "ready"}')

  local http_code
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" \
    "$REST_URL/nugget_cache?on_conflict=track_id" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -X POST \
    -d "$upsert_body")

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "    ✓ nugget_cache written: $cache_key"
  else
    echo "    ⚠ nugget_cache write failed (HTTP $http_code): $cache_key"
  fi
}

# Transform AI nuggets response into companion nuggets format
transform_to_companion() {
  local nuggets_json="$1" listen_level="$2"
  local now_ms
  now_ms=$(date +%s)000

  echo "$nuggets_json" | jq --argjson level "$listen_level" --argjson now "$now_ms" \
    --argjson kindMap "$KIND_TO_CATEGORY" '
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
    }]'
}

echo "========================================"
echo "  MusicNerd Demo Seed Script"
echo "  2 tracks × 3 tiers × 3 listens"
echo "========================================"
echo ""

total_calls=0

for i in "${!ARTISTS[@]}"; do
  artist="${ARTISTS[$i]}"
  title="${TITLES[$i]}"
  album="${ALBUMS[$i]}"
  track_id="${TRACK_IDS[$i]}"

  echo "━━━ $artist — $title ━━━"

  for tier in "${TIERS[@]}"; do
    echo ""
    echo "  ── Tier: $tier ──"

    all_companion_nuggets="[]"
    previous_headlines="[]"
    listen1_response=""

    for listen in 1 2 3; do
      # Generate nuggets for this listen
      nuggets_response=$(call_nuggets "$artist" "$title" "$album" "$tier" "$listen" "$previous_headlines")
      total_calls=$((total_calls + 1))

      # Check for errors
      error_msg=$(echo "$nuggets_response" | jq -r '.error // empty' 2>/dev/null || true)
      if [ -n "$error_msg" ]; then
        echo "    ⚠ Error: $error_msg"
        continue
      fi

      # Save listen-1 response for nugget_cache write
      if [ "$listen" -eq 1 ]; then
        listen1_response="$nuggets_response"
      fi

      # Extract headlines for dedup in next listen
      new_headlines=$(echo "$nuggets_response" | jq '[.nuggets[]?.headline // empty]' 2>/dev/null || echo '[]')
      previous_headlines=$(echo "$previous_headlines $new_headlines" | jq -s 'add' 2>/dev/null || echo '[]')

      # Transform to companion format
      companion_batch=$(transform_to_companion "$nuggets_response" "$listen" 2>/dev/null || echo '[]')
      all_companion_nuggets=$(echo "$all_companion_nuggets $companion_batch" | jq -s 'add' 2>/dev/null || echo '[]')

      nugget_count=$(echo "$nuggets_response" | jq '.nuggets | length' 2>/dev/null || echo '?')
      echo "    ✓ Listen #$listen: $nugget_count nuggets"

      # Small delay to avoid rate limiting
      sleep 2
    done

    # Write listen-1 nuggets to nugget_cache (tier-scoped key) so the Listen page
    # loads them instantly on first visit
    if [ -n "$listen1_response" ]; then
      write_nugget_cache "$track_id" "$tier" "$listen1_response"
    fi

    # Now generate companion content with all accumulated nuggets
    echo ""
    call_companion "$artist" "$title" "$album" "$tier" "$all_companion_nuggets"
    total_calls=$((total_calls + 1))
    echo "    ✓ Companion cached with $(echo "$all_companion_nuggets" | jq 'length') nuggets"

    sleep 2
  done
  echo ""
done

echo ""
echo "========================================"
echo "  Done! $total_calls API calls made."
echo "  Caches populated for instant demo."
echo "========================================"
