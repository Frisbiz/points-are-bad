import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function loadEffectiveFixtureResult() {
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const match = source.match(/function effectiveFixtureResult\(fixture, liveScores\) \{[\s\S]*?\n\}/);
  assert.ok(match, "effectiveFixtureResult should exist in App.jsx");
  return Function(`${match[0]}; return effectiveFixtureResult;`)();
}

test("finished Yahoo scores display while the group fixture waits for sync", () => {
  const effectiveFixtureResult = loadEffectiveFixtureResult();
  const fixture = {
    id: "wc-gw4-fsoccer-g-13532361",
    home: "South Africa",
    away: "Canada",
    result: null,
    status: "SCHEDULED",
  };
  const liveScores = {
    "South Africa|Canada": {
      status: "finished",
      homeScore: 0,
      awayScore: 1,
    },
  };

  assert.equal(effectiveFixtureResult(fixture, liveScores), "0-1");
});
