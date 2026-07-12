import test from "node:test";
import assert from "node:assert/strict";
import {
  FINALIZATION_RETRY_INTERVAL_MS,
  LIVE_POLL_INTERVAL_MS,
  SCHEDULE_SYNC_INTERVAL_MS,
  hasUnpersistedFinishedLiveScores,
  setLiveSuccessCacheHeaders,
  shouldRunVisibleTask,
} from "../api/_livePolicy.js";

test("live success responses are browser-revalidated and shared at Vercel for 15 seconds", () => {
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };

  setLiveSuccessCacheHeaders(res);

  assert.equal(LIVE_POLL_INTERVAL_MS, 5_000);
  assert.equal(FINALIZATION_RETRY_INTERVAL_MS, 60_000);
  assert.equal(headers["Cache-Control"], "public, max-age=0, must-revalidate");
  assert.equal(headers["Vercel-CDN-Cache-Control"], "public, max-age=15, stale-while-revalidate=30");
});

test("visible task policy pauses hidden pages and waits for the 15 minute interval", () => {
  const now = 2_000_000;

  assert.equal(SCHEDULE_SYNC_INTERVAL_MS, 15 * 60_000);
  assert.equal(shouldRunVisibleTask({ visibilityState: "hidden", lastRunAt: 0, now, intervalMs: SCHEDULE_SYNC_INTERVAL_MS }), false);
  assert.equal(shouldRunVisibleTask({ visibilityState: "visible", lastRunAt: 0, now, intervalMs: SCHEDULE_SYNC_INTERVAL_MS }), true);
  assert.equal(shouldRunVisibleTask({ visibilityState: "visible", lastRunAt: now - SCHEDULE_SYNC_INTERVAL_MS + 1, now, intervalMs: SCHEDULE_SYNC_INTERVAL_MS }), false);
  assert.equal(shouldRunVisibleTask({ visibilityState: "visible", lastRunAt: now - SCHEDULE_SYNC_INTERVAL_MS, now, intervalMs: SCHEDULE_SYNC_INTERVAL_MS }), true);
});

test("finished live scores request persistence only while group fixture data is stale", () => {
  const liveScores = {
    "Alpha|Beta": {
      status: "finished",
      homeScore: 1,
      awayScore: 1,
      winnerSide: "home",
      homeShootoutScore: 5,
      awayShootoutScore: 4,
    },
  };
  const staleGroup = {
    gameweeks: [{ gw: 1, fixtures: [{ home: "Alpha", away: "Beta", status: "SCHEDULED", result: null }] }],
  };
  const currentGroup = {
    gameweeks: [{ gw: 1, fixtures: [{
      home: "Alpha",
      away: "Beta",
      status: "FINISHED",
      result: "1-1",
      winnerSide: "home",
      homeShootoutScore: 5,
      awayShootoutScore: 4,
    }] }],
  };

  assert.equal(hasUnpersistedFinishedLiveScores(staleGroup, liveScores), true);
  assert.equal(hasUnpersistedFinishedLiveScores(currentGroup, liveScores), false);
  assert.equal(hasUnpersistedFinishedLiveScores(currentGroup, {}), false);
});
