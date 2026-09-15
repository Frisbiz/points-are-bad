import test from "node:test";
import assert from "node:assert/strict";

import * as scoring from "../shared/scoring.js";

const { calcPts, computeGroupStats } = scoring;

test("malformed scorelines do not poison aggregate standings", () => {
  assert.equal(calcPts("1", "0-0"), null);
  assert.equal(calcPts("one-nil", "0-0"), null);
  assert.equal(calcPts("1-0", "0"), null);
});

test("ties use perfect scores, missed picks, then shared competition ranks", () => {
  const stats = computeGroupStats({
    members: ["alex", "dana", "faris", "sam", "lee"],
    season: 2026,
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [
        { id: "one", result: "1-0" },
        { id: "two", result: "0-0" },
      ],
    }],
    predictions: {
      alex: { one: "1-0", two: "4-0" },
      dana: { one: "1-0", two: "4-0" },
      faris: { two: "0-0" },
      sam: { one: "2-0", two: "3-0" },
      lee: {},
    },
  });

  assert.deepEqual(stats.map(({ username, total, perfects, missed, rank }) => ({
    username, total, perfects, missed, rank,
  })), [
    { username: "alex", total: 4, perfects: 1, missed: 0, rank: 1 },
    { username: "dana", total: 4, perfects: 1, missed: 0, rank: 1 },
    { username: "faris", total: 4, perfects: 1, missed: 1, rank: 3 },
    { username: "sam", total: 4, perfects: 0, missed: 0, rank: 4 },
    { username: "lee", total: 4, perfects: 0, missed: 0, rank: 5 },
  ]);
});

test("points breakdown rows come from authoritative aggregate stats without scorelines", () => {
  const stats = computeGroupStats({
    members: ["alex"],
    season: 2026,
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [
        { id: "perfect", result: "1-0" },
        { id: "close", result: "0-0" },
        { id: "bad", result: "3-2" },
        { id: "missed", result: "2-2" },
      ],
    }],
    predictions: {
      alex: { perfect: "1-0", close: "1-0", bad: "0-0" },
    },
  });

  assert.equal(typeof scoring.buildPointsBreakdownRows, "function");
  assert.deepEqual(scoring.buildPointsBreakdownRows(stats, { alex: "Alex" }), [{
    name: "Alex",
    Perfect: 1,
    Close: 1,
    Bad: 1,
    Missed: 1,
  }]);
  assert.equal(JSON.stringify(stats).includes('"1-0"'), false);
  assert.equal(JSON.stringify(stats).includes('"0-0"'), false);
});

test("match-level trend aggregates include partial gameweek results but exclude future picks", () => {
  assert.equal(typeof scoring.computeTrendStats, "function");
  const trends = scoring.computeTrendStats({
    members: ["alex"],
    season: 2026,
    gameweeks: [
      {
        gw: 1,
        season: 2026,
        fixtures: [
          { id: "one", status: "FINISHED", result: "1-0" },
          { id: "two", status: "FINISHED", result: "0-0" },
        ],
      },
      {
        gw: 2,
        season: 2026,
        fixtures: [
          { id: "three", status: "FINISHED", result: "2-2" },
          { id: "future", status: "SCHEDULED" },
        ],
      },
    ],
    predictions: {
      alex: { one: "1-0", two: "2-1", three: "1-1", future: "5-5" },
    },
  });

  assert.deepEqual(trends.players.alex, {
    pointsDistribution: { "0": 1, "1": 0, "2": 1, "3": 1, "4": 0, "5+": 0 },
    predictionStyle: { home: 2, draw: 1, away: 0 },
    submittedPicks: 3,
    submittedPoints: 5,
    predictedGoals: 6,
    actualGoals: 5,
    winnerCorrect: 2,
    perfects: 1,
    completedGwStdDev: 0,
    scoreHeatmap: { "1-0": 1, "1-1": 1, "2-1": 1 },
  });
  assert.deepEqual(trends.actualResultsHeatmap, { "0-0": 1, "1-0": 1, "2-2": 1 });
  assert.equal(JSON.stringify(trends).includes('"5-5"'), false);
});

test("match-level trend distributions apply missed-pick penalties after a player joins", () => {
  const trends = scoring.computeTrendStats({
    members: ["alex"],
    season: 2026,
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [
        { id: "missed", result: "3-0" },
        { id: "picked", result: "1-1" },
      ],
    }],
    predictions: { alex: { picked: "1-1" } },
  });

  assert.deepEqual(trends.players.alex.pointsDistribution, {
    "0": 1, "1": 0, "2": 0, "3": 0, "4": 1, "5+": 0,
  });
  assert.equal(trends.players.alex.submittedPicks, 1);
  assert.equal(trends.players.alex.submittedPoints, 0);
});
