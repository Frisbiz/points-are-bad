import { groupLifecycle, fixtureBelongsToSeason } from '../shared/groupLifecycle.js';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function fixtureTime(fixture) {
  const value = fixture?.date ? new Date(fixture.date).getTime() : NaN;
  return Number.isFinite(value) ? value : null;
}

function isFinishedFixture(fixture) {
  return Boolean(fixture?.result) || ["FINISHED", "CANCELLED", "CANCELED"].includes(String(fixture?.status || "").toUpperCase());
}

function isLiveFixture(fixture) {
  return ["IN_PLAY", "PAUSED", "LIVE"].includes(String(fixture?.status || "").toUpperCase()) && !isFinishedFixture(fixture);
}

function isPickableFixture(fixture) {
  return !["POSTPONED", "CANCELLED", "CANCELED"].includes(String(fixture?.status || "").toUpperCase());
}

function dibsTurnForFixture(group, fixtureId) {
  const memberOrder = group?.memberOrder || group?.members || [];
  if (!memberOrder.length) return null;
  const activeSeason = group?.season || 2025;
  const orderedGameweeks = (group?.gameweeks || [])
    .slice()
    .sort((a, b) => ((a.season || activeSeason) - (b.season || activeSeason)) || (a.gw - b.gw));
  let fixtureIndex = 0;
  let targetIndex = null;
  for (const gameweek of orderedGameweeks) {
    for (const fixture of (gameweek.fixtures || [])) {
      if (fixture.id === fixtureId) targetIndex = fixtureIndex;
      fixtureIndex++;
    }
  }
  if (targetIndex === null) return null;
  const skipped = group?.dibsSkips?.[fixtureId] || [];
  const predictions = group?.predictions || {};
  const rotationStart = targetIndex % memberOrder.length;
  for (let offset = 0; offset < memberOrder.length; offset++) {
    const member = memberOrder[(rotationStart + offset) % memberOrder.length];
    if (skipped.includes(member)) continue;
    if (!/^\d+-\d+$/.test(predictions[member]?.[fixtureId] || "")) return member;
  }
  return null;
}

export function formatDashboardCountdown(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "now";
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes >= 15 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function getDashboardCountdownUrgency(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 60 * 60 * 1000) return "critical";
  if (milliseconds <= 24 * 60 * 60 * 1000) return "urgent";
  if (milliseconds <= 4 * 24 * 60 * 60 * 1000) return "soon";
  return "calm";
}

export function getDashboardFixtureTiming(item, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const isPickDeadline = item?.mode === "picks-due" || item?.mode === "picks-open";
  const targetMs = isPickDeadline ? item?.deadlineMs : item?.nextKickoffMs;
  if (!Number.isFinite(targetMs)) return null;
  return {
    label: isPickDeadline ? "Picks due" : "Kickoff",
    countdown: `in ${formatDashboardCountdown(targetMs - safeNowMs)}`,
  };
}

export function getGroupDashboardAction(mode, missingPickCount = 0) {
  if (mode === 'completed' || mode === 'results-pending') return { label: 'View results', tab: 'League' };
  if (missingPickCount > 0) return { label: "Make picks", tab: "Fixtures" };
  if (mode === "live") return { label: "Open group", tab: "Fixtures" };
  return { label: "Open group", tab: "League" };
}

export function buildGroupDashboardState(group, username, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const lifecycle = groupLifecycle(group, new Date(safeNowMs));
  if (lifecycle !== 'active') return {
    group, mode:lifecycle, roundNumber:group?.currentGW || null, nextFixture:null,
    nextKickoffMs:null, deadlineMs:null, dueSoonCount:0, missingPickCount:0,
    pickedCount:0,totalPickCount:0,sortTime:null,
  };
  const activeSeason = group?.season || 2025;
  const gameweeks = (group?.gameweeks || [])
    .filter(gameweek => (gameweek.season || activeSeason) === activeSeason)
    .slice()
    .sort((a, b) => a.gw - b.gw);
  const fixtures = gameweeks.flatMap(gameweek =>
    (gameweek.fixtures || []).filter(f => fixtureBelongsToSeason(f, group?.competition || 'PL', activeSeason)).map(fixture => ({ ...fixture, _gw: gameweek.gw }))
  );
  const liveFixtures = fixtures
    .filter(isLiveFixture)
    .sort((a, b) => (fixtureTime(a) ?? Number.MAX_SAFE_INTEGER) - (fixtureTime(b) ?? Number.MAX_SAFE_INTEGER));
  const futureFixtures = fixtures
    .filter(fixture => {
      const kickoffMs = fixtureTime(fixture);
      return isPickableFixture(fixture) && !isFinishedFixture(fixture) && !isLiveFixture(fixture) && kickoffMs !== null && kickoffMs > safeNowMs;
    })
    .sort((a, b) => fixtureTime(a) - fixtureTime(b));

  const anchorFixture = liveFixtures[0] || futureFixtures[0] || null;
  const roundNumber = anchorFixture?._gw ?? group?.currentGW ?? null;
  const round = gameweeks.find(gameweek => gameweek.gw === roundNumber);
  const roundFixtures = (round?.fixtures || []).filter(isPickableFixture);
  const predictions = group?.predictions?.[username] || {};
  const pickedCount = roundFixtures.filter(fixture => /^\d+-\d+$/.test(predictions[fixture.id] || "")).length;
  const roundLocked = Boolean(group?.picksLocked?.[username]?.[activeSeason]?.[roundNumber]);
  const adminLocked = (group?.hiddenGWs || []).includes(roundNumber) && !(group?.admins || []).includes(username);
  const allOpenUnpickedFixtures = roundFixtures
    .filter(fixture => {
      if (/^\d+-\d+$/.test(predictions[fixture.id] || "")) return false;
      const kickoffMs = fixtureTime(fixture);
      return !isFinishedFixture(fixture) && !isLiveFixture(fixture) && kickoffMs !== null && kickoffMs > safeNowMs;
    })
    .sort((a, b) => fixtureTime(a) - fixtureTime(b));
  const openMissingFixtures = (roundLocked || adminLocked)
    ? []
    : allOpenUnpickedFixtures.filter(fixture => group?.mode !== "dibs" || dibsTurnForFixture(group, fixture.id) === username);
  const dueSoonFixtures = openMissingFixtures.filter(fixture => fixtureTime(fixture) - safeNowMs <= THREE_DAYS_MS);
  const earliestMissing = openMissingFixtures[0] || null;
  const waitingForDibs = group?.mode === "dibs" && !roundLocked && !adminLocked && allOpenUnpickedFixtures.some(fixture => dibsTurnForFixture(group, fixture.id) !== username);

  let mode = "complete";
  let nextFixture = anchorFixture;
  if (dueSoonFixtures.length) {
    mode = "picks-due";
    nextFixture = dueSoonFixtures[0];
  } else if (liveFixtures.length) {
    mode = "live";
    nextFixture = liveFixtures[0];
  } else if (openMissingFixtures.length) {
    mode = "picks-open";
    nextFixture = earliestMissing || futureFixtures[0] || null;
  } else if (waitingForDibs) {
    mode = "waiting-turn";
    nextFixture = futureFixtures[0] || null;
  } else if (futureFixtures.length) {
    mode = "ready";
    nextFixture = futureFixtures[0];
  } else if (!anchorFixture) {
    mode = "no-fixtures";
  }

  const deadlineMs = earliestMissing ? fixtureTime(earliestMissing) : null;
  const nextKickoffMs = nextFixture ? fixtureTime(nextFixture) : null;
  return {
    group,
    mode,
    roundNumber,
    nextFixture,
    nextKickoffMs,
    deadlineMs,
    dueSoonCount: dueSoonFixtures.length,
    missingPickCount: openMissingFixtures.length,
    pickedCount,
    totalPickCount: roundFixtures.length,
    sortTime: mode === "picks-due" ? deadlineMs : nextKickoffMs,
  };
}

export function sortGroupDashboardItems(items = []) {
  const priority = {
    "picks-due": 0,
    live: 1,
    "picks-open": 2,
    "waiting-turn": 3,
    ready: 4,
    complete: 5,
    "no-fixtures": 6,
  };
  return items.slice().sort((a, b) => {
    const priorityDiff = (priority[a.mode] ?? 99) - (priority[b.mode] ?? 99);
    if (priorityDiff) return priorityDiff;
    return (a.sortTime ?? Number.MAX_SAFE_INTEGER) - (b.sortTime ?? Number.MAX_SAFE_INTEGER);
  });
}
