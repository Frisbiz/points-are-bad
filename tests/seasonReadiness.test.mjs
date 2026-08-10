import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import fixtureHandler from "../api/fixtures.js";
import standingsHandler from "../api/standings.js";
import { shouldHydrateLeagueSeason } from "../api/_fixtureSync.js";
import { CURRENT_LEAGUE_SEASON, getCurrentLeagueSeason } from "../shared/season.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../api/security.js", import.meta.url), "utf8");
const yahooSource = readFileSync(new URL("../api/_yahooFixtures.js", import.meta.url), "utf8");
const liveSource = readFileSync(new URL("../api/live.js", import.meta.url), "utf8");

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader() {},
    json(value) {
      this.body = value;
      return value;
    },
  };
}

test("league season rollover keeps summer fixtures on the upcoming campaign", () => {
  assert.equal(getCurrentLeagueSeason("2026-06-30T23:59:59Z"), 2025);
  assert.equal(getCurrentLeagueSeason("2026-07-01T00:00:00Z"), 2026);
  assert.equal(getCurrentLeagueSeason("2027-01-15T00:00:00Z"), 2026);
  assert.equal(typeof CURRENT_LEAGUE_SEASON, "number");
});

test("new group and fixture-cache paths use the current league season", () => {
  const createGroupStart = securitySource.indexOf("if (action === 'create-group'");
  const createGroupEnd = securitySource.indexOf("if (action === 'join-group'", createGroupStart);
  const createGroupBlock = securitySource.slice(createGroupStart, createGroupEnd);

  assert.match(createGroupBlock, /const leagueSeason = CURRENT_LEAGUE_SEASON;/);
  assert.match(createGroupBlock, /`fixtures:PL:\$\{leagueSeason\}`/);
  assert.match(appSource, /setupCompetition === "LL" \? "fixtures:LL" : "fixtures:PL"/);
  assert.match(appSource, /:\$\{CURRENT_LEAGUE_SEASON\}/);
  assert.match(appSource, /api\/fixtures\?season=\$\{CURRENT_LEAGUE_SEASON\}/);
  assert.match(yahooSource, /season: CURRENT_LEAGUE_SEASON/);
  assert.match(liveSource, /Number\(season \|\| CURRENT_LEAGUE_SEASON\)/);
  assert.match(appSource, /api\/standings\?competition=\$\{comp\}&season=\$\{activeSeason\}/);
  assert.match(securitySource, /shouldHydrateLeagueSeason\(globalDoc, targetGW\)/);
  assert.match(securitySource, /fullSeason: Object\.keys\(byGW\)\.length >= 38/);
});

test("legacy groups retain their 2025 fallback when season metadata is absent", () => {
  assert.match(appSource, /const activeSeason = group\.season \|\| 2025;/);
  assert.match(securitySource, /const seas = isWC \? 2026 : \(group\.season \|\| 2025\);/);
});

test("fixture proxy defaults new PL requests to the current season and honors explicit history", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return { ok: true, status: 200, json: async () => ({ matches: [] }) };
  };

  try {
    const firstResponse = mockResponse();
    await fixtureHandler({ query: { competition: "PL" } }, firstResponse);
    assert.equal(firstResponse.statusCode, 200);

    const historicalResponse = mockResponse();
    await fixtureHandler({ query: { competition: "PL", season: "2025" } }, historicalResponse);
    assert.equal(historicalResponse.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requested[0], new RegExp(`season=${CURRENT_LEAGUE_SEASON}`));
  assert.match(requested[1], /season=2025/);
});

test("standings proxy requests the selected La Liga season", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        standings: [{
          type: "TOTAL",
          table: [{
            position: 1,
            team: { name: "Alaves" },
            playedGames: 0,
            won: 0,
            draw: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
          }],
        }],
      }),
    };
  };

  try {
    const response = mockResponse();
    await standingsHandler({ query: { competition: "LL", season: "2026" } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.table[0].pts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requested[0], /competitions\/PD\/standings\?season=2026/);
});

test("partial La Liga caches hydrate the full season before serving placeholder rounds", () => {
  assert.equal(shouldHydrateLeagueSeason({ season: 2026, gameweeks: [{ gw: 1, fixtures: [] }] }, 1), true);
  assert.equal(shouldHydrateLeagueSeason({ season: 2026, fullSeason: true, gameweeks: [{ gw: 1, fixtures: [] }] }, 1), false);
  assert.equal(shouldHydrateLeagueSeason({ season: 2026, gameweeks: Array.from({ length: 38 }, (_, i) => ({ gw: i + 1, fixtures: [{ id: `f${i + 1}` }] })) }, 1), false);
});
