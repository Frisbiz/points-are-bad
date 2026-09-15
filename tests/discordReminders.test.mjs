import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildDiscordReminderJobs, buildDiscordReminderStatus, verifyDiscordLinkToken } from "../shared/discordReminders.js";

function signedToken(payload, secret = "shared-secret") {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

const now = Date.parse("2026-09-14T12:00:00Z");

function group(overrides = {}) {
  return {
    id: "friends",
    name: "Friends League",
    competition: "PL",
    season: 2026,
    members: ["faris"],
    gameweeks: [{
      gw: 5,
      season: 2026,
      fixtures: [
        { id: "picked", home: "Arsenal", away: "Chelsea", date: "2026-09-15T10:00:00Z", status: "SCHEDULED" },
        { id: "due", home: "Everton", away: "Leeds", date: "2026-09-15T11:00:00Z", status: "SCHEDULED" },
      ],
    }],
    predictions: { faris: { picked: "2-1" } },
    ...overrides,
  };
}

test("builds a privacy-safe reminder for the next unpicked kickoff", () => {
  const jobs = buildDiscordReminderJobs({
    links: [{ discordUserId: "123", username: "faris", remindersEnabled: true }],
    usersByUsername: { faris: { username: "faris", groupIds: ["friends"] } },
    groupsById: { friends: group() },
    nowMs: now,
    appUrl: "https://pab.wtf",
  });

  assert.deepEqual(jobs, [{
    discordUserId: "123",
    groupId: "friends",
    groupName: "Friends League",
    roundLabel: "GW5",
    picked: 1,
    total: 2,
    deadline: "2026-09-15T11:00:00.000Z",
    window: "24h",
    deliveryKey: "pab:123:friends:due:24h",
    url: "https://pab.wtf/groups/friends",
  }]);
  assert.equal(JSON.stringify(jobs).includes("2-1"), false);
});

test("uses progressively urgent windows and sends nothing outside 24 hours", () => {
  const makeJobs = deadline => buildDiscordReminderJobs({
    links: [{ discordUserId: "123", username: "faris", remindersEnabled: true }],
    usersByUsername: { faris: { username: "faris", groupIds: ["friends"] } },
    groupsById: { friends: group({ gameweeks: [{ gw: 5, season: 2026, fixtures: [{ id: "due", home: "A", away: "B", date: deadline, status: "SCHEDULED" }] }], predictions: { faris: {} } }) },
    nowMs: now,
    appUrl: "https://pab.wtf",
  });

  assert.equal(makeJobs("2026-09-15T13:00:00Z").length, 0);
  assert.equal(makeJobs("2026-09-15T11:00:00Z")[0].window, "24h");
  assert.equal(makeJobs("2026-09-14T14:00:00Z")[0].window, "3h");
  assert.equal(makeJobs("2026-09-14T12:20:00Z")[0].window, "30m");
});

test("skips disabled links, completed rounds, and already-started fixtures", () => {
  const args = {
    usersByUsername: { faris: { username: "faris", groupIds: ["friends"] } },
    groupsById: { friends: group() },
    nowMs: now,
    appUrl: "https://pab.wtf",
  };
  assert.deepEqual(buildDiscordReminderJobs({ ...args, links: [{ discordUserId: "123", username: "faris", remindersEnabled: false }] }), []);
  assert.deepEqual(buildDiscordReminderJobs({ ...args, links: [{ discordUserId: "123", username: "faris", remindersEnabled: true }], groupsById: { friends: group({ predictions: { faris: { picked: "2-1", due: "1-0" } } }) } }), []);
});

test("validates signed, unexpired Discord link tokens", () => {
  const token = signedToken({ discordUserId: "123", nonce: "abc", exp: now + 60_000 });
  assert.deepEqual(verifyDiscordLinkToken(token, "shared-secret", now), { discordUserId: "123", nonce: "abc", exp: now + 60_000 });
  assert.equal(verifyDiscordLinkToken(token, "wrong-secret", now), null);
  assert.equal(verifyDiscordLinkToken(signedToken({ discordUserId: "123", nonce: "abc", exp: now - 1 }), "shared-secret", now), null);
});

test("status reports incomplete groups even before their reminder window", () => {
  const status = buildDiscordReminderStatus({
    link: { discordUserId: "123", username: "faris", remindersEnabled: true },
    user: { username: "faris", groupIds: ["friends"] },
    groupsById: { friends: group({ gameweeks: [{ gw: 5, season: 2026, fixtures: [{ id: "due", home: "A", away: "B", date: "2026-09-20T12:00:00Z", status: "SCHEDULED" }] }], predictions: { faris: {} } }) },
    nowMs: now,
  });
  assert.deepEqual(status, {
    linked: true,
    username: "faris",
    remindersEnabled: true,
    incomplete: [{ groupId: "friends", groupName: "Friends League", roundLabel: "GW5", picked: 0, total: 1, deadline: "2026-09-20T12:00:00.000Z" }],
  });
});

test("does not remind a Dibs player before their turn or a locked player", () => {
  const base = group({
    mode: "dibs",
    memberOrder: ["alex", "faris"],
    members: ["alex", "faris"],
    gameweeks: [{ gw: 5, season: 2026, fixtures: [{ id: "due", home: "A", away: "B", date: "2026-09-14T14:00:00Z", status: "SCHEDULED" }] }],
    predictions: { alex: {}, faris: {} },
  });
  const args = {
    links: [{ discordUserId: "123", username: "faris", remindersEnabled: true }],
    usersByUsername: { faris: { username: "faris", groupIds: ["friends"] } },
    nowMs: now,
    appUrl: "https://pab.wtf",
  };
  assert.deepEqual(buildDiscordReminderJobs({ ...args, groupsById: { friends: base } }), []);
  assert.deepEqual(buildDiscordReminderJobs({ ...args, groupsById: { friends: { ...base, mode: "open", picksLocked: { faris: { 2026: { 5: true } } } } } }), []);
});

test("ignores completed seasons and contaminated future fixtures", () => {
  const jobs = buildDiscordReminderJobs({
    links: [{ discordUserId: "123", username: "faris", remindersEnabled: true }],
    usersByUsername: { faris: { username: "faris", groupIds: ["old"] } },
    groupsById: { old: group({ id: "old", season: 2025, status: "completed", gameweeks: [{ gw: 1, season: 2025, fixtures: [{ id: "foreign", home: "A", away: "B", date: "2026-09-14T14:00:00Z", status: "SCHEDULED" }] }], predictions: { faris: {} } }) },
    nowMs: now,
    appUrl: "https://pab.wtf",
  });
  assert.deepEqual(jobs, []);
});
