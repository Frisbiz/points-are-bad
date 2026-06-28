import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function loadAppFunction(name) {
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in App.jsx`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} should have a function signature`);
  const bodyStart = signatureEnd + 2;
  assert.notEqual(bodyStart, -1, `${name} should have a body`);
  let depth = 0;
  let end = -1;
  for (let index = bodyStart; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
  assert.notEqual(end, -1, `${name} body should close`);
  const fnSource = source.slice(start, end);
  return Function(`${fnSource}; return ${name};`)();
}

test("finished Yahoo scores display while the group fixture waits for sync", () => {
  const effectiveFixtureResult = loadAppFunction("effectiveFixtureResult");
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

test("finished Yahoo scores are applied before computing standings totals", () => {
  const applyFinishedLiveScoresToGroup = loadAppFunction("applyFinishedLiveScoresToGroup");
  const group = {
    id: "g1",
    season: 2026,
    competition: "WC",
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-fsoccer-g-13532361",
            home: "South Africa",
            away: "Canada",
            result: null,
            status: "SCHEDULED",
          },
        ],
      },
    ],
  };
  const liveScores = {
    "South Africa|Canada": {
      status: "finished",
      homeScore: 0,
      awayScore: 1,
    },
  };

  const projected = applyFinishedLiveScoresToGroup(group, liveScores);
  const fixture = projected.gameweeks[0].fixtures[0];

  assert.equal(fixture.result, "0-1");
  assert.equal(fixture.status, "FINISHED");
  assert.equal(group.gameweeks[0].fixtures[0].result, null);
});

test("auto sync still targets finished fixtures missing saved results", () => {
  const autoSyncTargetGW = loadAppFunction("autoSyncTargetGW");
  const group = {
    season: 2026,
    currentGW: 5,
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-fsoccer-g-13532361",
            home: "South Africa",
            away: "Canada",
            result: null,
            status: "FINISHED",
            date: "2026-06-28T19:00:00.000Z",
          },
        ],
      },
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-f1",
            home: "W73",
            away: "W75",
            result: null,
            status: "SCHEDULED",
            date: "2026-07-04T19:00:00.000Z",
          },
        ],
      },
    ],
  };

  assert.equal(autoSyncTargetGW(group), 4);
});
