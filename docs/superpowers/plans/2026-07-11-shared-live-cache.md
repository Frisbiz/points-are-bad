# Shared Live-Score Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-user high-frequency Firestore synchronization with a shared live-score CDN cache, visibility-aware polling, low-frequency schedule checks, and event-driven final-result persistence.

**Architecture:** A small shared policy module defines cache and timing rules used by the Vercel endpoint and React client. `/api/live` remains the single Yahoo polling path but successful responses are cached at Vercel's CDN. Group documents are updated only when a client observes a finished score missing from its group, using authoritative data already promoted into the global fixture document.

**Tech Stack:** React 19, Vite 7, Vercel Functions, Vercel CDN cache headers, Firebase Admin/Firestore, Node's built-in test runner.

## Global Constraints

- Preserve the current 5-second visible-client live-score refresh experience.
- Use a 15-second shared CDN lifetime and a 30-second stale-while-revalidate window.
- Never cache live endpoint errors or private user/group data.
- Pause network polling while `document.visibilityState` is `hidden` and refresh immediately on return.
- Replace the 20-second authenticated fixture timer with a 15-minute visible schedule check plus one initial check.
- Persist final scores from the authoritative global fixture document; never trust scores supplied by a client.
- Do not change scoring rules, fixture matching rules, or live-score presentation.
- Do not modify or stage unrelated untracked workspace files.

## File Structure

- Create `api/_livePolicy.js`: cache constants, visibility/timing eligibility, and finished-score detection shared by server, client, and tests.
- Modify `api/live.js`: apply browser and Vercel CDN headers only to successful supported live responses.
- Modify `api/security.js`: add an authenticated `sync-finished-live-scores` group action that merges authoritative global fixtures without fetching Yahoo.
- Modify `src/App.jsx`: pause hidden live polling, replace the 20-second sync timer, and request finalization only when live results differ from the group.
- Create `tests/livePolicy.test.mjs`: unit coverage for cache headers, timing policy, and finished-score detection.
- Modify `tests/liveEndpointPromotion.test.mjs`: integration-source assertions for cache policy use.
- Modify `tests/securitySync.test.mjs`: integration-source assertions for authoritative finalization.

---

### Task 1: Shared Live Policy

**Files:**
- Create: `api/_livePolicy.js`
- Create: `tests/livePolicy.test.mjs`

**Interfaces:**
- Produces: `LIVE_POLL_INTERVAL_MS`, `SCHEDULE_SYNC_INTERVAL_MS`, `setLiveSuccessCacheHeaders(res)`, `shouldRunVisibleTask({ visibilityState, lastRunAt, now, intervalMs })`, and `hasUnpersistedFinishedLiveScores(group, liveScores)`.

- [ ] **Step 1: Write failing policy tests**

Test exact browser/CDN headers, hidden and expired schedule eligibility, and detection of a finished live result absent from a group fixture. Use a fake response with `setHeader(name, value)` and plain group/live-score objects.

- [ ] **Step 2: Verify the tests fail for the missing module**

Run: `node --test tests/livePolicy.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `api/_livePolicy.js`.

- [ ] **Step 3: Implement the policy module**

Implement these exact values and signatures:

```js
export const LIVE_POLL_INTERVAL_MS = 5_000;
export const SCHEDULE_SYNC_INTERVAL_MS = 15 * 60_000;

export function setLiveSuccessCacheHeaders(res) {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("Vercel-CDN-Cache-Control", "public, max-age=15, stale-while-revalidate=30");
}

export function shouldRunVisibleTask({ visibilityState, lastRunAt = 0, now = Date.now(), intervalMs }) {
  return visibilityState === "visible" && (!lastRunAt || now - lastRunAt >= intervalMs);
}

export function hasUnpersistedFinishedLiveScores(group, liveScores = {}) {
  // Return true when a matching finished live score would change result,
  // FINISHED status, winner metadata, or penalty metadata on a group fixture.
}
```

- [ ] **Step 4: Verify policy tests pass**

Run: `node --test tests/livePolicy.test.mjs`

Expected: all policy tests PASS.

### Task 2: Shared CDN Cache on the Live Endpoint

**Files:**
- Modify: `api/live.js`
- Modify: `tests/liveEndpointPromotion.test.mjs`

**Interfaces:**
- Consumes: `setLiveSuccessCacheHeaders(res)` from `api/_livePolicy.js`.

- [ ] **Step 1: Add a failing live-endpoint integration assertion**

Assert that `api/live.js` imports `setLiveSuccessCacheHeaders` and calls it immediately before both supported successful `200` responses. Assert that the former `no-store` success header is absent.

- [ ] **Step 2: Verify the assertion fails**

Run: `node --test tests/liveEndpointPromotion.test.mjs`

Expected: FAIL because the endpoint still emits `no-store`.

- [ ] **Step 3: Apply the shared success headers**

Import `setLiveSuccessCacheHeaders` and replace both supported-path `no-store` header assignments with:

```js
setLiveSuccessCacheHeaders(res);
return res.status(200).json({ matches, week: Number.parseInt(week, 10), competition: comp });
```

and the equivalent cached-fixture fallback response. Do not apply shared headers to `400` or `500` responses.

- [ ] **Step 4: Verify endpoint tests pass**

Run: `node --test tests/liveEndpointPromotion.test.mjs tests/livePolicy.test.mjs`

Expected: all tests PASS.

### Task 3: Authoritative Event-Driven Group Finalization

**Files:**
- Modify: `api/security.js`
- Modify: `tests/securitySync.test.mjs`

**Interfaces:**
- Produces: `group-user` action `sync-finished-live-scores` with `{ groupId, payload: { type } }` input and `{ group, updated }` response.

- [ ] **Step 1: Add a failing finalization integration assertion**

Extract the new action block from `api/security.js` and assert that it:

```js
const globalDoc = await getValue(fixtureGlobalKey(comp, seas));
const merged = globalDoc ? mergeGlobalIntoGroup(globalDoc, cleanedGroup) : null;
```

uses `hasFixtureSyncChanges(cleanedGroup, merged)`, skips `setValue` when unchanged, and writes the merged group only when changed.

- [ ] **Step 2: Verify the assertion fails**

Run: `node --test tests/securitySync.test.mjs`

Expected: FAIL because `sync-finished-live-scores` does not exist.

- [ ] **Step 3: Implement finalization after `lock-picks` and before `auto-sync-fixtures`**

Determine World Cup/competition/season exactly as `auto-sync-fixtures` does. Read the global fixture document without calling `refreshYahooFixtureCache`. Normalize/dedupe the stored group, merge global fixtures, return `{ group, updated: false }` when no authoritative change exists, otherwise persist `{ ...merged, lastAutoSync: globalDoc.updatedAt }` and return `{ group: next, updated: true }`.

- [ ] **Step 4: Verify security tests pass**

Run: `node --test tests/securitySync.test.mjs`

Expected: all security sync tests PASS.

### Task 4: Visibility-Aware Client Polling and Reduced Schedule Sync

**Files:**
- Modify: `src/App.jsx`
- Create: `tests/liveClientPolicy.test.mjs`

**Interfaces:**
- Consumes all timing and detection exports from `api/_livePolicy.js`.
- Calls `callAPI("group-user", { groupId, payload: { type: "sync-finished-live-scores" } })` only after `hasUnpersistedFinishedLiveScores` returns true.

- [ ] **Step 1: Add failing client integration assertions**

Assert that `src/App.jsx` imports the shared policy, subscribes to `visibilitychange`, uses `LIVE_POLL_INTERVAL_MS`, removes `setInterval(hydrate, 20000)`, uses `SCHEDULE_SYNC_INTERVAL_MS`, and calls the finalization action behind `hasUnpersistedFinishedLiveScores`.

- [ ] **Step 2: Verify the assertions fail**

Run: `node --test tests/liveClientPolicy.test.mjs`

Expected: FAIL because the old 20-second timer and literal 5-second live timer remain.

- [ ] **Step 3: Make live polling visibility-aware**

In `useLiveScores`, clear any pending timer when hidden, avoid scheduling a new timer while hidden, and call `poll()` immediately on `visibilitychange` to visible. Retain the existing live-window predicate and error behavior. Use `LIVE_POLL_INTERVAL_MS` instead of `5000`.

- [ ] **Step 4: Replace the 20-second fixture timer**

Keep `liveGroupRef`. Track `lastScheduleSyncAt` in the effect, run once on mount, schedule eligibility checks at `SCHEDULE_SYNC_INTERVAL_MS`, skip hidden pages through `shouldRunVisibleTask`, and run on visibility restoration when eligible. Set the last-attempt timestamp before awaiting the request to prevent concurrent calls.

- [ ] **Step 5: Add event-driven finalization**

After `standingsLiveScores` is created, add an effect guarded by a ref. If finished live data would change the group, call `sync-finished-live-scores`; on success replace local group state with `data.group`. Clear the in-flight guard in `finally` so a later response can retry failures.

- [ ] **Step 6: Verify client policy tests pass**

Run: `node --test tests/liveClientPolicy.test.mjs tests/livePolicy.test.mjs`

Expected: all tests PASS.

### Task 5: Full Verification

**Files:**
- Modify only files required to correct verified regressions.

- [ ] **Step 1: Run the complete test suite**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 and a generated Vite production bundle.

- [ ] **Step 4: Inspect scope and cache policy**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only the planned tracked files are modified, while pre-existing unrelated untracked paths remain untouched.

- [ ] **Step 5: Commit the implementation**

Stage only `api/_livePolicy.js`, `api/live.js`, `api/security.js`, `src/App.jsx`, `tests/livePolicy.test.mjs`, `tests/liveEndpointPromotion.test.mjs`, `tests/securitySync.test.mjs`, `tests/liveClientPolicy.test.mjs`, and this plan. Commit with `fix: share live score refresh work`.
