import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("live score polling uses the shared interval and pauses with page visibility", () => {
  assert.match(
    appSource,
    /import \{[^}]*LIVE_POLL_INTERVAL_MS[^}]*SCHEDULE_SYNC_INTERVAL_MS[^}]*hasUnpersistedFinishedLiveScores[^}]*shouldRunVisibleTask[^}]*\} from "\.\.\/api\/_livePolicy\.js";/s
  );
  assert.match(appSource, /document\.addEventListener\("visibilitychange", onLiveVisibilityChange\)/);
  assert.match(appSource, /schedulePoll\(LIVE_POLL_INTERVAL_MS\)/);
  assert.doesNotMatch(appSource, /setTimeout\(poll, 5000\)/);
});

test("fixture schedule synchronization runs every 15 minutes instead of every 20 seconds", () => {
  assert.match(appSource, /shouldRunVisibleTask\(\{[\s\S]*intervalMs: SCHEDULE_SYNC_INTERVAL_MS[\s\S]*\}\)/);
  assert.match(appSource, /setInterval\(runScheduleSync, SCHEDULE_SYNC_INTERVAL_MS\)/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange", onScheduleVisibilityChange\)/);
  assert.doesNotMatch(appSource, /setInterval\(hydrate, 20000\)/);
});

test("newly finished scores trigger authoritative group finalization", () => {
  assert.match(appSource, /hasUnpersistedFinishedLiveScores\(group, standingsLiveScores\)/);
  assert.match(
    appSource,
    /callAPI\("group-user", \{ groupId: group\.id, payload: \{ type: "sync-finished-live-scores" \} \}\)/
  );
  assert.match(appSource, /finalizingLiveScoresRef\.current/);
});
