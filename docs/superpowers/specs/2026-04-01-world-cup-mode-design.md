# World Cup Mode Design

## Overview

Add a World Cup 2026 competition mode. Users create a new standalone group and select "World Cup 2026" as the competition. All existing PL logic is unchanged; WC support is purely additive. A `competition` field on the group document drives every WC-specific code path.

---

## Data Model

### Group document additions

```js
{
  competition: "PL" | "WC",  // new field; omitted = "PL" for all existing groups
  season: 2026,               // WC groups use 2026
}
```

`competition` is absent on all existing groups. Every code path that reads it must default to `"PL"`.

### Fixture object additions

```js
{
  // existing fields unchanged
  id, home, away, result, status, date,

  // new WC fields (populated during API sync; undefined on PL fixtures)
  stage: "GROUP_STAGE" | "LAST_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "THIRD_PLACE" | "FINAL",
  homeCrest: "https://...",   // national team crest URL from API
  awayCrest: "https://...",   // national team crest URL from API
}
```

PL fixtures are never written with these fields. The logo display code checks fixture crest fields first, then falls back to `TEAM_BADGES[normName]` (the existing PL badge map).

### Global fixture cache

- PL: `fixtures:PL:{season}` (unchanged)
- WC: `fixtures:WC:2026`

### Round structure

WC groups use the same `gameweeks` array as PL groups. Each entry is `{ gw: N, season: 2026, fixtures: [...] }` where `gw` is the football-data.org matchday number. Expected matchdays for WC 2026:

| Matchday | Stage |
|----------|-------|
| 1 | Group Stage (matchday 1 of group stage) |
| 2 | Group Stage (matchday 2) |
| 3 | Group Stage (matchday 3) |
| 4 | Round of 32 |
| 5 | Round of 16 |
| 6 | Quarter-finals |
| 7 | Semi-finals |
| 8 | Third Place + Final |

8 placeholder rounds are created at group creation time using `makeWCRounds()`.

---

## New Helpers

### `makeWCRounds()`

Returns 8 gameweek objects (matchdays 1-8) for WC 2026, each with an empty fixtures array. Empty arrays are safe throughout the app: `computeStats` skips fixtures without results, `allFixturesFinished` checks `gwFixtures.length > 0` first, and the prediction wizard produces an empty queue for empty rounds.

```js
function makeWCRounds() {
  return Array.from({ length: 8 }, (_, i) => ({
    gw: i + 1,
    season: 2026,
    fixtures: [],
  }));
}
```

### `stageLabel(stage, matchday)`

Derives a display label for a WC round.

```js
function stageLabel(stage, matchday) {
  const map = {
    GROUP_STAGE: `Matchday ${matchday}`,
    LAST_32: "R32",
    ROUND_OF_16: "R16",
    QUARTER_FINAL: "QF",
    SEMI_FINAL: "SF",
    THIRD_PLACE: "3rd Place",
    FINAL: "Final",
  };
  return map[stage] || `Round ${matchday}`;
}
```

The `stage` is read from the first fixture in the round that has a `stage` field set. If none have it yet (placeholder rounds), falls back to `Round {matchday}`.

### `gwLabel(group, gwNum)`

Single function called everywhere "GW N" text is needed. Used in the GW strip, FixturesTab heading, recap banner, GroupLobby card, and sync messages.

```js
function gwLabel(group, gwNum) {
  if ((group.competition || "PL") === "PL") return `GW${gwNum}`;
  const gwObj = (group.gameweeks || []).find(g => g.gw === gwNum);
  const stage = (gwObj?.fixtures || []).find(f => f.stage)?.stage;
  return stageLabel(stage, gwNum);
}
```

---

## API Proxy Changes

`api/fixtures.js` accepts a `competition` query param (default `"PL"`):

```js
const competition = req.query.competition || "PL";
// live endpoint stays PL-only (no WC live scores needed)
url = `https://api.football-data.org/v4/competitions/${competition}/matches?season=${season}`;
```

`fetchMatchweek(apiKey, matchday, season, competition)` in App.jsx gains a fourth param defaulting to `"PL"`. The URL it builds passes `competition` through to the proxy. All existing call sites omit the param and are unaffected.

---

## Fixture Sync for WC

### Result field

football-data.org provides `score.fullTime`, `score.extraTime`, and `score.penalties` as separate fields. For WC:
- Group stage fixtures end at 90 min: use `score.fullTime`.
- Knockout fixtures that reach extra time: use `score.extraTime` (score after 90 + ET), falling back to `score.fullTime` if null.
- Penalties are ignored in scoring: the result is the scoreline after 90 + ET regardless of the shootout winner.

`parseMatchesToFixtures` (the function that maps API match objects to fixture objects) must handle this: for WC matches, check `score.extraTime` first (if stage is not `GROUP_STAGE` and extraTime is non-null), else use `score.fullTime`.

### `parseMatchesToFixtures` signature

`parseMatchesToFixtures` gains a third parameter: `competition` (default `"PL"`). When `competition === "WC"`, the function:
- Uses `wc-gw${matchday}-f${match.id}` as the fixture ID instead of the existing season-prefix format
- Writes `stage`, `homeCrest`, `awayCrest` fields from the match object
- Uses the ET-aware result resolution described above

```js
// updated signature
function parseMatchesToFixtures(matches, matchday, competition = "PL") { ... }
```

All existing call sites pass no third argument and are unaffected.

### Fixture mapping (WC)

```js
{
  id: `wc-gw${matchday}-f${match.id}`,
  home: normName(match.homeTeam.name),
  away: normName(match.awayTeam.name),
  result: resolvedResult,   // from extraTime or fullTime as above
  status: match.status,
  date: match.utcDate,
  stage: match.stage,
  homeCrest: match.homeTeam.crest,
  awayCrest: match.awayTeam.crest,
}
```

WC fixture IDs are prefixed `wc-` to avoid any collision with PL fixture IDs.

### TBD teams in knockout rounds

Before knockout pairings are decided, the API returns placeholder team names (e.g. `"Winner Match 49"`). These pass through `normName()` unchanged (no match in `TEAM_NAME_MAP`, no ` FC` suffix). They are stored and displayed as-is. Fixtures with these names have no `date` set yet, so locking logic leaves them open for predictions. Once real teams are confirmed the sync will update the names. This is acceptable UX for a prediction game -- predicting early on a TBD pairing is at the user's discretion.

### `mergeGlobalIntoGroup` and `regroupGlobalDoc`

`regroupGlobalDoc` is **not called** for WC syncs. WC matchdays are strictly assigned by FIFA and never rescheduled across matchday boundaries in the way PL fixtures are. Instead, WC sync does a direct replacement: for each matchday fetched, replace the global doc's fixture list for that matchday outright.

`mergeGlobalIntoGroup` is still called to apply the updated global doc to the group. However, its cross-GW deduplication pass (which removes a fixture from a group GW if the global doc assigns that `home|away` pair to a different GW) must be **skipped for WC groups**. This is necessary because knockout fixture team names start as TBD placeholders and change to real names after pairings are set. The old placeholder name would not match the updated global doc entry, causing the dedup pass to behave incorrectly. For WC the global doc is the direct authority per matchday, so dedup is not needed. Branch on `(group.competition || "PL") === "WC"` to skip the dedup pass.

### Auto-sync effect

The auto-sync `useEffect([activeSeason, group.currentGW])` in `FixturesTab` is gated on competition. For PL groups it runs exactly as today. For WC groups it uses a structurally identical path with these differences:

- `globalKey` = `fixtures:WC:2026`
- `targetMatchday` is resolved the same way as PL: `Math.max(...incompleteMatchdays.map(g => g.gw))` where incompleteMatchdays are WC gameweeks in season 2026 with at least one fixture without a result
- "Full season sync" triggers when `Array.from({length: targetMatchday - 1}, (_, i) => i + 1).some(n => !existingMatchdayNums.has(n))` — i.e. any matchday from 1 to `targetMatchday - 1` is missing from the global doc. This naturally caps at `targetMatchday - 1` (max 7), not a fixed 8
- "Per-matchday sync" otherwise fetches only `targetMatchday`
- Cooldown keys: `fixtures-full-sync:WC:2026` and `gw-api-sync:WC:2026:{matchday}`
- `regroupGlobalDoc` is skipped; direct replacement is used instead

The `fetchFromAPI` function (the "Sync Fixtures" button) also passes `competition` to `fetchMatchweek` and uses `fixtures:WC:2026` as the global doc key for WC groups.

`TEAM_NAME_MAP` is not used for WC teams (national team names from the API are already short). `normName()` is still called but will just strip ` FC` suffixes if present (harmless for country names).

---

## Group Creation UI

The create-group wizard in `GroupLobby` gains a competition step before the group name step:

- Two options: **Premier League** (default, existing flow) and **World Cup 2026**
- Selecting WC sets `competition: "WC"`, `season: 2026`, uses `makeWCRounds()` instead of `makeAllGWs()`, and removes the `startGW` selector (WC always starts at round 1)
- The group list in GroupLobby shows competition type and uses `gwLabel()` for the round indicator: `WC 2026 · 4 MEMBERS · R32`

---

## Round Navigation (GW Strip)

The GW strip in `FixturesTab` uses `gwLabel(group, gw)` for button labels. For WC groups, buttons read "Matchday 1", "R32", "QF", etc. For PL groups, nothing changes.

The strip width and scroll logic are unchanged. WC has only 8 rounds so no scrolling is needed.

The `<h1>` heading above the fixtures (currently "Gameweek {N}") uses `gwLabel()` for WC groups.

---

## Team Logo Display (`TeamBadge` component)

`TeamBadge` gains an optional `crest` prop. When provided, it renders the crest URL directly instead of looking up `TEAM_BADGES`. Call sites in `FixturesTab` and `AllPicksTable` pass `crest={f.homeCrest}` / `crest={f.awayCrest}` when rendering WC fixtures.

```jsx
// Updated TeamBadge signature
function TeamBadge({ team, crest, size }) {
  const src = crest || TEAM_BADGES[normName(team)];
  // render as before
}
```

PL call sites pass no `crest` prop and are unaffected.

---

## UI Text Changes

| Location | PL | WC |
|----------|----|----|
| GW strip button | GW1, GW2... | Matchday 1, R32, QF... |
| FixturesTab `<h1>` heading | Gameweek {N} | {gwLabel()} |
| GW recap banner | GW{N} RECAP | {gwLabel()} RECAP |
| GroupLobby group card | GW{N} | {gwLabel()} |
| Admin sync messages | Syncing GW{N}... | Syncing {gwLabel()}... |
| Lock picks key | `picks-locked:{id}:{user}:{season}:gw{N}` | unchanged (internal, not displayed) |

---

## Admin UI Changes (GroupTab)

The following PL-specific buttons are hidden when `group.competition === "WC"`:

- Create future GWs
- Create all GWs
- Sync all dates
- Start new season

"Delete current GW" remains available for WC groups (admin may want to remove a round). `deleteGW` must branch on `group.competition === "WC"` when generating replacement placeholder fixture IDs: use `wc-gw${gwToClear}-f${i}` instead of the existing `${season}-gw${gwToClear}-f${i}` formula. Without this, a WC group with `season: 2026` would produce `2026-gw4-f0` instead of `wc-gw4-f0`, breaking the `wc-` prefix convention used by all real WC fixture IDs.

The API key field and "Sync Fixtures" button remain available for WC groups.

---

## Scoring

`calcPts(pred, result)` is unchanged: `|pH-rH| + |pA-rA|`. For group stage WC fixtures the result is the 90-minute score. For knockout WC fixtures the result is the score after extra time (if played), ignoring the penalty shootout. This is handled at the point where the result string is written to the fixture during sync (see Fixture Sync section). No changes to `calcPts` itself.

---

## What Changes (summary)

- `api/fixtures.js` — add `competition` param
- `parseMatchesToFixtures` — add `competition` param, WC ID prefix, stage/crest fields, ET result logic
- `TeamBadge` — add optional `crest` prop
- `mergeGlobalIntoGroup` — skip cross-GW dedup pass for WC groups
- `deleteGW` — branch on `competition === "WC"` for placeholder ID prefix
- Auto-sync `useEffect` — WC path with `fixtures:WC:2026` key, 8-round ceiling, no `regroupGlobalDoc`
- `fetchFromAPI` ("Sync Fixtures") — pass `competition` and use WC global key for WC groups
- Group creation wizard — competition picker step
- GW strip, FixturesTab heading, recap banner, GroupLobby card — use `gwLabel()`
- GroupTab — hide PL-only admin buttons for WC groups

## What Is Not Changed

- `calcPts`, `computeStats`, all chart/trends logic
- Prediction wizard, lock-in picks, AllPicksTable visibility gate
- Weekly medals, GW recap computation logic
- Account system, password reset, email management
- Admin GW locking, prediction limits
- `regroupGlobalDoc` (not called for WC)
- All PL sync paths
- Firestore API proxy (`api/db.js`)
- Any existing group document (no migration needed)
