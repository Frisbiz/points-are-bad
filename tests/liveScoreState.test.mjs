import test from "node:test";
import assert from "node:assert/strict";
import { finishedScoresKey, retainUnchangedLiveScores } from "../src/liveScoreState.js";

test("live minutes and scores do not change the finished-results snapshot", () => {
  const live = { "A|B": { status: "in_progress", homeScore: 0, awayScore: 0, elapsed: "30'" } };
  const updated = { "A|B": { status: "in_progress", homeScore: 1, awayScore: 0, elapsed: "31'" } };
  assert.equal(finishedScoresKey(live), finishedScoresKey(updated));
  assert.notEqual(finishedScoresKey(updated), finishedScoresKey({ "A|B": { ...updated["A|B"], status: "finished" } }));
});

test("finished result and shootout updates change the snapshot while fixture order does not", () => {
  const a = { status: "finished", homeScore: 1, awayScore: 1, homeShootoutScore: 4, awayShootoutScore: 3 };
  const b = { status: "finished", homeScore: 2, awayScore: 0 };
  const original = { "A|B": a, "C|D": b };
  assert.equal(finishedScoresKey(original), finishedScoresKey({ "C|D": { ...b }, "A|B": { ...a } }));
  assert.notEqual(finishedScoresKey(original), finishedScoresKey({ "A|B": { ...a, homeShootoutScore: 5 }, "C|D": b }));
  assert.notEqual(finishedScoresKey(original), finishedScoresKey({ "A|B": a, "C|D": { ...b, homeScore: 3 } }));
});

test("unchanged poll responses retain the existing map while any score or status change is delivered", () => {
  const previous = { "A|B": { status: "in_progress", homeScore: 1, awayScore: 0, elapsed: "30'" } };
  assert.equal(retainUnchangedLiveScores(previous, { "A|B": { ...previous["A|B"] } }), previous);
  const changed = { "A|B": { ...previous["A|B"], elapsed: "31'" } };
  assert.equal(retainUnchangedLiveScores(previous, changed), changed);
  const final = { "A|B": { ...previous["A|B"], status: "finished" } };
  assert.equal(retainUnchangedLiveScores(previous, final), final);
  assert.notEqual(retainUnchangedLiveScores(previous, {}), previous);
});
