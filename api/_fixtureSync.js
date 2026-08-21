import { applyKnownWorldCupKnockoutSchedule, isWorldCupGroupLike, normalizeWorldCupGroup } from "./_wcBracket.js";

export const TEAM_NAME_MAP = {
  // Premier League - with and without FC suffix (API returns both forms)
  "Wolverhampton Wanderers FC": "Wolves",
  "Wolverhampton Wanderers": "Wolves",
  "Wolverhampton": "Wolves",
  "Tottenham Hotspur FC": "Spurs",
  "Tottenham Hotspur": "Spurs",
  "Spurs": "Spurs",
  "Manchester United FC": "Man Utd",
  "Manchester United": "Man Utd",
  "Manchester City FC": "Man City",
  "Manchester City": "Man City",
  "Newcastle United FC": "Newcastle",
  "Newcastle United": "Newcastle",
  "Nottingham Forest FC": "Nott'm Forest",
  "Nottingham Forest": "Nott'm Forest",
  "Brighton & Hove Albion FC": "Brighton",
  "Brighton & Hove Albion": "Brighton",
  "West Ham United FC": "West Ham",
  "West Ham United": "West Ham",
  "Ipswich Town FC": "Ipswich",
  "Ipswich Town": "Ipswich",
  "Leicester City FC": "Leicester",
  "Leicester City": "Leicester",
  "AFC Bournemouth": "Bournemouth",
  "Bournemouth FC": "Bournemouth",
  "Leeds United FC": "Leeds",
  "Leeds United": "Leeds",
  "Sunderland AFC": "Sunderland",
  "Burnley FC": "Burnley",
  "Arsenal FC": "Arsenal",
  "Aston Villa FC": "Aston Villa",
  "Brentford FC": "Brentford",
  "Chelsea FC": "Chelsea",
  "Crystal Palace FC": "Crystal Palace",
  "Everton FC": "Everton",
  "Fulham FC": "Fulham",
  "Liverpool FC": "Liverpool",
  "Southampton FC": "Southampton",
  // Championship / other English clubs
  "Sheffield United FC": "Sheffield Utd",
  "Sheffield United": "Sheffield Utd",
  "Luton Town FC": "Luton",
  "Luton Town": "Luton",
  "Huddersfield Town FC": "Huddersfield",
  "Huddersfield Town": "Huddersfield",
  "Norwich City FC": "Norwich",
  "Norwich City": "Norwich",
  "Cardiff City FC": "Cardiff",
  "Cardiff City": "Cardiff",
  "Coventry City FC": "Coventry",
  "Coventry City": "Coventry",
  "Birmingham City FC": "Birmingham",
  "Birmingham City": "Birmingham",
  "Stoke City FC": "Stoke",
  "Stoke City": "Stoke",
  "Swansea City AFC": "Swansea",
  "Swansea City": "Swansea",
  "Hull City FC": "Hull",
  "Hull City": "Hull",
  "Bristol City FC": "Bristol City",
  "Bristol City": "Bristol City",
  "West Bromwich Albion FC": "West Brom",
  "West Bromwich Albion": "West Brom",
  "Queens Park Rangers": "QPR",
  "Preston North End": "Preston",
  "Blackburn Rovers FC": "Blackburn",
  "Blackburn Rovers": "Blackburn",
  "Middlesbrough FC": "Boro",
  "Middlesbrough": "Boro",
  // La Liga
  "Real Madrid CF": "Real Madrid",
  "FC Barcelona": "Barcelona",
  "Club Atlético de Madrid": "Atletico Madrid",
  "Atlético de Madrid": "Atletico Madrid",
  "Girona FC": "Girona",
  "Athletic Club": "Athletic Bilbao",
  "Real Sociedad de Fútbol": "Real Sociedad",
  "Real Sociedad": "Real Sociedad",
  "Real Betis Balompié": "Real Betis",
  "Real Betis": "Real Betis",
  "Villarreal CF": "Villarreal",
  "Getafe CF": "Getafe",
  "CA Osasuna": "Osasuna",
  "Sevilla FC": "Sevilla",
  "RC Celta de Vigo": "Celta Vigo",
  "Celta de Vigo": "Celta Vigo",
  "Valencia CF": "Valencia",
  "RCD Mallorca": "Mallorca",
  "UD Las Palmas": "Las Palmas",
  "Rayo Vallecano de Madrid": "Rayo Vallecano",
  "Rayo Vallecano": "Rayo Vallecano",
  "RCD Espanyol de Barcelona": "Espanyol",
  "RCD Espanyol": "Espanyol",
  "CD Leganés": "Leganes",
  "Leganés": "Leganes",
  "Real Valladolid CF": "Valladolid",
  "Real Valladolid": "Valladolid",
  "Deportivo Alavés": "Alaves",
  "Alavés": "Alaves",
  "Real Zaragoza": "Zaragoza",
  "Levante UD": "Levante",
  "SD Eibar": "Eibar",
  "Granada CF": "Granada",
  "Cádiz CF": "Cadiz",
  "UD Almería": "Almeria",
  "Elche CF": "Elche",
  "Real Oviedo": "Oviedo",
  "Racing de Santander": "Racing",
  "R. Racing Club": "Real Racing Club de Santander",
  "Racing Santander": "Real Racing Club de Santander",
  "RC Deportivo": "RC Deportivo La Coruña",
  "Sporting de Gijón": "Sporting Gijon",
  "Real Sporting de Gijón": "Sporting Gijon",
  "SD Huesca": "Huesca",
  "CD Tenerife": "Tenerife",
  "Deportivo de La Coruña": "Deportivo",
  // European clubs
  "Paris Saint-Germain": "PSG",
  "Internazionale": "Inter",
  "Inter Milan": "Inter",
  "Bayern München": "Bayern",
  "Borussia Mönchengladbach": "Gladbach",
  // International aliases
  "Bosnia and Herzegovina": "Bosnia-Herzegovina",
  "Bosnia & Herzegovina": "Bosnia-Herzegovina",
  "Cape Verde Islands": "Cape Verde",
  "Cabo Verde": "Cape Verde",
  "Korea Republic": "South Korea",
  "United States": "USA",
  "United States of America": "USA",
  "Congo DR": "DR Congo",
  "Congo, DR": "DR Congo",
  "Cote d'Ivoire": "Ivory Coast",
  "Côte d'Ivoire": "Ivory Coast",
  "Cura\u00e7ao": "Curacao",
  "Cura\u00c3\u00a7ao": "Curacao",
  "Cura?ao": "Curacao",
  "Turkiye": "Turkey",
  "Türkiye": "Turkey",
};

export function normName(n) {
  return TEAM_NAME_MAP[n] || n?.replace(/ FC$/, '').replace(/ AFC$/, '') || n;
}

function teamKey(n) {
  return normName(n)
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase() || '';
}

function fixturePairKey(f) {
  return `${teamKey(f.home)}|${teamKey(f.away)}`;
}

const LA_LIGA_2026_CONFIRMED_KICKOFFS = [
  // GW1: current confirmed slots. Celta-Osasuna was postponed from Aug 16 to Aug 27.
  [1, "Alaves", "Getafe", "2026-08-15T17:30:00.000Z"],
  [1, "Sevilla", "Rayo Vallecano", "2026-08-15T19:30:00.000Z"],
  [1, "Real Racing Club de Santander", "Villarreal", "2026-08-16T15:00:00.000Z"],
  [1, "Espanyol", "Levante", "2026-08-16T17:00:00.000Z"],
  [1, "RC Deportivo La Coruña", "Elche", "2026-08-17T19:00:00.000Z"],
  [1, "Atletico Madrid", "Málaga CF", "2026-08-19T19:00:00.000Z"],
  [1, "Valencia", "Real Betis", "2026-08-25T19:00:00.000Z"],
  [1, "Real Madrid", "Real Sociedad", "2026-08-26T19:00:00.000Z"],
  [1, "Celta Vigo", "Osasuna", "2026-08-27T18:30:00.000Z"],
  [1, "Barcelona", "Athletic Bilbao", "2026-08-27T19:00:00.000Z"],

  [2, "Rayo Vallecano", "Alaves", "2026-08-20T19:00:00.000Z"],
  [2, "Real Betis", "Real Sociedad", "2026-08-21T19:00:00.000Z"],
  [2, "Athletic Bilbao", "Sevilla", "2026-08-22T15:00:00.000Z"],
  [2, "Valencia", "Celta Vigo", "2026-08-22T17:30:00.000Z"],
  [2, "Espanyol", "Real Madrid", "2026-08-22T19:30:00.000Z"],
  [2, "Atletico Madrid", "Villarreal", "2026-08-23T15:00:00.000Z"],
  [2, "Getafe", "Real Racing Club de Santander", "2026-08-23T17:30:00.000Z"],
  [2, "Elche", "Barcelona", "2026-08-23T19:30:00.000Z"],
  [2, "Osasuna", "Levante", "2026-08-24T17:30:00.000Z"],
  [2, "Málaga CF", "RC Deportivo La Coruña", "2026-08-24T19:30:00.000Z"],

  [3, "Real Racing Club de Santander", "Elche", "2026-08-28T17:00:00.000Z"],
  [3, "Alaves", "Villarreal", "2026-08-28T19:30:00.000Z"],
  [3, "Levante", "Real Betis", "2026-08-29T15:00:00.000Z"],
  [3, "Real Sociedad", "Espanyol", "2026-08-29T17:00:00.000Z"],
  [3, "Sevilla", "Atletico Madrid", "2026-08-29T19:30:00.000Z"],
  [3, "Real Madrid", "Málaga CF", "2026-08-30T15:00:00.000Z"],
  [3, "RC Deportivo La Coruña", "Valencia", "2026-08-30T17:30:00.000Z"],
  [3, "Celta Vigo", "Athletic Bilbao", "2026-08-30T19:30:00.000Z"],
  [3, "Osasuna", "Getafe", "2026-08-31T17:30:00.000Z"],
  [3, "Barcelona", "Rayo Vallecano", "2026-08-31T19:30:00.000Z"],

  [4, "Real Betis", "Real Madrid", "2026-09-04T19:00:00.000Z"],
  [4, "Athletic Bilbao", "Atletico Madrid", "2026-09-05T14:15:00.000Z"],
  [4, "Rayo Vallecano", "Real Racing Club de Santander", "2026-09-05T16:30:00.000Z"],
  [4, "Villarreal", "RC Deportivo La Coruña", "2026-09-05T19:00:00.000Z"],
  [4, "Valencia", "Barcelona", "2026-09-06T14:15:00.000Z"],
  [4, "Alaves", "Osasuna", "2026-09-06T16:30:00.000Z"],
  [4, "Málaga CF", "Levante", "2026-09-06T16:30:00.000Z"],
  [4, "Espanyol", "Sevilla", "2026-09-06T19:00:00.000Z"],
  [4, "Getafe", "Celta Vigo", "2026-09-07T17:00:00.000Z"],
  [4, "Elche", "Real Sociedad", "2026-09-07T19:30:00.000Z"],
];

const LA_LIGA_2026_KICKOFF_BY_MATCH = new Map(
  LA_LIGA_2026_CONFIRMED_KICKOFFS.map(([gw, home, away, date]) => [`${gw}|${teamKey(home)}|${teamKey(away)}`, date])
);

const LEAGUE_SCHEDULE_REFRESH_MS = 12 * 60 * 60 * 1000;

function confirmedLeagueKickoffDate(fixture, gw, competition, season) {
  if (competition !== 'LL' || Number(season) !== 2026) return null;
  return LA_LIGA_2026_KICKOFF_BY_MATCH.get(`${Number(gw)}|${fixturePairKey(fixture)}`) || null;
}

function isScheduledWithoutResult(fixture) {
  if (fixture?.result) return false;
  const status = normalizeFixtureStatus(fixture?.status);
  return !status || status === 'SCHEDULED' || status === 'TIMED';
}

function isLikelyFootballDataPlaceholderDate(value) {
  if (!value) return false;
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return false;
  return date.getUTCDay() === 0
    && date.getUTCHours() === 15
    && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0;
}

function placeholderDateForGameweek(fixtures = []) {
  const datedScheduled = fixtures
    .filter(isScheduledWithoutResult)
    .map(f => f.date)
    .filter(Boolean);
  if (datedScheduled.length < 6) return null;
  const counts = new Map();
  datedScheduled.forEach(date => counts.set(date, (counts.get(date) || 0) + 1));
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!dominant || dominant[1] < Math.min(6, datedScheduled.length)) return null;
  return isLikelyFootballDataPlaceholderDate(dominant[0]) ? dominant[0] : null;
}

function normalizeLeagueGameweekFixtures(fixtures = [], gw, competition = 'PL', season = null) {
  if (competition !== 'LL' || Number(season) !== 2026) return { fixtures, changed: false };
  const placeholderDate = placeholderDateForGameweek(fixtures);
  let changed = false;
  const normalized = fixtures.map(fixture => {
    const confirmedDate = confirmedLeagueKickoffDate(fixture, gw, competition, season);
    if (confirmedDate && fixture.date !== confirmedDate) {
      changed = true;
      return { ...fixture, date: confirmedDate };
    }
    if (!confirmedDate && placeholderDate && fixture.date === placeholderDate && isScheduledWithoutResult(fixture)) {
      changed = true;
      return { ...fixture, date: null, dateTbd: true };
    }
    return fixture;
  });
  return { fixtures: normalized, changed };
}

function inferLeagueSeasonFromMatches(matches = []) {
  const explicit = matches.find(m => m?.season?.startDate)?.season?.startDate;
  if (explicit) {
    const year = Number(String(explicit).slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  const dated = matches.find(m => m?.utcDate)?.utcDate;
  if (!dated) return null;
  const date = new Date(dated);
  const year = date.getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

export function normalizeLeagueFixtureDoc(doc, competition = doc?.competition || 'PL', season = doc?.season || null) {
  if (!doc || competition !== 'LL' || Number(season) !== 2026 || !Array.isArray(doc.gameweeks)) return doc;
  let changed = false;
  const gameweeks = doc.gameweeks.map(gwObj => {
    const normalized = normalizeLeagueGameweekFixtures(gwObj.fixtures || [], gwObj.gw, competition, gwObj.season || season);
    if (!normalized.changed) return gwObj;
    changed = true;
    return { ...gwObj, fixtures: normalized.fixtures };
  });
  return changed ? { ...doc, gameweeks } : doc;
}

export function normalizeFootballDataMatches(matches = [], matchday = null, competition = 'PL', season = null) {
  const normalizedSeason = Number(season) || inferLeagueSeasonFromMatches(matches);
  if (competition !== 'LL' || Number(normalizedSeason) !== 2026 || !Array.isArray(matches) || !matches.length) return matches;
  const byGW = new Map();
  matches.forEach((match, index) => {
    const gw = Number(match.matchday || matchday);
    if (!Number.isFinite(gw)) return;
    if (!byGW.has(gw)) byGW.set(gw, []);
    byGW.get(gw).push({ match, index });
  });
  if (!byGW.size) return matches;

  let changed = false;
  const next = [...matches];
  byGW.forEach((entries, gw) => {
    const fixtureRows = entries.map(({ match }) => ({
      apiId: match.id,
      home: normName(match.homeTeam?.name || match.homeTeam?.shortName),
      away: normName(match.awayTeam?.name || match.awayTeam?.shortName),
      status: normalizeFixtureStatus(match.status),
      result: null,
      date: match.utcDate ? new Date(match.utcDate).toISOString() : null,
    }));
    const normalized = normalizeLeagueGameweekFixtures(fixtureRows, gw, competition, normalizedSeason);
    normalized.fixtures.forEach((fixture, entryIndex) => {
      const { match, index } = entries[entryIndex];
      const currentDate = match.utcDate ? new Date(match.utcDate).toISOString() : null;
      if (fixture.date === currentDate) return;
      changed = true;
      next[index] = { ...match, utcDate: fixture.date };
    });
  });
  return changed ? next : matches;
}

function fixtureDateKey(f) {
  if (f?.yahooDate) return String(f.yahooDate).slice(0, 10);
  if (!f?.date) return '';
  const time = new Date(f.date).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(time).toISOString().slice(0, 16);
}

export function fixtureDedupeKey(f) {
  const pair = fixturePairKey(f);
  if (!pair || pair === '|') return String(f?.apiId || f?.id || '');
  const date = fixtureDateKey(f);
  return date ? `${pair}|${date}` : pair;
}

function fixtureLookupKeys(f) {
  const pair = fixturePairKey(f);
  const keys = [];
  const dated = fixtureDedupeKey(f);
  if (dated) keys.push(dated);
  if (pair && pair !== '|' && pair !== dated) keys.push(pair);
  if (f?.apiId) keys.push(`api:${f.apiId}`);
  return keys;
}

function fixtureStatusRank(status) {
  switch (status) {
    case 'FINISHED': return 5;
    case 'LIVE': return 4;
    case 'IN_PLAY': return 4;
    case 'PAUSED': return 3;
    case 'POSTPONED': return 2;
    case 'DELAYED': return 2;
    case 'TIMED': return 1;
    case 'SCHEDULED': return 1;
    default: return 0;
  }
}

function normalizeFixtureStatus(status) {
  return status === 'LIVE' ? 'IN_PLAY' : status;
}

function isLiveFixtureStatus(status) {
  const normalized = normalizeFixtureStatus(status);
  return normalized === 'IN_PLAY' || normalized === 'PAUSED';
}

function fixtureDataScore(f) {
  if (!f) return -1;
  return fixtureStatusRank(f.status) * 10
    + (f.result ? 6 : 0)
    + (f.liveScore ? 4 : 0)
    + (f.winningTeamId || f.winnerSide ? 1 : 0)
    + (f.homeShootoutScore !== null && f.homeShootoutScore !== undefined ? 1 : 0)
    + (f.awayShootoutScore !== null && f.awayShootoutScore !== undefined ? 1 : 0)
    + (f.date ? 2 : 0)
    + (f.apiId ? 1 : 0)
    + (f.homeCrest ? 1 : 0)
    + (f.awayCrest ? 1 : 0);
}

function fixtureFreshnessTime(f) {
  if (!f?.yahooLastUpdated) return 0;
  const raw = String(f.yahooLastUpdated);
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function betterFixtureData(a, b) {
  const aScore = fixtureDataScore(a);
  const bScore = fixtureDataScore(b);
  if (bScore !== aScore) return bScore > aScore ? b : a;
  const aFresh = fixtureFreshnessTime(a);
  const bFresh = fixtureFreshnessTime(b);
  if (bFresh !== aFresh) return bFresh > aFresh ? b : a;
  return b;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function fixturePickCount(predictions, fixtureId) {
  if (!fixtureId) return 0;
  return Object.values(predictions || {}).reduce((count, picks) => count + (hasOwn(picks, fixtureId) ? 1 : 0), 0);
}

function remapPredictionId(predictions, fromId, toId) {
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

function shouldReplaceFixtureKeeper(current, candidate, predictions) {
  const currentPicks = fixturePickCount(predictions, current?.id);
  const candidatePicks = fixturePickCount(predictions, candidate?.id);
  if (currentPicks !== candidatePicks) return candidatePicks > currentPicks;
  return fixtureDataScore(candidate) > fixtureDataScore(current);
}

function isUnresolvedTeamSlot(value) {
  const raw = String(value || '').trim().toUpperCase();
  return !raw
    || raw === 'TBD'
    || /^[WL]\d+$/.test(raw)
    || /^\d[A-L]$/.test(raw)
    || /^3[A-L](?:\/3[A-L])+$/.test(raw);
}

function mergeTeamName(keeperValue, duplicateValue, bestValue) {
  if (isUnresolvedTeamSlot(keeperValue) && !isUnresolvedTeamSlot(duplicateValue)) return duplicateValue;
  if (isUnresolvedTeamSlot(duplicateValue) && !isUnresolvedTeamSlot(keeperValue)) return keeperValue;
  return bestValue || keeperValue || duplicateValue;
}

function mergeFixtureData(keeper, duplicate) {
  const best = betterFixtureData(keeper, duplicate);
  const liveStatus = isLiveFixtureStatus(best.status);
  return {
    ...keeper,
    apiId: best.apiId || keeper.apiId || duplicate.apiId,
    home: normName(mergeTeamName(keeper.home, duplicate.home, best.home)),
    away: normName(mergeTeamName(keeper.away, duplicate.away, best.away)),
    result: best.result ?? keeper.result ?? duplicate.result ?? null,
    status: normalizeFixtureStatus(best.status || keeper.status || duplicate.status),
    date: best.date || keeper.date || duplicate.date || null,
    liveScore: liveStatus ? (best.liveScore || null) : null,
    yahooDate: best.yahooDate || keeper.yahooDate || duplicate.yahooDate || null,
    homeTeamId: best.homeTeamId || keeper.homeTeamId || duplicate.homeTeamId || null,
    awayTeamId: best.awayTeamId || keeper.awayTeamId || duplicate.awayTeamId || null,
    winningTeamId: best.winningTeamId || keeper.winningTeamId || duplicate.winningTeamId || null,
    winnerSide: best.winnerSide || keeper.winnerSide || duplicate.winnerSide || null,
    homeShootoutScore: best.homeShootoutScore ?? keeper.homeShootoutScore ?? duplicate.homeShootoutScore ?? null,
    awayShootoutScore: best.awayShootoutScore ?? keeper.awayShootoutScore ?? duplicate.awayShootoutScore ?? null,
    homeSeed: best.homeSeed || keeper.homeSeed || duplicate.homeSeed || null,
    awaySeed: best.awaySeed || keeper.awaySeed || duplicate.awaySeed || null,
    homeOriginalSeed: best.homeOriginalSeed || keeper.homeOriginalSeed || duplicate.homeOriginalSeed || null,
    awayOriginalSeed: best.awayOriginalSeed || keeper.awayOriginalSeed || duplicate.awayOriginalSeed || null,
    homeCrest: best.homeCrest || keeper.homeCrest || duplicate.homeCrest || null,
    awayCrest: best.awayCrest || keeper.awayCrest || duplicate.awayCrest || null,
    stage: best.stage || keeper.stage || duplicate.stage || null,
    elapsed: liveStatus ? (best.elapsed || null) : null,
    yahooLastUpdated: best.yahooLastUpdated || keeper.yahooLastUpdated || duplicate.yahooLastUpdated || null,
  };
}

function dedupeFixtureList(fixtures = [], predictions = null) {
  const out = [];
  const indexByKey = new Map();
  let nextPredictions = predictions;
  const remaps = [];
  let changed = false;

  fixtures.forEach(fixture => {
    const keys = fixtureLookupKeys(fixture);
    const existingIndex = keys.map(key => indexByKey.get(key)).find(idx => idx !== undefined);
    if (existingIndex === undefined) {
      const nextIndex = out.length;
      out.push(fixture);
      keys.forEach(key => indexByKey.set(key, nextIndex));
      return;
    }

    changed = true;
    const current = out[existingIndex];
    const replace = shouldReplaceFixtureKeeper(current, fixture, nextPredictions);
    const keeper = replace ? fixture : current;
    const duplicate = replace ? current : fixture;
    if (duplicate.id && keeper.id && duplicate.id !== keeper.id) {
      nextPredictions = remapPredictionId(nextPredictions, duplicate.id, keeper.id);
      remaps.push([duplicate.id, keeper.id]);
    }
    out[existingIndex] = mergeFixtureData(keeper, duplicate);
    fixtureLookupKeys(out[existingIndex]).forEach(key => indexByKey.set(key, existingIndex));
  });

  return { fixtures: out, predictions: nextPredictions, remaps, changed };
}

export function dedupeFixtures(fixtures = []) {
  return dedupeFixtureList(fixtures).fixtures;
}

function liveMatchScoreline(match) {
  if (match?.status !== 'finished') return null;
  const home = Number(match.homeScore);
  const away = Number(match.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return `${home}-${away}`;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sideFromWinningTeamId(winningTeamId, fixture) {
  const winnerId = String(winningTeamId || '').trim();
  if (!winnerId) return null;
  if (String(fixture?.homeTeamId || '') === winnerId) return 'home';
  if (String(fixture?.awayTeamId || '') === winnerId) return 'away';
  return null;
}

function knockoutWinnerPatch(match, fixture) {
  const patch = {};
  const winningTeamId = match?.winningTeamId || match?.winnerTeamId || null;
  const explicitSide = String(match?.winnerSide || match?.winningSide || '').trim().toLowerCase();
  const homeShootoutScore = optionalNumber(match?.homeShootoutScore ?? match?.homePenaltyScore);
  const awayShootoutScore = optionalNumber(match?.awayShootoutScore ?? match?.awayPenaltyScore);

  if (winningTeamId) patch.winningTeamId = winningTeamId;
  if (homeShootoutScore !== null) patch.homeShootoutScore = homeShootoutScore;
  if (awayShootoutScore !== null) patch.awayShootoutScore = awayShootoutScore;
  if (explicitSide === 'home' || explicitSide === 'away') {
    patch.winnerSide = explicitSide;
  } else {
    const metadataSide = sideFromWinningTeamId(winningTeamId, fixture);
    if (metadataSide) patch.winnerSide = metadataSide;
    else if (homeShootoutScore !== null && awayShootoutScore !== null && homeShootoutScore !== awayShootoutScore) {
      patch.winnerSide = homeShootoutScore > awayShootoutScore ? 'home' : 'away';
    }
  }

  return patch;
}

function patchChangesFixture(fixture, patch) {
  return Object.entries(patch).some(([key, value]) => fixture?.[key] !== value);
}

function fixtureDateOnly(value) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(time).toISOString().slice(0, 10);
}

function liveMatchFitsFixture(fixture, match) {
  const fixtureDate = fixtureDateOnly(fixture.date || fixture.yahooDate);
  const matchDate = fixtureDateOnly(match.startTime);
  return !fixtureDate || !matchDate || fixtureDate === matchDate;
}

export function applyFinishedLiveMatchesToGlobalDoc(globalDoc = {}, targetGW, matches = [], now = Date.now()) {
  const target = Number(targetGW || 1);
  const finishedByPair = new Map();
  matches.forEach(match => {
    const result = liveMatchScoreline(match);
    if (!result) return;
    const pair = fixturePairKey(match);
    if (!pair || pair === '|') return;
    if (!finishedByPair.has(pair)) finishedByPair.set(pair, []);
    finishedByPair.get(pair).push({ ...match, result });
  });
  if (!finishedByPair.size) return { globalDoc, changed: false };

  let changed = false;
  const gameweeks = (globalDoc.gameweeks || []).map(gwObj => {
    if (Number(gwObj.gw) !== target) return gwObj;
    let gwChanged = false;
    const fixtures = (gwObj.fixtures || []).map(fixture => {
      const candidates = finishedByPair.get(fixturePairKey(fixture)) || [];
      const match = candidates.find(m => liveMatchFitsFixture(fixture, m));
      if (!match) return fixture;
      const finishedPatch = {
        status: 'FINISHED',
        liveScore: null,
        elapsed: match.elapsed || fixture.elapsed || null,
        ...knockoutWinnerPatch(match, fixture),
      };
      if (fixture.result) {
        if (!patchChangesFixture(fixture, finishedPatch)) return fixture;
        gwChanged = true;
        changed = true;
        return { ...fixture, ...finishedPatch };
      }
      const next = {
        ...fixture,
        result: match.result,
        ...finishedPatch,
      };
      gwChanged = true;
      changed = true;
      return next;
    });
    return gwChanged ? { ...gwObj, fixtures } : gwObj;
  });

  return changed
    ? { globalDoc: { ...globalDoc, updatedAt: now, gameweeks }, changed: true }
    : { globalDoc, changed: false };
}

function applyFixtureIdRemaps(group, remaps = []) {
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

export function dedupeGroupFixtures(g) {
  const originalPredictions = g.predictions || {};
  let predictions = originalPredictions;
  const remaps = [];
  let changed = false;
  const gameweeks = (g.gameweeks || []).map(gwObj => {
    const cleaned = dedupeFixtureList(gwObj.fixtures || [], predictions);
    predictions = cleaned.predictions || predictions;
    remaps.push(...cleaned.remaps);
    if (!cleaned.changed) return gwObj;
    changed = true;
    return { ...gwObj, fixtures: cleaned.fixtures };
  });
  if (!changed && predictions === originalPredictions) return g;
  return applyFixtureIdRemaps({ ...g, gameweeks, predictions }, remaps);
}

export function parseMatchesToFixtures(matches, matchday, competition = 'PL', season = null) {
  const isWC = competition === 'WC';
  const fixtures = matches.map((m, i) => {
    const home = normName(m.homeTeam?.name || m.homeTeam?.shortName);
    const away = normName(m.awayTeam?.name || m.awayTeam?.shortName);
    const status = normalizeFixtureStatus(m.status);
    let result = null;
    if (status === 'FINISHED') {
      const isKnockout = isWC && m.stage && m.stage !== 'GROUP_STAGE';
      const scoreObj = isKnockout && m.score?.extraTime?.home != null ? m.score.extraTime : m.score?.fullTime;
      if (scoreObj) {
        const { home: h, away: a } = scoreObj;
        if (h !== null && a !== null) result = `${h}-${a}`;
      }
    }
    const date = m.utcDate ? new Date(m.utcDate) : null;
    const scoreObj = m.score?.fullTime;
    const liveScore = isLiveFixtureStatus(status) && scoreObj?.home != null && scoreObj?.away != null ? `${scoreObj.home}-${scoreObj.away}` : null;
    const id = isWC ? `wc-gw${matchday}-f${m.id || i}` : `gw${matchday}-f${m.id || i}`;
    const base = { id, apiId: m.id, home, away, result, status, date: date ? date.toISOString() : null, liveScore };
    if (competition !== 'PL') {
      base.homeCrest = m.homeTeam?.crest || null;
      base.awayCrest = m.awayTeam?.crest || null;
    }
    if (isWC) {
      base.stage = m.stage || null;
    }
    return base;
  });
  const normalizedSeason = Number(season) || inferLeagueSeasonFromMatches(matches);
  return normalizeLeagueGameweekFixtures(fixtures, matchday, competition, normalizedSeason).fixtures;
}

export function mergeGlobalIntoGroup(globalDoc, g) {
  const groupIsWC = isWorldCupGroupLike(g);
  const globalDocIsWC = isWorldCupGroupLike(globalDoc);
  if (groupIsWC !== globalDocIsWC) return g;

  const group = groupIsWC ? normalizeWorldCupGroup(g) : g;
  const normalizedGlobalDoc = groupIsWC
    ? { ...globalDoc, gameweeks: applyKnownWorldCupKnockoutSchedule(globalDoc.gameweeks || []) }
    : normalizeLeagueFixtureDoc(globalDoc, group.competition || 'PL', group.season || globalDoc?.season || 2025);
  const seas = group.season || 2025;
  let predictions = group.predictions || {};
  const remaps = [];
  const globalGWMap = {};
  (normalizedGlobalDoc.gameweeks || []).filter(gwObj => (gwObj.season || seas) === seas).forEach(gwObj => { globalGWMap[gwObj.gw] = dedupeFixtures(gwObj.fixtures || []); });
  const hasPick = id => Object.values(predictions).some(up => up[id] !== undefined);
  const updatedGameweeks = (group.gameweeks || []).map(gwObj => {
    if ((gwObj.season || seas) !== seas) return gwObj;
    const globalFixtures = globalGWMap[gwObj.gw];
    if (!globalFixtures || !globalFixtures.length) return gwObj;
    const cleanedOld = dedupeFixtureList(gwObj.fixtures || [], predictions);
    predictions = cleanedOld.predictions || predictions;
    remaps.push(...cleanedOld.remaps);
    const oldFixtures = cleanedOld.fixtures;
    const gwHasPicks = oldFixtures.some(f => hasPick(f.id));
    if (!gwHasPicks) return { ...gwObj, fixtures: globalFixtures };
    const oldByApiId = {};
    const oldByMatch = {};
    const oldByTeams = {};
    oldFixtures.forEach(f => {
      if (f.apiId) oldByApiId[String(f.apiId)] = f;
      oldByMatch[fixtureDedupeKey(f)] = f;
      oldByTeams[fixturePairKey(f)] = f;
    });
    const working = [...oldFixtures];
    const toAdd = [];
    globalFixtures.forEach(gf => {
      const byApi = gf.apiId && oldByApiId[String(gf.apiId)];
      const byMatch = oldByMatch[fixtureDedupeKey(gf)];
      const byTeams = oldByTeams[fixturePairKey(gf)];
      const existing = [byApi, byMatch, byTeams].filter(Boolean).sort((a, b) => fixturePickCount(predictions, b.id) - fixturePickCount(predictions, a.id))[0];
      if (existing) {
        const idx = working.findIndex(f => f.id === existing.id);
        if (idx >= 0) working[idx] = mergeFixtureData(existing, gf);
      } else {
        toAdd.push(gf);
      }
    });
    return { ...gwObj, fixtures: [...working, ...toAdd] };
  });
  if (isWorldCupGroupLike(group)) {
    return applyFixtureIdRemaps({ ...group, gameweeks: updatedGameweeks, predictions, lastAutoSync: Date.now() }, remaps);
  }
  const globalPairToGW = {};
  (normalizedGlobalDoc.gameweeks || []).forEach(gwObj => {
    (gwObj.fixtures || []).forEach(f => { globalPairToGW[fixturePairKey(f)] = gwObj.gw; });
  });
  const deduped = updatedGameweeks.map(gwObj => {
    if ((gwObj.season || seas) !== seas) return gwObj;
    const filtered = (gwObj.fixtures || []).filter(f => {
      const globalGW = globalPairToGW[fixturePairKey(f)];
      if (globalGW === undefined || globalGW === gwObj.gw) return true;
      return hasPick(f.id);
    });
    return { ...gwObj, fixtures: filtered };
  });
  const merged = applyFixtureIdRemaps({ ...group, gameweeks: deduped, predictions, lastAutoSync: Date.now() }, remaps);
  return normalizeLeagueFixtureDoc(merged, merged.competition || 'PL', seas);
}

function hasUnconfirmedLeagueSchedule(globalDoc = {}, competition = 'PL', season = null) {
  if (competition !== 'LL' || Number(season || globalDoc.season) !== 2026) return false;
  return (globalDoc.gameweeks || []).some(gwObj => {
    const fixtures = gwObj.fixtures || [];
    if (!fixtures.length) return true;
    if (placeholderDateForGameweek(fixtures)) return true;
    return fixtures.some(f => isScheduledWithoutResult(f) && !f.date);
  });
}

export function shouldHydrateLeagueSeason(globalDoc = {}, targetGW = 1, options = {}) {
  const gameweeks = globalDoc.gameweeks || [];
  const existingGWNums = new Set(gameweeks.map(g => Number(g.gw)).filter(Number.isFinite));
  const target = Math.max(1, Number(targetGW) || 1);
  const missingPast = Array.from({ length: target - 1 }, (_, i) => i + 1).some(gw => !existingGWNums.has(gw));
  const hasFullSchedule = existingGWNums.size >= 38 && gameweeks.every(gw => (gw.fixtures || []).length > 0);
  if (missingPast || !hasFullSchedule) return true;
  const competition = options.competition || globalDoc.competition || 'PL';
  const season = options.season || globalDoc.season || null;
  if (hasUnconfirmedLeagueSchedule(globalDoc, competition, season)) {
    const now = Number(options.now ?? Date.now());
    const updatedAt = Number(globalDoc.updatedAt || 0);
    return !updatedAt || now - updatedAt >= LEAGUE_SCHEDULE_REFRESH_MS;
  }
  return false;
}

export function regroupGlobalDoc(globalDoc, gwNum, newFixtures) {
  newFixtures = dedupeFixtures(newFixtures);
  const otherGWs = (globalDoc.gameweeks || []).filter(g => g.gw !== gwNum);
  const dates = newFixtures.filter(f => f.date).map(f => new Date(f.date).getTime()).sort((a, b) => a - b);
  if (dates.length < 3) {
    return { ...globalDoc, updatedAt: Date.now(), gameweeks: [...otherGWs, { gw: gwNum, fixtures: newFixtures }] };
  }
  const median = dates[Math.floor(dates.length / 2)];
  const THRESHOLD = 14 * 24 * 60 * 60 * 1000;
  const otherMedians = {};
  otherGWs.forEach(gwObj => {
    const d = (gwObj.fixtures || []).filter(f => f.date).map(f => new Date(f.date).getTime()).sort((a, b) => a - b);
    if (d.length >= 3) otherMedians[gwObj.gw] = d[Math.floor(d.length / 2)];
  });
  const normal = [], orphaned = [];
  newFixtures.forEach(f => {
    if (!f.date) { normal.push(f); return; }
    const fDate = new Date(f.date).getTime();
    if (median - fDate > THRESHOLD) {
      let bestGW = null, bestDiff = Infinity;
      Object.entries(otherMedians).forEach(([gw, m]) => {
        const diff = Math.abs(m - fDate);
        if (diff < bestDiff) { bestDiff = diff; bestGW = Number(gw); }
      });
      bestGW !== null ? orphaned.push({ fixture: f, targetGW: bestGW }) : normal.push(f);
    } else {
      normal.push(f);
    }
  });
  if (normal.length < 3 && orphaned.length > 0) {
    return { ...globalDoc, updatedAt: Date.now(), gameweeks: [...otherGWs, { gw: gwNum, fixtures: newFixtures }] };
  }
  const updatedOthers = otherGWs.map(gwObj => {
    const additions = orphaned.filter(o => o.targetGW === gwObj.gw).map(o => o.fixture);
    if (!additions.length) return gwObj;
    const addPairs = new Set(additions.map(fixturePairKey));
    const kept = (gwObj.fixtures || []).filter(f => !addPairs.has(fixturePairKey(f)));
    return { ...gwObj, fixtures: [...kept, ...additions] };
  });
  return { ...globalDoc, updatedAt: Date.now(), gameweeks: [...updatedOthers, { gw: gwNum, fixtures: normal }] };
}
