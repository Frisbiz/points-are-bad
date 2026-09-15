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
