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

test("mergeGlobalIntoGroup updates stale WC fixture dates while preserving picks", () => {
  const group = {
    id: "g1",
    competition: "WC",
    season: 2026,
    predictions: {
      faris: { "wc-gw5-fsoccer-g-13532382": "2-1" },
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-fsoccer-g-13532382",
            apiId: "soccer.g.13532382",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-06T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-fsoccer-g-13532382",
            apiId: "soccer.g.13532382",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-07T00:00:00.000Z",
            yahooDate: "2026-07-06",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(fixture.id, "wc-gw5-fsoccer-g-13532382");
  assert.equal(fixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(fixture.yahooDate, "2026-07-06");
  assert.equal(merged.predictions.faris["wc-gw5-fsoccer-g-13532382"], "2-1");
});

test("mergeGlobalIntoGroup updates rescheduled La Liga TIMED fixtures while preserving picks", () => {
  const group = {
    id: "g1",
    competition: "LL",
    season: 2026,
    predictions: {
      friend: { "gw1-f564636": "1-0" },
    },
    gameweeks: [
      {
        gw: 1,
        season: 2026,
        fixtures: [
          {
            id: "gw1-f564636",
            apiId: 564636,
            home: "Celta Vigo",
            away: "Osasuna",
            status: "SCHEDULED",
            date: "2026-08-16T19:30:00.000Z",
            result: null,
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 1,
        season: 2026,
        fixtures: [
          {
            id: "gw1-f564636",
            apiId: 564636,
            home: "Celta Vigo",
            away: "Osasuna",
            status: "TIMED",
            date: "2026-08-27T18:30:00.000Z",
            result: null,
            homeCrest: "celta.png",
            awayCrest: "osasuna.png",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(fixture.id, "gw1-f564636");
  assert.equal(fixture.date, "2026-08-27T18:30:00.000Z");
  assert.equal(fixture.status, "TIMED");
  assert.equal(fixture.homeCrest, "celta.png");
  assert.equal(fixture.awayCrest, "osasuna.png");
  assert.equal(merged.predictions.friend["gw1-f564636"], "1-0");
});

test("mergeGlobalIntoGroup updates old WC placeholder rows after teams advance", () => {
  const group = {
    id: "g1",
    competition: "WC",
    season: 2026,
    predictions: {
      faris: { "wc-gw5-old-row": "2-1" },
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-old-row",
            home: "W81",
            away: "W82",
            status: "SCHEDULED",
            date: "2026-07-06T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-fsoccer-g-13532382",
            apiId: "soccer.g.13532382",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-07T00:00:00.000Z",
            yahooDate: "2026-07-06",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(merged.gameweeks[0].fixtures.length, 1);
  assert.equal(fixture.id, "wc-gw5-old-row");
  assert.equal(fixture.apiId, "soccer.g.13532382");
  assert.equal(fixture.home, "USA");
  assert.equal(fixture.away, "Belgium");
  assert.equal(fixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(fixture.yahooDate, "2026-07-06");
  assert.equal(merged.predictions.faris["wc-gw5-old-row"], "2-1");
});

test("mergeGlobalIntoGroup updates old resolved WC rows without Yahoo game ids", () => {
  const group = {
    id: "g1",
    competition: "WC",
    season: 2026,
    predictions: {
      faris: { "wc-gw5-old-usa-belgium": "2-1" },
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-old-usa-belgium",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-06T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-fsoccer-g-13532382",
            apiId: "soccer.g.13532382",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-07T00:00:00.000Z",
            yahooDate: "2026-07-06",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(merged.gameweeks[0].fixtures.length, 1);
  assert.equal(fixture.id, "wc-gw5-old-usa-belgium");
  assert.equal(fixture.apiId, "soccer.g.13532382");
  assert.equal(fixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(fixture.yahooDate, "2026-07-06");
  assert.equal(merged.predictions.faris["wc-gw5-old-usa-belgium"], "2-1");
});

test("mergeGlobalIntoGroup fixes old resolved WC rows with wrong Yahoo game ids", () => {
  const group = {
    id: "g1",
    competition: "WC",
    season: 2026,
    predictions: {
      faris: { "wc-gw5-old-usa-belgium": "2-1" },
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-old-usa-belgium",
            apiId: "soccer.g.13532380",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-06T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-fsoccer-g-13532382",
            apiId: "soccer.g.13532382",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-07T00:00:00.000Z",
            yahooDate: "2026-07-06",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(merged.gameweeks[0].fixtures.length, 1);
  assert.equal(fixture.id, "wc-gw5-old-usa-belgium");
  assert.equal(fixture.apiId, "soccer.g.13532382");
  assert.equal(fixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(fixture.yahooDate, "2026-07-06");
  assert.equal(merged.predictions.faris["wc-gw5-old-usa-belgium"], "2-1");
});

test("mergeGlobalIntoGroup fixes all old resolved Round of 16 date rows", () => {
  const groupRows = [
    ["old-r16-1", "soccer.g.13532377", "Paraguay", "France", "2026-07-04T17:00:00.000Z"],
    ["old-r16-2", "soccer.g.13532378", "Canada", "Morocco", "2026-07-04T21:00:00.000Z"],
    ["old-r16-3", "soccer.g.13532379", "Portugal", "Spain", "2026-07-05T20:00:00.000Z"],
    ["old-r16-4", "soccer.g.13532380", "USA", "Belgium", "2026-07-06T00:00:00.000Z"],
    ["old-r16-5", "soccer.g.13532381", "Brazil", "Norway", "2026-07-06T19:00:00.000Z"],
    ["old-r16-6", "soccer.g.13532382", "Mexico", "England", "2026-07-07T00:00:00.000Z"],
    ["old-r16-7", "soccer.g.13532383", "Argentina", "Egypt", "2026-07-07T16:00:00.000Z"],
    ["old-r16-8", "soccer.g.13532384", "Switzerland", "Colombia", "2026-07-07T20:00:00.000Z"],
  ];
  const correctRows = [
    ["soccer.g.13532377", "Paraguay", "France", "2026-07-04T21:00:00.000Z", "2026-07-04"],
    ["soccer.g.13532378", "Canada", "Morocco", "2026-07-04T17:00:00.000Z", "2026-07-04"],
    ["soccer.g.13532381", "Portugal", "Spain", "2026-07-06T19:00:00.000Z", "2026-07-06"],
    ["soccer.g.13532382", "USA", "Belgium", "2026-07-07T00:00:00.000Z", "2026-07-06"],
    ["soccer.g.13532379", "Brazil", "Norway", "2026-07-05T20:00:00.000Z", "2026-07-05"],
    ["soccer.g.13532380", "Mexico", "England", "2026-07-06T00:00:00.000Z", "2026-07-05"],
    ["soccer.g.13532383", "Argentina", "Egypt", "2026-07-07T16:00:00.000Z", "2026-07-07"],
    ["soccer.g.13532384", "Switzerland", "Colombia", "2026-07-07T20:00:00.000Z", "2026-07-07"],
  ];
  const group = {
    id: "g1",
    competition: "WC",
    season: 2026,
    predictions: {
      faris: Object.fromEntries(groupRows.map(([id]) => [id, "1-0"])),
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: groupRows.map(([id, apiId, home, away, date]) => ({ id, apiId, home, away, status: "SCHEDULED", date })),
      },
    ],
  };
  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: correctRows.map(([apiId, home, away, date, yahooDate]) => ({
          id: `wc-gw5-f${apiId.replaceAll(".", "-")}`,
          apiId,
          home,
          away,
          status: "SCHEDULED",
          date,
          yahooDate,
        })),
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);

  assert.equal(merged.gameweeks[0].fixtures.length, 8);
  assert.deepEqual(
    merged.gameweeks[0].fixtures.map(f => [f.id, f.apiId, f.home, f.away, f.date, f.yahooDate]),
    groupRows.map(([id], index) => [id, ...correctRows[index]])
  );
  assert.deepEqual(merged.predictions.faris, Object.fromEntries(groupRows.map(([id]) => [id, "1-0"])));
});

test("mergeGlobalIntoGroup treats old 2026 World Cup groups without competition as WC", () => {
  const group = {
    id: "old-wc",
    season: 2026,
    predictions: {
      faris: { "old-r16-usa-belgium": "2-1" },
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "old-r16-usa-belgium",
            apiId: "soccer.g.13532380",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-06T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  const globalDoc = {
    season: 2026,
    updatedAt: 100,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw5-fsoccer-g-13532382",
            apiId: "soccer.g.13532382",
            home: "USA",
            away: "Belgium",
            status: "SCHEDULED",
            date: "2026-07-07T00:00:00.000Z",
            yahooDate: "2026-07-06",
          },
        ],
      },
    ],
  };

  const merged = mergeGlobalIntoGroup(globalDoc, group);
  const fixture = merged.gameweeks[0].fixtures[0];

  assert.equal(merged.competition, "WC");
  assert.equal(fixture.id, "old-r16-usa-belgium");
  assert.equal(fixture.apiId, "soccer.g.13532382");
  assert.equal(fixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(merged.predictions.faris["old-r16-usa-belgium"], "2-1");
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
