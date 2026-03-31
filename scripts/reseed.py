#!/usr/bin/env python3
"""Re-seed all demo track nuggets by calling the live generate-nuggets edge function."""

import json
import os
import sys
import time
import urllib.request
import urllib.error

API_URL = "https://rglhkxgknszkgdtzopsh.supabase.co/functions/v1/generate-nuggets"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbGhreGdrbnN6a2dkdHpvcHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzcwNzQsImV4cCI6MjA4ODIxMzA3NH0.Pil_lBTL8nRAWb2R4vLXbjFM4Dy5VPa3QYmtr_k5qcM"

SEED_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data", "seed")

TRACKS = [
    ("daftpunk", "Daft Punk", "Around the World", "Homework"),
    ("radiohead", "Radiohead", "Weird Fishes/Arpeggi", "In Rainbows"),
    ("peterango", "Pete Rango", "Oms at Play", "Savage Planet"),
    ("jameecornelia", "Jamee Cornelia", "SLACK", "HARVEST"),
    ("kendrick", "Kendrick Lamar", "HUMBLE.", "DAMN."),
    ("billie", "Billie Eilish", "bad guy", "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?"),
]

TIERS = ["casual", "curious", "nerd"]
LISTENS = [1, 2, 3]
MAX_RETRIES = 2


def call_generate_nuggets(artist, title, album, tier, listen_count, previous_nuggets):
    body = json.dumps({
        "artist": artist,
        "title": title,
        "album": album,
        "tier": tier,
        "listenCount": listen_count,
        "previousNuggets": previous_nuggets,
    }).encode()

    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "apikey": API_KEY,
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )

    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode())
                if "nuggets" in data:
                    return data
                print(f"    Unexpected response (attempt {attempt+1}): {json.dumps(data)[:200]}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            print(f"    HTTP {e.code} (attempt {attempt+1}): {err_body[:200]}")
        except Exception as e:
            print(f"    Error (attempt {attempt+1}): {e}")

        if attempt < MAX_RETRIES:
            print(f"    Retrying in 5s...")
            time.sleep(5)

    return None


def main():
    os.makedirs(SEED_DIR, exist_ok=True)
    total = len(TRACKS)
    failed = []
    succeeded = 0

    for idx, (slug, artist, title, album) in enumerate(TRACKS, 1):
        for tier in TIERS:
            previous_nuggets = []

            for listen in LISTENS:
                outfile = os.path.join(SEED_DIR, f"{slug}-{tier}-listen{listen}.json")
                print(f"[{idx}/{total}] {artist} - {title} ({tier}, listen {listen})...")

                data = call_generate_nuggets(artist, title, album, tier, listen, previous_nuggets)

                if data:
                    with open(outfile, "w") as f:
                        json.dump(data, f, indent=2)
                    print(f"    Saved {os.path.basename(outfile)} ({len(data.get('nuggets', []))} nuggets)")
                    succeeded += 1

                    # Collect headlines for dedup on next listen
                    for n in data.get("nuggets", []):
                        h = n.get("headline", "")
                        if h:
                            previous_nuggets.append(h)
                else:
                    failed.append(f"{slug}-{tier}-listen{listen}")
                    print(f"    FAILED - will need manual re-run")

                # Rate limit
                time.sleep(2)

    print(f"\nDone! {succeeded} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed files:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
