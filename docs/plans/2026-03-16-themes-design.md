# Theme System Design
**Date:** 2026-03-16

## Overview
Add a multi-theme system to Points Are Bad. Themes are purely cosmetic — no mechanic changes. The existing binary dark/light toggle in Settings is replaced with a 6-theme picker grid.

## Themes

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `dark` | Dark | existing | Current default — deep navy/black |
| `light` | Light | existing | Warm off-white |
| `excel` | Excel | new | Spreadsheet look — white, Arial, tight grid |
| `terminal` | Terminal | new (color only) | Green on black, monospace, Matrix feel |
| `nord` | Nord | new (color only) | Cool blue-grey, popular dev palette |
| `pitch` | Pitch | new (color only) | Deep greens, football-inspired |

## Implementation Approach

**CSS variables + one extra class for Excel mode (Approach B)**

- Each theme is a `[data-theme="<key>"]` block in the `CSS` string overriding all existing CSS variables
- Excel mode additionally gets an `excel-mode` class injected on `AllPicksTable` for structural tweaks (cell borders, padding, font) that can't be done via variables alone
- No component logic changes — purely presentational

## CSS Variable Sets

All themes override the same variable set already in use:
`--bg, --surface, --card, --card-hi, --card-hover, --input-bg, --border, --border2, --border3, --text, --text-dim, --text-dim2, --text-dim3, --text-mid, --text-bright, --text-inv, --scrollbar, --btn-bg, --btn-text`

Font family is added as a new variable `--font-mono` (default: `'DM Mono'`) so Excel/Terminal can swap it.

## Excel Mode Details

- Background: pure white (`#ffffff`)
- Font: `Arial, Calibri, sans-serif` — no Google Fonts import needed
- `AllPicksTable` gets className `excel-mode` when active theme is `excel`
- `.excel-mode` CSS:
  - All `td`/`th`: `border: 1px solid #d0d0d0`, `border-radius: 0`, padding `6px 10px`
  - Header row: `background: #f2f2f2`, bold, grey text
  - No card border-radius on the table wrapper
  - Player name cells: colored left-border (3px) matching their existing highlight color

## Settings UI

- Replaces the current dark/light `<Btn>` toggle in the Settings tab
- 6-card grid, each card shows:
  - Color swatch (small circles of `--bg`, `--surface`, `--text` for that theme)
  - Theme name label
  - Checkmark border when selected
- Clicking a card sets the theme immediately (live preview)

## Storage

- `localStorage` key: `"theme"` (unchanged)
- Valid values: `"dark"` | `"light"` | `"excel"` | `"terminal"` | `"nord"` | `"pitch"`
- Default: `"dark"` (unchanged)
- `index.html` splash theme-restore script already handles `"light"` — needs updating to handle all non-dark themes by checking `!== "dark"`

## State Changes

- Replace `const [dark, setDark]` with `const [theme, setTheme]`
- `document.documentElement.setAttribute("data-theme", theme)`
- Pass `theme` down to `AllPicksTable` so it can conditionally apply `excel-mode` class

## Out of Scope
- Per-user theme synced to Firestore (localStorage only)
- Theme affects only visuals, zero impact on picks/scoring/submissions logic
