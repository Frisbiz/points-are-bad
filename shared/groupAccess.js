export const DEVELOPER_USERNAME = "faris";

function normalizedUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export function isDeveloper(username) {
  return normalizedUsername(username) === DEVELOPER_USERNAME;
}

export function isGroupCreator(group, username) {
  return normalizedUsername(group?.creatorUsername) === normalizedUsername(username);
}

export function canAdminGroup(group, username) {
  const normalized = normalizedUsername(username);
  if (!normalized || !(group?.members || []).some(member => normalizedUsername(member) === normalized)) return false;
  return isDeveloper(normalized) || isGroupCreator(group, normalized) || (group?.admins || []).some(admin => normalizedUsername(admin) === normalized);
}

function isPick(value) {
  return /^\d+-\d+$/.test(String(value || ""));
}

function fixtureIsClosed(fixture, nowMs) {
  if (fixture?.result) return true;
  if (["FINISHED", "IN_PLAY", "PAUSED", "POSTPONED", "CANCELLED", "CANCELED"].includes(fixture?.status)) return true;
  const kickoff = Date.parse(fixture?.date);
  return Number.isFinite(kickoff) && kickoff <= nowMs;
}

function pickableFixtures(group, gameweek) {
  const hidden = new Set(group?.hiddenFixtures || []);
  return (gameweek?.fixtures || []).filter(fixture =>
    !hidden.has(fixture.id) && !["POSTPONED", "CANCELLED", "CANCELED"].includes(fixture.status)
  );
}

function completionForGameweek(group, gameweek) {
  const fixtures = pickableFixtures(group, gameweek);
  return Object.fromEntries((group?.members || []).map(username => {
    const picks = group?.predictions?.[username] || {};
    const picked = fixtures.reduce((total, fixture) => total + (isPick(picks[fixture.id]) ? 1 : 0), 0);
    const status = fixtures.length > 0 && picked === fixtures.length
      ? "done"
      : picked > 0 ? "in-progress" : "not-started";
    return [username, { picked, total: fixtures.length, status }];
  }));
}

export function buildPickCompletion(group) {
  const summary = {};
  for (const gameweek of group?.gameweeks || []) {
    const season = String(gameweek.season || group?.season || 2025);
    const gw = String(gameweek.gw);
    if (!summary[season]) summary[season] = {};
    summary[season][gw] = completionForGameweek(group, gameweek);
  }
  return summary;
}

function revealedFixtureIds(group, viewer, nowMs) {
  if (group?.mode === "dibs") {
    return new Set((group?.gameweeks || []).flatMap(gameweek => (gameweek.fixtures || []).map(fixture => fixture.id)));
  }

  const revealed = new Set();
  for (const gameweek of group?.gameweeks || []) {
    const fixtures = pickableFixtures(group, gameweek);
    if (!fixtures.length) continue;
    const season = String(gameweek.season || group?.season || 2025);
    const gw = String(gameweek.gw);
    const viewerPicks = group?.predictions?.[viewer] || {};
    const viewerLocked = !!group?.picksLocked?.[viewer]?.[season]?.[gw];
    const openFixtures = fixtures.filter(fixture => !fixtureIsClosed(fixture, nowMs));
    const viewerComplete = openFixtures.every(fixture => isPick(viewerPicks[fixture.id]));
    const allClosed = fixtures.every(fixture => fixtureIsClosed(fixture, nowMs));
    if (viewerLocked || viewerComplete || allClosed) {
      for (const fixture of gameweek.fixtures || []) revealed.add(fixture.id);
    }
  }
  return revealed;
}

export function sanitizeGroupForViewer(group, username, now = new Date()) {
  if (!group || typeof group !== "object") return group;
  const viewer = normalizedUsername(username);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const revealed = revealedFixtureIds(group, viewer, Number.isFinite(nowMs) ? nowMs : Date.now());
  const predictions = {};

  for (const member of group.members || []) {
    const picks = group.predictions?.[member] || {};
    if (normalizedUsername(member) === viewer || group.mode === "dibs") {
      predictions[member] = { ...picks };
    } else {
      predictions[member] = Object.fromEntries(Object.entries(picks).filter(([fixtureId]) => revealed.has(fixtureId)));
    }
  }

  const ownLocked = group.picksLocked?.[username] || group.picksLocked?.[viewer];
  const view = {
    ...group,
    predictions,
    picksLocked: ownLocked ? { [username]: ownLocked } : {},
  };
  if (canAdminGroup(group, viewer)) view.pickCompletion = buildPickCompletion(group);
  else delete view.pickCompletion;
  return view;
}

export function sanitizeGroupPreview(group) {
  if (!group || typeof group !== "object") return group;
  return {
    id: group.id,
    name: group.name,
    code: group.code,
    competition: group.competition,
    season: group.season,
    mode: group.mode,
    memberCount: (group.members || []).length,
  };
}
