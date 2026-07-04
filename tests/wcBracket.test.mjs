import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyKnownWorldCupKnockoutSchedule,
  buildWorldCupKnockoutScheduleFixtures,
  fixtureHasWorldCupSeedPlaceholder,
  formatWorldCupBracketKickoff,
  formatWorldCupBracketMatchMeta,
  formatWorldCupBracketTeamName,
  formatWorldCupFixtureSeedPlaceholders,
  formatWorldCupGlobalDocSeedPlaceholders,
  getWorldCupKnockoutPlaceholderLabel,
  isWorldCupGroupLike,
  isUnresolvedWorldCupTeamSlot,
  normalizeWorldCupGroup,
  resolveWorldCupBracketAdvancement,
  resolveWorldCupGlobalDocSeeds,
  resolveWorldCupKnockoutSeeds,
  sortWorldCupBracketFixturesForDisplay,
  winnerSideForWorldCupFixture,
} from "../api/_wcBracket.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("old 2026 World Cup groups without a competition flag are detected and normalized", () => {
  const group = {
    id: "old-wc",
    season: 2026,
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          { id: "old-r16-1", apiId: "soccer.g.13532377", home: "Paraguay", away: "France", status: "SCHEDULED", date: "2026-07-04T17:00:00.000Z" },
          { id: "old-r16-2", apiId: "soccer.g.13532378", home: "Canada", away: "Morocco", status: "SCHEDULED", date: "2026-07-04T21:00:00.000Z" },
          { id: "old-r16-3", apiId: "soccer.g.13532379", home: "Portugal", away: "Spain", status: "SCHEDULED", date: "2026-07-05T20:00:00.000Z" },
          { id: "old-r16-4", apiId: "soccer.g.13532380", home: "USA", away: "Belgium", status: "SCHEDULED", date: "2026-07-06T00:00:00.000Z" },
          { id: "old-r16-5", apiId: "soccer.g.13532381", home: "Brazil", away: "Norway", status: "SCHEDULED", date: "2026-07-06T19:00:00.000Z" },
          { id: "old-r16-6", apiId: "soccer.g.13532382", home: "Mexico", away: "England", status: "SCHEDULED", date: "2026-07-07T00:00:00.000Z" },
          { id: "old-r16-7", apiId: "soccer.g.13532383", home: "Argentina", away: "Egypt", status: "SCHEDULED", date: "2026-07-07T16:00:00.000Z" },
          { id: "old-r16-8", apiId: "soccer.g.13532384", home: "Switzerland", away: "Colombia", status: "SCHEDULED", date: "2026-07-07T20:00:00.000Z" },
        ],
      },
    ],
  };

  const normalized = normalizeWorldCupGroup(group);

  assert.equal(isWorldCupGroupLike(group), true);
  assert.equal(normalized.competition, "WC");
  assert.equal(normalized.season, 2026);
  assert.deepEqual(
    normalized.gameweeks[0].fixtures.map(f => [f.id, f.apiId, f.home, f.away, f.date, f.yahooDate]),
    [
      ["old-r16-1", "soccer.g.13532377", "Paraguay", "France", "2026-07-04T21:00:00.000Z", "2026-07-04"],
      ["old-r16-2", "soccer.g.13532378", "Canada", "Morocco", "2026-07-04T17:00:00.000Z", "2026-07-04"],
      ["old-r16-3", "soccer.g.13532381", "Portugal", "Spain", "2026-07-06T19:00:00.000Z", "2026-07-06"],
      ["old-r16-4", "soccer.g.13532382", "USA", "Belgium", "2026-07-07T00:00:00.000Z", "2026-07-06"],
      ["old-r16-5", "soccer.g.13532379", "Brazil", "Norway", "2026-07-05T20:00:00.000Z", "2026-07-05"],
      ["old-r16-6", "soccer.g.13532380", "Mexico", "England", "2026-07-06T00:00:00.000Z", "2026-07-05"],
      ["old-r16-7", "soccer.g.13532383", "Argentina", "Egypt", "2026-07-07T16:00:00.000Z", "2026-07-07"],
      ["old-r16-8", "soccer.g.13532384", "Switzerland", "Colombia", "2026-07-07T20:00:00.000Z", "2026-07-07"],
    ]
  );
});

test("legacy World Cup normalization collapses duplicate placeholder rows into the real fixture", () => {
  const group = {
    id: "old-wc",
    season: 2026,
    predictions: {
      faris: {
        "real-canada-morocco": "1-2",
        "blank-canada-morocco": "0-3",
        "blank-paraguay-france": "0-3",
      },
      damon: {
        "blank-canada-morocco": "2-0",
      },
    },
    hiddenFixtures: ["blank-canada-morocco"],
    dibsSkips: {
      "blank-canada-morocco": ["faris"],
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "real-canada-morocco",
            apiId: "soccer.g.13532378",
            home: "Canada",
            away: "Morocco",
            homeCrest: "can.png",
            awayCrest: "mar.png",
            status: "SCHEDULED",
            date: "2026-07-04T17:00:00.000Z",
          },
          {
            id: "blank-canada-morocco",
            home: "",
            away: "",
            status: "SCHEDULED",
            date: "2026-07-04T17:00:00.000Z",
          },
          {
            id: "blank-paraguay-france",
            home: "W74",
            away: "W77",
            status: "SCHEDULED",
            date: "2026-07-04T21:00:00.000Z",
          },
          {
            id: "real-paraguay-france",
            apiId: "soccer.g.13532377",
            home: "Paraguay",
            away: "France",
            status: "SCHEDULED",
            date: "2026-07-04T21:00:00.000Z",
          },
        ],
      },
    ],
  };

  const normalized = normalizeWorldCupGroup(group);
  const fixtures = normalized.gameweeks[0].fixtures;

  assert.equal(fixtures.length, 2);
  assert.deepEqual(
    fixtures.map(f => [f.id, f.apiId, f.home, f.away, f.date]),
    [
      ["real-canada-morocco", "soccer.g.13532378", "Canada", "Morocco", "2026-07-04T17:00:00.000Z"],
      ["real-paraguay-france", "soccer.g.13532377", "Paraguay", "France", "2026-07-04T21:00:00.000Z"],
    ]
  );
  assert.deepEqual(normalized.predictions.faris, {
    "real-canada-morocco": "1-2",
    "real-paraguay-france": "0-3",
  });
  assert.deepEqual(normalized.predictions.damon, {
    "real-canada-morocco": "2-0",
  });
  assert.deepEqual(normalized.hiddenFixtures, ["real-canada-morocco"]);
  assert.deepEqual(normalized.dibsSkips, {
    "real-canada-morocco": ["faris"],
  });
});

test("legacy World Cup normalization does not collapse distinct real fixtures at the same kickoff", () => {
  const group = {
    competition: "WC",
    season: 2026,
    gameweeks: [
      {
        gw: 4,
        fixtures: [
          {
            id: "real-alpha-beta",
            home: "Alpha FC",
            away: "Beta FC",
            status: "SCHEDULED",
            date: "2026-07-04T17:00:00.000Z",
          },
          {
            id: "real-gamma-delta",
            home: "Gamma FC",
            away: "Delta FC",
            status: "SCHEDULED",
            date: "2026-07-04T17:00:00.000Z",
          },
        ],
      },
    ],
  };

  const normalized = normalizeWorldCupGroup(group);
  const fixtures = normalized.gameweeks[0].fixtures;

  assert.equal(fixtures.length, 2);
  assert.deepEqual(fixtures.map(f => f.id), ["real-alpha-beta", "real-gamma-delta"]);
});

test("legacy World Cup normalization preserves picks when reused ids belong to different matches", () => {
  const group = {
    competition: "WC",
    season: 2026,
    members: ["faris"],
    predictions: {
      faris: {
        "canada-real": "1-2",
        "paraguay-real": "0-3",
      },
    },
    gameweeks: [
      {
        gw: 5,
        season: 2026,
        fixtures: [
          {
            id: "paraguay-real",
            apiId: "soccer.g.13532377",
            home: "Paraguay",
            away: "France",
            status: "SCHEDULED",
            date: "2026-07-04T21:00:00.000Z",
          },
          {
            id: "canada-real",
            apiId: "soccer.g.13532378",
            home: "Canada",
            away: "Morocco",
            status: "SCHEDULED",
            date: "2026-07-04T17:00:00.000Z",
          },
          {
            id: "paraguay-real",
            home: "",
            away: "",
            status: "SCHEDULED",
            date: "2026-07-04T17:00:00.000Z",
          },
          {
            id: "canada-real",
            home: "",
            away: "",
            status: "SCHEDULED",
            date: "2026-07-04T21:00:00.000Z",
          },
        ],
      },
    ],
  };

  const normalized = normalizeWorldCupGroup(group);
  const fixtures = normalized.gameweeks[0].fixtures;

  assert.deepEqual(fixtures.map(f => [f.id, f.home, f.away]), [
    ["paraguay-real", "Paraguay", "France"],
    ["canada-real", "Canada", "Morocco"],
  ]);
  assert.deepEqual(normalized.predictions.faris, {
    "canada-real": "1-2",
    "paraguay-real": "0-3",
  });
});

const standings = {
  groups: [
    {
      name: "Group B",
      rows: [
        { pos: 1, team: "Switzerland", teamId: "soccer.t.398", crest: "sui.png" },
        { pos: 2, team: "Canada", teamId: "soccer.t.875", crest: "can.png" },
        { pos: 3, team: "Bosnia and Herzegovina", teamId: "soccer.t.16603", crest: "bih.png" },
      ],
    },
    {
      name: "Group D",
      rows: [
        { pos: 1, team: "USA", teamId: "soccer.t.400", crest: "usa.png" },
        { pos: 2, team: "Australia", teamId: "soccer.t.371", crest: "aus.png" },
        { pos: 3, team: "Paraguay", teamId: "soccer.t.390", crest: "par.png" },
      ],
    },
    {
      name: "Group E",
      rows: [
        { pos: 1, team: "Germany", teamId: "soccer.t.379", crest: "ger.png" },
        { pos: 2, team: "Ivory Coast", teamId: "soccer.t.16583", crest: "civ.png" },
        { pos: 3, team: "Ecuador", teamId: "soccer.t.442", crest: "ecu.png" },
      ],
    },
    {
      name: "Group F",
      rows: [
        { pos: 1, team: "Netherlands", teamId: "soccer.t.386", crest: "ned.png" },
        { pos: 2, team: "Japan", teamId: "soccer.t.384", crest: "jpn.png" },
        { pos: 3, team: "Sweden", teamId: "soccer.t.923", crest: "swe.png" },
      ],
    },
    {
      name: "Group H",
      rows: [
        { pos: 1, team: "Spain", teamId: "soccer.t.397", crest: "esp.png" },
        { pos: 2, team: "Cape Verde", teamId: "soccer.t.5335", crest: "cpv.png" },
        { pos: 3, team: "Uruguay", teamId: "soccer.t.399", crest: "uru.png" },
      ],
    },
    {
      name: "Group I",
      rows: [
        { pos: 1, team: "France", teamId: "soccer.t.378", crest: "fra.png" },
        { pos: 2, team: "Norway", teamId: "soccer.t.910", crest: "nor.png" },
        { pos: 3, team: "Senegal", teamId: "soccer.t.1536", crest: "sen.png" },
      ],
    },
    {
      name: "Group J",
      rows: [
        { pos: 1, team: "Argentina", teamId: "soccer.t.370", crest: "arg.png" },
        { pos: 2, team: "Austria", teamId: "soccer.t.869", crest: "aut.png" },
        { pos: 3, team: "Algeria", teamId: "soccer.t.369", crest: "alg.png" },
      ],
    },
    {
      name: "Group K",
      rows: [
        { pos: 1, team: "Colombia", teamId: "soccer.t.437", crest: "col.png" },
        { pos: 2, team: "Portugal", teamId: "soccer.t.391", crest: "por.png" },
        { pos: 3, team: "Congo DR", teamId: "soccer.t.5334", crest: "cod.png" },
      ],
    },
    {
      name: "Group L",
      rows: [
        { pos: 1, team: "England", teamId: "soccer.t.377", crest: "eng.png" },
        { pos: 2, team: "Croatia", teamId: "soccer.t.440", crest: "cro.png" },
        { pos: 3, team: "Ghana", teamId: "soccer.t.380", crest: "gha.png" },
      ],
    },
  ],
  thirdPlaceRanking: [
    { group: "Group K", team: "Congo DR", qualified: true },
    { group: "Group F", team: "Sweden", qualified: true },
    { group: "Group E", team: "Ecuador", qualified: true },
    { group: "Group L", team: "Ghana", qualified: true },
    { group: "Group B", team: "Bosnia and Herzegovina", qualified: true },
    { group: "Group J", team: "Algeria", qualified: true },
    { group: "Group D", team: "Paraguay", qualified: true },
    { group: "Group I", team: "Senegal", qualified: true },
  ],
};

test("formats unresolved World Cup knockout placeholders like Yahoo", () => {
  const fixtures = [
    {
      id: "wc-gw4-f13532373",
      stage: "LAST_32",
      home: "Spain",
      away: "2J",
    },
    {
      id: "wc-gw4-f13532371",
      stage: "LAST_32",
      home: "Switzerland",
      away: "3E/3F/3G/3I/3J",
    },
  ];

  const formatted = formatWorldCupFixtureSeedPlaceholders(fixtures);

  assert.equal(formatted[0].away, "2J");
  assert.equal(formatted[0].awayOriginalSeed, "2J");
  assert.equal(formatted[1].away, "3RD P");
  assert.equal(formatted[1].awayOriginalSeed, "3E/3F/3G/3I/3J");
  assert.equal(fixtureHasWorldCupSeedPlaceholder(formatted[1]), true);
});

test("resolves direct and third-place World Cup knockout seed placeholders", () => {
  const fixtures = [
    {
      id: "wc-gw4-f13532371",
      stage: "LAST_32",
      home: "Switzerland",
      homeTeamId: "soccer.t.398",
      away: "3E/3F/3G/3I/3J",
      awayTeamId: "soccer.t.19398",
    },
    {
      id: "wc-gw4-f13532373",
      stage: "LAST_32",
      home: "Spain",
      homeTeamId: "soccer.t.397",
      away: "2J",
      awayTeamId: "soccer.t.19387",
    },
  ];

  const resolved = resolveWorldCupKnockoutSeeds(fixtures, standings);

  assert.equal(resolved[0].away, "Algeria");
  assert.equal(resolved[0].awaySeed, "3J");
  assert.equal(resolved[0].awayOriginalSeed, "3E/3F/3G/3I/3J");
  assert.equal(resolved[0].awayTeamId, "soccer.t.369");
  assert.equal(resolved[0].awayCrest, "alg.png");

  assert.equal(resolved[1].away, "Austria");
  assert.equal(resolved[1].awaySeed, "2J");
  assert.equal(resolved[1].awayOriginalSeed, "2J");
  assert.equal(resolved[1].awayTeamId, "soccer.t.869");
  assert.equal(resolved[1].awayCrest, "aut.png");
});

test("resolves seed placeholders already stored in the WC global fixture cache", () => {
  const globalDoc = {
    season: 2026,
    updatedAt: 1,
    gameweeks: [
      {
        gw: 4,
        season: 2026,
        fixtures: [
          {
            id: "wc-gw4-f13532371",
            stage: "LAST_32",
            home: "Switzerland",
            homeTeamId: "soccer.t.398",
            away: "3E/3F/3G/3I/3J",
            awayTeamId: "soccer.t.19398",
          },
          {
            id: "wc-gw4-f13532373",
            stage: "LAST_32",
            home: "Spain",
            homeTeamId: "soccer.t.397",
            away: "2J",
            awayTeamId: "soccer.t.19387",
          },
        ],
      },
    ],
  };

  const { globalDoc: resolvedDoc, changed } = resolveWorldCupGlobalDocSeeds(globalDoc, standings);
  const fixtures = resolvedDoc.gameweeks[0].fixtures;

  assert.equal(changed, true);
  assert.equal(fixtures[0].away, "Algeria");
  assert.equal(fixtures[1].away, "Austria");
});

test("formats seed placeholders already stored in the WC global fixture cache before they are resolvable", () => {
  const globalDoc = {
    season: 2030,
    updatedAt: 1,
    gameweeks: [
      {
        gw: 4,
        season: 2030,
        fixtures: [
          {
            id: "wc-gw4-f1",
            stage: "LAST_32",
            home: "1B",
            away: "3E/3F/3G/3I/3J",
          },
        ],
      },
    ],
  };

  const { globalDoc: formattedDoc, changed } = formatWorldCupGlobalDocSeedPlaceholders(globalDoc);
  const fixture = formattedDoc.gameweeks[0].fixtures[0];

  assert.equal(changed, true);
  assert.equal(fixture.home, "1B");
  assert.equal(fixture.homeOriginalSeed, "1B");
  assert.equal(fixture.away, "3RD P");
  assert.equal(fixture.awayOriginalSeed, "3E/3F/3G/3I/3J");
});

test("labels unresolved World Cup knockout bracket slots like Yahoo", () => {
  assert.equal(getWorldCupKnockoutPlaceholderLabel(5, 0, "home"), "W74");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(5, 0, "away"), "W77");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(5, 7, "home"), "W85");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(5, 7, "away"), "W87");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(6, 0, "home"), "W89");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(7, 1, "away"), "W100");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(8, 0, "away"), "W102");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(8, 0, "home", "THIRD_PLACE"), "L101");
  assert.equal(getWorldCupKnockoutPlaceholderLabel(8, 0, "away", "THIRD_PLACE"), "L102");
});

test("uses Yahoo game ids for unresolved World Cup knockout labels when available", () => {
  assert.equal(
    getWorldCupKnockoutPlaceholderLabel(5, 0, "home", "ROUND_OF_16", { apiId: "soccer.g.13532378" }),
    "W73"
  );
  assert.equal(
    getWorldCupKnockoutPlaceholderLabel(5, 0, "away", "ROUND_OF_16", { apiId: "soccer.g.13532378" }),
    "W75"
  );
  assert.equal(
    getWorldCupKnockoutPlaceholderLabel(6, 1, "home", "QUARTER_FINAL", { id: "wc-gw6-fsoccer-g-13532386" }),
    "W93"
  );
  assert.equal(
    getWorldCupKnockoutPlaceholderLabel(8, 0, "away", "THIRD_PLACE", { apiId: "soccer.g.13532391" }),
    "L102"
  );
});

test("builds known World Cup knockout fixtures with verified dates", () => {
  const roundOf32 = buildWorldCupKnockoutScheduleFixtures(4);
  assert.equal(roundOf32.length, 16);
  assert.deepEqual(
    roundOf32.map(f => [f.apiId, f.date, f.yahooDate]),
    [
      ["soccer.g.13532362", "2026-06-29T20:30:00.000Z", "2026-06-29"],
      ["soccer.g.13532365", "2026-06-30T21:00:00.000Z", "2026-06-30"],
      ["soccer.g.13532361", "2026-06-28T19:00:00.000Z", "2026-06-28"],
      ["soccer.g.13532363", "2026-06-30T01:00:00.000Z", "2026-06-29"],
      ["soccer.g.13532372", "2026-07-02T23:00:00.000Z", "2026-07-02"],
      ["soccer.g.13532373", "2026-07-02T19:00:00.000Z", "2026-07-02"],
      ["soccer.g.13532368", "2026-07-02T00:00:00.000Z", "2026-07-01"],
      ["soccer.g.13532369", "2026-07-01T20:00:00.000Z", "2026-07-01"],
      ["soccer.g.13532364", "2026-06-29T17:00:00.000Z", "2026-06-29"],
      ["soccer.g.13532366", "2026-06-30T17:00:00.000Z", "2026-06-30"],
      ["soccer.g.13532367", "2026-07-01T02:00:00.000Z", "2026-06-30"],
      ["soccer.g.13532370", "2026-07-01T16:00:00.000Z", "2026-07-01"],
      ["soccer.g.13532376", "2026-07-03T22:00:00.000Z", "2026-07-03"],
      ["soccer.g.13532374", "2026-07-03T18:00:00.000Z", "2026-07-03"],
      ["soccer.g.13532371", "2026-07-03T03:00:00.000Z", "2026-07-02"],
      ["soccer.g.13532375", "2026-07-04T01:30:00.000Z", "2026-07-03"],
    ]
  );

  const roundOf16 = buildWorldCupKnockoutScheduleFixtures(5);
  assert.equal(roundOf16.length, 8);
  assert.deepEqual(
    roundOf16.map(f => [f.apiId, f.home, f.away, f.date]),
    [
      ["soccer.g.13532377", "W74", "W77", "2026-07-04T21:00:00.000Z"],
      ["soccer.g.13532378", "W73", "W75", "2026-07-04T17:00:00.000Z"],
      ["soccer.g.13532381", "W83", "W84", "2026-07-06T19:00:00.000Z"],
      ["soccer.g.13532382", "W81", "W82", "2026-07-07T00:00:00.000Z"],
      ["soccer.g.13532379", "W76", "W78", "2026-07-05T20:00:00.000Z"],
      ["soccer.g.13532380", "W79", "W80", "2026-07-06T00:00:00.000Z"],
      ["soccer.g.13532383", "W86", "W88", "2026-07-07T16:00:00.000Z"],
      ["soccer.g.13532384", "W85", "W87", "2026-07-07T20:00:00.000Z"],
    ]
  );

  const quarterFinals = buildWorldCupKnockoutScheduleFixtures(6);
  assert.equal(quarterFinals.find(f => f.apiId === "soccer.g.13532388")?.date, "2026-07-12T01:00:00.000Z");

  const finalRound = buildWorldCupKnockoutScheduleFixtures(8);
  assert.deepEqual(
    finalRound.map(f => [f.apiId, f.stage, f.date]),
    [
      ["soccer.g.13532392", "FINAL", "2026-07-19T19:00:00.000Z"],
      ["soccer.g.13532391", "THIRD_PLACE", "2026-07-18T21:00:00.000Z"],
    ]
  );
});

test("known World Cup knockout schedule corrects stale cached fixture dates", () => {
  const [gw] = applyKnownWorldCupKnockoutSchedule([
    {
      gw: 5,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw5-fsoccer-g-13532377",
          apiId: "soccer.g.13532377",
          home: "Canada",
          away: "Morocco",
          date: "2026-07-13T15:00:00.000Z",
          stage: "ROUND_OF_16",
          status: "SCHEDULED",
        },
      ],
    },
    {
      gw: 4,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw4-fsoccer-g-13532375",
          apiId: "soccer.g.13532375",
          home: "Colombia",
          away: "Ghana",
          date: "2026-07-10T21:00:00.000Z",
          stage: "LAST_32",
          status: "FINISHED",
          result: "1-0",
        },
      ],
    },
  ]);

  assert.equal(gw.fixtures[0].apiId, "soccer.g.13532378");
  assert.equal(gw.fixtures[0].date, "2026-07-04T17:00:00.000Z");
  assert.equal(gw.fixtures[0].yahooDate, "2026-07-04");
  assert.equal(
    applyKnownWorldCupKnockoutSchedule([
      {
        gw: 4,
        fixtures: [
          {
            id: "wc-gw4-fsoccer-g-13532375",
            apiId: "soccer.g.13532375",
            home: "Colombia",
            away: "Ghana",
            date: "2026-07-10T21:00:00.000Z",
          },
        ],
      },
    ])[0].fixtures[0].date,
    "2026-07-04T01:30:00.000Z"
  );
  const placeholderFixture = applyKnownWorldCupKnockoutSchedule([
    {
      gw: 5,
      fixtures: [
        {
          id: "wc-gw5-old-row",
          home: "W81",
          away: "W82",
          date: "2026-07-06T00:00:00.000Z",
        },
      ],
    },
  ])[0].fixtures[0];
  assert.equal(placeholderFixture.apiId, "soccer.g.13532382");
  assert.equal(placeholderFixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(placeholderFixture.yahooDate, "2026-07-06");

  const resolvedTeamFixture = applyKnownWorldCupKnockoutSchedule([
    {
      gw: 5,
      fixtures: [
        {
          id: "wc-gw5-old-usa-belgium",
          home: "USA",
          away: "Belgium",
          date: "2026-07-06T00:00:00.000Z",
        },
      ],
    },
  ])[0].fixtures[0];
  assert.equal(resolvedTeamFixture.apiId, "soccer.g.13532382");
  assert.equal(resolvedTeamFixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(resolvedTeamFixture.yahooDate, "2026-07-06");

  const wrongApiIdFixture = applyKnownWorldCupKnockoutSchedule([
    {
      gw: 5,
      fixtures: [
        {
          id: "wc-gw5-old-usa-belgium",
          apiId: "soccer.g.13532380",
          home: "USA",
          away: "Belgium",
          date: "2026-07-06T00:00:00.000Z",
        },
      ],
    },
  ])[0].fixtures[0];
  assert.equal(wrongApiIdFixture.apiId, "soccer.g.13532382");
  assert.equal(wrongApiIdFixture.date, "2026-07-07T00:00:00.000Z");
  assert.equal(wrongApiIdFixture.yahooDate, "2026-07-06");

  const oldVisibleRows = applyKnownWorldCupKnockoutSchedule([
    {
      gw: 5,
      fixtures: [
        { id: "old-r16-1", apiId: "soccer.g.13532377", home: "Paraguay", away: "France", date: "2026-07-04T17:00:00.000Z" },
        { id: "old-r16-2", apiId: "soccer.g.13532378", home: "Canada", away: "Morocco", date: "2026-07-04T21:00:00.000Z" },
        { id: "old-r16-3", apiId: "soccer.g.13532379", home: "Portugal", away: "Spain", date: "2026-07-05T20:00:00.000Z" },
        { id: "old-r16-4", apiId: "soccer.g.13532380", home: "USA", away: "Belgium", date: "2026-07-06T00:00:00.000Z" },
        { id: "old-r16-5", apiId: "soccer.g.13532381", home: "Brazil", away: "Norway", date: "2026-07-06T19:00:00.000Z" },
        { id: "old-r16-6", apiId: "soccer.g.13532382", home: "Mexico", away: "England", date: "2026-07-07T00:00:00.000Z" },
        { id: "old-r16-7", apiId: "soccer.g.13532383", home: "Argentina", away: "Egypt", date: "2026-07-07T16:00:00.000Z" },
        { id: "old-r16-8", apiId: "soccer.g.13532384", home: "Switzerland", away: "Colombia", date: "2026-07-07T20:00:00.000Z" },
      ],
    },
  ])[0].fixtures;
  assert.deepEqual(
    oldVisibleRows.map(f => [f.home, f.away, f.apiId, f.date]),
    [
      ["Paraguay", "France", "soccer.g.13532377", "2026-07-04T21:00:00.000Z"],
      ["Canada", "Morocco", "soccer.g.13532378", "2026-07-04T17:00:00.000Z"],
      ["Portugal", "Spain", "soccer.g.13532381", "2026-07-06T19:00:00.000Z"],
      ["USA", "Belgium", "soccer.g.13532382", "2026-07-07T00:00:00.000Z"],
      ["Brazil", "Norway", "soccer.g.13532379", "2026-07-05T20:00:00.000Z"],
      ["Mexico", "England", "soccer.g.13532380", "2026-07-06T00:00:00.000Z"],
      ["Argentina", "Egypt", "soccer.g.13532383", "2026-07-07T16:00:00.000Z"],
      ["Switzerland", "Colombia", "soccer.g.13532384", "2026-07-07T20:00:00.000Z"],
    ]
  );
});

test("orders World Cup bracket fixtures by visible bracket flow", () => {
  const fixture = (gameId, home = `H${gameId}`, away = `A${gameId}`) => ({
    id: `wc-fsoccer-g-${gameId}`,
    apiId: `soccer.g.${gameId}`,
    home,
    away,
  });

  const roundOf32 = sortWorldCupBracketFixturesForDisplay(4, [
    fixture(13532361, "South Africa", "Canada"),
    fixture(13532364, "Brazil", "Japan"),
    fixture(13532362, "Germany", "Paraguay"),
    fixture(13532363, "Netherlands", "Morocco"),
    fixture(13532366, "Ivory Coast", "Norway"),
    fixture(13532365, "France", "Sweden"),
    fixture(13532367, "Mexico", "Ecuador"),
    fixture(13532370, "England", "DR Congo"),
    fixture(13532372, "Portugal", "Croatia"),
    fixture(13532373, "Spain", "Austria"),
    fixture(13532368, "USA", "Bosnia-Herzegovina"),
    fixture(13532369, "Belgium", "Senegal"),
    fixture(13532376, "Argentina", "Cape Verde"),
    fixture(13532374, "Australia", "Egypt"),
    fixture(13532371, "Switzerland", "Algeria"),
    fixture(13532375, "Colombia", "Ghana"),
  ]);

  assert.deepEqual(roundOf32.map(f => f.apiId), [
    "soccer.g.13532362",
    "soccer.g.13532365",
    "soccer.g.13532361",
    "soccer.g.13532363",
    "soccer.g.13532372",
    "soccer.g.13532373",
    "soccer.g.13532368",
    "soccer.g.13532369",
    "soccer.g.13532364",
    "soccer.g.13532366",
    "soccer.g.13532367",
    "soccer.g.13532370",
    "soccer.g.13532376",
    "soccer.g.13532374",
    "soccer.g.13532371",
    "soccer.g.13532375",
  ]);

  const roundOf16 = sortWorldCupBracketFixturesForDisplay(5, [
    fixture(13532378),
    fixture(13532377),
    fixture(13532379),
    fixture(13532380),
    fixture(13532381),
    fixture(13532382),
    fixture(13532383),
    fixture(13532384),
  ]);

  assert.deepEqual(roundOf16.map(f => f.apiId), [
    "soccer.g.13532377",
    "soccer.g.13532378",
    "soccer.g.13532381",
    "soccer.g.13532382",
    "soccer.g.13532379",
    "soccer.g.13532380",
    "soccer.g.13532383",
    "soccer.g.13532384",
  ]);

  const quarterfinals = sortWorldCupBracketFixturesForDisplay(6, [
    fixture(13532387),
    fixture(13532385),
    fixture(13532388),
    fixture(13532386),
  ]);

  assert.deepEqual(quarterfinals.map(f => f.apiId), [
    "soccer.g.13532385",
    "soccer.g.13532386",
    "soccer.g.13532387",
    "soccer.g.13532388",
  ]);
});

test("advances completed knockout winners into later bracket placeholders", () => {
  const partial = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw4-fsoccer-g-13532361",
          apiId: "soccer.g.13532361",
          home: "South Africa",
          away: "Canada",
          homeCrest: "rsa.png",
          awayCrest: "can.png",
          result: "0-1",
        },
        {
          id: "wc-gw4-fsoccer-g-13532364",
          apiId: "soccer.g.13532364",
          home: "Brazil",
          away: "Japan",
          homeCrest: "bra.png",
          awayCrest: "jpn.png",
          result: null,
        },
      ],
    },
    {
      gw: 5,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw5-fsoccer-g-13532378",
          apiId: "soccer.g.13532378",
          home: "W73",
          away: "W75",
        },
        {
          id: "wc-gw5-fsoccer-g-13532379",
          apiId: "soccer.g.13532379",
          home: "W76",
          away: "W78",
        },
      ],
    },
  ]);

  assert.equal(partial[1].fixtures[0].home, "Canada");
  assert.equal(partial[1].fixtures[0].homeCrest, "can.png");
  assert.equal(partial[1].fixtures[0].away, "W75");
  assert.equal(partial[1].fixtures[1].home, "W76");

  const complete = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw4-fsoccer-g-13532361",
          apiId: "soccer.g.13532361",
          home: "South Africa",
          away: "Canada",
          result: "0-1",
        },
        {
          id: "wc-gw4-fsoccer-g-13532364",
          apiId: "soccer.g.13532364",
          home: "Brazil",
          away: "Japan",
          result: "2-1",
        },
      ],
    },
    {
      gw: 5,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw5-fsoccer-g-13532378",
          apiId: "soccer.g.13532378",
          home: "W73",
          away: "W75",
        },
        {
          id: "wc-gw5-fsoccer-g-13532379",
          apiId: "soccer.g.13532379",
          home: "W76",
          away: "W78",
        },
      ],
    },
  ]);

  assert.equal(complete[1].fixtures[0].home, "Canada");
  assert.equal(complete[1].fixtures[0].away, "W75");
  assert.equal(complete[1].fixtures[1].home, "Brazil");
  assert.equal(complete[1].fixtures[1].away, "W78");
});

test("advances winners into generated placeholder labels for empty knockout slots", () => {
  const resolved = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw4-fsoccer-g-13532361",
          apiId: "13532361",
          home: "South Africa",
          away: "Canada",
          result: "0-1",
        },
        {
          id: "wc-gw4-fsoccer-g-13532364",
          apiId: "13532364",
          home: "Brazil",
          away: "Japan",
          result: "2-1",
        },
      ],
    },
    {
      gw: 5,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw5-fsoccer-g-13532378",
          apiId: "13532378",
          home: "TBD",
          away: null,
          stage: "ROUND_OF_16",
        },
        {
          id: "wc-gw5-fsoccer-g-13532379",
          apiId: "13532379",
          home: "TBD",
          away: null,
          stage: "ROUND_OF_16",
        },
      ],
    },
  ]);

  assert.equal(resolved[1].fixtures[0].home, "Canada");
  assert.equal(resolved[1].fixtures[0].away, null);
  assert.equal(resolved[1].fixtures[1].home, "Brazil");
  assert.equal(resolved[1].fixtures[1].away, null);
});

test("advances tied knockout winners using Yahoo winner metadata", () => {
  const germanyParaguay = {
    id: "wc-gw4-fsoccer-g-13532362",
    apiId: "soccer.g.13532362",
    home: "Germany",
    away: "Paraguay",
    homeTeamId: "soccer.t.379",
    awayTeamId: "soccer.t.390",
    homeCrest: "ger.png",
    awayCrest: "par.png",
    result: "1-1",
    status: "FINISHED",
    winningTeamId: "soccer.t.390",
    homeShootoutScore: 3,
    awayShootoutScore: 4,
  };

  assert.equal(winnerSideForWorldCupFixture(germanyParaguay), "away");

  const resolved = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        { id: "wc-gw4-fsoccer-g-13532361", apiId: "soccer.g.13532361", home: "South Africa", away: "Canada", result: "0-1" },
        { id: "wc-gw4-fsoccer-g-13532364", apiId: "soccer.g.13532364", home: "Brazil", away: "Japan", result: "2-1" },
        germanyParaguay,
      ],
    },
    {
      gw: 5,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw5-fsoccer-g-13532377",
          apiId: "soccer.g.13532377",
          home: "W74",
          away: "W77",
          stage: "ROUND_OF_16",
        },
      ],
    },
  ]);

  const fixture = resolved[1].fixtures[0];
  assert.equal(fixture.home, "Paraguay");
  assert.equal(fixture.homeTeamId, "soccer.t.390");
  assert.equal(fixture.homeCrest, "par.png");
  assert.equal(fixture.away, "W77");
});

test("advances later knockout winners by Yahoo game id instead of fetched order", () => {
  const resolved = resolveWorldCupBracketAdvancement([
    {
      gw: 5,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw5-fsoccer-g-13532378",
          apiId: "soccer.g.13532378",
          home: "Canada",
          away: "Morocco",
          result: "1-0",
        },
        {
          id: "wc-gw5-fsoccer-g-13532377",
          apiId: "soccer.g.13532377",
          home: "Paraguay",
          away: "France",
          result: "2-1",
        },
      ],
    },
    {
      gw: 6,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw6-fsoccer-g-13532385",
          apiId: "soccer.g.13532385",
          home: "W89",
          away: "W90",
          stage: "QUARTER_FINAL",
        },
      ],
    },
  ]);

  const fixture = resolved[1].fixtures[0];
  assert.equal(fixture.home, "Paraguay");
  assert.equal(fixture.away, "Canada");
});

test("resolved Round of 16 fixtures keep the correct kickoff dates", () => {
  const resolved = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        { id: "wc-gw4-fsoccer-g-13532361", apiId: "soccer.g.13532361", home: "South Africa", away: "Canada", result: "0-1" },
        { id: "wc-gw4-fsoccer-g-13532362", apiId: "soccer.g.13532362", home: "Germany", away: "Paraguay", result: "1-1", winnerSide: "away" },
        { id: "wc-gw4-fsoccer-g-13532363", apiId: "soccer.g.13532363", home: "Netherlands", away: "Morocco", result: "1-1", winnerSide: "away" },
        { id: "wc-gw4-fsoccer-g-13532365", apiId: "soccer.g.13532365", home: "France", away: "Sweden", result: "3-0" },
        { id: "wc-gw4-fsoccer-g-13532368", apiId: "soccer.g.13532368", home: "USA", away: "Bosnia-Herzegovina", result: "2-0" },
        { id: "wc-gw4-fsoccer-g-13532369", apiId: "soccer.g.13532369", home: "Belgium", away: "Senegal", result: "3-2" },
      ],
    },
    { gw: 5, season: 2026, fixtures: buildWorldCupKnockoutScheduleFixtures(5) },
  ]);

  const paraguayFrance = resolved[1].fixtures.find(f => f.apiId === "soccer.g.13532377");
  const canadaMorocco = resolved[1].fixtures.find(f => f.apiId === "soccer.g.13532378");

  assert.deepEqual(
    [paraguayFrance.home, paraguayFrance.away, paraguayFrance.date],
    ["Paraguay", "France", "2026-07-04T21:00:00.000Z"]
  );
  assert.deepEqual(
    [canadaMorocco.home, canadaMorocco.away, canadaMorocco.date],
    ["Canada", "Morocco", "2026-07-04T17:00:00.000Z"]
  );

  const usaBelgium = resolved[1].fixtures.find(f => f.apiId === "soccer.g.13532382");
  assert.deepEqual(
    [
      usaBelgium.home,
      usaBelgium.away,
      formatWorldCupBracketMatchMeta(usaBelgium, { timeZone: "America/Los_Angeles" }),
    ],
    [
      "USA",
      "Belgium",
      { primary: "7/6", secondary: "5:00 PM" },
    ]
  );
});

test("knockout bracket renders with advanced winner placeholders resolved", () => {
  const bracketBlock = appSource.slice(
    appSource.indexOf("function WCKnockoutStage"),
    appSource.indexOf("function LeagueTab")
  );

  assert.match(bracketBlock, /resolveWorldCupBracketAdvancement\(group\.gameweeks \|\| \[\]\)/);
  assert.match(bracketBlock, /bracketGameweeks\.find\(g => g\.gw === gwNum\)/);
  assert.match(bracketBlock, /sortWorldCupBracketFixturesForDisplay\(gwNum/);
  assert.match(bracketBlock, /winnerSideForWorldCupFixture\(f\)/);
  assert.match(bracketBlock, /formatWorldCupBracketMatchMeta\(f/);
});

test("detects only empty/TBD World Cup team slots as unresolved", () => {
  assert.equal(isUnresolvedWorldCupTeamSlot(""), true);
  assert.equal(isUnresolvedWorldCupTeamSlot(null), true);
  assert.equal(isUnresolvedWorldCupTeamSlot("TBD"), true);
  assert.equal(isUnresolvedWorldCupTeamSlot("South Africa"), false);
  assert.equal(isUnresolvedWorldCupTeamSlot("W74"), false);
});

test("formats World Cup bracket team names to 12 characters plus ellipsis", () => {
  assert.equal(formatWorldCupBracketTeamName("Bosnia-Herzegovina"), "Bosnia-Herze...");
  assert.equal(formatWorldCupBracketTeamName("South Africa"), "South Africa");
  assert.equal(formatWorldCupBracketTeamName("Portugal"), "Portugal");
});

test("formats World Cup bracket kickoff date and time like Yahoo", () => {
  const kickoff = formatWorldCupBracketKickoff("2026-06-29T17:30:00.000Z", { timeZone: "UTC" });

  assert.deepEqual(kickoff, { date: "6/29", time: "5:30 PM" });
  assert.equal(formatWorldCupBracketKickoff(null), null);
  assert.equal(formatWorldCupBracketKickoff("not a date"), null);
});

test("formats World Cup bracket right strip for scheduled and finished matches", () => {
  assert.deepEqual(
    formatWorldCupBracketMatchMeta({ status: "SCHEDULED", date: "2026-06-29T17:30:00.000Z" }, { timeZone: "UTC" }),
    { primary: "6/29", secondary: "5:30 PM" }
  );

  assert.deepEqual(
    formatWorldCupBracketMatchMeta({ status: "FINISHED", result: "2-1", date: "2026-06-29T17:30:00.000Z" }, { timeZone: "UTC" }),
    { primary: "FT", secondary: null }
  );

  assert.deepEqual(
    formatWorldCupBracketMatchMeta({
      status: "FINISHED",
      result: "1-1",
      homeTeamId: "soccer.t.379",
      awayTeamId: "soccer.t.390",
      winningTeamId: "soccer.t.390",
      homeShootoutScore: 3,
      awayShootoutScore: 4,
      date: "2026-06-29T20:30:00.000Z",
    }, { timeZone: "UTC" }),
    { primary: "FT", secondary: "PEN: 4-3" }
  );

  assert.equal(formatWorldCupBracketMatchMeta({ status: "SCHEDULED" }), null);
});
