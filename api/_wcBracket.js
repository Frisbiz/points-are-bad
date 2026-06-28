const GROUP_LETTERS = "ABCDEFGHIJKL";

const TEAM_DISPLAY_MAP = {
  "Bosnia and Herzegovina": "Bosnia-Herzegovina",
  "Bosnia & Herzegovina": "Bosnia-Herzegovina",
  "Cabo Verde": "Cape Verde",
  "Cape Verde Islands": "Cape Verde",
  "Congo DR": "DR Congo",
  "Congo, DR": "DR Congo",
  "Cote d'Ivoire": "Ivory Coast",
  "C\u00f4te d'Ivoire": "Ivory Coast",
  "United States": "USA",
};

const THIRD_PLACE_SLOT_ORDER = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"];

// FIFA's third-place allocation table for the combinations still possible after
// the late group-stage matches that produce the current 2026 Round of 32.
const THIRD_PLACE_ASSIGNMENTS = {
  BDEFIJKL: ["3E", "3J", "3B", "3D", "3I", "3F", "3L", "3K"],
  BDEFGIKL: ["3E", "3G", "3B", "3D", "3I", "3F", "3L", "3K"],
  BDEFGIJL: ["3E", "3G", "3B", "3D", "3J", "3F", "3L", "3I"],
  ABDEFGIL: ["3E", "3G", "3B", "3D", "3A", "3F", "3L", "3I"],
};

function displayTeamName(team) {
  return TEAM_DISPLAY_MAP[team] || team;
}

function teamKey(value) {
  return displayTeamName(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\band\b/gi, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function groupLetterFrom(value) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/(?:GROUP\s*)?([A-L])$/);
  return match ? match[1] : null;
}

function parseSeed(value) {
  const match = String(value || "").trim().toUpperCase().match(/^([123])\s*([A-L])$/);
  return match ? `${match[1]}${match[2]}` : null;
}

function parseThirdSeedList(value) {
  const tokens = String(value || "")
    .trim()
    .toUpperCase()
    .split("/")
    .map(parseSeed)
    .filter(Boolean);
  return tokens.length > 1 && tokens.every(seed => seed.startsWith("3")) ? tokens : [];
}

function sideSeedSource(fixture, side) {
  return fixture?.[`${side}OriginalSeed`] || fixture?.[side];
}

export function hasWorldCupSeedPlaceholder(value) {
  return Boolean(parseSeed(value) || parseThirdSeedList(value).length);
}

export function fixtureHasWorldCupSeedPlaceholder(fixture) {
  return ["home", "away"].some(side => hasWorldCupSeedPlaceholder(sideSeedSource(fixture, side)));
}

function yahooStyleSeedName(value) {
  const seed = parseSeed(value);
  if (seed) return seed;
  if (parseThirdSeedList(value).length) return "3RD P";
  return null;
}

function formatFixtureSideSeedPlaceholder(fixture, side) {
  const source = sideSeedSource(fixture, side);
  const display = yahooStyleSeedName(source);
  if (!display) return null;
  return {
    [side]: display,
    [`${side}OriginalSeed`]: String(source || "").trim(),
  };
}

export function formatWorldCupFixtureSeedPlaceholders(fixtures = []) {
  return fixtures.map(fixture => {
    const homePatch = formatFixtureSideSeedPlaceholder(fixture, "home");
    const awayPatch = formatFixtureSideSeedPlaceholder(fixture, "away");
    if (!homePatch && !awayPatch) return fixture;
    return { ...fixture, ...homePatch, ...awayPatch };
  });
}

export function formatWorldCupGlobalDocSeedPlaceholders(globalDoc = {}) {
  let changed = false;
  const gameweeks = (globalDoc.gameweeks || []).map(gwObj => {
    const originalFixtures = gwObj.fixtures || [];
    const fixtures = formatWorldCupFixtureSeedPlaceholders(originalFixtures);
    if (!fixtures.some((fixture, index) => fixture !== originalFixtures[index])) return gwObj;
    changed = true;
    return { ...gwObj, fixtures };
  });

  return {
    changed,
    globalDoc: changed ? { ...globalDoc, gameweeks } : globalDoc,
  };
}

function buildStandingsIndex(standings = {}) {
  const bySeed = new Map();
  const seedByTeamId = new Map();
  const seedByTeamKey = new Map();

  for (const group of standings.groups || []) {
    const letter = groupLetterFrom(group.name);
    if (!letter) continue;
    for (const row of group.rows || []) {
      const pos = Number(row.pos);
      if (![1, 2, 3].includes(pos) || !row.team) continue;
      const seed = `${pos}${letter}`;
      const indexed = { ...row, team: displayTeamName(row.team), seed, groupLetter: letter };
      bySeed.set(seed, indexed);
      if (row.teamId) seedByTeamId.set(String(row.teamId), seed);
      seedByTeamKey.set(teamKey(row.team), seed);
      seedByTeamKey.set(teamKey(indexed.team), seed);
      if (row.abbr) seedByTeamKey.set(teamKey(row.abbr), seed);
    }
  }

  const thirdGroupKey = (standings.thirdPlaceRanking || [])
    .filter(row => row.qualified)
    .map(row => groupLetterFrom(row.group))
    .filter(Boolean)
    .sort()
    .join("");

  const thirdAssignments = Object.fromEntries(
    (THIRD_PLACE_ASSIGNMENTS[thirdGroupKey] || [])
      .map((seed, index) => [THIRD_PLACE_SLOT_ORDER[index], seed])
  );

  return { bySeed, seedByTeamId, seedByTeamKey, thirdGroupKey, thirdAssignments };
}

function fixtureSideSeed(fixture, side, index) {
  const teamId = fixture?.[`${side}TeamId`];
  if (teamId && index.seedByTeamId.has(String(teamId))) return index.seedByTeamId.get(String(teamId));
  const name = fixture?.[side];
  const key = teamKey(name);
  return index.seedByTeamKey.get(key) || null;
}

function rowPatchForSide(side, row, seed, originalSeed) {
  return {
    [side]: row.team,
    [`${side}Seed`]: seed,
    [`${side}OriginalSeed`]: originalSeed,
    [`${side}TeamId`]: row.teamId || null,
    [`${side}Crest`]: row.crest || null,
  };
}

function resolveSide(fixture, side, index) {
  const originalSeed = String(sideSeedSource(fixture, side) || "").trim();
  const simpleSeed = parseSeed(originalSeed);
  if (simpleSeed) {
    const row = index.bySeed.get(simpleSeed);
    return row ? rowPatchForSide(side, row, simpleSeed, originalSeed) : null;
  }

  const candidates = parseThirdSeedList(originalSeed);
  if (!candidates.length) return null;

  const oppositeSide = side === "home" ? "away" : "home";
  const oppositeSeed = fixtureSideSeed(fixture, oppositeSide, index);
  const resolvedSeed = oppositeSeed ? index.thirdAssignments[oppositeSeed] : null;
  if (!resolvedSeed || !candidates.includes(resolvedSeed)) return null;

  const row = index.bySeed.get(resolvedSeed);
  return row ? rowPatchForSide(side, row, resolvedSeed, originalSeed) : null;
}

export function resolveWorldCupKnockoutSeeds(fixtures = [], standings = {}) {
  const index = buildStandingsIndex(standings);
  if (!index.bySeed.size) return fixtures;

  return formatWorldCupFixtureSeedPlaceholders(fixtures).map(fixture => {
    const homePatch = resolveSide(fixture, "home", index);
    const awayPatch = resolveSide(fixture, "away", index);
    if (!homePatch && !awayPatch) return fixture;
    return { ...fixture, ...homePatch, ...awayPatch };
  });
}

export function resolveWorldCupGlobalDocSeeds(globalDoc = {}, standings = {}) {
  const formatted = formatWorldCupGlobalDocSeedPlaceholders(globalDoc);
  let changed = formatted.changed;
  const gameweeks = (formatted.globalDoc.gameweeks || []).map(gwObj => {
    const fixtures = gwObj.fixtures || [];
    if (!fixtures.some(fixtureHasWorldCupSeedPlaceholder)) {
      return gwObj;
    }

    const resolvedFixtures = resolveWorldCupKnockoutSeeds(fixtures, standings);
    const fixturesChanged = resolvedFixtures.some((fixture, index) => fixture !== fixtures[index]);
    if (!fixturesChanged) return gwObj;

    changed = true;
    return { ...gwObj, fixtures: resolvedFixtures };
  });

  return {
    changed,
    globalDoc: changed ? { ...globalDoc, gameweeks } : globalDoc,
  };
}
