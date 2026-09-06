// Domestic league and UEFA club seasons are named for the year in which they
// start. July is the handoff point: by then the previous campaign is over and
// the upcoming season's fixtures are the ones new groups should use.
export const LEAGUE_SEASON_ROLLOVER_MONTH = 6;

export const LEAGUE_COMPETITIONS = ["PL", "LL", "CL"];
export const COMPETITION_ROUNDS = {
  PL: 38,
  LL: 38,
  CL: 8,
  WC: 8,
};

export const COMPETITION_FIXTURE_COUNTS = {
  PL: 10,
  LL: 10,
  CL: 18,
};

export const FOOTBALL_DATA_COMPETITION_MAP = {
  PL: "PL",
  LL: "PD",
  CL: "CL",
  WC: "WC",
};

export function normalizeCompetition(competition, fallback = "PL") {
  const comp = String(competition || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(COMPETITION_ROUNDS, comp) ? comp : fallback;
}

export function isLeagueCompetition(competition) {
  return LEAGUE_COMPETITIONS.includes(normalizeCompetition(competition, ""));
}

export function competitionRoundCount(competition) {
  return COMPETITION_ROUNDS[normalizeCompetition(competition)] || COMPETITION_ROUNDS.PL;
}

export function competitionFixtureCount(competition) {
  return COMPETITION_FIXTURE_COUNTS[normalizeCompetition(competition)] || COMPETITION_FIXTURE_COUNTS.PL;
}

export function footballDataCompetitionCode(competition) {
  const comp = normalizeCompetition(competition);
  return FOOTBALL_DATA_COMPETITION_MAP[comp] || comp;
}

export function competitionFixtureCacheKey(competition, season) {
  const comp = normalizeCompetition(competition);
  if (comp === "WC") return "fixtures:WC:2026";
  const leagueComp = isLeagueCompetition(comp) ? comp : "PL";
  return `fixtures:${leagueComp}:${season || CURRENT_LEAGUE_SEASON}`;
}

export function getCurrentLeagueSeason(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date");
  const year = value.getUTCFullYear();
  return value.getUTCMonth() >= LEAGUE_SEASON_ROLLOVER_MONTH ? year : year - 1;
}

export const CURRENT_LEAGUE_SEASON = getCurrentLeagueSeason();
