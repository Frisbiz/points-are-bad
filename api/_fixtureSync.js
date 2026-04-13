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
  // European clubs
  "Paris Saint-Germain": "PSG",
  "Internazionale": "Inter",
  "Inter Milan": "Inter",
  "Bayern München": "Bayern",
  "Borussia Mönchengladbach": "Gladbach",
};

export function normName(n) {
  return TEAM_NAME_MAP[n] || n?.replace(/ FC$/, '').replace(/ AFC$/, '') || n;
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
    if (isWC) {
      base.stage = m.stage || null;
      base.homeCrest = m.homeTeam?.crest || null;
      base.awayCrest = m.awayTeam?.crest || null;
    }
    return base;
  });
}

export function mergeGlobalIntoGroup(globalDoc, g) {
  const seas = g.season || 2025;
  const globalGWMap = {};
  (globalDoc.gameweeks || []).filter(gwObj => (gwObj.season || seas) === seas).forEach(gwObj => { globalGWMap[gwObj.gw] = gwObj.fixtures; });
  const preds = g.predictions || {};
  const hasPick = id => Object.values(preds).some(up => up[id] !== undefined);
  const updatedGameweeks = (g.gameweeks || []).map(gwObj => {
    if ((gwObj.season || seas) !== seas) return gwObj;
    const globalFixtures = globalGWMap[gwObj.gw];
    if (!globalFixtures || !globalFixtures.length) return gwObj;
    const oldFixtures = gwObj.fixtures || [];
    const gwHasPicks = oldFixtures.some(f => hasPick(f.id));
    if (!gwHasPicks) return { ...gwObj, fixtures: globalFixtures };
    const oldByApiId = {};
    const oldByTeams = {};
    oldFixtures.forEach(f => {
      if (f.apiId) oldByApiId[String(f.apiId)] = f;
      oldByTeams[`${f.home}|${f.away}`] = f;
    });
    const working = [...oldFixtures];
    const toAdd = [];
    globalFixtures.forEach(gf => {
      const existing = (gf.apiId && oldByApiId[String(gf.apiId)]) || oldByTeams[`${gf.home}|${gf.away}`];
      if (existing) {
        const idx = working.findIndex(f => f.id === existing.id);
        if (idx >= 0) working[idx] = { ...existing, result: gf.result, status: gf.status, date: gf.date, apiId: gf.apiId, home: gf.home, away: gf.away, liveScore: gf.liveScore || null };
      } else {
        toAdd.push(gf);
      }
    });
    return { ...gwObj, fixtures: [...working, ...toAdd] };
  });
  if ((g.competition || 'PL') === 'WC') {
    return { ...g, gameweeks: updatedGameweeks, lastAutoSync: Date.now() };
  }
  const globalPairToGW = {};
  (globalDoc.gameweeks || []).forEach(gwObj => {
    (gwObj.fixtures || []).forEach(f => { globalPairToGW[`${f.home}|${f.away}`] = gwObj.gw; });
  });
  const deduped = updatedGameweeks.map(gwObj => {
    if ((gwObj.season || seas) !== seas) return gwObj;
    const filtered = (gwObj.fixtures || []).filter(f => {
      const globalGW = globalPairToGW[`${f.home}|${f.away}`];
      if (globalGW === undefined || globalGW === gwObj.gw) return true;
      return hasPick(f.id);
    });
    return { ...gwObj, fixtures: filtered };
  });
  return { ...g, gameweeks: deduped, lastAutoSync: Date.now() };
}

export function regroupGlobalDoc(globalDoc, gwNum, newFixtures) {
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
    const addPairs = new Set(additions.map(f => `${f.home}|${f.away}`));
    const kept = (gwObj.fixtures || []).filter(f => !addPairs.has(`${f.home}|${f.away}`));
    return { ...gwObj, fixtures: [...kept, ...additions] };
  });
  return { ...globalDoc, updatedAt: Date.now(), gameweeks: [...updatedOthers, { gw: gwNum, fixtures: normal }] };
}
