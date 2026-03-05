# Global Fixtures Design

## Summary

A shared Firestore document per season holds the canonical PL fixture list. Groups are seeded from it on creation and silently updated from it on every FixturesTab mount. Admin manual sync writes to the global first, propagating to all groups lazily on their next load.

---

## Section 1: Data Model

### Global fixture document

Key: `fixtures:PL:{season}` (e.g. `fixtures:PL:2025`)

```js
{
  season: 2025,
  updatedAt: 1740000000000,  // Unix ms — last written from API
  gameweeks: [
    { gw: 1, fixtures: [{ id, home, away, result, status, date, apiId }, ...] },
    { gw: 2, fixtures: [...] },
    // ...up to gw 38
  ]
}
```

One document per season. Only GWs that have been synced from the API are included; missing GWs are absent (groups fall back to `makeAllGWs`).

### Group document change

`group.lastAutoSync` (already exists) is repurposed: it now means "the last time this group merged from the global doc" (previously it meant "last API fetch"). Semantics are the same; no migration needed.

### api/db.js

Add `"fixtures:"` to `ALLOWED_PREFIXES`. No other backend changes.

---

## Section 2: Sync Flows

### A. Manual "Sync Fixtures" (admin)

The existing sync button flow, with one addition:

1. Admin clicks Sync, confirmation modal opens (unchanged)
2. On confirm: fetch current GW from API (`/api/fixtures?matchday={gw}&season={season}`)
3. **New:** write result into global doc — update/replace the matching `{ gw, fixtures }` entry and set `updatedAt = now`
4. Merge into this group immediately using the existing remap-by-team logic (unchanged)

The "Clear picks" option in the modal still applies to the group only; the global always stores the latest API data regardless.

### B. Auto-merge on FixturesTab mount (silent)

Replaces the current auto-sync useEffect. No API call involved.

1. Read `fixtures:PL:{season}` from Firestore
2. If `global.updatedAt > group.lastAutoSync` (or group has never synced): merge global into group for **all GWs**, set `group.lastAutoSync = now`
3. If global is absent or `updatedAt` is > 24h old AND the group hasn't synced recently: fall back to the old behaviour (fetch from API, write global, merge) — this covers the case where no admin has manually synced recently

### C. Group creation

When the setup panel opens:

1. Read `fixtures:PL:2025` (the active season)
2. If fresh: detect current GW from global's fixture dates (replaces the direct `/api/fixtures` call)
3. If absent/stale: fall back to direct `/api/fixtures?season=2025` call (same as today) and write global as a side-effect
4. On "Create Group →": build group with `makeAllGWs(2025)` as the base, then for each GW present in global, replace the fallback fixtures with global's real fixtures. Starting GW selector uses the detected current GW as the default.

---

## Section 3: Merge Logic

Used in both B (auto-merge) and C (group creation). Applied per-GW, non-destructive:

For each fixture in global's GW:
- **Match** by `apiId` (if set) or `home|away` team name against group's existing fixtures
- If matched: update `date`, `status`, `result`, `apiId` on the group fixture — **keep the group fixture's `id`** so prediction keys are never broken
- If no match (new fixture): append to group's GW fixtures with global's `id`

Group fixtures not present in global are left untouched (admin-added custom fixtures survive).

No prediction remapping needed — IDs never change on existing fixtures.

---

## Section 4: Edge Cases

| Scenario | Behaviour |
|---|---|
| Global doesn't exist yet | First admin to sync (or auto-sync fallback) creates it |
| Group was created before this feature | `lastAutoSync` is null → treated as "never synced" → merges on first mount |
| Two users open FixturesTab simultaneously | Both may write global/group; last write wins, data is identical, no loss |
| Admin edits a fixture manually after sync | Group fixture keeps admin's change; next merge only updates `date`/`status`/`result`/`apiId`, not `home`/`away` |
| GW not yet in global | Group keeps its `makeAllGWs` fallback fixtures for that GW |

---

## Files Changed

| File | Change |
|---|---|
| `api/db.js` | Add `"fixtures:"` to `ALLOWED_PREFIXES` |
| `src/App.jsx` | Manual sync writes to global; auto-sync useEffect becomes global-merge-only; group creation seeds from global; `GroupLobby` reads global for GW detection |
