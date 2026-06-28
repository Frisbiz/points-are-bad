import test from "node:test";
import assert from "node:assert/strict";

import { mergeGlobalIntoGroup } from "../api/_fixtureSync.js";

test("mergeGlobalIntoGroup updates resolved WC seed fields while preserving picks", () => {
  const group = {
    id: "g1",
    competition: "WC",
    season: 2026,
    predictions: {
      faris: { "wc-gw4-f13532371": "1-1" },
    },
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-f13532371",
            apiId: "13532371",
            home: "Switzerland",
            away: "3E/3F/3G/3I/3J",
            status: "SCHEDULED",
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: Date.now(),
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-f13532371",
            apiId: "13532371",
            home: "Switzerland",
            away: "Algeria",
            status: "SCHEDULED",
            awayTeamId: "soccer.t.369",
            awaySeed: "3J",
            awayOriginalSeed: "3E/3F/3G/3I/3J",
            awayCrest: "alg.png",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(fixture.away, "Algeria");
  assert.equal(fixture.awayTeamId, "soccer.t.369");
  assert.equal(fixture.awaySeed, "3J");
  assert.equal(fixture.awayOriginalSeed, "3E/3F/3G/3I/3J");
  assert.equal(fixture.awayCrest, "alg.png");
  assert.equal(merged.predictions.faris["wc-gw4-f13532371"], "1-1");
});
