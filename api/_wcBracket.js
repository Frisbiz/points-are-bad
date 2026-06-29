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

const KNOCKOUT_PLACEHOLDER_LABELS_BY_GW = {
  5: [
    ["W74", "W77"],
    ["W76", "W78"],
    ["W73", "W75"],
    ["W79", "W80"],
    ["W83", "W84"],
    ["W86", "W88"],
    ["W81", "W82"],
    ["W85", "W87"],
  ],
  6: [
    ["W89", "W90"],
    ["W91", "W92"],
    ["W93", "W94"],
    ["W95", "W96"],
  ],
  7: [
    ["W97", "W98"],
    ["W99", "W100"],
  ],
  8: [["W101", "W102"]],
};

const THIRD_PLACE_PLACEHOLDER_LABELS = ["L101", "L102"];

const YAHOO_GAME_PLACEHOLDER_LABELS = {
  13532377: ["W74", "W77"],
  13532378: ["W73", "W75"],
  13532379: ["W76", "W78"],
  13532380: ["W79", "W80"],
  13532381: ["W83", "W84"],
  13532382: ["W81", "W82"],
  13532383: ["W86", "W88"],
  13532384: ["W85", "W87"],
  13532385: ["W89", "W90"],
  13532386: ["W93", "W94"],
  13532387: ["W91", "W92"],
  13532388: ["W95", "W96"],
  13532389: ["W97", "W98"],
  13532390: ["W99", "W100"],
  13532391: ["L101", "L102"],
  13532392: ["W101", "W102"],
};

const WORLD_CUP_BRACKET_TEAM_NAME_LIMIT = 12;

function displayTeamName(team) {
  return TEAM_DISPLAY_MAP[team] || team;
}

function sideIndex(side) {
  return side === "away" || side === 1 ? 1 : 0;
}

function yahooGameIdKey(fixture) {
  const source = [fixture?.apiId, fixture?.gameid, fixture?.id].filter(Boolean).join(" ");
  const match = source.match(/135323(?:7[7-9]|8[0-9]|9[0-2])/);
  return match ? match[0] : null;
}

export function isUnresolvedWorldCupTeamSlot(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return !normalized || normalized === "TBD";
}

export function formatWorldCupBracketTeamName(name, max = WORLD_CUP_BRACKET_TEAM_NAME_LIMIT) {
  const text = String(name || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function formatWorldCupBracketKickoff(value, options = {}) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const { locale = "en-US", timeZone } = options;
  const dateOptions = { month: "numeric", day: "numeric" };
  const timeOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  if (timeZone) {
    dateOptions.timeZone = timeZone;
    timeOptions.timeZone = timeZone;
  }

  return {
    date: new Intl.DateTimeFormat(locale, dateOptions).format(date),
    time: new Intl.DateTimeFormat(locale, timeOptions).format(date),
  };
}

export function getWorldCupKnockoutPlaceholderLabel(gw, matchIndex, side, stage = null, fixture = null) {
  const index = sideIndex(side);
  const yahooLabels = YAHOO_GAME_PLACEHOLDER_LABELS[yahooGameIdKey(fixture)];
  if (yahooLabels?.[index]) return yahooLabels[index];

  if (String(stage || "").toUpperCase() === "THIRD_PLACE") {
    return THIRD_PLACE_PLACEHOLDER_LABELS[index] || "TBD";
  }

  const roundLabels = KNOCKOUT_PLACEHOLDER_LABELS_BY_GW[Number(gw)];
  return roundLabels?.[Number(matchIndex)]?.[index] || "TBD";
}

function knockoutFeederLabelsForGW(gw) {
  return (KNOCKOUT_PLACEHOLDER_LABELS_BY_GW[Number(gw) + 1] || []).flat();
}

function scoreNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sideFromWinningTeamId(fixture) {
  const winningTeamId = String(fixture?.winningTeamId || fixture?.winnerTeamId || fixture?.winning_team_id || "").trim();
  if (!winningTeamId) return null;
  if (String(fixture?.homeTeamId || "") === winningTeamId) return "home";
  if (String(fixture?.awayTeamId || "") === winningTeamId) return "away";
  return null;
}

function sideFromShootout(fixture) {
  const home = scoreNumber(fixture?.homeShootoutScore ?? fixture?.homePenaltyScore ?? fixture?.total_home_shootout_points);
  const away = scoreNumber(fixture?.awayShootoutScore ?? fixture?.awayPenaltyScore ?? fixture?.total_away_shootout_points);
  if (home === null || away === null || home === away) return null;
  return home > away ? "home" : "away";
}

export function winnerSideForWorldCupFixture(fixture) {
  if (!fixture?.result) return null;
  const [home, away] = String(fixture.result).split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (home > away) return "home";
  if (away > home) return "away";

  const explicitSide = String(fixture?.winnerSide || fixture?.winningSide || "").trim().toLowerCase();
  if (explicitSide === "home" || explicitSide === "away") return explicitSide;

  return sideFromWinningTeamId(fixture) || sideFromShootout(fixture);
}

function isFinishedFixture(fixture) {
  const status = String(fixture?.status || "").toUpperCase();
  if (status === "FINISHED") return true;
  if (!fixture?.result) return false;
  return status !== "IN_PLAY" && status !== "PAUSED" && status !== "POSTPONED";
}

function shootoutLabel(fixture) {
  const home = scoreNumber(fixture?.homeShootoutScore ?? fixture?.homePenaltyScore ?? fixture?.total_home_shootout_points);
  const away = scoreNumber(fixture?.awayShootoutScore ?? fixture?.awayPenaltyScore ?? fixture?.total_away_shootout_points);
  if (home === null || away === null) return null;

  const winnerSide = winnerSideForWorldCupFixture(fixture) || sideFromShootout(fixture);
  const first = winnerSide === "away" ? away : home;
  const second = winnerSide === "away" ? home : away;
  return `PEN: ${first}-${second}`;
}

export function formatWorldCupBracketMatchMeta(fixture, options = {}) {
  if (!fixture) return null;
  if (isFinishedFixture(fixture)) {
    return {
      primary: "FT",
      secondary: shootoutLabel(fixture),
    };
  }

  const kickoff = formatWorldCupBracketKickoff(fixture?.date, options);
  return kickoff ? { primary: kickoff.date, secondary: kickoff.time } : null;
}

function advancedTeamPatch(sourceFixture, sourceSide, targetSide) {
  const patch = {
    [targetSide]: sourceFixture?.[sourceSide] || null,
    [`${targetSide}Crest`]: sourceFixture?.[`${sourceSide}Crest`] || null,
    [`${targetSide}TeamId`]: sourceFixture?.[`${sourceSide}TeamId`] || null,
  };
  if (sourceFixture?.[`${sourceSide}Seed`]) patch[`${targetSide}Seed`] = sourceFixture[`${sourceSide}Seed`];
  return patch;
}

function sideAdvancementLabels(fixture, side, gw, matchIndex) {
  const labels = [];
  const raw = String(fixture?.[side] || "").trim().toUpperCase();
  if (raw) labels.push(raw);
  if (isUnresolvedWorldCupTeamSlot(fixture?.[side])) {
    labels.push(getWorldCupKnockoutPlaceholderLabel(gw, matchIndex, side, fixture?.stage, fixture));
  }
  return [...new Set(labels.filter(Boolean))];
}

function resolveAdvancementPlaceholders(fixtures, advancementByLabel, gw = null) {
  let changed = false;
  const resolved = fixtures.map((fixture, matchIndex) => {
    let next = fixture;
    ["home", "away"].forEach(side => {
      const patch = sideAdvancementLabels(next, side, gw, matchIndex)
        .map(label => advancementByLabel.get(label))
        .find(Boolean);
      if (!patch) return;
      next = { ...next, ...patch(side) };
      changed = true;
    });
    return next;
  });
  return { fixtures: resolved, changed };
}

function setGWFixtures(gameweeks, gw, fixtures) {
  return gameweeks.map(gwObj => Number(gwObj.gw) === Number(gw) ? { ...gwObj, fixtures } : gwObj);
}

export function resolveWorldCupBracketAdvancement(gameweeks = []) {
  let resolvedGameweeks = gameweeks.map(gwObj => ({
    ...gwObj,
    fixtures: (gwObj.fixtures || []).map(fixture => ({ ...fixture })),
  }));
  const advancementByLabel = new Map();

  for (const gw of [4, 5, 6, 7]) {
    const gwObj = resolvedGameweeks.find(item => Number(item.gw) === gw);
    if (!gwObj) continue;

    const current = resolveAdvancementPlaceholders(gwObj.fixtures || [], advancementByLabel, gw);
    if (current.changed) resolvedGameweeks = setGWFixtures(resolvedGameweeks, gw, current.fixtures);

    const winnerLabels = knockoutFeederLabelsForGW(gw);
    current.fixtures.forEach((fixture, index) => {
      const winnerSide = winnerSideForWorldCupFixture(fixture);
      if (!winnerSide) return;

      const loserSide = winnerSide === "home" ? "away" : "home";
      const winnerLabel = winnerLabels[index];
      if (winnerLabel) {
        advancementByLabel.set(winnerLabel, targetSide => advancedTeamPatch(fixture, winnerSide, targetSide));
      }
      if (gw === 7 && THIRD_PLACE_PLACEHOLDER_LABELS[index]) {
        advancementByLabel.set(THIRD_PLACE_PLACEHOLDER_LABELS[index], targetSide => advancedTeamPatch(fixture, loserSide, targetSide));
      }
    });
  }

  return resolvedGameweeks.map(gwObj => {
    const patched = resolveAdvancementPlaceholders(gwObj.fixtures || [], advancementByLabel, gwObj.gw);
    return patched.changed ? { ...gwObj, fixtures: patched.fixtures } : gwObj;
  });
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
