# GW Visibility Design

**Date:** 2026-02-25

## Overview

Admins can toggle individual gameweeks visible or locked for non-admin players. Locked GWs appear grayed out in the strip and are read-only inside. All GWs are visible by default.

## Data Model

Add `hiddenGWs: []` to the group document. A GW is admin-locked if its number appears in this array. Existing groups without the field treat it as `[]`.

No changes to individual gameweek objects.

## Group Tab (admin only)

New "Gameweek Visibility" section below the existing Gameweeks section. Shows all GWs for the active season as a row of small toggle buttons (same style as the GW strip). Clicking a button immediately toggles the GW in/out of `hiddenGWs` via `updateGroup`. No save button needed.

## GW Strip

- **Non-admins:** locked GW buttons appear dimmed with reduced opacity. Clicking still navigates to that GW.
- **Admins:** no visual change, full access.

## Fixtures View

- **Non-admins on a locked GW:** small notice at top ("This gameweek is locked by your admin."). All prediction inputs replaced with read-only display (same as post-kickoff treatment). Wizard does not fire for locked GWs. AllPicksTable still shows if they have submitted all picks.
- **Admins on a locked GW:** no difference, full edit access.
