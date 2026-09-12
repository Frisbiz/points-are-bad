import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const access = await import("../shared/groupAccess.js").catch(() => ({}));
const securitySource = readFileSync(new URL("../api/security.js", import.meta.url), "utf8");
const reminderSource = readFileSync(new URL("../api/send-picks-reminder.js", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("../api/db.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

function makeGroup(overrides = {}) {
  return {
    id: "friends",
    creatorUsername: "alex",
    members: ["alex", "faris", "sam"],
    admins: ["alex"],
    competition: "PL",
    season: 2026,
    currentGW: 1,
    mode: "open",
    hiddenFixtures: [],
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [
        { id: "one", home: "Arsenal", away: "Chelsea", date: "2026-09-12T15:00:00Z", status: "SCHEDULED" },
        { id: "two", home: "Leeds", away: "Everton", date: "2026-09-13T15:00:00Z", status: "SCHEDULED" },
      ],
    }],
    predictions: {
      alex: { one: "1-0", two: "2-0" },
      faris: { one: "2-1" },
      sam: {},
    },
    ...overrides,
  };
}

test("developer identity and group admin access are centralized", () => {
  assert.equal(typeof access.isDeveloper, "function");
  assert.equal(typeof access.canAdminGroup, "function");
  assert.equal(access.isDeveloper("FARIS"), true);
  assert.equal(access.isDeveloper("faris2"), false);
  assert.equal(access.canAdminGroup(makeGroup(), "faris"), true);
  assert.equal(access.canAdminGroup(makeGroup({ members: ["alex", "sam"] }), "faris"), false);
  assert.equal(access.canAdminGroup(makeGroup(), "sam"), false);
});

test("admin completion summaries expose counts without scorelines", () => {
  assert.equal(typeof access.sanitizeGroupForViewer, "function");
  const view = access.sanitizeGroupForViewer(makeGroup(), "faris", new Date("2026-09-10T12:00:00Z"));

  assert.deepEqual(view.pickCompletion["2026"]["1"], {
    alex: { picked: 2, total: 2, status: "done" },
    faris: { picked: 1, total: 2, status: "in-progress" },
    sam: { picked: 0, total: 2, status: "not-started" },
  });
  assert.deepEqual(view.predictions.faris, { one: "2-1" });
  assert.deepEqual(view.predictions.alex, {});
  assert.deepEqual(view.predictions.sam, {});
  assert.doesNotMatch(JSON.stringify(view.pickCompletion), /1-0|2-0|2-1/);
});

test("ordinary members do not receive the admin completion summary", () => {
  const view = access.sanitizeGroupForViewer(makeGroup(), "sam", new Date("2026-09-10T12:00:00Z"));
  assert.equal(view.pickCompletion, undefined);
  assert.deepEqual(view.predictions.sam, {});
  assert.deepEqual(view.predictions.alex, {});
  assert.deepEqual(view.picksLocked || {}, {});
});

test("round picks reveal after the viewer completes the round", () => {
  const group = makeGroup({
    predictions: {
      alex: { one: "1-0", two: "2-0" },
      faris: { one: "2-1", two: "1-1" },
      sam: { one: "0-0", two: "0-1" },
    },
  });
  const view = access.sanitizeGroupForViewer(group, "faris", new Date("2026-09-10T12:00:00Z"));
  assert.deepEqual(view.predictions.alex, group.predictions.alex);
  assert.deepEqual(view.predictions.sam, group.predictions.sam);
});

test("round picks reveal after every fixture has kicked off", () => {
  const group = makeGroup();
  const view = access.sanitizeGroupForViewer(group, "sam", new Date("2026-09-14T12:00:00Z"));
  assert.deepEqual(view.predictions.alex, group.predictions.alex);
  assert.deepEqual(view.predictions.faris, group.predictions.faris);
});

test("missing an already-started fixture does not keep later picks hidden", () => {
  const group = makeGroup({
    predictions: {
      alex: { one: "1-0", two: "2-0" },
      faris: { two: "1-1" },
      sam: { one: "0-0", two: "0-1" },
    },
  });
  const view = access.sanitizeGroupForViewer(group, "faris", new Date("2026-09-12T16:00:00Z"));
  assert.deepEqual(view.predictions.alex, group.predictions.alex);
  assert.deepEqual(view.predictions.sam, group.predictions.sam);
});

test("standings totals are identical for every viewer while hidden picks remain private", () => {
  const group = makeGroup({
    gameweeks: [{
      gw: 1,
      season: 2026,
      fixtures: [
        { id: "one", home: "Real Sociedad", away: "Celta Vigo", date: "2026-09-10T18:00:00Z", status: "FINISHED", result: "0-0" },
        { id: "two", home: "Arsenal", away: "Everton", date: "2026-09-13T15:00:00Z", status: "SCHEDULED" },
      ],
    }],
    predictions: {
      alex: { one: "2-1", two: "1-0" },
      faris: { one: "0-0" },
      sam: {},
    },
  });

  const farisView = access.sanitizeGroupForViewer(group, "faris", new Date("2026-09-11T05:00:00Z"));
  const samView = access.sanitizeGroupForViewer(group, "sam", new Date("2026-09-11T05:00:00Z"));

  assert.deepEqual(farisView.standingsStats, samView.standingsStats);
  assert.equal(farisView.standingsStats.find(row => row.username === "alex").total, 3);
  assert.deepEqual(farisView.predictions.alex, {});
  assert.deepEqual(samView.predictions.alex, {});
  assert.doesNotMatch(JSON.stringify(farisView.standingsStats), /2-1|1-0/);
});

test("client standings use the authoritative privacy-safe totals", () => {
  assert.match(appSource, /import \{[^}]*computeGroupStats[^}]*\} from "\.\.\/shared\/scoring\.js"/);
  assert.doesNotMatch(appSource, /function computeStats\(group\)/);
  assert.match(appSource, /Array\.isArray\(group\?\.standingsStats\) \? group\.standingsStats : computeGroupStats\(group\)/);
});

test("dashboard and standings display authoritative shared ranks", () => {
  assert.match(appSource, /rank:playerStats\?\.rank\?\?null/);
  assert.match(appSource, /const myRank = stats\.find\(s => s\.username === user\.username\)\?\.rank \|\| 0/);
  assert.match(appSource, /const place=p\.rank\?\?i\+1/);
  assert.match(appSource, /const seasonWinners = seasonStats\.filter\(player=>player\.rank===1\)/);
  assert.match(appSource, /\{seasonWinnerNames\}/);
});

test("dibs mode keeps claimed scorelines visible to members", () => {
  const group = makeGroup({ mode: "dibs" });
  const view = access.sanitizeGroupForViewer(group, "sam", new Date("2026-09-10T12:00:00Z"));
  assert.deepEqual(view.predictions.alex, group.predictions.alex);
  assert.deepEqual(view.predictions.faris, group.predictions.faris);
});

test("security responses consistently use the viewer-safe group serializer", () => {
  assert.match(securitySource, /import \{[^}]*canAdminGroup[^}]*sanitizeGroupForViewer[^}]*\} from "\.\.\/shared\/groupAccess\.js"/);
  assert.match(securitySource, /prepareGroupForViewer:\s*sanitizeGroupForViewer/);
  assert.match(securitySource, /function secureGroupResponses\(/);
  assert.match(securitySource, /sanitizeGroupForViewer\(payload\.group, res\._pabViewerUsername\)/);
});

test("developer group administration is enforced by both server entry points", () => {
  assert.match(securitySource, /canAdminGroup\(group, username\)/);
  assert.match(reminderSource, /canAdminGroup\(group, session\.username\)/);
  assert.match(securitySource, /group\.creatorUsername !== username[^\n]+Only creator can delete group/);
  assert.doesNotMatch(securitySource, /const OWNER_USERNAME = "faris"/);
  assert.doesNotMatch(appSource, /user\?\.username\s*={2,3}\s*"faris"/);
});

test("client uses the shared admin role and renders private completion status", () => {
  assert.match(appSource, /import \{ canAdminGroup, isDeveloper \} from "\.\.\/shared\/groupAccess\.js"/);
  assert.match(appSource, /const isAdmin=!!\(user&&group&&canAdminGroup\(group,user\.username\)\)/);
  assert.match(appSource, /See who has finished\. Individual picks stay hidden\./i);
  assert.match(appSource, /function DevTag\(/);
  assert.match(appSource, /isDeveloper\(username\)/);
});

test("developer tag appears only in the members list and replaces the admin tag", () => {
  const devTagUses = [...appSource.matchAll(/<DevTag\s+username=/g)];
  assert.equal(devTagUses.length, 1);
  const membersStart = appSource.indexOf("function MembersTab");
  const membersEnd = appSource.indexOf("function GroupTab", membersStart);
  const membersBlock = appSource.slice(membersStart, membersEnd);
  assert.match(membersBlock, /<DevTag username=\{username\}/);
  assert.match(membersBlock, /isDeveloper\(username\)\?\(\s*<DevTag/);
  assert.match(membersBlock, /:mIsAdmin&&!mIsCreator\?\(/);
});

test("pick check uses numeric progress with semantic completion colors", () => {
  const start = appSource.indexOf("function PickCompletionPanel");
  const end = appSource.indexOf("function FixturesTab", start);
  const panel = appSource.slice(start, end);
  assert.match(panel, /const label = `\$\{item\.picked\}\/\$\{item\.total\}`/);
  assert.doesNotMatch(panel, /\?\s*"Done"|"Not started"/);
  assert.match(panel, /status === "done"[\s\S]*color:"#22c55e"/);
  assert.match(panel, /status === "in-progress"[\s\S]*color:"#f59e0b"/);
  assert.match(panel, /color:"var\(--text-dim2\)"/);
});

test("non-member invite previews contain metadata but no identities or picks", () => {
  assert.equal(typeof access.sanitizeGroupPreview, "function");
  const preview = access.sanitizeGroupPreview(makeGroup());
  assert.deepEqual(preview, {
    id: "friends",
    name: undefined,
    code: undefined,
    competition: "PL",
    season: 2026,
    mode: "open",
    memberCount: 3,
  });
  assert.equal(preview.members, undefined);
  assert.equal(preview.predictions, undefined);
});

test("legacy group reads enforce membership and viewer-safe serialization", () => {
  assert.match(dbSource, /sanitizeGroupForViewer/);
  assert.match(dbSource, /sanitizeGroupPreview/);
  assert.match(dbSource, /session\?\.username/);
  assert.doesNotMatch(dbSource, /return normalizeLeagueFixtureDoc\(group, group\?\.competition/);
});
