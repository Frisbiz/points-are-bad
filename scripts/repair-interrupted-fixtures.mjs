// Preview first: node --env-file=.env.local scripts/repair-interrupted-fixtures.mjs LL 2026 8
// Add --apply to persist provider-confirmed interruptions. Picks and results are never changed.
import assert from "node:assert/strict";
import { FieldPath } from "firebase-admin/firestore";
import { db, docKey } from "../api/_db.js";
import { fetchYahooLiveMatches, fixtureGlobalKey } from "../api/_yahooFixtures.js";
import { applyFinishedLiveMatchesToGlobalDoc } from "../api/_fixtureSync.js";
import { gameweekStatus } from "../src/gameweekSelector.js";

const [competition, seasonArg, weekArg] = process.argv.slice(2);
const season = Number(seasonArg);
const week = Number(weekArg);
assert.ok(["PL", "LL"].includes(competition) && Number.isInteger(season) && Number.isInteger(week) && week > 0);
const apply = process.argv.includes("--apply");
const matches = (await fetchYahooLiveMatches(competition, week)).filter(match => match.status === "postponed");
assert.ok(matches.length, "No provider-confirmed interruptions to repair");
console.log(JSON.stringify({ apply, competition, season, week, interruptions: matches.map(m => ({ home: m.home, away: m.away, reason: m.interruptionStatus })) }));

const globalRef = db.collection("data").doc(docKey(fixtureGlobalKey(competition, season)));
const groups = await db.collection("data").where(FieldPath.documentId(), ">=", "group:").where(FieldPath.documentId(), "<", "group;").get();
const refs = [globalRef, ...groups.docs.filter(doc => {
  const group = doc.data().value;
  return group?.competition === competition && Number(group.season) === season;
}).map(doc => doc.ref)];
let changed = 0;
for (const ref of refs) {
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const before = snapshot.data()?.value;
    if (!before) return;
    const update = applyFinishedLiveMatchesToGlobalDoc(before, week, matches);
    if (!update.changed) return;
    const after = update.globalDoc;
    assert.deepEqual(after.predictions, before.predictions);
    assert.deepEqual(after.gameweeks.flatMap(gw => gw.fixtures.map(f => f.result)), before.gameweeks.flatMap(gw => gw.fixtures.map(f => f.result)));
    const round = after.gameweeks.find(gw => Number(gw.gw) === week);
    console.log(JSON.stringify({ document: ref.id, gameweekStatus: gameweekStatus(round), updated: apply }));
    if (apply) {
      tx.update(ref, { "value.gameweeks": after.gameweeks, "value.updatedAt": after.updatedAt, updatedAt: Date.now() });
    }
    changed++;
  });
}
console.log(JSON.stringify({ changed, applied: apply }));
