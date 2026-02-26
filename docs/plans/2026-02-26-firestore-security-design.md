# Firestore Security: Server-Side Proxy Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

The Firebase config (`apiKey`, `projectId`, etc.) is visible in the browser's page source. Without Firestore Security Rules, anyone who finds it can read and write directly to the database using the Firebase SDK from their browser console.

## Goal

Make the Firebase config useless for direct database access. All Firestore operations must go through a server-side proxy that holds Admin SDK credentials. Firestore rules deny all client requests.

## Approach

Proxy all Firestore reads and writes through a new Vercel serverless function (`api/db.js`) that uses the Firebase Admin SDK. Set Firestore Security Rules to deny all direct client access.

## Components

### `api/db.js` (new)

Vercel serverless function. Single endpoint, two operations:

- `GET /api/db?key=<key>` -- reads one document, returns `{ value: <data> }` or `{ value: null }`
- `POST /api/db` with JSON body `{ key, value }` -- writes one document

Key validation on every request: rejects keys that do not start with `user:`, `group:`, or `groupcode:` with a 400 error. No delete endpoint is exposed.

Uses `firebase-admin` initialized with service account credentials from env vars. The Admin SDK bypasses Firestore Security Rules, so no rule changes are needed for the server path.

### `src/App.jsx` changes

- Remove `FIREBASE_CONFIG` constant and all Firebase CDN dynamic imports (~30 lines)
- Remove `getDB()` function
- Replace `sget(key)` with `fetch('/api/db?key=' + encodeURIComponent(key))` GET, returning `data.value`
- Replace `sset(key, val)` with `fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value: val }) })`
- Error handling mirrors current behavior: `sget` returns `null` on failure, `sset` logs and swallows errors

### Firestore Security Rules

Set in the Firebase console (or `firestore.rules` if Firebase CLI is used):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### `package.json`

- Add `firebase-admin` to `dependencies`
- Remove `firebase` (unused -- the app was loading it via CDN dynamic import, not bundling it)

### Environment variables

Add to Vercel project settings and local `.env`:

| Variable | Source |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase console > Project settings |
| `FIREBASE_CLIENT_EMAIL` | Service account JSON |
| `FIREBASE_PRIVATE_KEY` | Service account JSON (multi-line, keep quotes) |

Generate the service account key at: Firebase console > Project settings > Service accounts > Generate new private key.

## Security outcome

The Firebase config (`apiKey`, `authDomain`, etc.) exposed in the browser source code becomes inert. Firestore rules deny all direct client requests with a permission-denied error. The Admin SDK credentials never leave the server. All data access is gated through `/api/db`, which validates key prefixes before any read or write.

## Out of scope

- Rate limiting on `/api/db` (no auth layer, public endpoint)
- Per-user access control (requires Firebase Auth migration)
- Encryption of stored passwords (separate concern)
