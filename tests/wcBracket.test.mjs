import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  fixtureHasWorldCupSeedPlaceholder,
  formatWorldCupBracketKickoff,
  formatWorldCupBracketTeamName,
  formatWorldCupFixtureSeedPlaceholders,
  formatWorldCupGlobalDocSeedPlaceholders,
  getWorldCupKnockoutPlaceholderLabel,
  isUnresolvedWorldCupTeamSlot,
  resolveWorldCupBracketAdvancement,
  resolveWorldCupGlobalDocSeeds,
  resolveWorldCupKnockoutSeeds,
} from "../api/_wcBracket.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

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

test("advances completed knockout winners into later bracket placeholders", () => {
  const partial = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw4-f13532374",
          home: "South Africa",
          away: "Canada",
          homeCrest: "rsa.png",
          awayCrest: "can.png",
          result: "0-1",
        },
        {
          id: "wc-gw4-f13532377",
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
          id: "wc-gw5-f13532377",
          home: "W74",
          away: "W77",
        },
      ],
    },
  ]);

  assert.equal(partial[1].fixtures[0].home, "Canada");
  assert.equal(partial[1].fixtures[0].homeCrest, "can.png");
  assert.equal(partial[1].fixtures[0].away, "W77");

  const complete = resolveWorldCupBracketAdvancement([
    {
      gw: 4,
      season: 2026,
      fixtures: [
        {
          id: "wc-gw4-f13532374",
          home: "South Africa",
          away: "Canada",
          result: "0-1",
        },
        {
          id: "wc-gw4-f13532377",
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
          id: "wc-gw5-f13532377",
          home: "W74",
          away: "W77",
        },
      ],
    },
  ]);

  assert.equal(complete[1].fixtures[0].home, "Canada");
  assert.equal(complete[1].fixtures[0].away, "Brazil");
});

test("knockout bracket renders with advanced winner placeholders resolved", () => {
  const bracketBlock = appSource.slice(
    appSource.indexOf("function WCKnockoutStage"),
    appSource.indexOf("function LeagueTab")
  );

  assert.match(bracketBlock, /resolveWorldCupBracketAdvancement\(group\.gameweeks \|\| \[\]\)/);
  assert.match(bracketBlock, /bracketGameweeks\.find\(g => g\.gw === gwNum\)/);
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
