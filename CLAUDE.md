# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build to dist/
npm run preview   # Preview production build locally
npm run lint      # Run ESLint
```

There are no tests in this project.

## Architecture

This is a single-page React app for a Premier League prediction game. The entire application lives in **`src/App.jsx`** (810 lines) — all components, state, data access, and styling are colocated in this one file.

### External Services

- **Firebase Firestore** — all persistence. Config is embedded in `App.jsx` as `FIREBASE_CONFIG`. The Firebase SDK is loaded via **dynamic ESM imports from the Google CDN** (`https://www.gstatic.com/firebasejs/11.10.0/`) at runtime — it is not imported from `node_modules/firebase` even though that package is listed in `package.json`.
- **football-data.org API** — Premier League fixture/result data. The global API key `GLOBAL_API_KEY` and base URL `FD_BASE` are hardcoded in `App.jsx`. `fetchMatchweek(apiKey, matchday, season)` calls the API; `parseMatchesToFixtures` transforms the response.

### Firestore Data Model

| Key pattern | Contents |
|---|---|
| `user:{username}` | Profile: displayName, password (plaintext), groupIds |
| `group:{id}` | Members, admins, gameweeks, fixtures, predictions |
| `groupcode:{code}` | Maps 4-digit invite code → group ID |
| `data` collection | Generic key-value store |

All reads/writes go through `sget(key)` and `sset(key, val)`. LocalStorage is used for session state via `lget()`, `lset()`, `ldel()`.

### Key Functions

- `computeStats(group)` — derives per-member leaderboard data (totals, averages, perfects, per-GW breakdown) from raw Firestore group data; used by `LeagueTab` and `TrendsTab`.
- `calcPts(pred, result)` — core scoring: sum of absolute goal differences (`|pH-rH| + |pA-rA|`). Lower is better.
- `makeFixturesFallback(gw)` — generates deterministic placeholder fixtures when the API is unavailable.
- `updateGroup(fn)` — functional updater pattern passed as a prop into tab components. It reads the latest group from Firestore, applies `fn(currentGroup)`, writes the result back, and refreshes local state.

### Component Tree (all in App.jsx)

```
App
├── AuthScreen          — login / register
├── GroupLobby          — create / join groups
└── GameUI              — main shell with tab navigation
    ├── LeagueTab       — leaderboard (ascending points)
    ├── FixturesTab     — enter predictions + results
    ├── TrendsTab       — charts (Recharts): cumulative, distribution, perfects
    ├── MembersTab      — member management, admin controls
    └── GroupTab        — settings, invite code, season config
```

### Shared UI Primitives (defined in App.jsx, use these instead of raw elements)

- `Btn` — button with variants: `default`, `ghost`, `danger`, `success`, `muted`, `amber`. Accepts `small` and `style` props.
- `Input` — styled text input; use instead of `<input>`.
- `Avatar` — initials avatar with deterministic hue from name.
- `BadgeScore` — coloured score badge (green=0, amber≤2, red>2).
- `Section` — labelled section wrapper with uppercase title.

### Styling

All styles are inline React objects. Dark theme: `#080810` background, `#e8e4d9` text. Fonts loaded from Google Fonts: DM Mono (body) and Playfair Display (headings). Global CSS (scrollbars, animations, tab styles) is injected via a `<style>` tag using the `CSS` string constant.

### Deployment

Deployed to Vercel. Config is in `.vercel/project.json`.
