# Discord Account Connection

## Intent

PAB members should be able to connect their own Discord account from Account
settings, with no slash command, copied ID, or administrator intervention.
After Discord authorization, they return to PAB with reminders enabled.
The existing Whistlebot reminder service remains the delivery mechanism.

The user approved the account-settings concept and delegated visual choices.
This document defines the new OAuth security boundary and implementation scope;
implementation starts after review of this document and the subsequent plan.

## Chosen Approach

Use Discord's confidential authorization-code flow, initiated by the logged-in
PAB member. Request only the `identify` scope. Use the existing Discord
application where its client credentials and callback configuration are available.
Do not request email, guild membership, bot installation, or message access.

Use a full-page redirect rather than a popup. This works with mobile browsers,
PWA windows, and popup blockers. A copied Discord ID is not an alternative
because it does not prove account ownership. The existing `/pab link` flow
continues to work as a separate entry point.

## Account UI

Add a shared Discord connection component to both existing Account dialogs in
`src/App.jsx`. Keep the rest of those dialogs unchanged.

- Disconnected: Discord section with a `Connect Discord` action.
- Starting: fixed-size action showing a spinner and `Connecting...`; prevent
  double submission while obtaining the authorization URL.
- Connected: Discord display name and username when available, connected status,
  a labeled `Pick reminders` switch, and a `Disconnect` action.
- Existing command-created link without profile metadata: show `Connected`
  without inventing a username or exposing a raw Discord ID as its label.
- Initial loading: reserved space with a loading state, not a false disconnected
  state. Failed status fetch: inline error and retry action.
- Preference update: disable only the affected control while saving; keep the
  previous value if the request fails.
- Disconnect: inline confirmation within the same section; no nested dialog.
  Cancel leaves the connection unchanged. Success returns to disconnected.
- Return from OAuth: reopen Account automatically on the originating dashboard
  or group view, display a brief success or actionable error, and remove the
  result query parameter with `history.replaceState`.

Use existing theme variables, icons, and button conventions. Keep this an
unframed settings section, not a card inside the Account dialog. Use normal
letter spacing and compact headings. Long names wrap without pushing actions
out of the dialog. Controls need visible focus, accessible names, and touch
targets. Status is not communicated by color alone; updates use a live region.

## Backend Boundaries

Extend the existing `api/security.js` dispatcher. Keep OAuth orchestration and
link persistence in focused helper modules instead of expanding its inline
branches. Do not add another public serverless function.

New browser actions:

- `discord-account-status` (GET): require the PAB session and read only that
  member's connection. Return linked state, saved Discord profile fields,
  reminders preference, and whether OAuth is configured. No service secret.
- `discord-oauth-start` (POST): require a valid PAB session and an exact
  configured same-origin request; create a short-lived authorization attempt
  and return the Discord authorization URL.
- `discord-oauth-callback` (GET): validate and consume the authorization attempt,
  exchange the code, fetch Discord identity, save the link, then redirect to
  the stored local return location with a sanitized result code.
- `discord-account-preferences` (POST): session-authenticated, same-origin,
  boolean preference update; derive the Discord ID from the stored user.
- `discord-account-unlink` (POST): session-authenticated, same-origin,
  transactionally remove the member's connection and reverse reference.

Keep the current service-authenticated jobs, status, preference, and unlink
actions compatible. Reuse transactional persistence for browser, service, and
signed-token paths where they operate on the same link records.

## Authorization Security

Generate at least 32 random bytes for OAuth `state`. Store only its hash as the
authorization record key. Bind the record to the PAB username, a hash of the
current session token, expiry, and an allowlisted local return path. State
expires after ten minutes and can be consumed once through a transaction.
On initiation, perform bounded opportunistic cleanup of expired attempts with
at most 25 deletions. Cleanup failure must not block initiation; expiry
validation remains mandatory regardless.

The callback requires the same live PAB session used at initiation. Reject
missing, malformed, expired, reused, or differently bound state before any
linking. Handle Discord cancellation only after validating state. A logged-out
or switched-account callback must never link to the new account. Revalidate
the bound session immediately before committing the connection, after the
provider requests finish.

Use a server-configured canonical origin and exact callback URI, never an
untrusted Host header. Allow return locations only for `/dashboard` and valid
local `/groups/<id>` routes, without arbitrary query strings or external URLs.
Fallback is `/dashboard`. Existing group authorization still applies on return.

Exchange the code server-side with the Discord client secret, then call
Discord's current-user endpoint with the access token. Apply network timeouts,
check response status and payload types, and validate the returned Discord ID.
Never accept a Discord ID supplied by the browser as proof of identity.

Access and refresh tokens are not persisted, sent to the frontend, or logged.
Best-effort revoke the temporary OAuth authorization after identity lookup;
revocation failure is logged without tokens and does not undo a successful link.
Return only fixed user-facing error codes, never provider bodies, OAuth codes,
state, credentials, or stack traces. Set `Cache-Control: no-store` on all new
actions and `Referrer-Policy: no-referrer` on callback responses.

## Link Integrity

Keep the existing Firestore records:

- `user:<username>.discordUserId`
- `discordlink:<discordUserId>`
- `discord-links-index`

Add optional Discord username, display name, and avatar-hash metadata to the
link record. Keep reminder preferences and `linkedAt`. Do not add OAuth tokens.
Use a transaction for connection, disconnection, and preference updates.

A Discord account already owned by another PAB member produces a conflict;
do not silently transfer it. Apply this rule to the signed-token entry point too,
so one route cannot bypass another's ownership protection.

Reauthorizing the same connection refreshes profile metadata and preserves the
current reminders preference. A first connection enables reminders. To change
Discord accounts, disconnect the existing one first; reject a different ID while
the PAB member still has a link. Unlink operations must verify both directions
and must not delete another member's connection if legacy data is inconsistent.

The scheduler and recently fixed per-round reminder deduplication are unchanged.
Connecting does not itself send a reminder or reset already delivered reminders.
Normal incomplete-pick reminders become eligible at the next scheduler poll.

## Configuration And Rollout

PAB needs server-only `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and canonical
`APP_URL`. Derive the exact callback from `APP_URL`:

`https://www.pab.wtf/api/security?action=discord-oauth-callback`

Register that exact URI in the Discord application's OAuth2 redirect settings.
Read-only HTTP checks on October 10, 2026 confirmed that `pab.wtf` returns a 307
redirect to `www.pab.wtf`, which returns 200. Configure PAB's `APP_URL` as
`https://www.pab.wtf` and preserve this canonical origin throughout initiation
and callback. Preview deployments must not reuse a production callback unless
users intentionally initiate on the canonical site.

Do not use `VITE_` prefixes for OAuth secrets. Keep the existing
`PAB_DISCORD_SHARED_SECRET` and Whistlebot configuration unchanged. Missing OAuth
configuration yields a clean unavailable state while existing links, reminder
preferences, and `/pab link` keep working.

Deploy the PAB code and configuration together after verification. No Whistlebot
restart or command registration is expected. Do not claim the feature is live
until the redirect registration, secret configuration, and real authorization
round trip have been verified. Rollback removes the new UI/actions while the
existing link records and bot remain compatible.

## Verification

Use executable helper and route tests with injected Firestore, session, clock,
and provider adapters; source-string tests alone are insufficient for OAuth.

- Start rejects unauthenticated and cross-origin requests.
- Callback rejects missing, expired, reused, malformed, and cross-session state.
- Concurrent callbacks cannot consume one attempt twice.
- Cancellation and provider failures preserve the current link.
- Successful authorization links the provider-returned ID only.
- Same-account reauthorization preserves disabled reminders.
- Conflicting ownership and replacing a link without disconnecting are rejected.
- Unlink and preference operations cannot modify another member's link.
- Tokens and secrets never appear in API responses or persisted records.
- Return paths cannot become open redirects.
- Existing signed-token linking, service endpoints, and reminder tests still pass.

Run the PAB test suite, production build, and focused lint checks. Verify real
browser screenshots and interactions on desktop and mobile: disconnected,
connected, long username, loading, retry, preference-save failure, disconnect
confirmation, OAuth cancellation, and return-to-account. Test at least the
default dark and light themes plus the currently selected theme. An actual
Discord authorization round trip requires a willing account owner; do not
impersonate a user or approve access on their behalf.

## Non-Goals

No administrator linking of other people, Discord sign-in for PAB, new reminder
windows, prediction sharing, bot installation, theme redesign, or unrelated
authentication refactor.
