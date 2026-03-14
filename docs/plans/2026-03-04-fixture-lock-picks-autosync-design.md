# Fixture Lock Visuals, Lock Picks Button, and Auto-Sync Design

## Summary

Three related improvements to the Fixtures tab:
1. Visual dimming on locked fixture cards
2. Explicit "Lock In Picks" button before revealing all-picks table
3. Client-triggered silent auto-sync of the current GW once per day

---

## Section 1: Visual lock indicator

When a fixture is locked (`f.result` set, status is FINISHED/IN_PLAY/PAUSED, or `f.date <= now`), the fixture card is visually dimmed:

- Card opacity reduced to ~0.55 in the desktop grid layout
- Mobile card border colour uses `var(--border3)` instead of the default, plus reduced opacity

No emoji or badge. The existing read-only pick input already signals the lock; the dim is the visual complement.

**Implementation:** In `FixturesTab`, where each fixture card/row is rendered, apply `opacity: locked ? 0.55 : 1` to the outermost card element. The `locked` boolean is already computed per fixture.

---

## Section 2: Lock picks button

### Trigger condition

The button appears when ALL of the following are true:
- `unpickedUnlocked.length === 0` (all unlocked fixtures have a prediction)
- `!picksLocked` (user has not yet locked this GW)
- `!allFixturesFinished` (not every fixture in the GW has a result - i.e. this isn't a fully completed past GW)

Where `allFixturesFinished = gwFixtures.length > 0 && gwFixtures.every(f => !!f.result)`.

### After locking

- All pick inputs become read-only for the current GW (even fixtures without a result yet)
- AllPicksTable is shown (removing the existing `gwFixtures.some(f=>f.result)` gate when locked)

### Past GW auto-reveal (unchanged)

For GWs where `allFixturesFinished && canViewAllPicks`, the AllPicksTable auto-reveals without requiring the button. This preserves the existing behaviour for completed gameweeks.

### Persistence

localStorage key: `picks-locked:${group.id}:${user.username}:${activeSeason}:gw${currentGW}`

Value: `true`. Checked and set in `FixturesTab`. Cleared automatically by switching GW (the key is GW-scoped).

### UI placement

The button renders below all fixture cards, above the AllPicksTable section. Style: full-width `Btn` with `variant="success"`, label `LOCK IN PICKS`, with a small note beneath: "You won't be able to change your picks after locking."

---

## Section 3: Client-triggered auto-sync

### Data

New field on the group document: `lastAutoSync` (Unix timestamp, ms). Set to `Date.now()` after each successful auto-sync.

### Trigger

`useEffect` in `FixturesTab`, dependent on `[currentGW, activeSeason]`. On run:

1. Check `group.lastAutoSync` - if within the last 24 hours, skip.
2. Fetch current GW fixtures from `GET /api/fixtures?matchday=${currentGW}&season=${activeSeason}`.
3. Parse with `parseMatchesToFixtures`.
4. Call `updateGroup` to remap predictions and update fixtures (same "keep picks / remap by team" logic as the manual sync).
5. Write `lastAutoSync: Date.now()` into the group doc within the same `updateGroup` call.

### Silent

No loading indicator, no toast, no message. Errors are swallowed silently (the manual sync button remains available as fallback).

### Scope

Only syncs `currentGW` for `activeSeason`. Does not touch other GWs or seasons.

### Race condition

Benign: two simultaneous users may both trigger. The second write simply overwrites with the same fixture data. No data is lost.

---

## Files Changed

| File | Change |
|---|---|
| `src/App.jsx` | `FixturesTab`: locked card dimming, picksLocked state, lock button, updated AllPicksTable gate, auto-sync useEffect |
