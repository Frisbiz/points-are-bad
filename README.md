<div align="center">

<img src="public/logo.png" alt="Points Are Bad" width="400" />

<p>A Premier League score prediction game for friend groups.</p>

<a href="https://pab.wtf"><strong>pab.wtf →</strong></a>

<br />

![React](https://img.shields.io/badge/react-18-blue?style=flat-square)
![Vite](https://img.shields.io/badge/vite-5-646cff?style=flat-square)
![Firebase](https://img.shields.io/badge/firebase-firestore-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Status](https://img.shields.io/badge/status-live-brightgreen?style=flat-square)

</div>

---

Predict the exact scoreline for every Premier League match each gameweek. Every goal you're off by costs you a point. Get the score right and you walk away with zero. Lowest total at the end of the season wins.

---

## Scoring

```
Prediction: 1-1   Result: 2-3   ->  1 + 2 = 3 points
Prediction: 2-1   Result: 2-1   ->  0 points  (perfect)
```

| Prediction | Result | Points |
|---|---|---|
| 2-1 | 2-1 | 0 |
| 1-0 | 2-0 | 1 |
| 1-1 | 2-3 | 3 |
| 0-0 | 4-2 | 6 |

---

## Features

**Gameweek predictions** — Submit scorelines for every match before kickoff. Fixtures lock individually as they kick off.

**Pick reveal** — Nobody sees anyone else's picks until they've submitted their own for the week.

**Live sync** — Fixtures and results pulled from the Premier League API. One button per gameweek.

**Leaderboard** — Running totals sorted lowest first, updated as results come in.

**Trends** — Per-gameweek scores, cumulative race chart, perfect prediction count, and points distribution per player.

**Seasons** — Full multi-season support with historical data preserved.

**Groups** — Private groups with a 4-digit invite code. Admins can manage members, lock gameweeks, and correct picks.

**Themes** — Six themes: Dark, Light, Excel, Terminal, Nord, Pitch. Excel mode renders the picks table in a spreadsheet layout with coloured player columns and per-cell point indicators.

---

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

---

## Stack

- React + Vite
- Firebase / Firestore
- Premier League API for fixtures and results
- Hosted at [pab.wtf](https://pab.wtf) via Vercel

---

## Self-hosting

You'll need a Firebase project with Firestore enabled. Firestore rules are in `firestore.rules`. Review before deploying.
