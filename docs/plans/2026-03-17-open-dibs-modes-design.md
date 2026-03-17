# Design: Open vs Dibs Modes

**Date:** 2026-03-17

## Overview

Add a season mode setting to groups: **Open** (current behaviour) or **Dibs** (sequential turn-based picking where no two players can claim the same scoreline for a match). Mode is chosen at group creation and is immutable for the lifetime of the group.

---

## 1. Group Creation

After naming the group, the creator picks a mode:

> **Pick a mode for this season**
>
> ◉ **Open** — everyone picks freely each gameweek
> ○ **Dibs** — take turns claiming scorelines; no two players can pick the same result for a match

Mode is locked once the group is created. It cannot be changed afterwards.

---

## 2. Data Model

Three additions to Firestore:

| Field | Location | Type | Description |
|---|---|---|---|
| `mode` | group document | `"open" \| "dibs"` | Set at creation, immutable |
| `memberOrder` | group document | `string[]` | Ordered array of player IDs; determines pick rotation |
| `skips` | per-fixture or subcollection | `{ [fixtureId]: playerId[] }` | Admin-issued skips per fixture |

### Turn order computation (Dibs only)

Turn order is **always computed client-side** — never stored as a separate pointer in Firestore.

```
rotationStart = fixtureSeasonIndex % playerCount
currentTurn   = (rotationStart + picksSubmitted + skipsIssued) % playerCount
```

- `fixtureSeasonIndex` — the fixture's position in the overall season fixture list (0-based)
- `picksSubmitted` — number of picks already submitted for this fixture
- `skipsIssued` — number of admin skips issued for this fixture

This means the current turn is always derivable from existing picks + skips, with no risk of stored state drifting out of sync.

---

## 3. Dibs Mode — Pick Flow

- For each fixture, only the player whose computed turn it is can submit a pick
- Once they submit, the next player in the queue is automatically unblocked
- All players can see all picks in real time — information hiding is unnecessary since you cannot claim a scoreline that's already taken
- If a player fails to pick before kickoff, an admin can manually skip them (see §5)
- Skipping advances the queue to the next player; the skipped player receives no pick for that fixture

---

## 4. UI Changes in Dibs Mode

### Picks table
- The **individual picks table is hidden** in Dibs mode — only the full-group `AllPicksTable` is shown
- Players awaiting their turn have their **name pulsing/blinking** in the table header column
- Awaiting cells show a distinct animated state (e.g. pulsing border or background)
- The current user's own awaiting cell is highlighted differently to make it immediately obvious when it is their turn

### No skip controls on the table
Skip buttons do not appear anywhere on the picks table. They live exclusively in Group Settings (see §5).

---

## 5. Group Settings (Admin / Creator Only)

In Dibs mode, the Group tab exposes two additional controls:

### Member order
- The pick rotation order is visible to all members
- Admins/creator can reorder it before the first pick of the season is submitted

### Skip player
- A skip button is shown per fixture, per player, in Group Settings only
- Clicking Skip opens a **double-confirmation modal**:

  > **Skip [Player] for [Home] vs [Away]?**
  >
  > This will move [Player]'s turn to the end of the queue for this fixture and unblock the next player. This cannot be undone.
  >
  > [ Cancel ]  [ Yes, Skip ]

- After confirmation, the skip is written to Firestore and the queue advances immediately

---

## Out of Scope

- Changing mode mid-season (mode is immutable)
- Auto-skipping players at kickoff (admin action only)
- Per-gameweek rotation resets (rotation is continuous across the full season)
