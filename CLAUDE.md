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

This is a single-page React app for a Premier League prediction game. The entire application lives in **`src/App.jsx`** (~810 lines) — all components, state, data access, and styling are colocated in this one file.

### External Services

- **Firebase Firestore** — all persistence. Config is embedded in `App.jsx` as `FIREBASE_CONFIG`.
- **football-data.org API** — Premier League fixture/result data. The global API key `GLOBAL_API_KEY` and base URL `FD_BASE` are hardcoded in `App.jsx`.

### Firestore Data Model

| Key pattern | Contents |
|---|---|
| `user:{username}` | Profile: displayName, password (plaintext), groupIds |
| `group:{id}` | Members, admins, gameweeks, fixtures, predictions |
| `groupcode:{code}` | Maps 4-digit invite code → group ID |
| `data` collection | Generic key-value store |

Reads/writes go through two thin wrappers: `sget(key)` and `sset(key, val)`. LocalStorage is used for session state via `lget()`, `lset()`, `ldel()`.

### Scoring

Points = sum of |predicted goals − actual goals| per match. Lower is better. Perfect predictions (0 points) are tracked separately.

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
    └── GroupTab        — settings, invite code, API key config
```

### Styling

All styles are inline React objects. Dark theme: `#080810` background, `#e8e4d9` text. Fonts loaded from Google Fonts: DM Mono (body) and Playfair Display (headings).

### Deployment

Deployed to Vercel. Config is in `.vercel/project.json`.
