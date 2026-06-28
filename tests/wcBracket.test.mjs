import test from "node:test";
import assert from "node:assert/strict";

import { resolveWorldCupGlobalDocSeeds, resolveWorldCupKnockoutSeeds } from "../api/_wcBracket.js";

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
