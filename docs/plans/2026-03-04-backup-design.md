# Backup System Design

## Summary

Manual admin-triggered backups of group data, stored in Firestore, restorable from the UI. Max 5 backups per group, newest first.

---

## Section 1: Data Model

### Backup document

Key: `backup:{groupId}:{timestamp}` (Unix ms timestamp as string).

```js
{
  groupId,
  createdAt,   // Unix ms
  createdBy,   // username of admin who created it
  snapshot,    // full group document value, minus the backups metadata field
}
```

### Group document change

New field `backups` (array, max 5, newest first):

```js
backups: [
  { id: "1740000000000", createdAt: 1740000000000, createdBy: "alice" },
  ...
]
```

When a 6th backup would be created, the oldest entry is removed from `group.backups` and its Firestore document (`backup:{groupId}:{oldest.id}`) is deleted via a POST with `value: null` (or a dedicated delete). The trimming happens client-side inside the `updateGroup` call so it is atomic with the metadata update.

---

## Section 2: API Changes

Add `"backup:"` to `ALLOWED_PREFIXES` in `api/db.js`. No new serverless functions required. All backup reads/writes use existing GET and POST endpoints.

---

## Section 3: UI

### Placement

New **Backups** section at the bottom of `GroupTab`, visible to admins only.

### Create backup

- `Btn variant="amber"` labelled `BACKUP NOW`.
- Non-destructive, no confirmation modal.
- On click: snapshot current group (excluding `backups` field), write to `backup:{groupId}:{now}`, call `updateGroup` to prepend metadata entry and trim to 5 (deleting oldest backup doc if needed).
- Shows brief inline `✓ Backup created` message for 3 seconds.

### Backup list

Each entry (newest first) shows:
- Date/time formatted as `"Fri 28 Feb, 14:32"` + `by {displayName}`
- `Restore` button (`variant="danger"`)
- `Delete` button (`variant="ghost"`)

### Restore flow

- Click `Restore` → row expands inline with: `"This will overwrite all current group data."` + `Yes, restore` (`variant="danger"`) + `Cancel` (`variant="muted"`) buttons.
- On confirm: POST the snapshot as the new group value, then call `updateGroup` to re-attach the live `backups` array (so the backup list survives the restore).
- No page reload needed; `setGroup` updates React state.

### Delete

- Immediately removes the `backup:{groupId}:{id}` Firestore document and removes the entry from `group.backups` via `updateGroup`.
- No confirmation needed.

---

## Files Changed

| File | Change |
|---|---|
| `api/db.js` | Add `"backup:"` to `ALLOWED_PREFIXES` |
| `src/App.jsx` | `GroupTab`: Backups section with create/list/restore/delete UI |
