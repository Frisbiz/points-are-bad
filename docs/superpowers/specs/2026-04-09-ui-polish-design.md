# UI Polish: Layout Consistency and Font Size Pass

**Date:** 2026-04-09
**Branch:** `ui-polish`
**File:** `src/App.jsx` (all changes confined here)

## Problem

When switching between tabs, the content area changes width noticeably:

- League, Fixtures, Trends: fill the full 940px container
- Members: inner `maxWidth: 560`
- Group: inner `maxWidth: 520`

This causes a visible layout jump between tabs. Additionally, many labels use 9–10px font sizes that are too small to read comfortably, and border radii are inconsistently applied across similar card elements.

## Goals

1. Eliminate the content-width jump when switching tabs
2. Raise the minimum readable font size to 11px across all non-decorative text
3. Standardize border radii on card rows and chart containers
4. Lightly bump player name and team name font sizes for readability

## Out of Scope

- New features or behaviour changes
- Colour scheme or theme changes
- Chart redesigns
- Mobile layout overhaul
- The `index` theme (it has its own layout system via `liquid-card` and `isIndex` branches)

---

## Change 1: Width Consistency

**MembersTab** — remove the inner `maxWidth` constraint:
```jsx
// Before
<div style={{maxWidth: isIndex ? 860 : 560}}>

// After
<div>
```

**GroupTab** — remove the inner `maxWidth` constraint:
```jsx
// Before
<div style={{maxWidth: isIndex ? 920 : 520}}>

// After
<div>
```

Both tabs now fill the full 940px container set by `<main>` in `GameUI`, the same as League, Fixtures, and Trends.

---

## Change 2: Font Size Floor (minimum 11px for non-decorative text)

All text that communicates information (labels, headers, counts, meta text) must be at least 11px. The following specific locations need updating:

| Location | Before | After |
|---|---|---|
| Bot-nav tab labels (`.bot-nav .nb`) | `fontSize: 9` | `fontSize: 11` |
| `Section` component title | `fontSize: 10` | `fontSize: 11` |
| Fixture column headers row (Home/Result/Away/Pick/Pts) | `fontSize: 10` | `fontSize: 11` |
| League tab meta ("X RESULTS COUNTED") | `fontSize: 11` | stays 11 (no change) |
| LeagueTab "PERFECT" / "AVG" column sub-labels | `fontSize: 10` | `fontSize: 11` |
| MembersTab member count ("X PLAYERS") | `fontSize: 11` | stays 11 (no change) |
| Recap banner text | `fontSize: 11` | `fontSize: 12` |
| TrendsTab `CC` component title | `fontSize: 10` | `fontSize: 11` |
| GroupTab `Section` separator labels (via `Section` component) | `fontSize: 10` | `fontSize: 11` |

**Exceptions — intentionally micro (stay at 9px):**
- "FT" / "LIVE" / "POSTPONED" match status badges — decorative micro-indicators
- Fixture date strings inside mobile cards

---

## Change 3: Border Radius Standardization

| Element | Before | After |
|---|---|---|
| Fixture rows (desktop and mobile) | `borderRadius: 8` | `borderRadius: 10` |
| TrendsTab `CC` (chart card) component | `borderRadius: 14` | `borderRadius: 12` |
| League rows | `borderRadius: 10` | stays 10 |
| Member rows | `borderRadius: 10` | stays 10 |
| Alert / info banners | `borderRadius: 8` | stays 8 |
| Inputs, buttons | `borderRadius: 8` | stays 8 |

Consistent rule: **card rows = 10px, chart panels = 12px, controls/banners = 8px**.

---

## Change 4: Name and Team Text Size Bumps

| Location | Before | After |
|---|---|---|
| Player names in LeagueTab rows | `fontSize: 14` | `fontSize: 15` |
| Player names in MembersTab rows | `fontSize: 14` | `fontSize: 15` |
| Team names in Fixtures desktop rows | `fontSize: 13` | `fontSize: 14` |
| Team names in NextMatchCountdown | `fontSize: 13` | `fontSize: 14` |

---

## Change 5: Section Component Label

The `Section` primitive used throughout `GroupTab`:

```jsx
// Before
<div style={{fontSize:10, color:"var(--text-dim2)", letterSpacing:3, textTransform:"uppercase", marginBottom:14, borderBottom:"1px solid var(--border)", paddingBottom:8}}>

// After
<div style={{fontSize:11, color:"var(--text-dim2)", letterSpacing:2, textTransform:"uppercase", marginBottom:14, borderBottom:"1px solid var(--border)", paddingBottom:8}}>
```

Bump from 10px to 11px, reduce letter-spacing from 3 to 2 (less tight at the larger size).

---

## Implementation Notes

- All changes are in `src/App.jsx` only
- The `isIndex` branches in each component remain untouched — this polish only targets the default dark/light/other themes
- No new components, no new state, no API changes
- Create branch `ui-polish` from `main` before starting
