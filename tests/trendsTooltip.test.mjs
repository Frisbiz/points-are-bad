import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const trendsBlock = appSource.slice(
  appSource.indexOf("function TrendsTab"),
  appSource.indexOf("function MembersTab")
);
const gwSpreadBlock = trendsBlock.slice(
  trendsBlock.indexOf('<CC title="GW Spread"'),
  trendsBlock.indexOf("{/*", trendsBlock.indexOf('<CC title="GW Spread"'))
);

test("GW Spread tooltip uses explicit high-contrast text styles", () => {
  assert.match(trendsBlock, /const chartTooltipProps=/);
  assert.match(trendsBlock, /labelStyle:\{color:"var\(--text-bright\)"/);
  assert.match(trendsBlock, /itemStyle:\{color:"var\(--text\)"/);
  assert.match(gwSpreadBlock, /<Tooltip \{\.\.\.chartTooltipProps\}\/>/);
});
