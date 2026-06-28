import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("TeamBadge images are decorative so visible team names are not duplicated in copied text", () => {
  const teamBadgeBlock = appSource.slice(
    appSource.indexOf("function TeamBadge"),
    appSource.indexOf("const PL_CLUBS")
  );

  assert.match(teamBadgeBlock, /alt=""/);
  assert.match(teamBadgeBlock, /aria-hidden="true"/);
  assert.doesNotMatch(teamBadgeBlock, /alt=\{team\}/);
});

test("World Cup bracket columns are wide enough for team names and kickoff times", () => {
  const bracketBlock = appSource.slice(
    appSource.indexOf("function WCKnockoutStage"),
    appSource.indexOf("function LeagueTab")
  );

  assert.match(bracketBlock, /const COL_W\s+= mob \? 170 : 224;/);
});
