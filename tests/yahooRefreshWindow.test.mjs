import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const yahooSource = readFileSync(new URL("../api/_yahooFixtures.js", import.meta.url), "utf8");

test("Yahoo fixture cache keeps missing results in a 72 hour recovery window", () => {
  const recentWindowBlock = yahooSource.slice(
    yahooSource.indexOf("function hasRecentOrTodayWindow"),
    yahooSource.indexOf("function getTargetFixtures")
  );
  const refreshDatesBlock = yahooSource.slice(
    yahooSource.indexOf("function refreshDatesForFixtures"),
    yahooSource.indexOf("function refreshIntervalMs")
  );

  assert.match(recentWindowBlock, /kickoff >= now - 72 \* 60 \* 60_000/);
  assert.match(refreshDatesBlock, /kickoff >= now - 72 \* 60 \* 60_000/);
});
