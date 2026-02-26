# Firestore Security: Server-Side Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route all Firestore reads and writes through a Vercel serverless function using the Firebase Admin SDK, then lock Firestore rules to deny all direct client access.

**Architecture:** A new `api/db.js` function handles `GET` (read) and `POST` (write) requests. `App.jsx` replaces its Firebase CDN imports and `sget`/`sset` helpers with plain `fetch` calls to this endpoint. Firestore Security Rules are then set to `allow read, write: if false`, making the Firebase config in the browser source code useless.

**Tech Stack:** Vercel serverless functions (Node.js ESM), `firebase-admin` npm package, Firebase Firestore Security Rules.

---

## Important Notes Before Starting

**No tests exist in this project.** Skip any TDD steps. Manual verification is described at each task.

**Local dev with API functions:** `npm run dev` runs Vite only. To test the `/api/db` endpoint locally, use `vercel dev` instead (requires Vercel CLI: `npm i -g vercel`). UI-only changes can still be tested with `npm run dev`.

**FIREBASE_PRIVATE_KEY formatting:** When adding to `.env`, wrap the entire value in double quotes and keep the literal `\n` sequences as-is. The `api/db.js` code calls `.replace(/\\n/g, '\n')` to expand them at runtime. In Vercel's dashboard the value is pasted as-is (Vercel handles newlines correctly).

---

### Task 1: Install firebase-admin, remove firebase

**Files:**
- Modify: `package.json`

**Step 1: Install firebase-admin**

```bash
npm install firebase-admin
```

**Step 2: Remove the unused firebase package**

```bash
npm uninstall firebase
```

**Step 3: Verify**

Open `package.json`. `dependencies` should now contain `firebase-admin` and NOT contain `firebase`.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Replace firebase with firebase-admin for server-side DB access"
```

---

### Task 2: Add Firebase Admin env vars to .env

**Files:**
- Modify: `.env` (gitignored, never committed)

**Step 1: Get service account credentials**

1. Go to [Firebase Console](https://console.firebase.google.com) > your project
2. Click the gear icon > **Project settings** > **Service accounts** tab
3. Click **Generate new private key** > **Generate key**
4. A JSON file downloads. Open it.

**Step 2: Add to .env**

Add these three lines to your `.env` file. Copy the values from the downloaded JSON:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

The `FIREBASE_PROJECT_ID` matches `project_id` in the JSON.
The `FIREBASE_CLIENT_EMAIL` matches `client_email` in the JSON.
The `FIREBASE_PRIVATE_KEY` matches `private_key` in the JSON -- paste it exactly including the surrounding double quotes.

**Step 3: Delete the downloaded JSON file**

It contains a private key. Do not leave it on disk or commit it.

```bash
rm ~/Downloads/your-project-*.json
```

No commit needed (`.env` is gitignored).

---

### Task 3: Create api/db.js

**Files:**
- Create: `api/db.js`

**Step 1: Create the file**

```js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

const ALLOWED_PREFIXES = ["user:", "group:", "groupcode:"];

function validKey(key) {
  return typeof key === "string" && ALLOWED_PREFIXES.some(p => key.startsWith(p));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { key } = req.query;
    if (!validKey(key)) return res.status(400).json({ error: "Invalid key" });
    try {
      const snap = await db.collection("data").doc(key.replace(/[/\\]/g, "_")).get();
      return res.status(200).json({ value: snap.exists ? snap.data().value : null });
    } catch (e) {
      console.error("db GET error", key, e);
      return res.status(500).json({ error: "Read failed" });
    }
  }

  if (req.method === "POST") {
    const { key, value } = req.body;
    if (!validKey(key)) return res.status(400).json({ error: "Invalid key" });
    try {
      await db.collection("data").doc(key.replace(/[/\\]/g, "_")).set({ value, updatedAt: Date.now() });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("db POST error", key, e);
      return res.status(500).json({ error: "Write failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
```

**Step 2: Test locally with vercel dev**

```bash
vercel dev
```

In a second terminal, test a read for a key you know exists (e.g. replace `user:alice` with a real username from your database):

```bash
curl "http://localhost:3000/api/db?key=user:alice"
# Expected: {"value":{"username":"alice",...}}

curl "http://localhost:3000/api/db?key=bad:key"
# Expected: {"error":"Invalid key"}
```

Test a write:

```bash
curl -X POST http://localhost:3000/api/db \
  -H "Content-Type: application/json" \
  -d '{"key":"user:testping","value":{"ping":true}}'
# Expected: {"ok":true}

curl "http://localhost:3000/api/db?key=user:testping"
# Expected: {"value":{"ping":true}}
```

Then clean up the test doc from Firestore console.

**Step 3: Commit**

```bash
git add api/db.js
git commit -m "Add server-side Firestore proxy endpoint"
```

---

### Task 4: Update sget and sset in App.jsx

**Files:**
- Modify: `src/App.jsx` lines 5-46

**Step 1: Replace the Firebase block**

Delete everything from line 5 through line 46 (the `FIREBASE_CONFIG` constant, the `db` variable, `getDB()`, `sget()`, and `sset()`). Replace with:

```js
// ─── DB HELPERS ──────────────────────────────────────────────────────────────
async function sget(key) {
  try {
    const res = await fetch("/api/db?key=" + encodeURIComponent(key));
    if (!res.ok) return null;
    const data = await res.json();
    return data.value;
  } catch(e) { console.error("sget error", key, e); return null; }
}

async function sset(key, val) {
  try {
    await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: val }),
    });
  } catch(e) { console.error("sset error", key, e); }
}
```

**Step 2: Verify the file compiles**

```bash
vercel dev
```

Open the app in the browser at `http://localhost:3000`. Log in with an existing account. Verify:
- Login works (calls `sget("user:username")`)
- Creating a group works (calls `sset("group:id", ...)`)
- Predictions save and load correctly

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Replace Firebase client SDK with fetch calls to /api/db"
```

---

### Task 5: Add firestore.rules to the repo

**Files:**
- Create: `firestore.rules`

**Step 1: Create the file**

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

This file is documentation and a source of truth. The rules must also be applied manually in the Firebase console (Task 6).

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "Add Firestore security rules (deny all client access)"
```

---

### Task 6: Apply Firestore Security Rules in Firebase console

**This is a manual step in the browser.**

1. Go to [Firebase Console](https://console.firebase.google.com) > your project > **Firestore Database** > **Rules** tab
2. Replace the current rules with:

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

3. Click **Publish**

**Step 3: Verify the rules are active**

Open your browser DevTools console on the live (or local vercel dev) app. Paste:

```js
const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
const app = initializeApp({ apiKey: "anything", projectId: "YOUR_PROJECT_ID" });
const db = getFirestore(app);
await getDoc(doc(db, "data", "user_alice"));
```

Expected: throws a `FirebaseError: Missing or insufficient permissions` error. If you get actual data back, the rules have not been published yet.

---

### Task 7: Add env vars to Vercel and deploy

**Step 1: Add the three env vars in Vercel dashboard**

1. Go to [vercel.com](https://vercel.com) > your project > **Settings** > **Environment Variables**
2. Add:
   - `FIREBASE_PROJECT_ID` = your project ID
   - `FIREBASE_CLIENT_EMAIL` = the client email from the service account JSON
   - `FIREBASE_PRIVATE_KEY` = the private key from the service account JSON (paste the full value including `-----BEGIN PRIVATE KEY-----` header and footer; Vercel stores newlines correctly)
3. Set all three to apply to **Production**, **Preview**, and **Development** environments

**Step 2: Deploy**

```bash
git push origin main
```

Vercel auto-deploys on push to main. Watch the deployment in the Vercel dashboard.

**Step 3: Smoke test production**

Open the live app. Log in, make a prediction, reload the page. Verify the prediction persisted. Check the Vercel function logs (Vercel dashboard > your project > **Functions** tab) to confirm `/api/db` is being called and returning 200s.

**Step 4: Confirm direct Firestore access is blocked**

Open DevTools on the live site and run the same test snippet from Task 6 Step 3 (using your real `projectId`). Must get `Missing or insufficient permissions`.
