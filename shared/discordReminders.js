import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { canAdminGroup } from "./groupAccess.js";
import { fixtureBelongsToSeason, isPastGroup } from "./groupLifecycle.js";

const CLOSED_STATUSES = new Set(["FINISHED", "IN_PLAY", "PAUSED", "POSTPONED", "CANCELLED"]);

export function verifyDiscordLinkToken(token, secret, nowMs = Date.now()) {
  if (!token || !secret) return null;
  const [body, suppliedSignature, extra] = String(token).split(".");
  if (!body || !suppliedSignature || extra) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!/^\d+$/.test(String(payload.discordUserId || ""))) return null;
    if (!payload.nonce || typeof payload.nonce !== "string") return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildDiscordReminderJobs({ links = [], usersByUsername = {}, groupsById = {}, nowMs = Date.now(), appUrl = "https://pab.wtf" }) {
  const jobs = [];
  for (const link of links) {
    if (!link?.remindersEnabled || !link.discordUserId || !link.username) continue;
    const user = usersByUsername[link.username];
    for (const groupId of user?.groupIds || []) {
      const group = groupsById[groupId];
      if (!group || isPastGroup(group, new Date(nowMs)) || !(group.members || []).includes(link.username)) continue;
      const candidate = nextIncompleteRound(group, link.username, nowMs);
      if (!candidate) continue;
      const remainingMs = candidate.deadlineMs - nowMs;
      const window = reminderWindow(remainingMs);
      if (!window) continue;
      jobs.push({
        discordUserId: String(link.discordUserId),
        groupId: String(group.id || groupId),
        groupName: String(group.name || "PAB group"),
        roundLabel: roundLabel(group.competition, candidate.gw.gw),
        picked: candidate.picked,
        total: candidate.fixtures.length,
        deadline: new Date(candidate.deadlineMs).toISOString(),
        window,
        deliveryKey: `pab:${link.discordUserId}:${group.id || groupId}:${candidate.nextFixture.id}:${window}`,
        url: `${String(appUrl).replace(/\/$/, "")}/groups/${encodeURIComponent(group.id || groupId)}`,
      });
    }
  }
  return jobs.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
}

export function buildDiscordReminderStatus({ link, user, groupsById = {}, nowMs = Date.now() }) {
  if (!link?.username || !user) return { linked: false, incomplete: [] };
  const incomplete = [];
  for (const groupId of user.groupIds || []) {
    const group = groupsById[groupId];
    if (!group || isPastGroup(group, new Date(nowMs)) || !(group.members || []).includes(link.username)) continue;
    const candidate = nextIncompleteRound(group, link.username, nowMs);
    if (!candidate) continue;
    incomplete.push({
      groupId: String(group.id || groupId),
      groupName: String(group.name || "PAB group"),
      roundLabel: roundLabel(group.competition, candidate.gw.gw),
      picked: candidate.picked,
      total: candidate.fixtures.length,
      deadline: new Date(candidate.deadlineMs).toISOString(),
    });
  }
  incomplete.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  return {
    linked: true,
    username: link.username,
    remindersEnabled: link.remindersEnabled !== false,
    incomplete,
  };
}

function nextIncompleteRound(group, username, nowMs) {
  const predictions = group.predictions?.[username] || {};
  const hidden = new Set(group.hiddenFixtures || []);
  const candidates = [];
  for (const gw of group.gameweeks || []) {
    const season = gw.season || group.season || 2025;
    if (Number(season) !== Number(group.season || 2025)) continue;
    if (group.picksLocked?.[username]?.[season]?.[gw.gw]) continue;
    if ((group.hiddenGWs || []).includes(gw.gw) && !canAdminGroup(group, username)) continue;
    const fixtures = (gw.fixtures || []).filter(fixture => !hidden.has(fixture.id) && fixture?.id && fixtureBelongsToSeason(fixture, group.competition || "PL", season));
    const openMissing = fixtures
      .filter(fixture => !predictions[fixture.id] && isFuturePickableFixture(fixture, nowMs))
      .filter(fixture => group.mode !== "dibs" || dibsTurnForFixture(group, fixture.id) === username)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (!openMissing.length) continue;
    candidates.push({
      gw,
      fixtures,
      nextFixture: openMissing[0],
      deadlineMs: Date.parse(openMissing[0].date),
      picked: fixtures.filter(fixture => Boolean(predictions[fixture.id])).length,
    });
  }
  return candidates.sort((a, b) => a.deadlineMs - b.deadlineMs)[0] || null;
}

function dibsTurnForFixture(group, fixtureId) {
  const members = group.memberOrder || group.members || [];
  if (!members.length) return null;
  const ordered = (group.gameweeks || []).slice().sort((a, b) => ((a.season || group.season || 2025) - (b.season || group.season || 2025)) || a.gw - b.gw);
  let fixtureIndex = 0;
  let targetIndex = null;
  for (const gameweek of ordered) {
    for (const fixture of gameweek.fixtures || []) {
      if (fixture.id === fixtureId) targetIndex = fixtureIndex;
      fixtureIndex += 1;
    }
  }
  if (targetIndex === null) return null;
  const skipped = group.dibsSkips?.[fixtureId] || [];
  for (let offset = 0; offset < members.length; offset += 1) {
    const member = members[(targetIndex + offset) % members.length];
    if (skipped.includes(member)) continue;
    if (!/^\d+-\d+$/.test(group.predictions?.[member]?.[fixtureId] || "")) return member;
  }
  return null;
}

function isFuturePickableFixture(fixture, nowMs) {
  const kickoff = Date.parse(fixture.date);
  if (!Number.isFinite(kickoff) || kickoff <= nowMs || fixture.result) return false;
  return !CLOSED_STATUSES.has(String(fixture.status || "").toUpperCase());
}

function reminderWindow(remainingMs) {
  if (remainingMs <= 0 || remainingMs > 24 * 60 * 60 * 1000) return null;
  if (remainingMs <= 30 * 60 * 1000) return "30m";
  if (remainingMs <= 3 * 60 * 60 * 1000) return "3h";
  return "24h";
}

function roundLabel(competition, gw) {
  const value = Number(gw) || gw;
  if (String(competition || "").toUpperCase() === "WC") return `Round ${value}`;
  if (String(competition || "").toUpperCase() === "CL") return `Matchday ${value}`;
  return `GW${value}`;
}
