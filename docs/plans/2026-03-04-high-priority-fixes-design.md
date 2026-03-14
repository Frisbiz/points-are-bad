# High Priority Fixes Design

Date: 2026-03-04

## Problem Summary

Four high-priority correctness and reliability issues:

1. Race condition in `updateGroup` - concurrent prediction saves overwrite each other
2. Silent failures in `sget`/`sset` - users get no feedback when saves fail
3. Boot failure has no recovery - infinite loading state on network error
4. `savePred` does not re-check lock state at save time

---

## Fix 1: Atomic Prediction Patch

### Problem

`updateGroup` uses read-modify-write on the entire group document. Two users saving predictions at the same time causes last-write-wins, silently erasing the earlier write.

### Solution

Add `PATCH /api/db` to the serverless function. Uses Firestore's `.update({ [dotPath]: value })` which is atomic at the field level - no read required, no race possible.

**Server (`api/db.js`):**
- Handle `req.method === "PATCH"`
- Accept `{ key, path, value }` in request body
- Validate key with same prefix rules as POST (`user:`, `group:`, `groupcode:`, under 200 chars)
- Validate path: must match `/^[\w.-]+$/` (alphanumeric, dots, dashes, underscores - prevents injection)
- Call `db.collection("data").doc(docId).update({ [path]: value })`
- Return `{ ok: true }` on success

**Client (`src/App.jsx`):**
- Add `spatch(key, path, value)` - mirrors `sget`/`sset` style, calls PATCH endpoint
- Add `applyPath(obj, path, value)` helper - navigates dot-notation path, returns new object with value set (used to update React state without a re-fetch)
- Add `patchGroup(path, value)` - calls `spatch`, on success calls `setGroup(g => applyPath(g, path, value))`, on failure calls `showToast`
- Pass `patchGroup` as a prop: `App -> GameUI -> FixturesTab`
- `savePred` calls `patchGroup("predictions.${user.username}.${fixtureId}", val)` instead of `updateGroup`

All other mutations (admin result edits, member management, fixture sync) keep the existing `updateGroup` read-modify-write - those are never concurrent.

---

## Fix 2: Save Failure Toast

### Problem

`updateGroup` swallows failures silently. Users believe their pick was saved when it wasn't.

### Solution

- Change `updateGroup` to `return ok` (the boolean from `sset`)
- Add `toast` state to `App`: `{ msg: string } | null`
- Add `showToast(msg)` in `App` - sets toast state, clears it after 4 seconds via `setTimeout`. Repeated calls reset the timer (last one wins, no stacking)
- `updateGroup` calls `showToast("Save failed - check your connection.")` on failure
- `patchGroup` does the same
- Toast renders as a fixed bottom-center banner using existing danger tint (`#ef444418`, `1px solid #ef4444`), z-index above everything, auto-dismissed

---

## Fix 3: Boot Retry

### Problem

If `sget` fails during the boot `useEffect`, `setBoot(true)` is never called and the app shows "loading..." forever with no way to recover.

### Solution

- Extract boot logic into a `runBoot` async function so it can be called again on retry
- If there is a saved session username and `sget("user:${username}")` returns null, set `bootError = true` then `setBoot(true)` - this is treated as a connectivity failure (the user existed when they last logged in)
- Add `bootError` state (boolean)
- When `!boot`: show existing loading screen
- When `boot && bootError`: show "Connection failed" message with two options:
  - `Retry` button - calls `runBoot()`
  - `Clear session` link - calls `ldel("session")` and reloads the page (escape hatch for edge case where user account was deleted)
- On successful retry, `bootError` is cleared and normal flow resumes

---

## Fix 4: Lock Guard in savePred

### Problem

`savePred` does not verify the fixture is still unlocked at the moment of saving. A match could kick off between when the user typed their prediction and when they pressed Enter.

### Solution

At the very top of `savePred`, before any other logic:

```js
const f = gwFixtures.find(fx => fx.id === fixtureId);
const locked = !!(
  f?.result ||
  f?.status === "FINISHED" ||
  f?.status === "IN_PLAY" ||
  f?.status === "PAUSED" ||
  (f?.date && new Date(f.date) <= new Date())
);
if (locked) return;
```

Uses the exact same locked formula as `unpickedUnlocked`. No new state, no network call.

---

## Prop Wiring

```
App
  toast state + showToast()
  updateGroup (returns bool, calls showToast on failure)
  patchGroup (new, calls showToast on failure)
  runBoot (extracted from useEffect)
  bootError state

  -> GameUI (receives patchGroup as new prop)
       -> FixturesTab (receives patchGroup as new prop, uses in savePred)
```

---

## Files Changed

- `api/db.js` - add PATCH handler
- `src/App.jsx` - add spatch, applyPath, patchGroup, showToast, toast state, bootError state, runBoot, wire props, update savePred
