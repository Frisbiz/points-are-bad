import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupDashboardState,
  formatDashboardCountdown,
  getDashboardCountdownUrgency,
  getDashboardFixtureTiming,
  sortGroupDashboardItems,
} from "../src/groupDashboard.js";
import * as groupDashboard from "../src/groupDashboard.js";

const NOW = new Date("2026-09-10T16:00:00.000Z");

function groupWithFixtures(fixtures, predictions = {}) {
  return {
    id: "friends",
    name: "The Boys",
    competition: "PL",
    season: 2026,
    currentGW: 4,
    members: ["anthony", "faris"],
    predictions: { anthony: predictions },
    gameweeks: [{ gw: 4, season: 2026, fixtures }],
  };
}

test("dashboard only counts unfinished picks inside the three-day attention window", () => {
  const group = groupWithFixtures([
    { id: "soon", home: "Arsenal", away: "Chelsea", date: "2026-09-12T16:00:00.000Z", status: "SCHEDULED" },
    { id: "later", home: "Liverpool", away: "Everton", date: "2026-09-15T16:00:00.000Z", status: "SCHEDULED" },
  ]);

  const state = buildGroupDashboardState(group, "anthony", NOW);

  assert.equal(state.mode, "picks-due");
  assert.equal(state.dueSoonCount, 1);
  assert.equal(state.missingPickCount, 2);
  assert.equal(state.pickedCount, 0);
  assert.equal(state.totalPickCount, 2);
  assert.equal(state.roundNumber, 4);
  assert.equal(state.nextFixture.id, "soon");
  assert.equal(state.deadlineMs, new Date("2026-09-12T16:00:00.000Z").getTime());
});

test("dashboard shows a live fixture once the user's round picks are complete", () => {
  const group = groupWithFixtures([
    { id: "live", home: "Arsenal", away: "Chelsea", date: "2026-09-10T15:00:00.000Z", status: "IN_PLAY" },
    { id: "next", home: "Liverpool", away: "Everton", date: "2026-09-11T16:00:00.000Z", status: "SCHEDULED" },
  ], { live: "2-1", next: "1-0" });

  const state = buildGroupDashboardState(group, "anthony", NOW);

  assert.equal(state.mode, "live");
  assert.equal(state.nextFixture.id, "live");
  assert.equal(state.pickedCount, 2);
  assert.equal(state.totalPickCount, 2);
  assert.equal(state.missingPickCount, 0);
});

test("dashboard reports all picks made when the next match has not started", () => {
  const group = groupWithFixtures([
    { id: "next", home: "Liverpool", away: "Everton", date: "2026-09-12T16:00:00.000Z", status: "SCHEDULED" },
  ], { next: "1-0" });

  const state = buildGroupDashboardState(group, "anthony", NOW);

  assert.equal(state.mode, "ready");
  assert.equal(state.dueSoonCount, 0);
  assert.equal(state.missingPickCount, 0);
});

test("dashboard waits instead of claiming picks are due when another Dibs player has the turn", () => {
  const group = {
    ...groupWithFixtures([
      { id: "next", home: "Liverpool", away: "Everton", date: "2026-09-12T16:00:00.000Z", status: "SCHEDULED" },
    ]),
    mode: "dibs",
    memberOrder: ["faris", "anthony"],
  };

  const state = buildGroupDashboardState(group, "anthony", NOW);

  assert.equal(state.mode, "waiting-turn");
  assert.equal(state.dueSoonCount, 0);
  assert.equal(state.missingPickCount, 0);
});

test("dashboard does not call locked round picks actionable", () => {
  const group = {
    ...groupWithFixtures([
      { id: "next", home: "Liverpool", away: "Everton", date: "2026-09-12T16:00:00.000Z", status: "SCHEDULED" },
    ]),
    picksLocked: { anthony: { 2026: { 4: true } } },
  };

  const state = buildGroupDashboardState(group, "anthony", NOW);

  assert.equal(state.mode, "ready");
  assert.equal(state.dueSoonCount, 0);
  assert.equal(state.missingPickCount, 0);
});

test("dashboard sorts due picks before live and ready groups", () => {
  const sorted = sortGroupDashboardItems([
    { group: { id: "ready" }, mode: "ready", sortTime: 30 },
    { group: { id: "live" }, mode: "live", sortTime: 20 },
    { group: { id: "due-later" }, mode: "picks-due", sortTime: 15 },
    { group: { id: "due-first" }, mode: "picks-due", sortTime: 10 },
  ]);

  assert.deepEqual(sorted.map(item => item.group.id), ["due-first", "due-later", "live", "ready"]);
});

test("dashboard countdown keeps useful day and hour precision", () => {
  assert.equal(formatDashboardCountdown(2 * 86400000 + 6 * 3600000), "2d 6h");
  assert.equal(formatDashboardCountdown(45 * 60000), "45m");
  assert.equal(formatDashboardCountdown(-1000), "now");
});

test("dashboard fixture timing leads with the pick deadline countdown", () => {
  assert.deepEqual(getDashboardFixtureTiming({
    mode: "picks-due",
    deadlineMs: NOW.getTime() + 14 * 3600000 + 24 * 60000,
    nextKickoffMs: NOW.getTime() + 15 * 3600000,
  }, NOW), {
    label: "Picks due",
    countdown: "in 14h 24m",
  });
});

test("dashboard fixture timing uses kickoff for completed picks", () => {
  assert.deepEqual(getDashboardFixtureTiming({
    mode: "ready",
    deadlineMs: NOW.getTime() + 8 * 3600000,
    nextKickoffMs: NOW.getTime() + 2 * 86400000 + 6 * 3600000,
  }, NOW), {
    label: "Kickoff",
    countdown: "in 2d 6h",
  });
});

test("dashboard countdown urgency escalates at one hour, one day, and four days", () => {
  assert.equal(getDashboardCountdownUrgency(30 * 60000), "critical");
  assert.equal(getDashboardCountdownUrgency(60 * 60000), "urgent");
  assert.equal(getDashboardCountdownUrgency(24 * 3600000), "urgent");
  assert.equal(getDashboardCountdownUrgency(24 * 3600000 + 1), "soon");
  assert.equal(getDashboardCountdownUrgency(4 * 86400000), "soon");
  assert.equal(getDashboardCountdownUrgency(4 * 86400000 + 1), "calm");
});

test("live dashboard cards open the group instead of offering a separate follow action", () => {
  assert.deepEqual(groupDashboard.getGroupDashboardAction?.("live", 0), {
    label: "Open group",
    tab: "Fixtures",
  });
});
