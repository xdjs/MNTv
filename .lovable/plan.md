

# Full Plan: Structured Nuggets + Progressive Depth + Dev Panel Controls

This plan restructures how MusicNerd generates and presents nuggets into a predictable 3-part format, adds listen history so content evolves across replays, and adds dev controls to test it all.

---

## Part 1: Database — `nugget_history` Table

Create a new table to track what the user has already seen per track.

```sql
CREATE TABLE nugget_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_key TEXT NOT NULL UNIQUE,          -- "artist::title"
  listen_count INTEGER DEFAULT 1,
  previous_nuggets JSONB DEFAULT '[]',     -- array of headline strings already shown
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE nugget_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON nugget_history FOR ALL USING (true) WITH CHECK (true);
```

No auth — this is a single-user TV app. The table just persists listen state across sessions.

---

## Part 2: New Nugget Kind Types

**File: `src/mock/types.ts`**

Change the `Nugget.kind` type from:
```
"process" | "constraint" | "pattern" | "human" | "influence" | "discovery"
```
to:
```
"artist" | "track" | "discovery"
```

This enforces the fixed 3-nugget structure everywhere.

---

## Part 3: Edge Function — Restructured Prompt + Depth Tiers

**File: `supabase/functions/generate-nuggets/index.ts`**

**Request body changes:** Accept two new optional fields: `listenCount` (number) and `previousNuggets` (string array of past headlines).

**Prompt rewrite** (standard nugget generation only, deep dive stays the same):

The prompt will enforce exactly 3 nuggets in order:
1. **Nugget 1 — `kind: "artist"`**: About the artist — their story, creative philosophy, world. `listenFor: false`.
2. **Nugget 2 — `kind: "track"`**: About this specific track — production, meaning, history, audio moment. `listenFor: true`.
3. **Nugget 3 — `kind: "discovery"`**: A specific recommendation — name the exact track/album/artist and explain the connection. `listenFor: false`.

**Depth tiers based on `listenCount`:**
- **1 (or undefined)**: "This is the listener's FIRST TIME hearing this track. Be introductory and welcoming. Set the stage — who is this artist, what's the basic story of this song, and what's one obvious next listen."
- **2**: "The listener has heard this before. Skip the basics. Go deeper — surprising production details, lesser-known connections, a more adventurous recommendation."
- **3+**: "The listener keeps coming back. Give them deep cuts — obscure influences, technical breakdowns, unexpected cultural connections, niche recommendations only a true nerd would know."

**Non-repetition:** If `previousNuggets` is provided, add: "DO NOT repeat or closely rephrase any of these previously shown headlines: [list]. Generate completely fresh angles."

**`GeminiNugget` interface update:** Change `kind` to `"artist" | "track" | "discovery"`.

---

## Part 4: Frontend Hook — Listen History Integration

**File: `src/hooks/useAINuggets.ts`**

Before calling the edge function:
1. Query `nugget_history` for `track_key = "${artist}::${title}"`
2. If found, extract `listen_count` and `previous_nuggets`
3. Pass `listenCount` and `previousNuggets` to the edge function request body

After successful generation:
1. Upsert `nugget_history`:
   - If new: insert with `listen_count: 1`, `previous_nuggets: [new headlines]`
   - If existing: increment `listen_count`, append new headlines to `previous_nuggets`, update `updated_at`

Also update `AINuggetData.kind` type to `"artist" | "track" | "discovery"`.

Expose `listenCount` in the return value so DevPanel and UI can use it.

---

## Part 5: NuggetCard Label Updates

**File: `src/components/NuggetCard.tsx`**

Replace `kindLabels`:
```ts
const kindLabels: Record<string, string> = {
  artist: "The Artist",
  track: "The Track",
  discovery: "Explore Next",
};
```

Keep the Compass icon for `discovery` kind. No other structural changes to the card.

---

## Part 6: NuggetDeepDive Label Updates

**File: `src/components/overlays/NuggetDeepDive.tsx`**

Update `kindLabels` (line 16-23) to match:
```ts
const kindLabels: Record<string, string> = {
  artist: "The Artist",
  track: "The Track",
  discovery: "Explore Next",
};
```

---

## Part 7: Dev Panel — Listen Depth Controls

**File: `src/components/DevPanel.tsx`**

Add new props: `listenCount`, `trackKey`, `onResetHistory`, `onResetAllHistory`, `onIncrementListen`.

Add a "Listen Depth" section showing:
- Current listen count displayed as "Listen #N"
- **Reset** button — calls `onResetHistory()` which deletes the current track's `nugget_history` row and re-generates nuggets
- **Reset All** button — calls `onResetAllHistory()` which clears the entire table
- **+1** button — calls `onIncrementListen()` which bumps the count and re-generates

**File: `src/pages/Listen.tsx`**

Wire the new DevPanel props:
- Pass `listenCount` from `useAINuggets` return value
- Pass `trackKey` as `"${track.artist}::${track.title}"`
- `onResetHistory`: delete from `nugget_history` where `track_key` matches, then re-trigger the hook (via a `regenerateKey` state counter)
- `onResetAllHistory`: delete all rows from `nugget_history`, re-trigger
- `onIncrementListen`: manually update `listen_count` +1 in `nugget_history`, re-trigger

The hook will accept an optional `regenerateKey` dependency so bumping it forces a fresh generation cycle.

---

## Summary of Files Changed

| File | Change |
|---|---|
| Database migration | Create `nugget_history` table |
| `src/mock/types.ts` | Update `Nugget.kind` union type |
| `supabase/functions/generate-nuggets/index.ts` | Restructure prompt, accept `listenCount`/`previousNuggets`, enforce 3-nugget format with depth tiers |
| `src/hooks/useAINuggets.ts` | Query/upsert `nugget_history`, pass depth params, expose `listenCount` |
| `src/components/NuggetCard.tsx` | Update `kindLabels` to artist/track/discovery |
| `src/components/overlays/NuggetDeepDive.tsx` | Update `kindLabels` to match |
| `src/components/DevPanel.tsx` | Add Listen Depth section with Reset / Reset All / +1 buttons |
| `src/pages/Listen.tsx` | Wire new DevPanel props and reset/increment callbacks |

