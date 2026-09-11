import test from "node:test";
import assert from "node:assert/strict";

import { VIEWPORT_WATCH_INTERVAL_MS, viewportLayoutState, visibleViewportWidth } from "../src/responsiveLayout.js";

test("responsive layout uses the narrower visible viewport when an embedded browser clips the layout viewport", () => {
  assert.equal(visibleViewportWidth({ innerWidth: 2560, visualViewportWidth: 1245 }), 1245);
});

test("responsive layout uses the visible browser window when the embedded viewport stays stale", () => {
  assert.equal(visibleViewportWidth({ innerWidth: 2560, visualViewportWidth: 2560, outerWidth: 1245 }), 1245);
});

test("responsive layout falls back to the normal viewport width", () => {
  assert.equal(visibleViewportWidth({ innerWidth: 900, visualViewportWidth: null }), 900);
  assert.equal(visibleViewportWidth({ innerWidth: 900, visualViewportWidth: 1200 }), 900);
});

test("embedded browser width is watched frequently enough to reflow without a refresh", () => {
  assert.ok(VIEWPORT_WATCH_INTERVAL_MS > 0);
  assert.ok(VIEWPORT_WATCH_INTERVAL_MS <= 250);
});

test("visible viewport state is shared with overlays and loading screens", () => {
  assert.deepEqual(viewportLayoutState(600), {
    width: 600,
    widthCss: "600px",
    compact: "true",
    dashboardStack: "true",
    phone: "true",
    smallPhone: "false",
  });
});

test("tablet portrait uses compact navigation while tablet landscape keeps desktop navigation", () => {
  assert.equal(viewportLayoutState(834).compact, "true");
  assert.equal(viewportLayoutState(834).dashboardStack, "true");
  assert.equal(viewportLayoutState(1024).compact, "false");
  assert.equal(viewportLayoutState(1024).dashboardStack, "false");
});
