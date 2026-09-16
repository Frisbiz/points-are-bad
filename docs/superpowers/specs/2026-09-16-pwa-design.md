# PAB Progressive Web App Design

**Date:** 2026-09-16  
**Status:** Approved direction

## Goal

Make Points Are Bad installable on iOS, Android, and desktop while preserving the existing fast web experience. The installed app should launch into the dashboard, feel native in standalone mode, update predictably, and fail cleanly without a network connection.

## Product behavior

- Supporting browsers can install PAB from the browser or add it to the home screen.
- The installed app launches at `/dashboard`. Existing routing sends signed-out users to sign in and signed-in users to their dashboard.
- The app shell and static visual assets work offline.
- If an API request cannot run because the device is offline, PAB shows a branded offline state with a retry action.
- Predictions, account changes, group administration, live scores, and all other API-backed actions require a live connection.
- PAB does not queue offline mutations. This prevents a prediction made before kickoff from being replayed after the deadline and avoids duplicate writes.
- When a new production build is available, PAB shows a small update prompt. The user can activate it immediately; otherwise the current version remains usable until the next reload.

## Architecture

### Manifest and icons

`vite-plugin-pwa` will generate and link the web app manifest. The manifest will define:

- name: `Points Are Bad`
- short name: `PAB`
- start URL: `/dashboard`
- scope: `/`
- display: `standalone`
- orientation: `any`
- background and theme colors matching the neutral Index loading canvas
- 192px and 512px standard PNG icons
- a 512px maskable PNG icon with adequate safe-zone padding

The existing 96px favicon and 180px Apple icon are too small to derive every required size safely. New icons will be rendered from the existing PAB artwork without changing the visual identity. The existing Apple touch icon remains explicitly linked for iOS.

### Service worker

The Vite PWA plugin will generate a Workbox service worker.

Precached resources:

- production HTML/JS/CSS bundles
- PAB icons and competition/team assets shipped from `public/`
- the offline document required to render the React shell

Runtime rules:

- `/api/**`: `NetworkOnly`; never written to Cache Storage
- navigation requests: use the precached app shell so client-side routes open when offline
- Google Fonts stylesheet and font files: `StaleWhileRevalidate` with bounded expiration
- same-origin static images not already precached: `CacheFirst` with bounded expiration

No Firebase/user/group response, authentication response, prediction, live score, or standings payload may enter the service-worker cache.

### Offline experience

The application will track browser connectivity and recognize network-level API failures. When boot cannot retrieve the session because the device is offline, it will replace indefinite loading with a dedicated offline screen containing:

- PAB branding
- “You’re offline” copy
- a short explanation that live scores and picks need a connection
- a retry button

If connectivity drops after the UI has loaded, a compact offline banner appears. Existing in-memory content may remain visible, but it is not persisted for later offline use and all write controls continue to rely on the server. Browser `online` events trigger a normal retry rather than replaying previous writes.

### Update lifecycle

The app registers the service worker through the plugin’s React helper. Registration checks for updates on load and when the page becomes visible. When a waiting worker exists, a compact prompt offers `Update` and `Later`. Selecting `Update` activates the worker and reloads once. The update UI will follow the active theme and remain accessible on mobile.

## Security and privacy

- API routes are explicitly network-only.
- Authenticated HTML data is not embedded in static documents.
- Private group data is not stored in service-worker caches.
- Existing local session/theme storage is unchanged.
- Offline mode never weakens kickoff locking because predictions are not accepted or queued without server confirmation.

## Performance

- Service-worker registration occurs after the initial React render.
- The plugin precaches hashed production assets and removes outdated caches automatically.
- Runtime caches have entry and age limits.
- No extra request is added to the live-score polling loop.
- The new PWA UI is code-split only if the bundle impact is material; otherwise it remains a small shared component.

## Testing and acceptance criteria

Automated checks will verify:

- required manifest fields and icon declarations
- API routes use `NetworkOnly`
- navigation fallback is configured without caching API responses
- service-worker registration and update prompt are wired into the app
- offline boot resolves to the offline state rather than hanging
- retry and update actions are accessible

Production verification will cover:

- successful production build and existing test suite
- Chrome DevTools installability with no manifest/service-worker errors
- installation and standalone launch at `/dashboard`
- offline reload of the app shell
- failed prediction attempts never being queued or replayed
- update prompt appearing after a new deployment
- iPhone add-to-home-screen metadata and safe-area layout
- no regression to ordinary browser load time or live-score polling

## Rollout

Deploy through the existing `main` → Vercel flow. After deployment, verify the manifest and service worker on `https://www.pab.wtf`, install the production app, test offline behavior, then make one follow-up deployment to confirm the update lifecycle. If any service-worker issue appears, unregistering the worker and removing the plugin configuration cleanly restores the current web-only behavior.

