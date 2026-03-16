# Points Are Bad

> A Premier League score prediction game where getting it wrong is the whole problem.

**[pab.wtf](https://pab.wtf)**

---

Most prediction games reward you for getting things right. This one punishes you for getting things wrong. Every goal your prediction misses costs you a point. Get the exact score and you walk away clean. Miss by a mile and you're carrying the shame all season.

Lowest points wins. Points are bad.

---

## How scoring works

Each goal your prediction is off by = 1 point.

```
Prediction: 1-1   Result: 2-3   →  1 + 2 = 3 points
Prediction: 2-1   Result: 2-1   →  0 points  ★
```

Nail the exact scoreline and you get zero. That's as good as it gets. At the end of the season, whoever has accumulated the least points takes the bragging rights.

| Prediction | Result | Points |
|---|---|---|
| 2-1 | 2-1 | **0** ★ |
| 1-0 | 2-0 | 1 |
| 1-1 | 2-3 | 3 |
| 0-0 | 4-2 | 6 |

---

## Features

**Gameweek predictions** — Submit exact scorelines for every match before kickoff. Once a fixture locks, your pick is locked too.

**Pick reveal** — You can't see what anyone else predicted until you've submitted all your own picks. No peeking.

**Live sync** — Fixtures and results pull straight from the Premier League API. One button, done.

**Leaderboard** — Running totals, sorted lowest first. Updates in real time as results come in.

**Trends** — Per-gameweek charts, a cumulative points race, perfect prediction counts, and a score distribution breakdown so you can see exactly who's been fluking it.

**Seasons** — Full multi-season support. Start a new season without losing the history.

**Groups** — Create a private group, share the 4-digit code, and you're playing. Admins can manage members, lock gameweeks, and edit picks if something needs correcting.

**Themes** — Six visual themes: Dark, Light, Excel, Terminal, Nord, and Pitch. Excel mode gives you a proper spreadsheet-style picks table — coloured player columns, alternating rows, and points colour-coded right next to each prediction.

---

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Create an account, start a group, share the code.

---

## Stack

- **React** + **Vite**
- **Firebase / Firestore** for data
- **Premier League API** for fixtures and results
- Deployed at [pab.wtf](https://pab.wtf) via Vercel

---

## Self-hosting

You'll need a Firebase project with Firestore enabled and an API key for fixture data. Drop your config in and you're good.

Firestore rules are included in `firestore.rules`. Review them before going live.

---

Built for a group chat that got too competitive about football scores.
