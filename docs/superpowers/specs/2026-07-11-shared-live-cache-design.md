# Shared Live-Score Cache Design

**Date:** 2026-07-11
**Status:** Approved for implementation planning

## Problem

Every open game page currently calls the authenticated fixture-sync endpoint every 20 seconds. Each call reads the session, group, and global fixture documents even when nothing changed. During a live window, clients also call `/api/live` every 5 seconds, and its successful responses explicitly disable shared caching. The result is duplicated Vercel execution and Firestore traffic proportional to the number of open browsers. This exhausted the Firestore free daily quota and contributed to exhausting Vercel Fluid Active CPU.

The replacement must reduce duplicated work without losing live scores, final-result persistence, schedule changes, or group standings updates.

## Chosen Approach

Use Vercel's shared CDN cache as the fan-out layer for public live-score responses, retain short client polling for responsiveness, and replace continuous authenticated group synchronization with event-driven finalization plus a low-frequency schedule check.

This is an incremental change to the existing Vite, Vercel Functions, Yahoo fixture, and Firestore architecture. It does not introduce Firebase Auth, WebSockets, Server-Sent Events, or a new hosted service.

## Data Flow

### Live scores

1. Visible clients poll `/api/live` every 5 seconds during the existing live window.
2. Successful `/api/live` responses use a 15-second shared CDN lifetime with a 30-second stale-while-revalidate window. Browser caching remains disabled so clients revalidate through the CDN rather than serving indefinitely stale local data.
3. The first request for a canonical competition, season, gameweek, and date set executes the function and fetches Yahoo. Other requests within the shared window receive the cached response without executing the function.
4. The existing in-browser live-score map updates the UI immediately from the shared response.
5. When the tab is hidden, live polling stops. It resumes immediately when the tab becomes visible.

### Final-result persistence

1. `/api/live` continues promoting newly finished results into the global Firestore fixture document before returning them.
2. When a client observes a finished result that is absent from its group document, it calls a dedicated authenticated group action.
3. The action reads the authoritative global fixture document, merges it into the latest stored group document, and writes only when the merged fixture state differs.
4. Concurrent clients may race to request finalization, but the first request performs the write; later requests observe the already-updated group and return without writing.
5. The response returns the current group so the initiating client updates standings and recap state immediately.

Client-supplied scores are never trusted as authoritative.

### Schedule synchronization

The existing generic `auto-sync-fixtures` action remains available for on-demand and administrative use. The per-user 20-second timer is replaced by:

- one immediate check when entering a real group;
- a 15-minute check while the page is visible; and
- an immediate check when a hidden tab becomes visible after the interval has elapsed.

The server's existing refresh intervals and Firestore lock continue to prevent duplicate upstream fixture refreshes. This preserves delayed kickoff and schedule correction behavior without constant authenticated reads.

## Cache Rules

- Cache only successful `200` live-score responses.
- Use a shared cache key derived from the normalized request URL. World Cup date lists must remain sorted and canonical.
- Do not cache errors, invalid parameters, or unsupported competitions.
- Do not place user, group, cookie, or other private data in `/api/live` responses.
- Keep the endpoint unauthenticated and public, as it is today.

## Expected Load Reduction

The removed loop currently creates at least three Firestore reads every 20 seconds per open user, or about 540 reads per user-hour. Its replacement performs the same authenticated path at most four times per visible user-hour, plus the initial check, reducing that portion by roughly 98%.

During live windows, `/api/live` function executions and Yahoo fetches become approximately one per shared 15-second cache key rather than one per user every 5 seconds. Clients retain near-live updates while Vercel and upstream work no longer scale linearly with audience size.

Finalization writes become proportional to newly completed fixtures and active groups, rather than elapsed time.

## Error Handling

- A failed live request leaves the last successful in-memory score map visible and retries on the normal schedule while the tab remains visible.
- A failed finalization request does not accept or persist client data. A later live response can trigger another attempt.
- A failed schedule synchronization leaves the current group intact and waits until the next eligible check.
- Authentication and quota failures must not be presented as invalid credentials unless the server actually returns `401 Invalid credentials`.

## Testing

Automated tests will cover:

- successful `/api/live` responses emit the shared-cache policy;
- error responses are not shared-cacheable;
- hidden-tab polling pauses and visibility restoration permits an immediate poll;
- schedule synchronization eligibility enforces the 15-minute interval;
- finished-score detection requests finalization only when the group lacks the result;
- finalization reads authoritative server data and skips unchanged group writes;
- existing live-score promotion, World Cup bracket, fixture synchronization, and security tests remain green.

Verification will include the full test suite, lint, production build, and inspection of the resulting cache headers from a locally invoked handler or deployed preview when available.

## Out of Scope

- Migrating custom authentication to Firebase Auth.
- Direct browser access to Firestore.
- WebSockets, Server-Sent Events, or a third-party realtime service.
- A global fixture-reference data-model migration.
- Changing scoring rules, fixture matching rules, or the visual presentation of live scores.
