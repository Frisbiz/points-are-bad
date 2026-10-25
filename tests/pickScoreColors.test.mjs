import test from "node:test";
import assert from "node:assert/strict";

const { pickScoreColors } = await import("../src/pickScoreColors.js").catch(() => ({}));

test("Jigga's signed-in view uses green, neutral, yellow, yellow, red for individual scores", () => {
  assert.equal(typeof pickScoreColors, "function");
  const colors = [0, 1, 2, 3, 4, 8].map(score => pickScoreColors(score, { viewerUsername: "jigga" }).color);
  assert.deepEqual(colors, ["#22c55e", "var(--text-bright)", "var(--pick-score-yellow)", "var(--pick-score-yellow)", "#ef4444", "#ef4444"]);
});

test("every other viewer keeps the original thresholds including red at three", () => {
  assert.equal(typeof pickScoreColors, "function");
  for (const viewerUsername of ["faris", "damon", "vall", "aamer", "", "jiggademo"]) {
    assert.deepEqual([0, 1, 2, 3, 4].map(score => pickScoreColors(score, { viewerUsername }).color),
      ["#22c55e", "#f59e0b", "#f59e0b", "#ef4444", "#ef4444"]);
  }
});

test("neutral and yellow badges have valid theme-aware backgrounds and borders", () => {
  assert.equal(typeof pickScoreColors, "function");
  const neutral = pickScoreColors(1, { viewerUsername: " Jigga " });
  assert.equal(neutral.color, "var(--text-bright)");
  assert.equal(neutral.background, "color-mix(in srgb, var(--text-bright) 12%, transparent)");
  assert.equal(neutral.borderColor, "color-mix(in srgb, var(--text-bright) 25%, transparent)");
  const yellow = pickScoreColors(3, { viewerUsername: "jigga" });
  assert.equal(yellow.background, "color-mix(in srgb, var(--pick-score-yellow) 12%, transparent)");
});

test("Excel applies the personal scheme only for Jigga and preserves everyone else's existing palette", () => {
  assert.equal(typeof pickScoreColors, "function");
  assert.equal(pickScoreColors(3, { viewerUsername: "jigga", theme: "excel" }).color, "var(--pick-score-yellow)");
  assert.equal(pickScoreColors(4, { viewerUsername: "jigga", theme: "excel" }).color, "#ef4444");
  assert.equal(pickScoreColors(3, { viewerUsername: "faris", theme: "excel" }).color, "#666");
  assert.equal(pickScoreColors(4, { viewerUsername: "faris", theme: "excel" }).color, "#ca8a04");
  assert.equal(pickScoreColors(5, { viewerUsername: "faris", theme: "excel" }).background, "#fee2e2");
});

test("missing results and missed picks keep their distinct neutral treatment", () => {
  assert.equal(typeof pickScoreColors, "function");
  assert.equal(pickScoreColors(null, { viewerUsername: "jigga" }).color, "var(--text-dim2)");
  assert.equal(pickScoreColors(4, { viewerUsername: "jigga", missed: true }).color, "#6b7280");
});
