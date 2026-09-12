import test from "node:test";
import assert from "node:assert/strict";

import { calcPts, computeGroupStats } from "../shared/scoring.js";

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
