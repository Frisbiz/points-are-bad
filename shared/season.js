// Premier League and La Liga seasons are named for the year in which they
// start. July is the handoff point: by then the previous campaign is over and
// the upcoming season's fixtures are the ones new groups should use.
export const LEAGUE_SEASON_ROLLOVER_MONTH = 6;

export function getCurrentLeagueSeason(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date");
  const year = value.getUTCFullYear();
  return value.getUTCMonth() >= LEAGUE_SEASON_ROLLOVER_MONTH ? year : year - 1;
}

export const CURRENT_LEAGUE_SEASON = getCurrentLeagueSeason();
