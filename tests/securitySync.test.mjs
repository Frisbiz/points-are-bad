import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const securitySource = readFileSync(new URL("../api/security.js", import.meta.url), "utf8");

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
