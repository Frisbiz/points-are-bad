import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const securitySource = readFileSync(new URL("../api/security.js", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("../api/db.js", import.meta.url), "utf8");

test("auto sync still merges corrected fixture fields when the global cache timestamp is not newer", () => {
  const autoSyncBlock = securitySource.slice(
    securitySource.indexOf("if (payload.type === 'auto-sync-fixtures')"),
    securitySource.indexOf("return bad(res, 400, 'Unsupported group user action')")
  );

  assert.match(securitySource, /function hasFixtureSyncChanges\(before, after\)/);
  assert.match(autoSyncBlock, /const merged = globalDoc \? mergeGlobalIntoGroup\(globalDoc, cleanedGroup\) : null;/);
  assert.match(autoSyncBlock, /if \(globalDoc\.updatedAt <= \(group\.lastAutoSync \|\| 0\)\)[\s\S]*hasFixtureSyncChanges\(cleanedGroup, merged\)/);
  assert.match(autoSyncBlock, /staleMerge: true/);
});

test("auto sync treats old World Cup groups as WC even without a competition field", () => {
  const autoSyncBlock = securitySource.slice(
    securitySource.indexOf("if (payload.type === 'auto-sync-fixtures')"),
    securitySource.indexOf("return bad(res, 400, 'Unsupported group user action')")
  );

  assert.match(securitySource, /isWorldCupGroupLike/);
  assert.match(autoSyncBlock, /const isWC = isWorldCupGroupLike\(group\);/);
  assert.match(autoSyncBlock, /const comp = isWC \? 'WC' : \(group\.competition \|\| 'PL'\);/);
});

test("database reads normalize fixture docs and old World Cup groups before returning them", () => {
  assert.match(dbSource, /normalizeWorldCupGroup/);
  assert.match(dbSource, /normalizeLeagueFixtureDoc/);
  assert.match(dbSource, /if \(key\.startsWith\("fixtures:"\)\)/);
  assert.match(dbSource, /const group = normalizeWorldCupGroup\(value\);/);
  assert.match(dbSource, /normalizeLeagueFixtureDoc\(group, group\?\.competition \|\| "PL", group\?\.season\)/);
});

test("finished live score sync merges authoritative global fixtures and skips unchanged writes", () => {
  assert.match(securitySource, /if \(payload\.type === 'sync-finished-live-scores'\)/);
  const start = securitySource.indexOf("if (payload.type === 'sync-finished-live-scores')");
  const end = securitySource.indexOf("if (payload.type === 'auto-sync-fixtures')", start);
  const finalizationBlock = securitySource.slice(start, end);

  assert.match(finalizationBlock, /const globalDoc = await getValue\(fixtureGlobalKey\(comp, seas\)\);/);
  assert.match(finalizationBlock, /const cleanedGroup = dedupeGroupFixtures\(group\);/);
  assert.match(finalizationBlock, /const merged = globalDoc \? mergeGlobalIntoGroup\(globalDoc, cleanedGroup\) : null;/);
  assert.match(finalizationBlock, /if \(!merged \|\| !hasFixtureSyncChanges\(cleanedGroup, merged\)\)[\s\S]*updated: false/);
  assert.match(finalizationBlock, /await setValue\(groupKey, next\);[\s\S]*updated: true/);
  assert.doesNotMatch(finalizationBlock, /refreshYahooFixtureCache/);
});
