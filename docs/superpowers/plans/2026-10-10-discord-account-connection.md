# Discord Account Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a member's Discord account directly from PAB Account settings, enable reminders, and expose connection management without a slash command.

**Architecture:** Add session-authenticated actions to the existing security dispatcher, backed by focused OAuth and transactional connection helpers. Reuse the current link records and reminder service. Share a connection component between the dashboard and group Account dialogs.

**Tech Stack:** React 19, Vite 7, existing griddy-icons, Node.js built-in crypto/fetch/test, firebase-admin Firestore, Discord OAuth2.

**Spec:** `docs/superpowers/specs/2026-10-10-discord-account-connection-design.md`

## Global Constraints

- Request only the `identify` scope.
- Do not request email, guild membership, bot installation, or message access.
- Use a full-page redirect rather than a popup.
- Do not add another public serverless function.
- Access and refresh tokens are not persisted, sent to the frontend, or logged.
- State expires after ten minutes and can be consumed once through a transaction.
- A first connection enables reminders; reauthorization preserves the current preference.
- A Discord account already owned by another PAB member produces a conflict; do not silently transfer it.
- Configure PAB's `APP_URL` as `https://www.pab.wtf`.
- Do not use `VITE_` prefixes for OAuth secrets.
- Keep the existing `PAB_DISCORD_SHARED_SECRET` and Whistlebot configuration unchanged.
- No unrelated authentication, theme, fixture, or reminder-scheduler changes.

## Review Focus

- The demo account is shared: reject connection and preference mutations for `demo`, rather than letting visitors overwrite one shared Discord connection (Tasks 2 and 3).
- A preference/unlink request races with reconnect: transactions must protect reverse ownership and preserve a valid final pair of records (Task 2).
- Logout occurs during a slow Discord request: the final connection transaction checks the original session still exists and is live (Tasks 2 and 3).
- Group access changes during authorization: return-to-account falls back to the dashboard while keeping a safe result notice (Task 4).
- Authorization is cancelled from a mobile or standalone PWA browser: return shows the connection unchanged, and cancellation is retryable (Tasks 3 and 5).

## Files And Interfaces

- `api/_discordOAuth.js`: pure configuration, return-path validation, provider requests, state hashing; injected fetch and clock.
- `api/_discordLinks.js`: transactional links, preference updates, disconnection, and OAuth attempt storage; injected Firestore and `docKey`.
- `api/_discordAccount.js`: request orchestration with injected session, store, and provider dependencies; no Firebase initialization on test import.
- `api/security.js`: delegate the five browser actions; use shared storage operations for existing signed-link and service preference/unlink actions.
- `src/DiscordConnection.jsx` and `src/discord-connection.css`: one theme-aware, accessible settings section.
- `src/discordConnection.js`: frontend request helper and safe callback-result parsing, usable from Node tests.
- `src/App.jsx`: mount the shared section in both Account dialogs; consume OAuth result after bootstrap and reopen the correct dialog.
- `tests/discordOAuth.test.mjs`, `tests/discordLinks.test.mjs`, `tests/discordAccount.test.mjs`, `tests/discordConnection.test.mjs`: executable tests.
- `tests/helpers/discordFirestore.mjs`: transaction-serializing memory adapter, including read-before-write enforcement and query/batch behavior used by cleanup.
- `.env.example`, `docs/discord-connection.md`: server-only configuration names and production runbook; no credentials.

Backend data contracts:

```js
// DiscordProfile
{ id: "123456789012345678", username: "aamer", displayName: "Aamer", avatarHash: null }
// Browser connection status
{ linked: true, oauthAvailable: true, profile: { username: "aamer", displayName: "Aamer", avatarHash: null }, remindersEnabled: true }
// Disconnected status
{ linked: false, oauthAvailable: true }
// Attempt value; state/session token themselves are never persisted here.
{ kind: "discord-oauth", username: "aamer", sessionHash: "sha256", returnPath: "/dashboard", expiresAt: 1000, consumedAt: null }
```

Use fixed codes `not_configured`, `sign_in_required`, `invalid_state`, `cancelled`, `provider_unavailable`, `already_linked`, `disconnect_first`, and `failed`. Successful callback is `connected`. Never show provider text directly.

### Task 1: OAuth Primitives And Provider Adapter

**Files:** Create `api/_discordOAuth.js`, `tests/discordOAuth.test.mjs`; update `.env.example`.

**Interfaces:**
- Produce `oauthConfig(env)` -> `{ origin, clientId, clientSecret, redirectUri } | null`.
- Produce `safeDiscordReturnPath(path)` -> local dashboard/group path.
- Produce `hashDiscordValue(value)` -> SHA-256 hex string.
- Produce `createDiscordAuthorization(config, state)` -> authorization URL.
- Produce `fetchDiscordProfile({ config, code, fetcher = fetch })` -> `DiscordProfile`.

- [ ] Write failing executable tests. Include these exact assertions plus malformed profile, non-OK response, timeout, wrong token type, and revocation failure cases:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { oauthConfig, safeDiscordReturnPath, createDiscordAuthorization } from "../api/_discordOAuth.js";

test("canonical callback and minimal scope", () => {
  const config = oauthConfig({ APP_URL: "https://www.pab.wtf", DISCORD_CLIENT_ID: "123456789012345678", DISCORD_CLIENT_SECRET: "test-secret" });
  assert.equal(config.redirectUri, "https://www.pab.wtf/api/security?action=discord-oauth-callback");
  const url = new URL(createDiscordAuthorization(config, "test-state"));
  assert.equal(url.origin, "https://discord.com");
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "test-state");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("return paths cannot redirect outside PAB", () => {
  for (const path of ["https://evil.test", "//evil.test", "/groups/a%2Fb", "/dashboard?redirect=https://evil.test", "/groups/..", "/signin"]) {
    assert.equal(safeDiscordReturnPath(path), "/dashboard");
  }
  assert.equal(safeDiscordReturnPath("/groups/friends"), "/groups/friends");
});
```

- [ ] Run `node --test tests/discordOAuth.test.mjs`; confirm it fails for the missing module.
- [ ] Implement config validation (HTTPS outside localhost, no credentials/query/fragment/path on APP_URL), strict local group-ID decoding, crypto hashing, and URLSearchParams-based authorization URL. Use these provider requests, validate JSON before accessing fields, and translate failures into fixed errors:

```js
const tokenResponse = await fetcher("https://discord.com/api/v10/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri }),
  signal: AbortSignal.timeout(10_000),
});
// After validating tokenResponse JSON and a Bearer access token:
const identityResponse = await fetcher("https://discord.com/api/v10/users/@me", {
  headers: { Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(10_000),
});
```

- [ ] In a `finally` block, best-effort revoke the token with `/api/v10/oauth2/token/revoke`, URL-encoded client credentials, token, and `token_type_hint=access_token`, with a five-second timeout. Never log response bodies or error objects containing request details. Verify returned ID is a decimal Discord snowflake, username is nonempty/bounded, nullable global name/avatar have expected types.
- [ ] Add blank `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` entries to `.env.example`; set the example APP_URL to `https://www.pab.wtf`. Do not copy real values.
- [ ] Rerun the test file and focused ESLint on the new module; commit only these files as `Add Discord OAuth identity primitives`.

### Task 2: Transactional Connections And Attempts

**Files:** Create `api/_discordLinks.js`, `tests/discordLinks.test.mjs`, `tests/helpers/discordFirestore.mjs`.

**Interfaces:** `createDiscordLinkStore({ db, docKey, now = Date.now })` returns:
- `status(username)` -> profile/preference status without OAuth availability.
- `connect({ username, discordUserId, profile, sessionToken, nonce })` -> saved link. `sessionToken` is optional for legacy signed-token callers; when supplied, its record must be live and owned by username inside the final transaction. `nonce` is optional `{ value, expiresAt }`, consumed atomically with the legacy link.
- `preferences({ username, enabled })` -> saved link.
- `unlink(username)` -> `{ linked: false }`.
- `putAttempt({ state, username, sessionToken, returnPath })` -> void.
- `consumeAttempt({ state, username, sessionToken })` -> attempt; validation then atomic consume.
- `cleanupAttempts()` -> bounded best-effort expired-attempt deletion.

- [ ] Build a serial transaction fake that stages writes until callback success, rejects transaction reads after writes, and exposes its persisted Map for assertions. Seed real-shaped `user:`, `session:`, `discordlink:`, and index records. Write tests for first connection, preserving disabled reminders, conflict, replacement rejection, concurrency, corrupt reverse ownership, and shared demo mutation rejection.

```js
test("cannot take another member's Discord connection", async () => {
  const { db, values } = createDiscordFirestore({
    "user:aamer": { username: "aamer" },
    "user:faris": { username: "faris", discordUserId: "123456789012345678" },
    "discordlink:123456789012345678": { username: "faris", discordUserId: "123456789012345678", remindersEnabled: true },
  });
  const store = createDiscordLinkStore({ db, docKey: key => key.replace(/[/\\]/g, "_"), now: () => 1000 });
  await assert.rejects(store.connect({ username: "aamer", discordUserId: "123456789012345678" }), { code: "already_linked" });
  assert.equal(values.get("discordlink:123456789012345678").username, "faris");
  assert.equal(values.get("user:aamer").discordUserId, undefined);
});
```

- [ ] Run `node --test tests/discordLinks.test.mjs`; confirm failure before implementation.
- [ ] Implement all connection reads before writes in a Firestore transaction. Validate both link directions. Preserve user fields, same-link preference and linkedAt, and optional saved profile when the legacy path supplies no metadata. First links set reminders true. Reject demo changes with 403. Remove only owned links on unlink; transactionally update the index.
- [ ] Store attempts under `discordoauth:<sha256(state)>`, with `kind`, expiry, hashed session, allowlisted return path and consumed marker. Validate 43-character base64url state shape before reads. Wrong-session requests do not consume a valid attempt. Atomically mark consumption before provider exchange; failed exchange requires a fresh initiation.
- [ ] For cleanup, query expired `value.kind == discord-oauth` records with `value.expiresAt <= now`, limit 25, and batch-delete them. Document any Firestore composite-index requirement in Task 5; catch cleanup failure without blocking initiation. Do not query/delete existing signed-link nonce records.
- [ ] Add replay/expiry and concurrent consume tests, final-session-expired/deleted test, and serialized preference/unlink/reconnect tests. Assert attempt values contain neither session token nor raw state. Rerun tests; commit as `Protect Discord connection ownership and OAuth state`.

### Task 3: Browser Actions And Existing Entry Points

**Files:** Create `api/_discordAccount.js`, `tests/discordAccount.test.mjs`; modify `api/security.js`.

**Interfaces:**
- Consume Task 1 functions and Task 2 store.
- Produce `createDiscordAccountHandler({ env, store, getSession, readSessionToken, fetchProfile, randomState })`, returning `handle(req, res, action)` -> boolean (true when handled).
- Default random state: `randomBytes(32).toString("base64url")`. Test dependencies use deterministic state and no network.

- [ ] Write route tests with fake `req`/`res` (status, json, setHeader, redirect), session map, real in-memory link store, and provider-call counter. Pin all five method contracts from the spec, 405 for wrong methods, unauthenticated errors, no-store headers, same-origin POST checks, and a forged browser Discord-ID payload being ignored.

```js
test("callback rejects an account switch before provider access", async () => {
  const h = makeDiscordAccountHarness();
  await h.start({ username: "aamer", token: "session-a", returnPath: "/groups/friends" });
  const result = await h.callback({ username: "faris", token: "session-b", state: h.state, code: "test-code" });
  assert.equal(result.status, 303);
  assert.match(result.headers.Location, /^https:\/\/www\.pab\.wtf\/dashboard\?discord=invalid_state$/);
  assert.equal(h.providerCalls(), 0);
  assert.equal(h.values.get("user:aamer").discordUserId, undefined);
});
```

- [ ] Run `node --test tests/discordAccount.test.mjs`; verify failure before implementation.
- [ ] Implement status, start, callback, preferences and unlink with fixed error codes. Exact Origin must match configured origin for browser writes; reject missing Origin too. Status remains usable when OAuth credentials are absent. Non-OAuth browser preference/unlink operations still need a configured canonical APP_URL.
- [ ] Callback validates state and the bound live session before exchange; handles denial as cancelled; rejects duplicate/array query values; revalidates session after network work and passes sessionToken to the final connection transaction. Redirect with 303 to the trusted stored path and fixed result code. Unknown state returns to dashboard only. Add `Referrer-Policy: no-referrer`.
- [ ] Wire once in `api/security.js` before existing Discord branches. Keep all external operations injectable in the helper. Replace signed-link transaction with `store.connect({ username, discordUserId: payload.discordUserId, nonce: { value: payload.nonce, expiresAt: payload.exp } })`; retain signature/expiry verification and current response contract. Existing service preference/unlink resolves the link owner then calls the ownership-checking store, without trusting browser session identity.
- [ ] Test cancellation, network/JSON failures, logout during fetch, missing configuration, demo account, existing service responses, token replay and signed-link conflict. Run all existing Discord reminder tests as well. Commit as `Expose secure PAB Discord account actions`.

### Task 4: Shared Account Controls And OAuth Return

**Files:** Create `src/discordConnection.js`, `src/DiscordConnection.jsx`, `src/discord-connection.css`, `tests/discordConnection.test.mjs`; modify `src/App.jsx`.

**Interfaces:**
- `requestDiscordAccount(action, payload, { fetcher = fetch, signal } = {})` -> validated data or a fixed user-facing error; status GET, all other browser actions POST.
- `readDiscordConnectionResult(search)` -> known result code or null.
- `DiscordConnection({ username, returnPath, resultCode, onConnectionChange })` -> shared settings section. `onConnectionChange()` is a no-argument refresh callback, not a user/status setter. The component never accepts a user-supplied Discord ID.
- App consumes the result once after bootstrap and passes it into the appropriate dialog, clearing the query with history.replaceState only after retaining the notice.

- [ ] Write request/result unit tests, including array-like/unknown callback results, 401, malformed JSON, aborted status loads, rejected mutation, and no secrets in rendered status data. Run the new test file and observe failure.
- [ ] Implement the request helper with JSON body, AbortSignal, fixed error messages and validated response shapes. Unknown callback codes are ignored, not rendered.
- [ ] Implement the shared section with existing theme variables and griddy icons, a fixed-size connect action, compact identity row, real accessible switch, and inline disconnect confirmation. Reserve loading space, keep names wrapping, use role=status, and separate status-fetch errors from mutation errors. Abort on unmount/account change; stale responses cannot update another username's controls.
- [ ] Add the exact shared mounts in both account dialogs:

```jsx
<DiscordConnection
  username={user.username}
  returnPath={window.location.pathname}
  resultCode={discordResult}
  onConnectionChange={refreshAccountUser}
/>
```

Define `refreshAccountUser` in App, pass it into `GroupLobby` and `GameUI`, and use it at both mounts. Refetch the user's bootstrap record after a successful mutation, verifying the result still belongs to the current username before calling setUser. Never pass raw connection status as a user object. Add a top-level stored `discordResult` and an explicit `openAccountAfterBoot` prop for GroupLobby/GameUI. Group bootstrap fallback must preserve the notice so GroupLobby reopens Account if access was removed.

```jsx
const refreshAccountUser = useCallback(async () => {
  const username = userRef.current?.username;
  const data = await fetchBootstrap();
  if (username && userRef.current?.username === username && data.user?.username === username) {
    setUser(data.user);
  }
}, [setUser]);
```

Catch refresh failure in the connection component without falsely reporting that a successful mutation failed; the connection component's newly saved state remains authoritative until the next bootstrap.

- [ ] Keep normal sign-in and existing `/link-discord` route working. For a signed-out callback result, show a safe sign-in notice without auto-completing any stale link. Demo UI has no connect/mutation controls. Missing OAuth setup shows an unavailable state while linked users retain reminder/disconnect controls.
- [ ] Rerun helper tests, relevant bootstrap/app-route tests, and `npm run build`; run focused lint on new files and check changed App lines without unrelated cleanup. Commit as `Add polished Discord controls to PAB Account`.

### Task 5: Browser Verification And Production Runbook

**Files:** Create `docs/discord-connection.md`; update `.env.example` if required by final configuration validation; screenshots go to ignored `output/discord-connection/`.

**Interfaces:** Verify the Task 3 API contracts against the Task 4 UI. No alternate production UI or fabricated authenticated data.

- [ ] Run the complete suite in PowerShell and record failures separately from baseline issues:

```powershell
$testFiles = @(Get-ChildItem -LiteralPath tests -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
node --test @testFiles
npm run build
```

- [ ] Start the local Vite server on an unused port and retain a usable URL. Use the available browser tools/Playwright with scoped mocked API responses for UI states only, clearly separate from live OAuth validation. Verify desktop 1440x900 and mobile 390x844, dark/light/current themes, connected and disconnected, long username, loading, failed status/retry, failed preference save, disconnect/cancel, result handling and group-access fallback. Capture screenshots and check no overflow or overlaps.
- [ ] Verify connect triggers full-page navigation to a Discord URL with identify-only scope. Cancellation returns safely to Account without modifying the link. Make screenshots available as artifacts, but do not claim a mocked provider round trip verifies live Discord configuration.
- [ ] Write the runbook with server-only env names, exact callback `https://www.pab.wtf/api/security?action=discord-oauth-callback`, canonical origin, Firestore cleanup index if requested by the SDK, deployment order, rollback, and a real-user smoke checklist. Do not include secret values.
- [ ] Obtain independent review of OAuth/state/ownership invariants and the final diff when a reviewer is available; otherwise report that review was unavailable. Verify no bot/scheduler changes or unrelated PAB changes entered commits. Commit as `Verify Discord account flow and document rollout`.

### Task 6: Configuration, Release, And Honest Completion

**Files:** No secret files are committed. Update the runbook only for verified deployment observations.

- [ ] Check current Vercel project and Discord application access using existing authenticated tooling. Report availability only; never print client secrets, bot tokens, environment files, access tokens, or OAuth codes.
- [ ] Configure server-only DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and APP_URL on the correct PAB production project; preserve all other environment variables. Register the exact callback in Discord. Never confuse the OAuth client secret with Whistlebot's bot token or shared PAB secret.
- [ ] If developer-portal or client-secret access is unavailable, finish code/tests and request that one missing setup step. Do not deploy a dead Connect button or claim the feature is live. A willing member performs Discord authorization themselves.
- [ ] Push only this feature's reviewed commits and deploy through PAB's established Vercel workflow. Check production status action, canonical redirect and no-cache headers. Verify one real connection, persisted preference, callback cancellation and disconnect; verify existing command-created connections still work. No bot restart is expected.
- [ ] Report deployed revision, actual verification evidence, and any unverified real-user or configuration step. Keep the final response short and show where users find Account > Discord.

## Execution Recommendation

Use native execution in the current session, task by task, with focused review of
the finished branch. The six tasks share store/handler/UI contracts, so one
implementer can keep those contracts consistent. Do not start implementation
until the human has reviewed this plan and selected or confirmed the method.
