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
    case 'IN_PLAY': return 4;
    case 'PAUSED': return 3;
    case 'POSTPONED': return 2;
    case 'SCHEDULED': return 1;
    default: return 0;
  }
}

function fixtureDataScore(f) {
  if (!f) return -1;
  return fixtureStatusRank(f.status) * 10
    + (f.result ? 6 : 0)
    + (f.liveScore ? 4 : 0)
    + (f.date ? 2 : 0)
    + (f.apiId ? 1 : 0)
    + (f.homeCrest ? 1 : 0)
    + (f.awayCrest ? 1 : 0);
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

function mergeFixtureData(keeper, duplicate) {
  const best = fixtureDataScore(duplicate) > fixtureDataScore(keeper) ? duplicate : keeper;
  return {
    ...keeper,
    apiId: best.apiId || keeper.apiId || duplicate.apiId,
    home: normName(best.home || keeper.home || duplicate.home),
    away: normName(best.away || keeper.away || duplicate.away),
    result: best.result ?? keeper.result ?? duplicate.result ?? null,
    status: best.status || keeper.status || duplicate.status,
    date: best.date || keeper.date || duplicate.date || null,
    liveScore: best.liveScore || keeper.liveScore || duplicate.liveScore || null,
    yahooDate: best.yahooDate || keeper.yahooDate || duplicate.yahooDate || null,
    homeCrest: best.homeCrest || keeper.homeCrest || duplicate.homeCrest || null,
    awayCrest: best.awayCrest || keeper.awayCrest || duplicate.awayCrest || null,
    stage: best.stage || keeper.stage || duplicate.stage || null,
    elapsed: best.elapsed || keeper.elapsed || duplicate.elapsed || null,
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

export function parseMatchesToFixtures(matches, matchday, competition = 'PL') {
  const isWC = competition === 'WC';
  return matches.map((m, i) => {
    const home = normName(m.homeTeam?.name || m.homeTeam?.shortName);
    const away = normName(m.awayTeam?.name || m.awayTeam?.shortName);
    const status = m.status;
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
    const liveScore = (status === 'IN_PLAY' || status === 'PAUSED') && scoreObj?.home != null && scoreObj?.away != null ? `${scoreObj.home}-${scoreObj.away}` : null;
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
}

export function mergeGlobalIntoGroup(globalDoc, g) {
  const seas = g.season || 2025;
  let predictions = g.predictions || {};
  const remaps = [];
  const globalGWMap = {};
  (globalDoc.gameweeks || []).filter(gwObj => (gwObj.season || seas) === seas).forEach(gwObj => { globalGWMap[gwObj.gw] = dedupeFixtures(gwObj.fixtures || []); });
  const hasPick = id => Object.values(predictions).some(up => up[id] !== undefined);
  const updatedGameweeks = (g.gameweeks || []).map(gwObj => {
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
  if ((g.competition || 'PL') === 'WC') {
    return applyFixtureIdRemaps({ ...g, gameweeks: updatedGameweeks, predictions, lastAutoSync: Date.now() }, remaps);
  }
  const globalPairToGW = {};
  (globalDoc.gameweeks || []).forEach(gwObj => {
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
  return applyFixtureIdRemaps({ ...g, gameweeks: deduped, predictions, lastAutoSync: Date.now() }, remaps);
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
