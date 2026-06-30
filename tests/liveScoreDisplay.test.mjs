import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function loadAppSource() {
  return fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
}

function loadAppFunction(name) {
  const source = loadAppSource();
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

test("finished Yahoo scores preserve knockout winner metadata for bracket projection", () => {
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
            id: "wc-gw4-fsoccer-g-13532362",
            home: "Germany",
            away: "Paraguay",
            homeTeamId: "soccer.t.379",
            awayTeamId: "soccer.t.390",
            result: null,
            status: "SCHEDULED",
          },
        ],
      },
    ],
  };
  const liveScores = {
    "Germany|Paraguay": {
      status: "finished",
      homeScore: 1,
      awayScore: 1,
      winningTeamId: "soccer.t.390",
      winnerSide: "away",
      homeShootoutScore: 3,
      awayShootoutScore: 4,
    },
  };

  const projected = applyFinishedLiveScoresToGroup(group, liveScores);
  const fixture = projected.gameweeks[0].fixtures[0];

  assert.equal(fixture.result, "1-1");
  assert.equal(fixture.winningTeamId, "soccer.t.390");
  assert.equal(fixture.winnerSide, "away");
  assert.equal(fixture.homeShootoutScore, 3);
  assert.equal(fixture.awayShootoutScore, 4);
});

test("finished Yahoo scores patch winner metadata onto already saved tied results", () => {
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
            id: "wc-gw4-fsoccer-g-13532362",
            home: "Germany",
            away: "Paraguay",
            homeTeamId: "soccer.t.379",
            awayTeamId: "soccer.t.390",
            result: "1-1",
            status: "FINISHED",
          },
        ],
      },
    ],
  };
  const liveScores = {
    "Germany|Paraguay": {
      status: "finished",
      homeScore: 1,
      awayScore: 1,
      winningTeamId: "soccer.t.390",
      winnerSide: "away",
      homeShootoutScore: 3,
      awayShootoutScore: 4,
    },
  };

  const projected = applyFinishedLiveScoresToGroup(group, liveScores);
  const fixture = projected.gameweeks[0].fixtures[0];

  assert.equal(fixture.result, "1-1");
  assert.equal(fixture.winningTeamId, "soccer.t.390");
  assert.equal(fixture.winnerSide, "away");
  assert.equal(fixture.homeShootoutScore, 3);
  assert.equal(fixture.awayShootoutScore, 4);
  assert.equal(group.gameweeks[0].fixtures[0].winningTeamId, undefined);
});

test("fixture result display marks penalty shootout finals with compact PEN status", () => {
  const fixtureResultDisplayParts = loadAppFunction("fixtureResultDisplayParts");
  const fixture = {
    id: "wc-gw4-fsoccer-g-13532362",
    home: "Germany",
    away: "Paraguay",
    result: "1-1",
    status: "FINISHED",
    homeShootoutScore: 3,
    awayShootoutScore: 4,
  };

  assert.deepEqual(fixtureResultDisplayParts(fixture, null, "1-1"), {
    homeScore: "1",
    awayScore: "1",
    homeShootoutScore: "3",
    awayShootoutScore: "4",
    isShootout: true,
    statusLabel: "PEN",
  });
});

test("fixture result display can use live shootout metadata before the fixture is saved", () => {
  const fixtureResultDisplayParts = loadAppFunction("fixtureResultDisplayParts");
  const fixture = {
    id: "wc-gw4-fsoccer-g-13532362",
    home: "Germany",
    away: "Paraguay",
    result: null,
    status: "SCHEDULED",
  };
  const liveMatch = {
    status: "finished",
    homeScore: 1,
    awayScore: 1,
    homeShootoutScore: 3,
    awayShootoutScore: 4,
  };

  assert.deepEqual(fixtureResultDisplayParts(fixture, liveMatch, "1-1"), {
    homeScore: "1",
    awayScore: "1",
    homeShootoutScore: "3",
    awayShootoutScore: "4",
    isShootout: true,
    statusLabel: "PEN",
  });
});

test("fixture result display keeps normal completed results as FT", () => {
  const fixtureResultDisplayParts = loadAppFunction("fixtureResultDisplayParts");
  const fixture = {
    id: "wc-gw4-fsoccer-g-13532361",
    home: "South Africa",
    away: "Canada",
    result: "0-1",
    status: "FINISHED",
  };

  assert.deepEqual(fixtureResultDisplayParts(fixture, null, "0-1"), {
    homeScore: "0",
    awayScore: "1",
    homeShootoutScore: null,
    awayShootoutScore: null,
    isShootout: false,
    statusLabel: "FT",
  });
});

test("fixture winner side resolves from a normal finished score", () => {
  const fixtureWinnerSide = loadAppFunction("fixtureWinnerSide");

  assert.equal(
    fixtureWinnerSide(
      { home: "South Africa", away: "Canada", result: "0-1", status: "FINISHED" },
      null,
      { homeScore: "0", awayScore: "1", homeShootoutScore: null, awayShootoutScore: null }
    ),
    "away"
  );
});

test("fixture winner side resolves from penalty shootout scores when regular score is tied", () => {
  const fixtureWinnerSide = loadAppFunction("fixtureWinnerSide");

  assert.equal(
    fixtureWinnerSide(
      { home: "Germany", away: "Paraguay", result: "1-1", status: "FINISHED" },
      null,
      { homeScore: "1", awayScore: "1", homeShootoutScore: "3", awayShootoutScore: "4" }
    ),
    "away"
  );
});

test("fixture winner side stays empty for draws without shootout metadata", () => {
  const fixtureWinnerSide = loadAppFunction("fixtureWinnerSide");

  assert.equal(
    fixtureWinnerSide(
      { home: "Netherlands", away: "Morocco", result: "1-1", status: "FINISHED" },
      null,
      { homeScore: "1", awayScore: "1", homeShootoutScore: null, awayShootoutScore: null }
    ),
    null
  );
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

  assert.equal(autoSyncTargetGW(group, new Date("2026-06-29T03:00:00.000Z").getTime()), 4);
});

test("auto sync prioritizes past scheduled fixtures missing results over future fixtures", () => {
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
            status: "SCHEDULED",
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

  assert.equal(autoSyncTargetGW(group, new Date("2026-06-29T03:00:00.000Z").getTime()), 4);
});

test("live score fetch retries stale scheduled fixtures that still miss results", () => {
  const shouldFetchLiveScores = loadAppFunction("shouldFetchLiveScores");
  const now = new Date("2026-06-29T03:00:00.000Z").getTime();
  const fixtures = [
    {
      id: "wc-gw4-fsoccer-g-13532361",
      home: "South Africa",
      away: "Canada",
      result: null,
      status: "SCHEDULED",
      date: "2026-06-28T19:00:00.000Z",
    },
  ];

  assert.equal(shouldFetchLiveScores(fixtures, now), true);
});

test("live score fetch retries finished tied knockout fixtures missing winner metadata", () => {
  const shouldFetchLiveScores = loadAppFunction("shouldFetchLiveScores");
  const now = new Date("2026-06-30T02:00:00.000Z").getTime();
  const fixtures = [
    {
      id: "wc-gw4-fsoccer-g-13532362",
      home: "Germany",
      away: "Paraguay",
      result: "1-1",
      status: "FINISHED",
      stage: "LAST_32",
      date: "2026-06-29T20:30:00.000Z",
    },
  ];

  assert.equal(shouldFetchLiveScores(fixtures, now), true);
});

test("live score fetch skips finished tied knockout fixtures once winner metadata is saved", () => {
  const shouldFetchLiveScores = loadAppFunction("shouldFetchLiveScores");
  const now = new Date("2026-06-30T02:00:00.000Z").getTime();
  const fixtures = [
    {
      id: "wc-gw4-fsoccer-g-13532362",
      home: "Germany",
      away: "Paraguay",
      result: "1-1",
      status: "FINISHED",
      stage: "LAST_32",
      winningTeamId: "soccer.t.390",
      winnerSide: "away",
      date: "2026-06-29T20:30:00.000Z",
    },
  ];

  assert.equal(shouldFetchLiveScores(fixtures, now), false);
});

test("fixture kickoff labels use 12-hour am/pm time", () => {
  const formatFixtureDate = loadAppFunction("formatFixtureDate");

  assert.equal(
    formatFixtureDate("2026-06-29T17:30:00.000Z", { timeZone: "UTC" }),
    "Mon 29 Jun 5:30 pm"
  );
  assert.equal(formatFixtureDate(null), null);
  assert.equal(formatFixtureDate("not a date"), null);
});

test("fixtures tab is seeded with live scores already loaded by the game shell", () => {
  const source = loadAppSource();

  assert.match(
    source,
    /function FixturesTab\(\{[^}]*initialLiveScores=\{\}/s,
    "FixturesTab should accept initial live scores"
  );
  assert.match(
    source,
    /useLiveScores\(currentGW, gwFixtures, group\.competition \|\| "PL", activeSeason, initialLiveScores\)/,
    "FixturesTab should seed its live-score hook from initial live scores"
  );
  assert.match(
    source,
    /<FixturesTab[^>]*initialLiveScores=\{standingsLiveScores\}/s,
    "GameUI should pass preloaded shell live scores into FixturesTab"
  );
});

test("live score hook keeps a shared cache for first render", () => {
  const source = loadAppSource();

  assert.match(source, /const LIVE_SCORE_CACHE = new Map\(\);/);
  assert.match(source, /const EMPTY_LIVE_SCORES = \{\};/);
  assert.match(source, /LIVE_SCORE_CACHE\.get\(cacheKey\)/);
  assert.match(source, /LIVE_SCORE_CACHE\.set\(cacheKey, map\)/);
});

test("fixtures show syncing instead of TBD while a missing result is recoverable", () => {
  const source = loadAppSource();
  const fixturesBlock = source.slice(
    source.indexOf("function FixturesTab"),
    source.indexOf("function AllPicksTable")
  );

  assert.match(fixturesBlock, /const pendingScoreSync = !scoreParts && shouldFetchLiveScores\(\[f\]\);/);
  assert.match(fixturesBlock, />SYNCING</);
});

test("fixture shootout scores render like small top-right score exponents", () => {
  const source = loadAppSource();
  const fixturesBlock = source.slice(
    source.indexOf("function FixturesTab"),
    source.indexOf("function AllPicksTable")
  );

  assert.match(fixturesBlock, /fontSize:9,fontWeight:700/);
  assert.match(fixturesBlock, /alignSelf:"flex-start"/);
  assert.match(fixturesBlock, /marginTop:-2/);
});

test("fixture rows use centered status lane with team-attached scores", () => {
  const source = loadAppSource();
  const fixturesBlock = source.slice(
    source.indexOf("function FixturesTab"),
    source.indexOf("function AllPicksTable")
  );

  assert.doesNotMatch(fixturesBlock, />Result</);
  assert.match(fixturesBlock, /gridTemplateColumns:"72px minmax\(0,1fr\) 54px minmax\(0,1fr\) 105px 70px"/);
  assert.match(fixturesBlock, /const homeScoreBlock = scoreParts\?/);
  assert.match(fixturesBlock, /const awayScoreBlock = scoreParts\?/);
  assert.match(fixturesBlock, /const resultStatusBlock = scoreParts\?/);
  assert.match(fixturesBlock, /justifyContent:"center"/);
});

test("fixture score slots reserve penalty width so normal rows align with shootout rows", () => {
  const source = loadAppSource();
  const fixturesBlock = source.slice(
    source.indexOf("function FixturesTab"),
    source.indexOf("function AllPicksTable")
  );

  assert.match(fixturesBlock, /const scoreSlotWidth = 32;/);
  assert.match(fixturesBlock, /minWidth:scoreSlotWidth/);
  assert.match(fixturesBlock, /justifyContent:"flex-start"/);
  assert.match(fixturesBlock, /justifyContent:"flex-end"/);
});
