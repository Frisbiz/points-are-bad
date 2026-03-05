# Fixture Date Re-grouping Design

## Goal

Fixtures displaced by PL rescheduling appear in the week they're actually played, not their API-assigned matchday. Users can make picks for every match happening that week. No fixture appears in more than one GW.

## Problem

The football-data.org API assigns fixtures to matchdays by the official PL calendar. When a match is rescheduled to an earlier date it keeps its original matchday. By the time that matchday arrives the match is already over and no picks were possible.

---

## Auto-Sync Changes

**Target GW selection:**
Find `targetGW` = highest-numbered GW in the active season where at least one fixture has no result yet. This is the "live" GW — the one users are actively predicting.

**Hourly cooldown:**
Use localStorage key `gw-api-sync:{season}:{gw}` to store the last API call timestamp. If less than 1 hour ago, skip the API call but still check if the global doc is newer than `group.lastAutoSync` and merge if so.

**On API call:**
1. Fetch `targetGW` from football-data.org
2. Write timestamp to localStorage
3. Update the global doc entry for `targetGW` (see Global Doc Update below)
4. If `globalDoc.updatedAt > group.lastAutoSync`, merge global doc into group

**Dependency change:** Auto-sync useEffect deps change from `[activeSeason]` to `[activeSeason, group.currentGW]` so it re-runs when the admin advances the current GW.

---

## Manual Sync Changes

After fetching and applying fixtures to the current group (existing behaviour unchanged), also update the global doc entry for the viewed GW using the same Global Doc Update logic below. This propagates the sync to all other groups automatically.

---

## Global Doc Per-GW Update

Function: `updateGlobalDocGW(globalDoc, gwNum, newFixtures)`

1. Load existing global doc from Firestore (or start with `{ season, updatedAt: 0, gameweeks: [] }`)
2. Apply date re-grouping to `newFixtures` against the existing global doc (see below)
3. Replace the `gwNum` entry in `globalDoc.gameweeks` with the re-grouped fixtures
4. Also update any other GW entries that received re-assigned fixtures
5. Set `globalDoc.updatedAt = Date.now()`
6. Write back to Firestore

---

## Date Re-grouping Algorithm

Applied when writing a GW to the global doc.

```
THRESHOLD = 14 days

1. Compute median date of the incoming fixtures for this GW
2. For each fixture:
   a. If fixture.date < (median - THRESHOLD):
      - Look at all other GWs already in the global doc
      - Compute median date for each of those GWs
      - Find the GW whose median is closest to fixture.date
      - If that GW exists in the global doc, mark fixture for move to that GW
3. Remove marked fixtures from the current GW's list
4. Add marked fixtures to their target GW's list in the global doc
   (create the entry if missing — but only if at least one other fixture
    from that GW already exists, to avoid orphan single-fixture GWs)
```

If fewer than 3 fixtures remain in the current GW after removal, abort re-grouping for this sync (not enough data to compute a reliable median).

---

## mergeGlobalIntoGroup Changes

Add a cross-GW deduplication pass after the existing per-GW merge.

**Build a global fixture index:**
```
globalTeamPairToGW: { "Arsenal|Wolves": 26, "Liverpool|Chelsea": 31, ... }
```
Maps every `home|away` pair in the global doc to its assigned GW number.

**Deduplication pass:**
For each GW in the group's gameweeks:
  For each fixture in that GW:
    If the fixture's `home|away` pair exists in globalTeamPairToGW under a DIFFERENT GW number:
      - If the fixture has no picks (check `hasPick(fixture.id)`): remove it from this GW
      - If it has picks: leave it (do not create duplicates — the pick is preserved in its original GW until the admin manually resolves)

This ensures a fixture only appears in one GW after merging.

---

## No-Duplicate Guarantee

1. Global doc: `updateGlobalDocGW` removes a re-assigned fixture from its source GW before adding it to the target GW
2. Group doc: `mergeGlobalIntoGroup` deduplication pass removes the fixture from the old GW when the global doc has it under a new GW
3. Edge case: fixture has picks in old GW → left in place, not moved. User keeps their pick. Admin can manually resolve with the sync modal if needed.

---

## What Does Not Change

- Sync modal UX (keep/clear picks options) — unchanged
- `fetchFromAPI` function signature — unchanged
- `parseMatchesToFixtures` — unchanged
- Group document structure — unchanged
- Prediction locking logic — unchanged
