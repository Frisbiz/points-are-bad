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
    ["W73", "W75"],
    ["W83", "W84"],
    ["W81", "W82"],
    ["W76", "W78"],
    ["W79", "W80"],
    ["W86", "W88"],
    ["W85", "W87"],
  ],
  6: [
    ["W89", "W90"],
    ["W93", "W94"],
    ["W91", "W92"],
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

const YAHOO_GAME_WINNER_LABELS = {
  13532361: "W73",
  13532362: "W74",
  13532363: "W75",
  13532364: "W76",
  13532365: "W77",
  13532366: "W78",
  13532367: "W79",
  13532370: "W80",
  13532368: "W81",
  13532369: "W82",
  13532372: "W83",
  13532373: "W84",
  13532371: "W85",
  13532376: "W86",
  13532375: "W87",
  13532374: "W88",
  13532377: "W89",
  13532378: "W90",
  13532379: "W91",
  13532380: "W92",
  13532381: "W93",
  13532382: "W94",
  13532383: "W95",
  13532384: "W96",
  13532385: "W97",
  13532386: "W98",
  13532387: "W99",
  13532388: "W100",
  13532389: "W101",
  13532390: "W102",
};

const YAHOO_GAME_LOSER_LABELS = {
  13532389: "L101",
  13532390: "L102",
};

const WORLD_CUP_KNOCKOUT_SCHEDULE_BY_GAME_ID = {
  13532361: { gw: 4, stage: "LAST_32", date: "2026-06-28T19:00:00.000Z", yahooDate: "2026-06-28" },
  13532362: { gw: 4, stage: "LAST_32", date: "2026-06-29T20:30:00.000Z", yahooDate: "2026-06-29" },
  13532363: { gw: 4, stage: "LAST_32", date: "2026-06-30T01:00:00.000Z", yahooDate: "2026-06-29" },
  13532364: { gw: 4, stage: "LAST_32", date: "2026-06-29T17:00:00.000Z", yahooDate: "2026-06-29" },
  13532365: { gw: 4, stage: "LAST_32", date: "2026-06-30T21:00:00.000Z", yahooDate: "2026-06-30" },
  13532366: { gw: 4, stage: "LAST_32", date: "2026-06-30T17:00:00.000Z", yahooDate: "2026-06-30" },
  13532367: { gw: 4, stage: "LAST_32", date: "2026-07-01T02:00:00.000Z", yahooDate: "2026-06-30" },
  13532368: { gw: 4, stage: "LAST_32", date: "2026-07-02T00:00:00.000Z", yahooDate: "2026-07-01" },
  13532369: { gw: 4, stage: "LAST_32", date: "2026-07-01T20:00:00.000Z", yahooDate: "2026-07-01" },
  13532370: { gw: 4, stage: "LAST_32", date: "2026-07-01T16:00:00.000Z", yahooDate: "2026-07-01" },
  13532371: { gw: 4, stage: "LAST_32", date: "2026-07-03T03:00:00.000Z", yahooDate: "2026-07-02" },
  13532372: { gw: 4, stage: "LAST_32", date: "2026-07-02T23:00:00.000Z", yahooDate: "2026-07-02" },
  13532373: { gw: 4, stage: "LAST_32", date: "2026-07-02T19:00:00.000Z", yahooDate: "2026-07-02" },
  13532374: { gw: 4, stage: "LAST_32", date: "2026-07-03T18:00:00.000Z", yahooDate: "2026-07-03" },
  13532375: { gw: 4, stage: "LAST_32", date: "2026-07-04T01:30:00.000Z", yahooDate: "2026-07-03" },
  13532376: { gw: 4, stage: "LAST_32", date: "2026-07-03T22:00:00.000Z", yahooDate: "2026-07-03" },
  13532377: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-04T21:00:00.000Z", yahooDate: "2026-07-04" },
  13532378: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-04T17:00:00.000Z", yahooDate: "2026-07-04" },
  13532379: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-05T20:00:00.000Z", yahooDate: "2026-07-05" },
  13532380: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-06T00:00:00.000Z", yahooDate: "2026-07-05" },
  13532381: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-06T19:00:00.000Z", yahooDate: "2026-07-06" },
  13532382: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-07T00:00:00.000Z", yahooDate: "2026-07-06" },
  13532383: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-07T16:00:00.000Z", yahooDate: "2026-07-07" },
  13532384: { gw: 5, stage: "ROUND_OF_16", date: "2026-07-07T20:00:00.000Z", yahooDate: "2026-07-07" },
  13532385: { gw: 6, stage: "QUARTER_FINAL", date: "2026-07-09T20:00:00.000Z", yahooDate: "2026-07-09" },
  13532386: { gw: 6, stage: "QUARTER_FINAL", date: "2026-07-10T19:00:00.000Z", yahooDate: "2026-07-10" },
  13532387: { gw: 6, stage: "QUARTER_FINAL", date: "2026-07-11T21:00:00.000Z", yahooDate: "2026-07-11" },
  13532388: { gw: 6, stage: "QUARTER_FINAL", date: "2026-07-12T01:00:00.000Z", yahooDate: "2026-07-11" },
  13532389: { gw: 7, stage: "SEMI_FINAL", date: "2026-07-14T19:00:00.000Z", yahooDate: "2026-07-14" },
  13532390: { gw: 7, stage: "SEMI_FINAL", date: "2026-07-15T19:00:00.000Z", yahooDate: "2026-07-15" },
  13532391: { gw: 8, stage: "THIRD_PLACE", date: "2026-07-18T21:00:00.000Z", yahooDate: "2026-07-18" },
  13532392: { gw: 8, stage: "FINAL", date: "2026-07-19T19:00:00.000Z", yahooDate: "2026-07-19" },
};

const WORLD_CUP_KNOWN_TEAM_GAME_IDS = [
  { gw: 5, home: "Paraguay", away: "France", gameId: 13532377 },
  { gw: 5, home: "Canada", away: "Morocco", gameId: 13532378 },
  { gw: 5, home: "Portugal", away: "Spain", gameId: 13532381 },
  { gw: 5, home: "USA", away: "Belgium", gameId: 13532382 },
  { gw: 5, home: "Brazil", away: "Norway", gameId: 13532379 },
  { gw: 5, home: "Mexico", away: "England", gameId: 13532380 },
  { gw: 5, home: "Argentina", away: "Egypt", gameId: 13532383 },
  { gw: 5, home: "Switzerland", away: "Colombia", gameId: 13532384 },
];

const BRACKET_DISPLAY_GAME_IDS_BY_GW = {
  4: [
    13532362,
    13532365,
    13532361,
    13532363,
    13532372,
    13532373,
    13532368,
    13532369,
    13532364,
    13532366,
    13532367,
    13532370,
    13532376,
    13532374,
    13532371,
    13532375,
  ],
  5: [
    13532377,
    13532378,
    13532381,
    13532382,
    13532379,
    13532380,
    13532383,
    13532384,
  ],
  6: [13532385, 13532386, 13532387, 13532388],
  7: [13532389, 13532390],
  8: [13532392, 13532391],
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
  const match = source.match(/135323(?:6[1-9]|7[0-9]|8[0-9]|9[0-2])/);
  return match ? match[0] : null;
}

function scheduleWithGameId(gameId) {
  const schedule = WORLD_CUP_KNOCKOUT_SCHEDULE_BY_GAME_ID[gameId];
  return schedule ? { ...schedule, gameId } : null;
}

function sameIsoMinute(a, b) {
  if (!a || !b) return false;
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;
  return Math.floor(aTime / 60000) === Math.floor(bTime / 60000);
}

function hasFreshYahooKickoff(fixture, schedule) {
  if (!fixture?.date || !fixture?.yahooLastUpdated) return false;
  const fixtureGameId = yahooGameIdKey(fixture);
  if (!fixtureGameId || String(fixtureGameId) !== String(schedule?.gameId)) return false;
  const time = new Date(fixture.date).getTime();
  return Number.isFinite(time);
}

function applySchedulePatchToFixture(fixture, schedule) {
  const preserveYahooKickoff = hasFreshYahooKickoff(fixture, schedule);
  const date = preserveYahooKickoff ? fixture.date : schedule.date;
  const yahooDate = preserveYahooKickoff ? (fixture.yahooDate || schedule.yahooDate) : schedule.yahooDate;
  const scheduleChanged = preserveYahooKickoff && !sameIsoMinute(fixture.date, schedule.date);
  const delayedStatus = scheduleChanged && String(fixture.status || "").toUpperCase() === "SCHEDULED";
  return {
    ...fixture,
    apiId: `soccer.g.${schedule.gameId}`,
    date,
    yahooDate,
    stage: schedule.stage || fixture.stage,
    status: delayedStatus ? "DELAYED" : fixture.status,
  };
}

function scheduleByUniqueKickoff(gw, fixture) {
  if (Number(gw) < 4 || !fixture?.date) return null;
  const time = new Date(fixture.date).getTime();
  if (!Number.isFinite(time)) return null;
  const kickoff = new Date(time).toISOString();
  const matches = Object.entries(WORLD_CUP_KNOCKOUT_SCHEDULE_BY_GAME_ID)
    .filter(([, schedule]) => Number(schedule.gw) === Number(gw) && schedule.date === kickoff);
  if (matches.length !== 1) return null;
  return scheduleWithGameId(matches[0][0]);
}

function slotLabel(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isWinnerLoserSlot(value) {
  return /^[WL]\d+$/.test(slotLabel(value));
}

function fixtureTeamPairKey(fixture) {
  const home = teamKey(fixture?.home);
  const away = teamKey(fixture?.away);
  return home && away ? `${home}|${away}` : null;
}

function buildKnownTeamPairSchedules(gameweeks = []) {
  const labelTeams = new Map();
  for (const gw of [4, 5, 6, 7]) {
    const gwObj = (gameweeks || []).find(item => Number(item.gw) === gw);
    (gwObj?.fixtures || []).forEach((fixture, index) => {
      const winnerSide = winnerSideForWorldCupFixture(fixture);
      if (!winnerSide) return;

      const winnerLabel = winnerAdvancementLabel(fixture, gw, index);
      const winnerTeam = fixture?.[winnerSide];
      if (winnerLabel && !isUnresolvedWorldCupTeamSlot(winnerTeam)) {
        labelTeams.set(winnerLabel, winnerTeam);
      }

      if (gw === 7) {
        const loserLabel = loserAdvancementLabel(fixture, index);
        const loserTeam = fixture?.[winnerSide === "home" ? "away" : "home"];
        if (loserLabel && !isUnresolvedWorldCupTeamSlot(loserTeam)) {
          labelTeams.set(loserLabel, loserTeam);
        }
      }
    });
  }

  const schedules = new Map();
  for (const [gw, gameIds] of Object.entries(BRACKET_DISPLAY_GAME_IDS_BY_GW)) {
    gameIds.forEach(gameId => {
      const labels = YAHOO_GAME_PLACEHOLDER_LABELS[gameId] || [];
      const home = labelTeams.get(labels[0]);
      const away = labelTeams.get(labels[1]);
      const schedule = scheduleWithGameId(gameId);
      if (!home || !away || !schedule) return;
      schedules.set(`${Number(gw)}:${fixtureTeamPairKey({ home, away })}`, schedule);
    });
  }

  WORLD_CUP_KNOWN_TEAM_GAME_IDS.forEach(({ gw, home, away, gameId }) => {
    const schedule = scheduleWithGameId(gameId);
    if (schedule) schedules.set(`${gw}:${fixtureTeamPairKey({ home, away })}`, schedule);
  });

  return schedules;
}

function knownScheduleForFixture(fixture, gw = null, matchIndex = null) {
  const gameId = yahooGameIdKey(fixture);
  if (gameId) return scheduleWithGameId(gameId);

  const gwNum = Number(gw);
  const home = slotLabel(fixture?.home);
  const away = slotLabel(fixture?.away);
  const gameIds = BRACKET_DISPLAY_GAME_IDS_BY_GW[gwNum] || [];
  const placeholderGameId = gameIds.find(id => {
    const labels = YAHOO_GAME_PLACEHOLDER_LABELS[id] || [];
    return slotLabel(labels[0]) === home && slotLabel(labels[1]) === away;
  });
  if (placeholderGameId) return scheduleWithGameId(placeholderGameId);

  const indexedGameId = Number.isInteger(matchIndex) ? gameIds[matchIndex] : null;
  if (indexedGameId && (isWinnerLoserSlot(home) || isWinnerLoserSlot(away))) {
    return scheduleWithGameId(indexedGameId);
  }
  const kickoffSchedule = scheduleByUniqueKickoff(gwNum, fixture);
  if (kickoffSchedule) return kickoffSchedule;
  return null;
}

function isWorldCupStage(value) {
  return [
    "GROUP_STAGE",
    "LAST_32",
    "ROUND_OF_16",
    "QUARTER_FINAL",
    "SEMI_FINAL",
    "THIRD_PLACE",
    "FINAL",
  ].includes(String(value || "").trim().toUpperCase());
}

function isWorldCupFixtureLike(fixture) {
  if (!fixture) return false;
  if (yahooGameIdKey(fixture)) return true;
  if (/^wc[-_]/i.test(String(fixture.id || ""))) return true;
  if (isWorldCupStage(fixture.stage)) return true;
  if (isWinnerLoserSlot(fixture.home) || isWinnerLoserSlot(fixture.away)) return true;

  const pairKey = fixtureTeamPairKey(fixture);
  return WORLD_CUP_KNOWN_TEAM_GAME_IDS.some(({ home, away }) => pairKey === fixtureTeamPairKey({ home, away }));
}

function isLeagueSeasonShape(group = {}) {
  const gameweeks = Array.isArray(group?.gameweeks) ? group.gameweeks : [];
  const gwNums = gameweeks.map(gw => Number(gw?.gw)).filter(Number.isFinite);
  if (gwNums.some(gw => gw > 8) || gwNums.length > 8) return true;

  return gameweeks.flatMap(gw => gw?.fixtures || []).some(fixture => {
    const id = String(fixture?.id || "");
    return /^gw\d+-f/i.test(id) || /^\d{4}-gw\d+-f/i.test(id);
  });
}

export function isWorldCupGroupLike(group = {}) {
  const competition = String(group?.competition || "").trim().toUpperCase();
  if (competition === "WC") return !isLeagueSeasonShape(group);
  if (competition) return false;

  const gameweeks = Array.isArray(group?.gameweeks) ? group.gameweeks : [];
  const inferredSeason = Number(group?.season || gameweeks.find(gw => gw?.season)?.season || 0);
  if (inferredSeason !== 2026) return false;

  const fixtures = gameweeks.flatMap(gw => gw?.fixtures || []);

  return fixtures.some(isWorldCupFixtureLike);
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

export function buildWorldCupKnockoutScheduleFixtures(gw) {
  return (BRACKET_DISPLAY_GAME_IDS_BY_GW[Number(gw)] || [])
    .map((gameId, matchIndex) => {
      const schedule = WORLD_CUP_KNOCKOUT_SCHEDULE_BY_GAME_ID[gameId];
      if (!schedule) return null;
      const stage = schedule.stage;
      const fixture = { apiId: `soccer.g.${gameId}` };
      const home = getWorldCupKnockoutPlaceholderLabel(schedule.gw, matchIndex, "home", stage, fixture);
      const away = getWorldCupKnockoutPlaceholderLabel(schedule.gw, matchIndex, "away", stage, fixture);
      return {
        id: `wc-gw${schedule.gw}-fsoccer-g-${gameId}`,
        apiId: `soccer.g.${gameId}`,
        home,
        away,
        result: null,
        status: "SCHEDULED",
        date: schedule.date,
        yahooDate: schedule.yahooDate,
        stage,
      };
    })
    .filter(Boolean);
}

export function applyKnownWorldCupKnockoutSchedule(gameweeks = []) {
  const teamPairSchedules = buildKnownTeamPairSchedules(gameweeks);
  return (gameweeks || []).map(gwObj => ({
    ...gwObj,
    fixtures: (gwObj.fixtures || []).map((fixture, matchIndex) => {
      const teamPairSchedule = teamPairSchedules.get(`${Number(gwObj.gw)}:${fixtureTeamPairKey(fixture)}`);
      const schedule = teamPairSchedule || knownScheduleForFixture(fixture, gwObj.gw, matchIndex);
      if (!schedule) return fixture;
      return applySchedulePatchToFixture(fixture, schedule);
    }),
  }));
}

function knockoutFeederLabelsForGW(gw) {
  return (KNOCKOUT_PLACEHOLDER_LABELS_BY_GW[Number(gw) + 1] || []).flat();
}

function winnerAdvancementLabel(fixture, gw, index) {
  const yahooLabel = YAHOO_GAME_WINNER_LABELS[yahooGameIdKey(fixture)];
  if (yahooLabel) return yahooLabel;
  return knockoutFeederLabelsForGW(gw)[index] || null;
}

function loserAdvancementLabel(fixture, index) {
  const yahooLabel = YAHOO_GAME_LOSER_LABELS[yahooGameIdKey(fixture)];
  if (yahooLabel) return yahooLabel;
  return THIRD_PLACE_PLACEHOLDER_LABELS[index] || null;
}

function bracketDisplayRank(gw, fixture) {
  const gameIds = BRACKET_DISPLAY_GAME_IDS_BY_GW[Number(gw)] || [];
  const gameId = yahooGameIdKey(fixture);
  const gameIndex = gameId ? gameIds.findIndex(id => String(id) === String(gameId)) : -1;
  if (gameIndex >= 0) return gameIndex;

  const placeholderPairs = KNOCKOUT_PLACEHOLDER_LABELS_BY_GW[Number(gw)] || [];
  const home = String(fixture?.home || "").trim().toUpperCase();
  const away = String(fixture?.away || "").trim().toUpperCase();
  const pairIndex = placeholderPairs.findIndex(([left, right]) => left === home && right === away);
  return pairIndex >= 0 ? pairIndex : Number.POSITIVE_INFINITY;
}

export function sortWorldCupBracketFixturesForDisplay(gw, fixtures = []) {
  return fixtures
    .map((fixture, index) => ({ fixture, index, rank: bracketDisplayRank(gw, fixture) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map(item => item.fixture);
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
  let resolvedGameweeks = applyKnownWorldCupKnockoutSchedule(gameweeks).map(gwObj => ({
    ...gwObj,
    fixtures: (gwObj.fixtures || []).map(fixture => ({ ...fixture })),
  }));
  const advancementByLabel = new Map();

  for (const gw of [4, 5, 6, 7]) {
    const gwObj = resolvedGameweeks.find(item => Number(item.gw) === gw);
    if (!gwObj) continue;

    const current = resolveAdvancementPlaceholders(gwObj.fixtures || [], advancementByLabel, gw);
    if (current.changed) resolvedGameweeks = setGWFixtures(resolvedGameweeks, gw, current.fixtures);

    current.fixtures.forEach((fixture, index) => {
      const winnerSide = winnerSideForWorldCupFixture(fixture);
      if (!winnerSide) return;

      const loserSide = winnerSide === "home" ? "away" : "home";
      const winnerLabel = winnerAdvancementLabel(fixture, gw, index);
      if (winnerLabel) {
        advancementByLabel.set(winnerLabel, targetSide => advancedTeamPatch(fixture, winnerSide, targetSide));
      }
      const loserLabel = gw === 7 ? loserAdvancementLabel(fixture, index) : null;
      if (loserLabel) {
        advancementByLabel.set(loserLabel, targetSide => advancedTeamPatch(fixture, loserSide, targetSide));
      }
    });
  }

  return resolvedGameweeks.map(gwObj => {
    const patched = resolveAdvancementPlaceholders(gwObj.fixtures || [], advancementByLabel, gwObj.gw);
    return patched.changed ? { ...gwObj, fixtures: patched.fixtures } : gwObj;
  });
}

function isWorldCupPlaceholderTeam(value) {
  const raw = String(value || "").trim().toUpperCase();
  return !raw
    || raw === "TBD"
    || /^[WL]\d+$/.test(raw)
    || /^\d[A-L]$/.test(raw)
    || /^3[A-L](?:\/3[A-L])+$/.test(raw);
}

function worldCupRealTeamCount(fixture) {
  return ["home", "away"].reduce((count, side) => count + (isWorldCupPlaceholderTeam(fixture?.[side]) ? 0 : 1), 0);
}

function worldCupFixtureDataScore(fixture) {
  if (!fixture) return -1;
  const status = String(fixture.status || "").toUpperCase();
  const statusRank = status === "FINISHED" ? 5 : status === "IN_PLAY" ? 4 : status === "PAUSED" ? 3 : status === "POSTPONED" || status === "DELAYED" ? 2 : status === "SCHEDULED" ? 1 : 0;
  return worldCupRealTeamCount(fixture) * 100
    + statusRank * 10
    + (fixture.result ? 6 : 0)
    + (fixture.liveScore ? 4 : 0)
    + (fixture.date ? 2 : 0)
    + (fixture.apiId ? 1 : 0)
    + (fixture.homeCrest ? 1 : 0)
    + (fixture.awayCrest ? 1 : 0);
}

function worldCupFixtureLookupKeys(gw, fixture) {
  const gameId = yahooGameIdKey(fixture);
  const keys = [];
  if (gameId) keys.push(`${Number(gw)}:game:${gameId}`);
  if (
    fixture?.home
    && fixture?.away
    && !isWorldCupPlaceholderTeam(fixture.home)
    && !isWorldCupPlaceholderTeam(fixture.away)
  ) {
    const home = teamKey(fixture.home);
    const away = teamKey(fixture.away);
    if (home && away) keys.push(`${Number(gw)}:teams:${home}:${away}`);
  }
  if (Number(gw) >= 4 && fixture?.date) {
    const time = new Date(fixture.date).getTime();
    if (Number.isFinite(time)) keys.push(`${Number(gw)}:date:${new Date(time).toISOString()}`);
  }
  return keys;
}

function canCollapseWorldCupFixtureByLookupKey(key, current, candidate) {
  if (!String(key || "").includes(":date:")) return true;
  if (worldCupRealTeamCount(current) < 2 || worldCupRealTeamCount(candidate) < 2) return true;
  const currentHome = teamKey(current?.home);
  const currentAway = teamKey(current?.away);
  const candidateHome = teamKey(candidate?.home);
  const candidateAway = teamKey(candidate?.away);
  return !!currentHome
    && !!currentAway
    && currentHome === candidateHome
    && currentAway === candidateAway;
}

function worldCupFixturesShareLookupKey(gw, a, b) {
  const aKeys = new Set(worldCupFixtureLookupKeys(gw, a));
  return worldCupFixtureLookupKeys(gw, b).some(key => aKeys.has(key));
}

function worldCupFixtureIdUsedByDifferentMatch(gw, fixtures, duplicate, keeper) {
  if (!duplicate?.id) return false;
  return (fixtures || []).some(other =>
    other !== duplicate
    && other !== keeper
    && other?.id === duplicate.id
    && !worldCupFixturesShareLookupKey(gw, other, keeper)
  );
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function worldCupFixturePickCount(predictions, fixtureId) {
  if (!fixtureId) return 0;
  return Object.values(predictions || {}).reduce((count, picks) => count + (hasOwn(picks, fixtureId) ? 1 : 0), 0);
}

function remapWorldCupPredictionId(predictions, fromId, toId) {
  if (!predictions || !fromId || !toId || fromId === toId) return predictions;
  let next = predictions;
  Object.entries(predictions).forEach(([username, picks]) => {
    if (!hasOwn(picks, fromId)) return;
    if (next === predictions) next = { ...predictions };
    const updated = { ...(picks || {}) };
    if (!hasOwn(updated, toId)) updated[toId] = updated[fromId];
    delete updated[fromId];
    next[username] = updated;
  });
  return next;
}

function shouldReplaceWorldCupFixtureKeeper(current, candidate, predictions) {
  const currentRealTeams = worldCupRealTeamCount(current);
  const candidateRealTeams = worldCupRealTeamCount(candidate);
  if (currentRealTeams !== candidateRealTeams) return candidateRealTeams > currentRealTeams;

  const currentPicks = worldCupFixturePickCount(predictions, current?.id);
  const candidatePicks = worldCupFixturePickCount(predictions, candidate?.id);
  if (currentPicks !== candidatePicks) return candidatePicks > currentPicks;

  return worldCupFixtureDataScore(candidate) > worldCupFixtureDataScore(current);
}

function mergeWorldCupTeamName(keeperValue, duplicateValue) {
  if (isWorldCupPlaceholderTeam(keeperValue) && !isWorldCupPlaceholderTeam(duplicateValue)) return duplicateValue;
  return keeperValue || duplicateValue || null;
}

function mergeWorldCupFixtureData(keeper, duplicate) {
  const best = worldCupFixtureDataScore(duplicate) > worldCupFixtureDataScore(keeper) ? duplicate : keeper;
  const liveStatus = best.status === "IN_PLAY" || best.status === "PAUSED";
  return {
    ...keeper,
    apiId: best.apiId || keeper.apiId || duplicate.apiId,
    home: mergeWorldCupTeamName(keeper.home, duplicate.home),
    away: mergeWorldCupTeamName(keeper.away, duplicate.away),
    result: best.result ?? keeper.result ?? duplicate.result ?? null,
    status: best.status || keeper.status || duplicate.status,
    date: best.date || keeper.date || duplicate.date || null,
    yahooDate: best.yahooDate || keeper.yahooDate || duplicate.yahooDate || null,
    liveScore: liveStatus ? (best.liveScore || null) : null,
    homeCrest: best.homeCrest || keeper.homeCrest || duplicate.homeCrest || null,
    awayCrest: best.awayCrest || keeper.awayCrest || duplicate.awayCrest || null,
    homeTeamId: best.homeTeamId || keeper.homeTeamId || duplicate.homeTeamId || null,
    awayTeamId: best.awayTeamId || keeper.awayTeamId || duplicate.awayTeamId || null,
    winningTeamId: best.winningTeamId || keeper.winningTeamId || duplicate.winningTeamId || null,
    winnerSide: best.winnerSide || keeper.winnerSide || duplicate.winnerSide || null,
    homeShootoutScore: best.homeShootoutScore ?? keeper.homeShootoutScore ?? duplicate.homeShootoutScore ?? null,
    awayShootoutScore: best.awayShootoutScore ?? keeper.awayShootoutScore ?? duplicate.awayShootoutScore ?? null,
    stage: best.stage || keeper.stage || duplicate.stage || null,
    elapsed: liveStatus ? (best.elapsed || null) : null,
    yahooLastUpdated: best.yahooLastUpdated || keeper.yahooLastUpdated || duplicate.yahooLastUpdated || null,
  };
}

function applyWorldCupFixtureIdRemaps(group, remaps = []) {
  if (!remaps.length) return group;
  const alias = new Map(remaps);
  const resolve = id => {
    let next = id;
    const seen = new Set();
    while (alias.has(next) && !seen.has(next)) {
      seen.add(next);
      next = alias.get(next);
    }
    return next;
  };
  const next = { ...group };
  if (Array.isArray(group.hiddenFixtures)) {
    next.hiddenFixtures = Array.from(new Set(group.hiddenFixtures.map(resolve)));
  }
  if (group.dibsSkips) {
    next.dibsSkips = Object.entries(group.dibsSkips).reduce((acc, [fixtureId, skips]) => {
      const key = resolve(fixtureId);
      acc[key] = Array.from(new Set([...(acc[key] || []), ...(skips || [])]));
      return acc;
    }, {});
  }
  return next;
}

function collapseDuplicateWorldCupFixtures(group = {}) {
  let predictions = group.predictions || {};
  const remaps = [];
  const gameweeks = (group.gameweeks || []).map(gwObj => {
    const out = [];
    const indexByKey = new Map();
    (gwObj.fixtures || []).forEach(fixture => {
      const keys = worldCupFixtureLookupKeys(gwObj.gw, fixture);
      const existing = keys
        .map(key => ({ key, index: indexByKey.get(key) }))
        .find(item => item.index !== undefined && canCollapseWorldCupFixtureByLookupKey(item.key, out[item.index], fixture));
      const existingIndex = existing?.index;
      if (existingIndex === undefined) {
        const nextIndex = out.length;
        out.push(fixture);
        keys.forEach(key => indexByKey.set(key, nextIndex));
        return;
      }

      const current = out[existingIndex];
      const replace = shouldReplaceWorldCupFixtureKeeper(current, fixture, predictions);
      const keeper = replace ? fixture : current;
      const duplicate = replace ? current : fixture;
      if (duplicate.id && keeper.id && duplicate.id !== keeper.id && !worldCupFixtureIdUsedByDifferentMatch(gwObj.gw, gwObj.fixtures || [], duplicate, keeper)) {
        predictions = remapWorldCupPredictionId(predictions, duplicate.id, keeper.id);
        remaps.push([duplicate.id, keeper.id]);
      }
      out[existingIndex] = mergeWorldCupFixtureData(keeper, duplicate);
      worldCupFixtureLookupKeys(gwObj.gw, out[existingIndex]).forEach(key => indexByKey.set(key, existingIndex));
    });
    return { ...gwObj, fixtures: out };
  });

  return applyWorldCupFixtureIdRemaps({ ...group, predictions, gameweeks }, remaps);
}

export function normalizeWorldCupGroup(group = {}) {
  if (!isWorldCupGroupLike(group)) return group;
  const season = Number(group.season) || 2026;
  const gameweeks = resolveWorldCupBracketAdvancement(group.gameweeks || []).map(gwObj => ({
    ...gwObj,
    season: gwObj.season || season,
  }));
  return collapseDuplicateWorldCupFixtures({
    ...group,
    competition: "WC",
    season,
    gameweeks,
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
  const resolvedSeed = parseSeed(fixture?.[`${side}Seed`]);
  const directSeed = parseSeed(source);
  const thirdSeeds = parseThirdSeedList(source);
  const alreadyResolved = resolvedSeed
    && (resolvedSeed === directSeed || thirdSeeds.includes(resolvedSeed))
    && !hasWorldCupSeedPlaceholder(fixture?.[side]);
  if (alreadyResolved) return null;
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

function changedRowPatchForSide(fixture, side, row, seed, originalSeed) {
  const patch = rowPatchForSide(side, row, seed, originalSeed);
  return Object.entries(patch).some(([key, value]) => fixture?.[key] !== value) ? patch : null;
}

function resolveSide(fixture, side, index) {
  const originalSeed = String(sideSeedSource(fixture, side) || "").trim();
  const simpleSeed = parseSeed(originalSeed);
  if (simpleSeed) {
    const row = index.bySeed.get(simpleSeed);
    return row ? changedRowPatchForSide(fixture, side, row, simpleSeed, originalSeed) : null;
  }

  const candidates = parseThirdSeedList(originalSeed);
  if (!candidates.length) return null;

  const oppositeSide = side === "home" ? "away" : "home";
  const oppositeSeed = fixtureSideSeed(fixture, oppositeSide, index);
  const resolvedSeed = oppositeSeed ? index.thirdAssignments[oppositeSeed] : null;
  if (!resolvedSeed || !candidates.includes(resolvedSeed)) return null;

  const row = index.bySeed.get(resolvedSeed);
  return row ? changedRowPatchForSide(fixture, side, row, resolvedSeed, originalSeed) : null;
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
