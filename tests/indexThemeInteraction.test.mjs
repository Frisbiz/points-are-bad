import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const polishSource = readFileSync(new URL("../src/app-polish.css", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Index theme keeps its neutral gray palette instead of the later olive override", () => {
  const indexVariables = polishSource.match(/html\[data-theme="index"\]\{([^}]*)\}/)?.[1] || "";

  assert.match(indexVariables, /--bg:#f6f6f7/);
  assert.match(indexVariables, /--card:#f0f0f2/);
  assert.match(indexVariables, /--btn-bg:#15181c/);
  assert.doesNotMatch(indexVariables, /#(?:eef0e9|edf3e3|e9ede1|263023)/i);
  assert.doesNotMatch(polishSource, /group-dashboard-summary\{[^}]*#e4edcf/i);
});

test("group navigation paints the selected tab before deferring expensive tab content", () => {
  const start = appSource.indexOf("function GameUI");
  const end = appSource.indexOf("/* World Cup standings */", start);
  const gameUi = appSource.slice(start, end);

  assert.match(gameUi, /const \[selectedTab,setSelectedTab\]=useState\(tab\)/);
  assert.match(gameUi, /const \[isTabPending,startTabTransition\]=useTransition\(\)/);
  assert.match(gameUi, /setSelectedTab\(nextTab\)/);
  assert.match(gameUi, /requestAnimationFrame[\s\S]*startTabTransition\(\(\)=>setTab\(nextTab\)\)/);
  assert.match(gameUi, /tab===t/);
  assert.match(gameUi, /selectedTab===t/);
  assert.match(gameUi, /aria-busy=\{isTabPending\|\|selectedTab!==tab\}/);
});

test("session bootstrap preserves the saved theme instead of flashing Index", () => {
  assert.match(appSource, /const effectiveTheme = !boot \? theme : user \? theme : "index"/);
});

test("the static document paints a dark root canvas before React loads", () => {
  assert.match(htmlSource, /html, body \{ margin: 0; background: #080810;/);
  assert.match(htmlSource, /document\.documentElement\.style\.background = c\.bg/);
  assert.doesNotMatch(htmlSource, /document\.body\.style\.background = c\.bg/);
});
