import test from "node:test";
import assert from "node:assert/strict";

const selector = await import("../src/gameweekSelector.js").catch(() => ({}));

function makeStrip({ viewportWidth, selectedGW, itemLeft, itemWidth }) {
  let width = viewportWidth;
  const strip = {
    scrollLeft: 0,
    get clientWidth() { return width; },
    set clientWidth(value) { width = value; },
    getBoundingClientRect: () => ({ left: 100, width }),
    querySelector: query => query === `[data-gameweek="${selectedGW}"]` ? selected : null,
  };
  const selected = {
    getBoundingClientRect: () => ({
      left: 100 + itemLeft - strip.scrollLeft,
      width: itemWidth,
    }),
  };
  return strip;
}

test("the selected historical round is centered using its rendered position and width", () => {
  assert.equal(typeof selector.syncSelectedGameweek, "function");
  const strip = makeStrip({ viewportWidth: 396, selectedGW: 1, itemLeft: 0, itemWidth: 64 });

  assert.equal(selector.syncSelectedGameweek(strip, 1), true);
  assert.equal(strip.scrollLeft, 0);
});

test("long gameweek labels use measured geometry instead of an assumed button width", () => {
  const strip = makeStrip({ viewportWidth: 220, selectedGW: 8, itemLeft: 420, itemWidth: 112 });

  selector.syncSelectedGameweek(strip, 8);

  assert.equal(strip.scrollLeft, 366);
});

test("the selected round recenters when the strip resizes", () => {
  assert.equal(typeof selector.observeSelectedGameweek, "function");
  let resizeCallback;
  let disconnected = false;
  class FakeResizeObserver {
    constructor(callback) { resizeCallback = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const strip = makeStrip({ viewportWidth: 396, selectedGW: 6, itemLeft: 335, itemWidth: 64 });

  const cleanup = selector.observeSelectedGameweek(strip, 6, FakeResizeObserver);
  assert.equal(strip.scrollLeft, 169);
  strip.clientWidth = 180;
  resizeCallback();
  assert.equal(strip.scrollLeft, 277);
  cleanup();
  assert.equal(disconnected, true);
});

test("overlapping gameweeks are each marked active from their own fixtures", () => {
  assert.equal(typeof selector.gameweekStatus, "function");
  const now = Date.parse("2026-09-18T20:00:00.000Z");
  const gameweekSix = {
    gw: 6,
    fixtures: [
      { id: "finished", result: "2-0", status: "FINISHED", date: "2026-09-17T19:30:00.000Z" },
      { id: "rescheduled", result: null, status: "TIMED", date: "2026-10-21T18:00:00.000Z" },
    ],
  };
  const gameweekSeven = {
    gw: 7,
    fixtures: [
      { id: "live", result: null, status: "IN_PLAY", date: "2026-09-18T19:00:00.000Z" },
      { id: "future", result: null, status: "TIMED", date: "2026-09-19T12:00:00.000Z" },
    ],
  };
  const gameweekEight = {
    gw: 8,
    fixtures: [
      { id: "future", result: null, status: "TIMED", date: "2026-09-25T19:00:00.000Z" },
    ],
  };

  assert.equal(selector.gameweekStatus(gameweekSix, [], false, now), "active");
  assert.equal(selector.gameweekStatus(gameweekSeven, [], false, now), "active");
  assert.equal(selector.gameweekStatus(gameweekEight, [], false, now), "future");
});

test("a started scheduled fixture marks its gameweek active while a locked round stays locked", () => {
  const gameweek = {
    gw: 7,
    fixtures: [{
      id: "started",
      result: null,
      status: "SCHEDULED",
      date: "2026-09-18T19:00:00.000Z",
    }],
  };

  assert.equal(selector.gameweekStatus(gameweek, [], false, Date.parse("2026-09-18T20:00:00.000Z")), "active");
  assert.equal(selector.gameweekStatus(gameweek, [7], false, Date.parse("2026-09-18T20:00:00.000Z")), "locked");
});
