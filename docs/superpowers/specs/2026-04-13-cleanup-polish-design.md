# Cleanup & Polish Design Spec

**Date:** 2026-04-13
**Scope:** Moderate cleanup - bug fixes, UX polish, code quality, Group tab redesign, GW selector improvements. Single-file architecture preserved. Error boundaries added.

---

## 1. Bug Fixes

### 1a. Group join doesn't refresh lobby list

**Root cause:** `joinGroup()` in GroupLobby calls `onEnterGroup(data.group)` and `onUpdateUser(data.user)`, but App's `groups` state array is never updated. It only populates on login via `handleLogin()`.

**Fix:** In `handleEnterGroup` (App component), after setting the group, also append it to the `groups` state if not already present:
```js
setGroups(prev => prev.some(g => g.id === fresh.id) ? prev : [...prev, fresh]);
```

### 1b. Missing `onUpdateUser` prop in GroupTab

**Root cause:** `GroupTab.leaveGroup()` calls `onUpdateUser(data.user)` on line ~4480, but `onUpdateUser` is not in the component's destructured props. Silently fails (user doc not updated in memory after leaving).

**Fix:** Add `onUpdateUser` to GroupTab's props and pass it down from GameUI.

### 1c. GW selector default position

**Current:** Finds first GW with a future-dated unfinished fixture. Doesn't account for postponed matches or the concept of "current active GW."

**New logic:** Find the lowest GW in the active season that has at least one non-postponed fixture without a result. This is the "active GW." If all GWs complete, default to the last one with results. Postponed-only GWs are skipped.

```js
// Pseudocode for active GW detection
const activeGW = seasonGWs.find(gw =>
  gw.fixtures.some(f => !f.result && f.status !== "POSTPONED" && f.status !== "FINISHED")
)?.gw;
```

---

## 2. GW Selector Polish

### 2a. Active GW indicator

Two visual states on GW buttons:
- **Viewing (selected):** Filled button with `var(--btn-bg)` (existing behavior)
- **Active GW (current real-world):** Small colored dot below the GW number. Visible even when a different GW is selected, so users always know where "now" is.

Dot colors (same as 2c):
- `#22c55e` green = all non-postponed fixtures have results (complete)
- `#f59e0b` amber = some results exist, some pending (in progress)
- No dot = future, no results yet
- `#ef4444` red = admin-locked GW

### 2b. Scroll behavior improvements

- On mount: instant scroll to center the active GW (keep instant, not smooth, to avoid jarring on load)
- Horizontal wheel scroll: convert `deltaY` to horizontal `scrollLeft` on the strip (reuse existing pattern, but extract to a shared `useHorizontalScroll` ref callback)
- Arrow buttons: keep current page-jump behavior
- Edge fade gradients: add left/right fade hints (like the theme picker) so users know the strip is scrollable

### 2c. GW status dots

Each button in the strip gets a 6px dot indicator below the label:
- `#22c55e` (green) = complete (all non-postponed fixtures have results)
- `#f59e0b` (amber) = in progress (some results exist)
- transparent/none = no results yet
- `#ef4444` (red) = admin-locked

---

## 3. Group Tab Redesign (Accordion Sections)

Replace the current flat scroll of settings with collapsible accordion sections.

### Section structure

| Section | Visible to | Default state | Contents |
|---------|-----------|---------------|----------|
| Group Info | Everyone | Expanded | Group name (editable by admin), invite code with copy button, share link |
| Rules | Everyone | Collapsed | Prediction limits (1-1 draw rule), score scope (all/current season), dibs mode settings |
| Gameweeks | Admins | Collapsed | GW locking toggles, create/backfill buttons, sync fixtures, sync all dates |
| Seasons | Admins | Collapsed | Active season display, start new season button, season history |
| Backups | Admins | Collapsed | Create/restore/delete backups with timestamps |
| Danger Zone | Everyone | Collapsed | Leave group (all users), delete group (creator only). Red-tinted border. |

### Accordion behavior

- Click section header to toggle open/closed
- Only one section open at a time (clicking a new one closes the previous)
- Section header shows: title, brief summary of current values (e.g., "Draw limit: 2"), chevron indicator
- Smooth height transition (CSS `max-height` or `grid-template-rows: 0fr/1fr`)
- Non-admin users only see: Group Info, Rules, Danger Zone (3 sections)

### Admin badge

Admin-only sections get a small "ADMIN" badge next to the title in `var(--text-dim)` with a border.

---

## 4. General Polish & Code Quality

### 4a. Shared API helper

Extract `callAPI(action, payload)`:
```js
async function callAPI(action, payload = {}) {
  try {
    const res = await fetch('/api/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `Error ${res.status}`, status: res.status };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}
```

Replace all `fetch('/api/security', ...)` calls throughout the codebase with `callAPI()`. This eliminates ~30 instances of duplicated fetch/parse/error-check boilerplate.

### 4b. Error boundaries

Add a `TabErrorBoundary` class component that wraps each tab in GameUI:
```jsx
<TabErrorBoundary key={tab} tabName={tab}>
  {tab === "League" && <LeagueTab ... />}
  {tab === "Fixtures" && <FixturesTab ... />}
  ...
</TabErrorBoundary>
```

Fallback UI: card with "Something went wrong" message, tab name, and a "Try again" button that resets the boundary's error state.

### 4c. Loading & error consistency

- Create a `Spinner` component (small animated dots, replacing `"..."` text across the codebase)
- Standardize error display: red text with consistent font size (12px), consistent placement (below the triggering element)
- Success messages: green text, auto-dismiss after 3 seconds

### 4d. Theme constants

Extract a `THEMES` array:
```js
const THEMES = [
  { id: "dark", label: "Dark", group: "core" },
  { id: "light", label: "Light", group: "core" },
  { id: "excel", label: "Excel", group: "fun" },
  { id: "terminal", label: "Terminal", group: "fun" },
  { id: "nord", label: "Nord", group: "core" },
  { id: "pitch", label: "Pitch", group: "fun" },
  { id: "velvet", label: "Velvet", group: "secret", unlock: "konami" },
  { id: "clarity", label: "Clarity", group: "core" },
  { id: "spotify", label: "Spotify", group: "fun" },
  { id: "index", label: "Index", group: "core" },
];
```

Theme picker, CSS conditionals, and `isIndex`/`isSpotify` checks all reference `THEMES` instead of scattered string literals.

### 4e. Dead code cleanup

- Verify `api/security.js` has no remaining API-Football code (previous session may not have committed the revert)
- Remove any unused state variables in FixturesTab and GroupTab
- Consolidate the 3 duplicate wheel-scroll binding patterns into a single `useHorizontalScroll` ref callback:
```js
function useHorizontalScroll() {
  return useCallback(node => {
    if (!node || node._wheelBound) return;
    node._wheelBound = true;
    node.addEventListener("wheel", e => {
      e.preventDefault();
      node.scrollLeft += e.deltaY;
    }, { passive: false });
  }, []);
}
```

### 4f. Account modal polish

- Section headers with dividers (Display Name, Security, Appearance)
- Theme picker collapsed by default behind a "Change theme" button/row
- Password change in its own section with clear current/new/confirm flow
- Better spacing: 20px between sections, 12px within

### 4g. Mobile polish

- Bottom nav: enforce 48px minimum tap targets
- All modals: add `overflow-y: auto; max-height: 85vh` to prevent off-screen content on small devices
- Fixture cards: review spacing, ensure score inputs aren't cramped
- GW strip: ensure touch-scroll is smooth, buttons are at least 44px wide

---

## 5. Out of Scope

- Breaking App.jsx into separate files (architectural restructure)
- Adding tests
- Changing the data model or API contract
- New features (only polish/fix existing)
- Recharts/TrendsTab chart redesign (works fine as-is)

---

## 6. Implementation Order

1. Bug fixes (1a, 1b, 1c) - foundation, no visual changes
2. Shared API helper (4a) - needed before touching components
3. Theme constants + dead code cleanup (4d, 4e) - housekeeping
4. Horizontal scroll hook (4e consolidation) - used by GW selector
5. GW selector polish (2a, 2b, 2c) - visible improvement
6. Error boundaries (4b) - safety net before larger changes
7. Spinner + loading consistency (4c) - visual polish
8. Group tab accordion redesign (3) - largest UI change
9. Account modal polish (4f) - smaller UI change
10. Mobile polish pass (4g) - final sweep
