import test from "node:test";
import assert from "node:assert/strict";

import { applyFinishedLiveMatchesToGlobalDoc, mergeGlobalIntoGroup } from "../api/_fixtureSync.js";

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

test("finished live matches are promoted into cached fixture results", () => {
  const globalDoc = {
    season: 2026,
    updatedAt: 1,
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-fsoccer-g-13532361",
            apiId: "13532361",
            home: "South Africa",
            away: "Canada",
            result: null,
            status: "SCHEDULED",
            date: "2026-06-28T19:00:00.000Z",
            liveScore: null,
          },
        ],
      },
    ],
  };

  const promoted = applyFinishedLiveMatchesToGlobalDoc(globalDoc, 4, [
    {
      home: "South Africa",
      away: "Canada",
      status: "finished",
      homeScore: 0,
      awayScore: 1,
      elapsed: "FT",
      startTime: "2026-06-28T19:00:00.000Z",
    },
  ], 123);

  const fixture = promoted.globalDoc.gameweeks[0].fixtures[0];

  assert.equal(promoted.changed, true);
  assert.equal(fixture.result, "0-1");
  assert.equal(fixture.status, "FINISHED");
  assert.equal(fixture.liveScore, null);
  assert.equal(fixture.elapsed, "FT");
  assert.equal(promoted.globalDoc.updatedAt, 123);
  assert.equal(globalDoc.gameweeks[0].fixtures[0].result, null);
});

test("finished live knockout shootout metadata is promoted into cached fixtures", () => {
  const globalDoc = {
    season: 2026,
    updatedAt: 1,
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-fsoccer-g-13532362",
            apiId: "soccer.g.13532362",
            home: "Germany",
            away: "Paraguay",
            homeTeamId: "soccer.t.379",
            awayTeamId: "soccer.t.390",
            result: null,
            status: "SCHEDULED",
            date: "2026-06-29T20:30:00.000Z",
            liveScore: null,
          },
        ],
      },
    ],
  };

  const promoted = applyFinishedLiveMatchesToGlobalDoc(globalDoc, 4, [
    {
      home: "Germany",
      away: "Paraguay",
      homeTeamId: "soccer.t.379",
      awayTeamId: "soccer.t.390",
      status: "finished",
      homeScore: 1,
      awayScore: 1,
      winningTeamId: "soccer.t.390",
      winnerSide: "away",
      homeShootoutScore: 3,
      awayShootoutScore: 4,
      elapsed: "120'",
      startTime: "2026-06-29T20:30:00.000Z",
    },
  ], 123);

  const fixture = promoted.globalDoc.gameweeks[0].fixtures[0];

  assert.equal(promoted.changed, true);
  assert.equal(fixture.result, "1-1");
  assert.equal(fixture.status, "FINISHED");
  assert.equal(fixture.winningTeamId, "soccer.t.390");
  assert.equal(fixture.winnerSide, "away");
  assert.equal(fixture.homeShootoutScore, 3);
  assert.equal(fixture.awayShootoutScore, 4);
  assert.equal(fixture.elapsed, "120'");
});

test("finished live knockout metadata patches cached results that were saved before shootout data", () => {
  const globalDoc = {
    season: 2026,
    updatedAt: 1,
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-fsoccer-g-13532362",
            apiId: "soccer.g.13532362",
            home: "Germany",
            away: "Paraguay",
            homeTeamId: "soccer.t.379",
            awayTeamId: "soccer.t.390",
            result: "1-1",
            status: "FINISHED",
            date: "2026-06-29T20:30:00.000Z",
            liveScore: null,
          },
        ],
      },
    ],
  };

  const promoted = applyFinishedLiveMatchesToGlobalDoc(globalDoc, 4, [
    {
      home: "Germany",
      away: "Paraguay",
      status: "finished",
      homeScore: 1,
      awayScore: 1,
      winningTeamId: "soccer.t.390",
      winnerSide: "away",
      homeShootoutScore: 3,
      awayShootoutScore: 4,
      elapsed: "120'",
      startTime: "2026-06-29T20:30:00.000Z",
    },
  ], 123);

  const fixture = promoted.globalDoc.gameweeks[0].fixtures[0];

  assert.equal(promoted.changed, true);
  assert.equal(fixture.result, "1-1");
  assert.equal(fixture.winningTeamId, "soccer.t.390");
  assert.equal(fixture.winnerSide, "away");
  assert.equal(fixture.homeShootoutScore, 3);
  assert.equal(fixture.awayShootoutScore, 4);
  assert.equal(promoted.globalDoc.updatedAt, 123);
});
