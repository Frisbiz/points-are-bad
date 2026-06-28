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

test("World Cup bracket columns fit desktop while reserving more room for kickoff times", () => {
  const bracketBlock = appSource.slice(
    appSource.indexOf("function WCKnockoutStage"),
    appSource.indexOf("function LeagueTab")
  );
  const colMatch = bracketBlock.match(/const COL_W\s+= mob \? (\d+) : (\d+);/);
  const connMatch = bracketBlock.match(/const CONN_W\s+= mob \? (\d+) : (\d+);/);
  const dateMatch = bracketBlock.match(/const dateW = mob \? (\d+) : (\d+);/);

  assert.ok(colMatch);
  assert.ok(connMatch);
  assert.ok(dateMatch);

  const desktopColW = Number(colMatch[2]);
  const desktopConnW = Number(connMatch[2]);
  const desktopDateW = Number(dateMatch[2]);
  const totalDesktopBracketW = (desktopColW * 5) + (desktopConnW * 4);

  assert.equal(desktopColW, 196);
  assert.equal(desktopConnW, 16);
  assert.equal(desktopDateW, 68);
  assert.ok(totalDesktopBracketW <= 1050);
});

test("All picks table keeps the fixture/result/name header sticky while scrolling", () => {
  const tableBlock = appSource.slice(
    appSource.indexOf("function AllPicksTable"),
    appSource.indexOf("function TrendsTab")
  );

  assert.match(tableBlock, /const picksHeaderStickyTop = theme==="index" \? 64 : 60;/);
  assert.match(tableBlock, /<thead style=\{\{position:"sticky",top:picksHeaderStickyTop,zIndex:20\}\}>/);
  assert.match(tableBlock, /background:theme==="excel"\?"#1a1a1a":"var\(--bg\)"/);
});
