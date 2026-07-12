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

test("live endpoint shares successful supported responses through the Vercel CDN", () => {
  assert.match(
    liveEndpointSource,
    /import \{ setLiveSuccessCacheHeaders \} from "\.\/_livePolicy\.js";/
  );
  assert.doesNotMatch(liveEndpointSource, /Cache-Control", "no-store/);
  assert.match(
    liveEndpointSource,
    /if \(!comp\) return res\.status\(400\)\.json\(\{ error: "unsupported competition" \}\);/
  );
  assert.match(
    liveEndpointSource,
    /await saveFinishedLiveMatchesToCache\([\s\S]*?setLiveSuccessCacheHeaders\(res\);\s*return res\.status\(200\)\.json\(\{ matches,/
  );
  assert.match(
    liveEndpointSource,
    /const fixtures = [\s\S]*?setLiveSuccessCacheHeaders\(res\);\s*return res\.status\(200\)\.json\(\{ matches: liveMatchesFromFixtures\(fixtures\),/
  );
});
