import { db, docKey, getValue, setValue } from "./_db.js";
import { normName, regroupGlobalDoc } from "./_fixtureSync.js";

const YAHOO_BASE = "https://api-secure.sports.yahoo.com/v1/editorial/s/scoreboard";
const REQUEST_HEADERS = { "User-Agent": "Mozilla/5.0" };
const LIVE_REFRESH_MS = 20_000;

const COMP_CONFIG = {
  PL: {
    league: "soccer.l.fbgb",
    season: 2025,
    weeks: 38,
    schedStates: "2",
  },
  WC: {
    league: "soccer.l.fbwcup",
    season: 2026,
    dates: { start: "2026-06-11", end: "2026-07-19" },
    schedStates: "1,2,3,4",
  },
};

const WC_EXTRA_STATE_4_DATES = new Set([
  "2026-07-04",
  "2026-07-05",
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-18",
]);

const NAME_MAP = {
  "Brighton and Hove Albion": "Brighton",
  "Korea Republic": "South Korea",
  "United States": "USA",
  "Congo DR": "DR Congo",
  "Cote d'Ivoire": "Ivory Coast",
  "Côte d'Ivoire": "Ivory Coast",
  Turkiye: "Turkey",
};

const STAGE_MAP = [
  [/group/i, "GROUP_STAGE"],
  [/playoff round 1|round of 32|last 32/i, "LAST_32"],
  [/round of 16|last 16/i, "ROUND_OF_16"],
  [/quarter/i, "QUARTER_FINAL"],
  [/semi/i, "SEMI_FINAL"],
  [/third|3rd/i, "THIRD_PLACE"],
  [/final/i, "FINAL"],
];

export function fixtureGlobalKey(competition = "PL", season = 2025) {
  const comp = competition === "WC" ? "WC" : competition === "LL" ? "LL" : "PL";
  return comp === "WC" ? "fixtures:WC:2026" : `fixtures:${comp}:${season || COMP_CONFIG[comp]?.season || 2025}`;
}

function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function boolish(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function resolveIsland(scoreboard, value) {
  if (!Array.isArray(value) || value.length < 2) return value || null;
  return scoreboard?.[value[0]]?.[value[1]] || null;
}

function resolveTeam(scoreboard, teamId) {
  const team = scoreboard?.teams?.[teamId] || {};
  const raw = team.first_name || team.display_name || team.full_name || team.abbr || "TBD";
  return {
    name: normName(NAME_MAP[raw] || raw),
    crest: resolveIsland(scoreboard, team.logo) || resolveIsland(scoreboard, team.sportacularLogo) || null,
  };
}

function parseStatus(game) {
  const status = String(game.status_type || "").toLowerCase();
  const display = String(game.status_display_name || game.status_description || "").toLowerCase();
  if (status.includes("final") || display.includes("finished") || display.includes("final")) return "FINISHED";
  if (status.includes("postponed") || status.includes("cancelled") || display.includes("postpone") || display.includes("cancel")) return "POSTPONED";
  if (boolish(game.is_halftime) || display.includes("half")) return "PAUSED";
  if (status.includes("in_progress") || status.includes("mid_event") || display.includes("live") || display.includes("progress")) return "IN_PLAY";
  return "SCHEDULED";
}

function parseStage(game) {
  const source = `${game.game_type || ""} ${game.season_phase_id || ""} ${game.status_description || ""}`;
  for (const [pattern, stage] of STAGE_MAP) {
    if (pattern.test(source)) return stage;
  }
  return null;
}

function wcRoundForGame(game, dateIso) {
  const stage = parseStage(game);
  if (stage === "GROUP_STAGE") {
    if (dateIso <= "2026-06-17") return 1;
    if (dateIso <= "2026-06-23") return 2;
    return 3;
  }
  if (stage === "LAST_32") return 4;
  if (stage === "ROUND_OF_16") return 5;
  if (stage === "QUARTER_FINAL") return 6;
  if (stage === "SEMI_FINAL") return 7;
  if (stage === "FINAL" || stage === "THIRD_PLACE") return 8;
  return null;
}

function stableId(value) {
  return String(value || Date.now()).replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function normalizeGames(scoreboard, competition, gwHint = null, scheduleDate = null) {
  const isWC = competition === "WC";
  const byRound = {};
  for (const game of Object.values(scoreboard?.games || {})) {
    const apiId = game.gameid || game.global_gameid;
    const date = game.start_time ? new Date(game.start_time) : null;
    const dateIso = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
    const gw = isWC ? wcRoundForGame(game, scheduleDate || dateIso) : Number(gwHint || game.week_number || 1);
    if (!gw) continue;

    const home = resolveTeam(scoreboard, game.home_team_id);
    const away = resolveTeam(scoreboard, game.away_team_id);
    const status = parseStatus(game);
    const homeScore = toInt(game.total_home_points);
    const awayScore = toInt(game.total_away_points);
    const scoreline = homeScore !== null && awayScore !== null ? `${homeScore}-${awayScore}` : null;
    const stage = parseStage(game);
    const idPrefix = isWC ? `wc-gw${gw}` : `gw${gw}`;
    const fixture = {
      id: `${idPrefix}-f${stableId(apiId || `${home.name}-${away.name}`)}`,
      apiId,
      home: home.name,
      away: away.name,
      result: status === "FINISHED" ? scoreline : null,
      status,
      date: dateIso ? date.toISOString() : null,
      liveScore: (status === "IN_PLAY" || status === "PAUSED") ? scoreline : null,
      yahooLastUpdated: game.last_updated || null,
    };
    if (home.crest) fixture.homeCrest = home.crest;
    if (away.crest) fixture.awayCrest = away.crest;
    if (stage) fixture.stage = stage;
    if (game.game_time_elapsed_display) fixture.elapsed = game.game_time_elapsed_display;
    if (!byRound[gw]) byRound[gw] = [];
    byRound[gw].push(fixture);
  }

  return Object.entries(byRound).map(([gw, fixtures]) => ({
    gw: Number(gw),
    season: isWC ? 2026 : COMP_CONFIG.PL.season,
    fixtures: fixtures.sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
  }));
}

async function fetchScoreboard({ competition = "PL", week = null, date = null, schedStates = null }) {
  const cfg = COMP_CONFIG[competition];
  if (!cfg) {
    const err = new Error(`Yahoo fixtures are not configured for ${competition}`);
    err.status = 400;
    throw err;
  }
  const params = new URLSearchParams({
    lang: "en-US",
    ysp_redesign: "1",
    ysp_platform: "desktop",
    leagues: cfg.league,
    v: "2",
    ysp_enable_last_update: "1",
    sched_states: schedStates || cfg.schedStates,
  });
  if (date) params.set("date", date);
  else params.set("week", String(week ?? "current"));

  const response = await fetch(`${YAHOO_BASE}?${params}`, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    const err = new Error(`Yahoo API error ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return data?.service?.scoreboard || {};
}

async function fetchYahooWCDayGroups(date) {
  const scoreboards = [await fetchScoreboard({ competition: "WC", date })];
  if (WC_EXTRA_STATE_4_DATES.has(date)) {
    scoreboards.push(await fetchScoreboard({ competition: "WC", date, schedStates: "4" }));
  }
  return scoreboards.flatMap(scoreboard => normalizeGames(scoreboard, "WC", null, date));
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

async function mapLimit(items, limit, worker) {
  const out = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      out[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

export async function fetchYahooFixturesForWeek(competition, week) {
  const scoreboard = await fetchScoreboard({ competition, week });
  const gameweeks = normalizeGames(scoreboard, competition, week);
  const target = gameweeks.find(gw => gw.gw === Number(week));
  return target?.fixtures || [];
}

async function fetchYahooWCRoundByDates(dates, targetGW) {
  const groups = await mapLimit(dates, 6, async date => {
    return fetchYahooWCDayGroups(date);
  });
  const fixtures = groups
    .flat()
    .filter(gwObj => gwObj.gw === Number(targetGW))
    .flatMap(gwObj => gwObj.fixtures);
  const seen = new Set();
  return fixtures.filter(f => {
    const key = f.apiId || `${f.home}|${f.away}|${f.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

export async function fetchYahooLiveMatches(competition, week, dates = []) {
  const fixtures = competition === "WC" && dates.length
    ? await fetchYahooWCRoundByDates(dates, week)
    : await fetchYahooFixturesForWeek(competition, week);
  return fixtures.map(f => {
    const [homeScore, awayScore] = String(f.liveScore || f.result || "0-0").split("-").map(n => Number.parseInt(n, 10));
    return {
      home: f.home,
      away: f.away,
      homeScore: Number.isFinite(homeScore) ? homeScore : 0,
      awayScore: Number.isFinite(awayScore) ? awayScore : 0,
      elapsed: f.elapsed || null,
      status: f.status === "FINISHED" ? "finished" : f.status === "PAUSED" ? "halftime" : f.status === "IN_PLAY" ? "in_progress" : f.status === "POSTPONED" ? "postponed" : "scheduled",
      startTime: f.date || null,
    };
  });
}

async function fetchYahooSeason(competition) {
  if (competition === "PL") {
    const weeks = Array.from({ length: COMP_CONFIG.PL.weeks }, (_, i) => i + 1);
    const gameweeks = await mapLimit(weeks, 6, async week => ({
      gw: week,
      season: COMP_CONFIG.PL.season,
      fixtures: await fetchYahooFixturesForWeek("PL", week),
    }));
    return gameweeks.filter(gw => gw.fixtures.length);
  }

  if (competition === "WC") {
    const dates = dateRange(COMP_CONFIG.WC.dates.start, COMP_CONFIG.WC.dates.end);
    const dayGroups = await mapLimit(dates, 6, async date => {
      return fetchYahooWCDayGroups(date);
    });
    const byGW = {};
    dayGroups.flat().forEach(gwObj => {
      if (!byGW[gwObj.gw]) byGW[gwObj.gw] = [];
      byGW[gwObj.gw].push(...gwObj.fixtures);
    });
    return Object.entries(byGW).map(([gw, fixtures]) => {
      const seen = new Set();
      const unique = fixtures.filter(f => {
        const key = f.apiId || `${f.home}|${f.away}|${f.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        gw: Number(gw),
        season: 2026,
        fixtures: unique.sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
      };
    }).sort((a, b) => a.gw - b.gw);
  }

  return [];
}

function hasLiveWindow(fixtures = []) {
  const now = Date.now();
  return fixtures.some(f => {
    if (f.result || f.status === "FINISHED" || f.status === "POSTPONED") return false;
    if (f.status === "IN_PLAY" || f.status === "PAUSED") return true;
    if (!f.date) return false;
    const kickoff = new Date(f.date).getTime();
    return kickoff <= now + 30 * 60_000 && kickoff >= now - 4 * 60 * 60_000;
  });
}

function hasRecentOrTodayWindow(fixtures = []) {
  const now = Date.now();
  return fixtures.some(f => {
    if (!f.date || f.result || f.status === "FINISHED" || f.status === "POSTPONED") return false;
    const kickoff = new Date(f.date).getTime();
    return kickoff <= now + 24 * 60 * 60_000 && kickoff >= now - 8 * 60 * 60_000;
  });
}

function getTargetFixtures(globalDoc, targetGW) {
  return (globalDoc?.gameweeks || []).find(gw => gw.gw === Number(targetGW))?.fixtures || [];
}

function refreshDatesForFixtures(fixtures = []) {
  const now = Date.now();
  const allDates = [...new Set(fixtures.map(f => String(f.date || "").slice(0, 10)).filter(Boolean))];
  const focused = [...new Set(fixtures.filter(f => {
    if (!f.date || f.result || f.status === "FINISHED" || f.status === "POSTPONED") return false;
    if (f.status === "IN_PLAY" || f.status === "PAUSED") return true;
    const kickoff = new Date(f.date).getTime();
    return kickoff <= now + 24 * 60 * 60_000 && kickoff >= now - 8 * 60 * 60_000;
  }).map(f => String(f.date || "").slice(0, 10)).filter(Boolean))];
  return focused.length ? focused : allDates;
}

function refreshIntervalMs(globalDoc, targetGW) {
  if (!globalDoc?.updatedAt) return 0;
  const fixtures = getTargetFixtures(globalDoc, targetGW);
  if (!fixtures.length) return 0;
  if (hasLiveWindow(fixtures)) return LIVE_REFRESH_MS;
  if (hasRecentOrTodayWindow(fixtures)) return 5 * 60_000;
  return 60 * 60_000;
}

function needsSeasonSync(globalDoc, competition, targetGW) {
  const gws = new Set((globalDoc?.gameweeks || []).map(gw => gw.gw));
  if (!gws.size) return true;
  if (competition === "WC") return Array.from({ length: 8 }, (_, i) => i + 1).some(gw => !gws.has(gw));
  const target = Math.max(1, Math.min(COMP_CONFIG.PL.weeks, Number(targetGW || 1)));
  return Array.from({ length: target }, (_, i) => i + 1).some(gw => !gws.has(gw));
}

function mergeGameweek(globalDoc, competition, gw, fixtures) {
  if (competition === "WC") {
    return {
      ...globalDoc,
      updatedAt: Date.now(),
      gameweeks: [...(globalDoc.gameweeks || []).filter(g => g.gw !== gw), { gw, season: 2026, fixtures }]
        .sort((a, b) => a.gw - b.gw),
    };
  }
  return regroupGlobalDoc(globalDoc, gw, fixtures);
}

async function acquireLock(lockKey, minIntervalMs, force = false) {
  const ref = db.collection("data").doc(docKey(lockKey));
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const value = snap.exists ? snap.data().value || {} : {};
    if (!force) {
      if (value.lockedUntil && value.lockedUntil > now) return { acquired: false, reason: "locked" };
      if (value.nextAllowedAt && value.nextAllowedAt > now) return { acquired: false, reason: "cooldown" };
    }
    tx.set(ref, { value: { ...value, lockedUntil: now + 45_000, lastAttemptAt: now, nextAllowedAt: now + minIntervalMs }, updatedAt: now });
    return { acquired: true };
  });
}

async function releaseLock(lockKey, patch) {
  const existing = await getValue(lockKey) || {};
  await setValue(lockKey, { ...existing, ...patch, lockedUntil: 0 });
}

export async function refreshYahooFixtureCache({ competition = "PL", season = null, targetGW = 1, force = false, full = false } = {}) {
  const comp = competition === "WC" ? "WC" : "PL";
  const seas = comp === "WC" ? 2026 : (season || COMP_CONFIG.PL.season);
  const globalKey = fixtureGlobalKey(comp, seas);
  let globalDoc = await getValue(globalKey) || { season: seas, updatedAt: 0, gameweeks: [], source: "yahoo" };
  const interval = refreshIntervalMs(globalDoc, targetGW);
  const seasonSync = full || needsSeasonSync(globalDoc, comp, targetGW);
  const minInterval = seasonSync ? 12 * 60 * 60_000 : interval;
  const now = Date.now();

  if (!force && !seasonSync && interval > 0 && now - (globalDoc.updatedAt || 0) < interval) {
    return { globalDoc, fetched: false, reason: "fresh", intervalMs: interval };
  }

  const lockKey = `sync-lock:yahoo-fixtures:${comp}:${seas}:${seasonSync ? "season" : `gw-${targetGW}`}`;
  const lock = await acquireLock(lockKey, minInterval || 60_000, force);
  if (!lock.acquired) {
    globalDoc = await getValue(globalKey) || globalDoc;
    return { globalDoc, fetched: false, reason: lock.reason, intervalMs: interval };
  }

  try {
    if (seasonSync) {
      const gameweeks = (await fetchYahooSeason(comp)).map(gw => ({ ...gw, season: seas }));
      if (gameweeks.length) {
        globalDoc = { ...globalDoc, season: seas, source: "yahoo", updatedAt: Date.now(), gameweeks };
      }
    } else {
      const gw = Number(targetGW || 1);
      const fixtures = comp === "WC"
        ? await fetchYahooWCRoundByDates(refreshDatesForFixtures(getTargetFixtures(globalDoc, gw)), gw)
        : await fetchYahooFixturesForWeek(comp, gw);
      if (fixtures.length) globalDoc = mergeGameweek(globalDoc, comp, gw, fixtures);
    }
    await setValue(globalKey, globalDoc);
    await releaseLock(lockKey, { lastSuccessAt: Date.now(), lastError: null, nextAllowedAt: Date.now() + (minInterval || 60_000) });
    return { globalDoc, fetched: true, full: seasonSync, intervalMs: interval };
  } catch (e) {
    const backoff = e.status === 429 ? 15 * 60_000 : 5 * 60_000;
    await releaseLock(lockKey, { lastError: e.message, lastErrorAt: Date.now(), nextAllowedAt: Date.now() + backoff });
    throw e;
  }
}
