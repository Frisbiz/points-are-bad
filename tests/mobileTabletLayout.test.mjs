import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const polishSource = readFileSync(new URL("../src/app-polish.css", import.meta.url), "utf8");

test("group navigation continuously moves from the header to the bottom on compact screens", () => {
  const gameUiStart = appSource.indexOf("function GameUI");
  const gameUiEnd = appSource.indexOf("/* World Cup standings */", gameUiStart);
  const gameUi = appSource.slice(gameUiStart, gameUiEnd);

  assert.equal((gameUi.match(/<nav className="group-tab-nav"/g) || []).length, 1);
  assert.doesNotMatch(gameUi, /<nav className="bot-nav"/);
  assert.match(appSource, /\.group-tab-nav \.nb\{[^}]*min-width:0/);
  assert.match(appSource, /data-compact="true"\] \.group-tab-nav\{[^}]*position:fixed!important[^}]*display:flex!important/);
  assert.match(appSource, /@media\(max-width:900px\)\{[^}]*\.group-tab-nav\{position:fixed!important/);
  assert.match(appSource, /\.group-tab-nav \.group-tab-label\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
});

test("changing a group tab returns the new view to the top", () => {
  assert.match(
    appSource,
    /const handleSetTab = useCallback\(\(t\)=>\{[\s\S]*?window\.scrollTo\(\{top:0,left:0,behavior:"auto"\}\);[\s\S]*?\},\[\]\);/,
  );
});

test("small screens use compact modal gutters and panel padding", () => {
  assert.match(polishSource, /@media\(max-width:480px\)\{[^}]*\.modal-overlay\{padding:12px!important/);
  assert.match(polishSource, /\.profile-dialog\{padding:22px 18px!important/);
});

test("mobile dashboard metadata stays with the heading instead of floating right", () => {
  assert.match(appSource, /className="group-dashboard-count"/);
  assert.match(appSource, /className="group-dashboard-actions"/);
  assert.match(polishSource, /\.group-dashboard-count\{justify-self:start;text-align:left!important/);
  assert.match(polishSource, /data-dashboard-stack="true"\] \.group-dashboard-actions\{grid-template-columns:1fr!important/);
});

test("key mobile chrome controls expose full-size touch targets", () => {
  assert.match(appSource, /className="app-brand-button"/);
  assert.match(appSource, /className="group-recap-close"/);
  assert.match(polishSource, /\.app-brand-button[^}]*min-height:44px/);
  assert.match(polishSource, /\.app-header-action[^}]*min-width:44px/);
  assert.match(polishSource, /\.group-recap-close[^}]*min-width:44px[^}]*min-height:44px/);
});

test("phone layouts give every button a 44px touch height", () => {
  assert.match(polishSource, /\.pab-app-shell\[data-phone="true"\] button\{min-height:44px!important/);
});

test("phone fixtures use a compact matchday header so picks appear sooner", () => {
  assert.match(appSource, /className="fade pad-bot group-main"/);
  assert.match(appSource, /className=\{`fixture-round-picker\$\{isIndex\?" liquid-card":""\}`\}/);
  assert.match(polishSource, /data-phone="true"\] \.group-main\{padding-top:14px!important/);
  assert.match(polishSource, /data-phone="true"\] \.group-context-bar\{[^}]*padding:0 0 12px[^}]*margin-bottom:14px/);
  assert.match(polishSource, /data-phone="true"\] \.fixture-round-picker\{[^}]*padding:16px 0 14px!important[^}]*margin-bottom:14px!important/);
  assert.match(polishSource, /data-phone="true"\] \.fixture-round-picker\.liquid-card\{[^}]*background:transparent!important[^}]*border:0!important/);
});
