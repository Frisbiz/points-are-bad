# World Cup Cache Idempotency Fix

## Problem

The World Cup fixture cache contains resolved knockout fixtures that retain their original group-stage seed metadata. `formatWorldCupGlobalDocSeedPlaceholders` currently treats those already-formatted fixtures as changed on every refresh because it creates replacement objects without checking whether their values differ.

`refreshYahooFixtureCache` interprets that false-positive normalization as a cache update, writes a new `updatedAt`, and then applies the normal freshness check. The refreshed timestamp causes the function to return early before fetching completed quarter-final results, leaving the semifinal team slots empty.

## Design

Make seed-placeholder formatting idempotent at the fixture-side boundary. If the displayed seed and stored original seed already match the desired values, the formatter returns no patch. As a result, a fully normalized cache preserves object identity and `formatWorldCupGlobalDocSeedPlaceholders` reports `changed: false`.

The fixture refresh flow and cache freshness policy remain unchanged. Once normalization stops generating false changes, stale completed rounds will proceed to Yahoo and merge their results normally.

## Testing

Add a regression test with a resolved knockout fixture that retains `awayOriginalSeed`. The first assertion verifies formatting leaves an already-normalized global document unchanged. The test must fail before the production change and pass afterward.

Run the focused World Cup bracket tests, the complete Node test suite, and the production build. After deployment, force-refresh World Cup round 6 and verify the shared cache contains all four quarter-final results and the projected semifinal fixtures are France vs Spain and England vs Argentina.

## Scope

No fixture IDs, predictions, scores, advancement mappings, refresh intervals, or UI behavior will be changed. The production repair is limited to refreshing authoritative fixture data after the code fix is deployed.
