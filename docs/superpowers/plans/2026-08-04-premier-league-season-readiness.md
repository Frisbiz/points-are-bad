# Premier League 2026-27 season readiness

## Goal

Make the site ready for the 2026-27 Premier League season without migrating or
changing the behavior of existing 2025 groups.

## Approach

1. Add a shared current league-season helper that resolves the season start
   year from the current date (July onward belongs to the new season).
2. Use that helper for new PL/La Liga group creation, the lobby's fixture
   preview/cache lookup, the fixture proxy's omitted-season default, and
   Yahoo fixture/live cache defaults.
3. Keep existing `group.season || 2025` fallbacks in scoring and admin paths so
   historical groups continue to read and sync their own season data.
4. Add regression checks for current-season defaults and legacy 2025
   preservation, then run the full available verification suite.

## Verification

- Run the Node test files directly (the package has no `test` script).
- Run `npm run lint` and `npm run build`.
- Exercise the fixture proxy with an explicit 2026 request and, when the
  deployment is reachable, the public endpoint as a read-only smoke check.
