# Points Are Bad

A Premier League score prediction game to play with friends. Every gameweek, everyone submits their predicted scorelines. The further off you are, the more points you get. Lowest score wins.

---

## How It Works

Before each gameweek kicks off, you predict the exact scoreline for every match. Once results are in, points are calculated like this:

> Each goal your prediction is off costs you 1 point.

So if you predict 1-1 and the actual result is 2-3, that's 1+2 = **3 points**. Nail the exact score and you get **0 points** and a star to brag about.

At the end of the season, whoever has the fewest points wins.

---

## Getting Started

1. Create an account (just a username and password, nothing fancy)
2. Create a group or join one with a 4-digit invite code
3. Head to the Fixtures tab and start predicting

That's it. Share your group code with friends and you're off.

---

## Features

**Predictions** -- Submit scorelines for each match in a gameweek before they're played.

**Live fixture sync** -- Admins can pull the latest fixtures and results directly from the Premier League with one click.

**Leaderboard** -- A running table sorted by total points, lowest first. Updated as results come in.

**Trends** -- Charts showing how each player's points are tracking over the season: per-gameweek scores, a cumulative race, perfect predictions, and a points distribution breakdown.

**Perfect predictions** -- Getting a scoreline exactly right (0 points) is tracked separately because it deserves recognition.

**Admin controls** -- Group creators can promote admins, kick members, and manage group settings.

---

## Scoring at a Glance

| Prediction | Result | Points |
|---|---|---|
| 2-1 | 2-1 | 0 (perfect!) |
| 1-0 | 2-0 | 1 |
| 1-1 | 2-3 | 3 |
| 0-0 | 4-2 | 6 |

Lower is always better.

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and you're good to go.

---

Built with React, Firebase, and a lot of wishful thinking about scorelines.
