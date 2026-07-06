import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

async function loadYahooFixturesModule() {
  if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = "test-project";
  if (!process.env.FIREBASE_CLIENT_EMAIL) process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
  }
  return import("../api/_yahooFixtures.js");
}

test("normalizes Yahoo knockout shootout winner metadata", async () => {
  const { normalizeGames } = await loadYahooFixturesModule();
  const scoreboard = {
    teams: {
      "soccer.t.379": {
        display_name: "Germany",
        first_name: "Germany",
        full_name: "Germany",
      },
      "soccer.t.390": {
        display_name: "Paraguay",
        first_name: "Paraguay",
        full_name: "Paraguay",
      },
    },
    games: {
      "soccer.g.13532362": {
        gameid: "soccer.g.13532362",
        global_gameid: "soccer.g.13532362",
        start_time: "Mon, 29 Jun 2026 20:30:00 +0000",
        season_phase_id: "season.phase.knockout",
        game_type: "Playoff Round 1",
        status_display_name: "Finished",
        status_description: "Final",
        status_type: "status.type.final",
        home_team_id: "soccer.t.379",
        away_team_id: "soccer.t.390",
        total_home_points: "1",
        total_away_points: "1",
        winning_team_id: "soccer.t.390",
        total_home_shootout_points: "3",
        total_away_shootout_points: "4",
        game_time_elapsed_display: "120'",
      },
    },
  };

  const [gw] = normalizeGames(scoreboard, "WC", null, "2026-06-29");
  const fixture = gw.fixtures[0];

  assert.equal(gw.gw, 4);
  assert.equal(fixture.home, "Germany");
  assert.equal(fixture.away, "Paraguay");
  assert.equal(fixture.result, "1-1");
  assert.equal(fixture.status, "FINISHED");
  assert.equal(fixture.winningTeamId, "soccer.t.390");
  assert.equal(fixture.winnerSide, "away");
  assert.equal(fixture.homeShootoutScore, 3);
  assert.equal(fixture.awayShootoutScore, 4);
  assert.equal(fixture.elapsed, "120'");
});

test("normalizes explicit Yahoo delayed statuses", async () => {
  const { normalizeGames } = await loadYahooFixturesModule();
  const scoreboard = {
    teams: {
      "soccer.t.383": {
        display_name: "Mexico",
        first_name: "Mexico",
        full_name: "Mexico",
      },
      "soccer.t.377": {
        display_name: "England",
        first_name: "England",
        full_name: "England",
      },
    },
    games: {
      "soccer.g.13532380": {
        gameid: "soccer.g.13532380",
        global_gameid: "soccer.g.13532380",
        start_time: "Mon, 06 Jul 2026 01:00:00 +0000",
        season_phase_id: "season.phase.knockout",
        game_type: "Round of 16",
        status_display_name: "Delayed",
        status_description: "Delayed",
        status_type: "status.type.delayed",
        home_team_id: "soccer.t.383",
        away_team_id: "soccer.t.377",
        total_home_points: null,
        total_away_points: null,
        last_updated: "2026-07-05 16:45:49",
      },
    },
  };

  const [gw] = normalizeGames(scoreboard, "WC", null, "2026-07-05");
  const fixture = gw.fixtures[0];

  assert.equal(gw.gw, 5);
  assert.equal(fixture.home, "Mexico");
  assert.equal(fixture.away, "England");
  assert.equal(fixture.status, "DELAYED");
  assert.equal(fixture.result, null);
  assert.equal(fixture.date, "2026-07-06T01:00:00.000Z");
});
