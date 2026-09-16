import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

function ensureFirebaseTestEnv() {
  if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = "test-project";
  if (!process.env.FIREBASE_CLIENT_EMAIL) process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
  }
}

function yahooLiveScoreboard() {
  return {
    teams: {
      "soccer.t.24": { display_name: "Barcelona", first_name: "Barcelona", full_name: "Barcelona" },
      "soccer.t.163": {
        display_name: "Racing de Santander",
        first_name: "Racing de Santander",
        full_name: "Racing de Santander",
      },
    },
    games: {
      "soccer.g.13598006": {
        gameid: "soccer.g.13598006",
        start_time: "Wed, 16 Sep 2026 19:30:00 +0000",
        week_number: "6",
        status_type: "status.type.in_progress",
        status_description: "Live",
        home_team_id: "soccer.t.24",
        away_team_id: "soccer.t.163",
        total_home_points: "5",
        total_away_points: "2",
        game_time_elapsed_display: "71'",
        last_updated: "2026-09-16 14:09:21",
      },
    },
  };
}

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return value; },
  };
}

test("Yahoo normalizes La Liga live scores into the current season and PAB team names", async () => {
  ensureFirebaseTestEnv();
  const { normalizeGames } = await import("../api/_yahooFixtures.js");

  const [gameweek] = normalizeGames(yahooLiveScoreboard(), "LL", 6);
  const [fixture] = gameweek.fixtures;

  assert.equal(gameweek.season, 2026);
  assert.equal(fixture.home, "Barcelona");
  assert.equal(fixture.away, "Real Racing Club de Santander");
  assert.equal(fixture.liveScore, "5-2");
  assert.equal(fixture.elapsed, "71'");
  assert.equal(fixture.status, "IN_PLAY");
});

test("Yahoo La Liga aliases match the team names stored in PAB fixtures", async () => {
  ensureFirebaseTestEnv();
  const { normalizeGames } = await import("../api/_yahooFixtures.js");
  const aliases = [
    ["Athletic", "Athletic Bilbao"],
    ["Atlético", "Atletico Madrid"],
    ["Betis", "Real Betis"],
    ["Celta", "Celta Vigo"],
    ["Málaga", "Málaga CF"],
    ["RC Deportivo de A Coruna", "RC Deportivo La Coruña"],
    ["Racing de Santander", "Real Racing Club de Santander"],
    ["Rayo", "Rayo Vallecano"],
  ];
  const teams = { opponent: { first_name: "Barcelona" } };
  const games = {};
  aliases.forEach(([raw], index) => {
    teams[`team-${index}`] = { first_name: raw };
    games[`game-${index}`] = {
      gameid: `game-${index}`,
      start_time: "Wed, 16 Sep 2026 19:30:00 +0000",
      week_number: "6",
      status_type: "status.type.pregame",
      home_team_id: `team-${index}`,
      away_team_id: "opponent",
    };
  });

  const [gameweek] = normalizeGames({ teams, games }, "LL", 6);

  assert.deepEqual(gameweek.fixtures.map(fixture => fixture.home), aliases.map(([, expected]) => expected));
});

test("La Liga live endpoint uses Yahoo before Football-Data", async () => {
  ensureFirebaseTestEnv();
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ service: { scoreboard: yahooLiveScoreboard() } }),
    };
  };

  try {
    const { default: liveHandler } = await import("../api/live.js");
    const response = mockResponse();
    await liveHandler({ query: { week: "6", competition: "LL", season: "2026" } }, response);

    assert.equal(response.statusCode, 200);
    assert.match(requested[0], /api-secure\.sports\.yahoo\.com/);
    assert.match(requested[0], /leagues=soccer\.l\.fbes/);
    assert.equal(response.body.matches[0].home, "Barcelona");
    assert.equal(response.body.matches[0].away, "Real Racing Club de Santander");
    assert.equal(response.body.matches[0].homeScore, 5);
    assert.equal(response.body.matches[0].awayScore, 2);
    assert.equal(response.body.matches[0].elapsed, "71'");
    assert.equal(response.body.matches[0].status, "in_progress");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
