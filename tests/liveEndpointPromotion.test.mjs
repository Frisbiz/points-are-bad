import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const liveEndpointSource = readFileSync(new URL("../api/live.js", import.meta.url), "utf8");

test("live endpoint saves finished Yahoo matches into the fixture cache", () => {
  assert.match(
    liveEndpointSource,
    /import \{[^}]*saveFinishedLiveMatchesToCache[^}]*\} from "\.\/_yahooFixtures\.js"/s
  );
  assert.match(
    liveEndpointSource,
    /const matches = await fetchYahooLiveMatches\(comp, Number\(week\), dateList\);[\s\S]*await saveFinishedLiveMatchesToCache\(\{ competition: comp, season: seas, targetGW: Number\(week\), matches \}\);/
  );
});
