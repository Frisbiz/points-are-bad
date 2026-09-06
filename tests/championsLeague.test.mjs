import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import * as seasonHelpers from "../shared/season.js";
import { mergeGlobalIntoGroup, shouldHydrateLeagueSeason } from "../api/_fixtureSync.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

async function loadYahooFixturesModule() {
  if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = "test-project";
  if (!process.env.FIREBASE_CLIENT_EMAIL) process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
  }
  return import("../api/_yahooFixtures.js");
}

async function loadLiveHandler() {
  if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = "test-project";
  if (!process.env.FIREBASE_CLIENT_EMAIL) process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
  }
  const mod = await import("../api/live.js");
  return mod.default;
}

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(value) {
      this.body = value;
      return value;
    },
  };
}

test("Champions League uses eight league-phase matchdays", () => {
  assert.equal(typeof seasonHelpers.competitionRoundCount, "function");
  assert.equal(seasonHelpers.competitionRoundCount("CL"), 8);
  assert.equal(seasonHelpers.competitionRoundCount("PL"), 38);
  assert.equal(seasonHelpers.competitionRoundCount("LL"), 38);
});

test("Champions League fixtures stay in their own global cache", async () => {
  const { fixtureGlobalKey } = await loadYahooFixturesModule();

  assert.equal(fixtureGlobalKey("CL", 2026), "fixtures:CL:2026");
  assert.equal(fixtureGlobalKey("PL", 2026), "fixtures:PL:2026");
  assert.equal(fixtureGlobalKey("WC", 2026), "fixtures:WC:2026");
});

test("complete Champions League league-phase caches do not keep hydrating for 38 gameweeks", () => {
  const fullLeaguePhase = {
    competition: "CL",
    season: 2026,
    gameweeks: Array.from({ length: 8 }, (_, i) => ({
      gw: i + 1,
      fixtures: [{ id: `cl-md${i + 1}-f1`, home: "Alpha", away: "Beta" }],
    })),
  };
  const missingMatchday = {
    ...fullLeaguePhase,
    gameweeks: fullLeaguePhase.gameweeks.slice(0, 7),
  };

  assert.equal(shouldHydrateLeagueSeason(fullLeaguePhase, 1, { competition: "CL", season: 2026 }), false);
  assert.equal(shouldHydrateLeagueSeason(missingMatchday, 1, { competition: "CL", season: 2026 }), true);
});

test("Champions League groups refuse Premier League fixture caches", () => {
  const group = {
    competition: "CL",
    season: 2026,
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [{ id: "cl-fallback", home: "PSG", away: "Bayern", status: "SCHEDULED", result: null }],
    }],
  };
  const premierLeagueDoc = {
    competition: "PL",
    season: 2026,
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [{ id: "pl-f1", home: "Arsenal", away: "Chelsea", status: "TIMED", date: "2026-08-15T14:00:00.000Z" }],
    }],
  };

  assert.deepEqual(mergeGlobalIntoGroup(premierLeagueDoc, group), group);
});

test("live endpoint serves Champions League matchday scores from Football-Data", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        matches: [{
          id: 9001,
          matchday: 1,
          utcDate: "2026-09-08T19:00:00Z",
          status: "LIVE",
          homeTeam: { name: "Real Madrid CF", crest: "real.png" },
          awayTeam: { name: "Inter Milan", crest: "inter.png" },
          score: { fullTime: { home: 2, away: 1 } },
        }],
      }),
    };
  };

  try {
    const liveHandler = await loadLiveHandler();
    const response = mockResponse();
    await liveHandler({ query: { week: "1", competition: "CL", season: "2026" } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.competition, "CL");
    assert.deepEqual(response.body.matches, [{
      home: "Real Madrid",
      away: "Inter",
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 2,
      awayScore: 1,
      elapsed: null,
      status: "in_progress",
      startTime: "2026-09-08T19:00:00.000Z",
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requested[0], /competitions\/CL\/matches\?season=2026&matchday=1/);
});

test("group setup exposes Champions League without using the Premier League cache path", () => {
  const setupStart = appSource.indexOf("const [setupCompetition,setSetupCompetition]");
  const setupEnd = appSource.indexOf("const loadGroups", setupStart);
  const setupBlock = appSource.slice(setupStart, setupEnd);
  const modalStart = appSource.indexOf("CREATE GROUP");
  const modalEnd = appSource.indexOf("SEASON MODE", modalStart);
  const modalBlock = appSource.slice(modalStart, modalEnd);

  assert.match(modalBlock, /\["CL","Champions League"\]/);
  assert.match(setupBlock, /`fixtures:\$\{setupCompetition\}:\$\{CURRENT_LEAGUE_SEASON\}`/);
  assert.match(setupBlock, /const setupMaxGW = competitionRoundCount\(setupCompetition\);/);
  assert.match(modalBlock, /setupCompetition === "PL" \|\| setupCompetition === "LL" \|\| setupCompetition === "CL"/);
  assert.doesNotMatch(setupBlock, /setupCompetition === "LL" \? "fixtures:LL" : "fixtures:PL"/);
});
