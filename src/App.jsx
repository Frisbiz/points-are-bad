import React, { useState, useEffect, useCallback, useRef, useMemo, useTransition, Fragment } from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Area, Cell, ReferenceLine } from "recharts";
import { Eye, EyeOff, Flash, Star, EditLine, Lock, LogOut, User } from "griddy-icons";
import { formatWorldCupBracketMatchMeta, formatWorldCupBracketTeamName, getWorldCupKnockoutPlaceholderLabel, isUnresolvedWorldCupTeamSlot, isWorldCupGroupLike, normalizeWorldCupGroup, resolveWorldCupBracketAdvancement, sortWorldCupBracketFixturesForDisplay, winnerSideForWorldCupFixture } from "../shared/wcBracket.js";
import { LIVE_POLL_INTERVAL_MS, SCHEDULE_SYNC_INTERVAL_MS, hasUnpersistedFinishedLiveScores, shouldRunVisibleTask, FINALIZATION_RETRY_INTERVAL_MS } from "../shared/livePolicy.js";
import { CURRENT_LEAGUE_SEASON, competitionRoundCount } from "../shared/season.js";
import { buildGroupDashboardState, formatDashboardCountdown, getDashboardCountdownUrgency, getDashboardFixtureTiming, getGroupDashboardAction, sortGroupDashboardItems } from "./groupDashboard.js";
import IndexLandingPage from "./LandingPage.jsx";
import './app-polish.css';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import { appPath, parseAppRoute } from './appRoutes.js';
import { isPastGroup } from "../shared/groupLifecycle.js";
import { VIEWPORT_WATCH_INTERVAL_MS, viewportLayoutState, visibleViewportWidth } from './responsiveLayout.js';
import { gameweekStatus, observeSelectedGameweek } from './gameweekSelector.js';
import { canAdminGroup, isDeveloper } from "../shared/groupAccess.js";
import { MISSED_PICK_PTS, calcPts, computeFirstPickGW, isPreJoinGW, computeGroupStats, computeTrendStats, buildPointsBreakdownRows } from "../shared/scoring.js";

// Server responses carry standings calculated before private picks are removed.
// Demo/local groups without an aggregate can still be scored in the browser.
function getGroupStats(group) {
  return Array.isArray(group?.standingsStats) ? group.standingsStats : computeGroupStats(group);
}

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
async function sget(key, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("/api/db?key=" + encodeURIComponent(key), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      if (res.status !== 400) console.error("sget error", key, res.status);
      return null;
    }
    const data = await res.json();
    return data.value;
  } catch(e) { console.error("sget error", key, e); return null; }
}

async function callAPI(action, payload = {}) {
  try {
    const res = await fetch('/api/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `Error ${res.status}`, status: res.status, data };
    return { ok: true, data };
  } catch (_error) {
    return { ok: false, error: 'Network error. Please try again.', data: {} };
  }
}

let bootstrapRequest = null;
async function fetchBootstrap() {
  if (!bootstrapRequest) {
    bootstrapRequest = fetch('/api/security?action=bootstrap')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        return data;
      });
    bootstrapRequest.then(
      () => { bootstrapRequest = null; },
      () => { bootstrapRequest = null; },
    );
  }
  return bootstrapRequest;
}

// Session stored locally (only needed on this browser)
function lget(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lset(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* Storage may be unavailable in private browsing. */ }
}
function ldel(key) {
  try { localStorage.removeItem(key); } catch { /* Storage may be unavailable in private browsing. */ }
}

const DEMO_GROUP_CODE = "M65Y4R";
const DEMO_WC_GROUP_CODE = "WCDEM0";
const DEMO_SHARED_USERNAME = "demo";
const DEMO_MEMBERS = [
  { username: "demo",      displayName: "Demo"  },
  { username: "farisdemo", displayName: "Faris" },
  { username: "damondemo", displayName: "Damon" },
  { username: "valldemo",  displayName: "Vall"  },
  { username: "aamerdemo", displayName: "Aamer" },
];

const TEAM_DISPLAY_LIMIT = 13;
function shortTeamName(name, max = TEAM_DISPLAY_LIMIT) {
  const text = String(name || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatFixtureDate(value, options = {}) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true };
  if (options.timeZone) formatOptions.timeZone = options.timeZone;
  return new Intl.DateTimeFormat("en-GB", formatOptions).format(date).replace(", ", " ");
}

function effectiveFixtureStatus(fixture, liveMatch = null) {
  if (fixture?.result) return "FINISHED";
  const liveStatus = String(liveMatch?.status || "").toLowerCase();
  const yahooStatus = {
    scheduled: "SCHEDULED",
    in_progress: "IN_PLAY",
    halftime: "PAUSED",
    finished: "FINISHED",
    postponed: "POSTPONED",
    delayed: "DELAYED",
  }[liveStatus];
  return yahooStatus || String(fixture?.status || "SCHEDULED").toUpperCase();
}

function matchClockLabel(fixture, liveMatch = null, now = Date.now()) {
  const effectiveStatus = effectiveFixtureStatus(fixture, liveMatch);
  if (effectiveStatus === "PAUSED") return "HT";
  if (effectiveStatus !== "IN_PLAY") return null;

  const explicitElapsed = liveMatch?.elapsed || fixture?.elapsed;
  if (explicitElapsed) return explicitElapsed;

  const kickoff = liveMatch?.startTime || fixture?.date;
  const kickoffMs = kickoff ? new Date(kickoff).getTime() : NaN;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (!Number.isFinite(kickoffMs) || kickoffMs > safeNowMs) return "LIVE";

  const wallMinutes = Math.floor((safeNowMs - kickoffMs) / 60000);
  if (wallMinutes < 45) return `~${Math.max(1, wallMinutes + 1)}'`;
  if (wallMinutes < 60) return "~45'";
  if (wallMinutes < 105) return `~${Math.min(90, 46 + (wallMinutes - 60))}'`;
  return "~90+";
}

function buildNextMatchCardState({ fixtureGameweeks = [], liveScores = {}, myPreds = {}, now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const fixtures = (fixtureGameweeks || [])
    .flatMap(gw => (gw.fixtures || []).map(f => ({ ...f, _gw: gw.gw, _season: gw.season })));
  const scoreFromLive = lm => (
    lm && lm.homeScore !== null && lm.homeScore !== undefined && lm.awayScore !== null && lm.awayScore !== undefined
      ? `${lm.homeScore}-${lm.awayScore}`
      : null
  );
  const scoreFromFixture = f => f.liveScore || null;
  const liveItems = fixtures
    .map(f => {
      const lm = liveScores?.[`${f.home}|${f.away}`];
      const effectiveStatus = effectiveFixtureStatus(f, lm);
      const liveStatus = effectiveStatus === "IN_PLAY" || effectiveStatus === "PAUSED";
      const finalStatus = effectiveStatus === "FINISHED";
      if (!liveStatus || finalStatus || effectiveStatus === "POSTPONED") return null;
      const halftime = effectiveStatus === "PAUSED";
      return {
        fixture: f,
        liveMatch: lm || null,
        scoreText: scoreFromLive(lm) || scoreFromFixture(f),
        secondaryLabel: halftime ? "HT" : (matchClockLabel(f, lm, safeNowMs) || "LIVE"),
        kickoffMs: f.date ? new Date(f.date).getTime() : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.kickoffMs - b.kickoffMs);

  if (liveItems.length) {
    const current = liveItems[0];
    return {
      mode: "live",
      label: "Live now",
      fixture: current.fixture,
      liveMatch: current.liveMatch,
      scoreText: current.scoreText,
      secondaryLabel: current.secondaryLabel,
      moreLiveCount: Math.max(0, liveItems.length - 1),
    };
  }

  const next = fixtures
    .filter(f => {
      const lm = liveScores?.[`${f.home}|${f.away}`];
      const effectiveStatus = effectiveFixtureStatus(f, lm);
      if (!f.date || f.result || effectiveStatus === "FINISHED" || effectiveStatus === "IN_PLAY" || effectiveStatus === "PAUSED" || effectiveStatus === "POSTPONED") return false;
      const kickoffMs = new Date(f.date).getTime();
      return Number.isFinite(kickoffMs) && kickoffMs > safeNowMs;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  if (!next) return null;

  const diff = new Date(next.date).getTime() - safeNowMs;
  const hasPick = !!myPreds[next.id];
  const urgent = !hasPick && diff < 3 * 3600000;
  const warning = !hasPick && diff < 24 * 3600000;
  return {
    mode: "upcoming",
    label: warning ? "Picks due" : "Next kick-off",
    fixture: next,
    diff,
    hasPick,
    urgent,
    warning,
  };
}

function findNextMatchLiveScoreTarget(fixtureGameweeks = [], now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const liveWindow = (f) => {
    if (!f || f.result || f.status === "FINISHED" || f.status === "POSTPONED") return false;
    if (f.status === "IN_PLAY" || f.status === "PAUSED") return true;
    if (!f.date) return false;
    const kickoffMs = new Date(f.date).getTime();
    return Number.isFinite(kickoffMs) && kickoffMs <= safeNowMs + 5 * 60000 && kickoffMs >= safeNowMs - 72 * 3600000;
  };
  return (fixtureGameweeks || [])
    .filter(gw => (gw.fixtures || []).some(liveWindow))
    .sort((a, b) => {
      const aTime = Math.min(...(a.fixtures || []).filter(liveWindow).map(f => f.date ? new Date(f.date).getTime() : Number.MAX_SAFE_INTEGER));
      const bTime = Math.min(...(b.fixtures || []).filter(liveWindow).map(f => f.date ? new Date(f.date).getTime() : Number.MAX_SAFE_INTEGER));
      return aTime - bTime;
    })[0] || null;
}

// Best-available scoreline for RENDERING/DISPLAY purposes only.
// Prefers the final result, then a cached live score, then the Yahoo live feed.
// DO NOT use this in getGroupStats or any Trends/standings aggregation — those
// must stay locked to f.result only so season totals, rankings, and charts
// don't flip mid-match.
function effectiveFixtureResult(fixture, liveScores) {
  if (fixture.result) return fixture.result;
  const lm = liveScores?.[`${fixture.home}|${fixture.away}`];
  if (lm && (lm.status === "in_progress" || lm.status === "halftime" || lm.status === "finished") && lm.homeScore != null && lm.awayScore != null) {
    return `${lm.homeScore}-${lm.awayScore}`;
  }
  if (lm && (lm.status === "scheduled" || lm.status === "postponed" || lm.status === "delayed")) return null;
  if (fixture.liveScore) return fixture.liveScore;
  return null;
}

function fixtureResultDisplayParts(fixture, liveMatch, scoreStr) {
  const score = String(scoreStr || "").trim();
  const match = score.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;

  const optionalScore = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : null;
  };
  const isFinal = !!fixture?.result || fixture?.status === "FINISHED" || liveMatch?.status === "finished";
  const homeShootoutScore = optionalScore(
    fixture?.homeShootoutScore ?? fixture?.homePenaltyScore ?? liveMatch?.homeShootoutScore ?? liveMatch?.homePenaltyScore
  );
  const awayShootoutScore = optionalScore(
    fixture?.awayShootoutScore ?? fixture?.awayPenaltyScore ?? liveMatch?.awayShootoutScore ?? liveMatch?.awayPenaltyScore
  );
  const isShootout = isFinal && homeShootoutScore !== null && awayShootoutScore !== null;

  return {
    homeScore: match[1],
    awayScore: match[2],
    homeShootoutScore: isShootout ? homeShootoutScore : null,
    awayShootoutScore: isShootout ? awayShootoutScore : null,
    isShootout,
    statusLabel: isFinal ? (isShootout ? "PEN" : "FT") : null,
  };
}

function fixtureDelayStatus(fixture, liveMatch, now = Date.now()) {
  const effectiveStatus = effectiveFixtureStatus(fixture, liveMatch);
  if (effectiveStatus === "POSTPONED") return "POSTPONED";
  if (effectiveStatus === "DELAYED") return "DELAYED";
  if (effectiveStatus !== "SCHEDULED" || String(liveMatch?.status || "").toLowerCase() !== "scheduled") return null;

  const nowMs = Number(now);
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const liveStart = liveMatch?.startTime ? new Date(liveMatch.startTime).getTime() : NaN;
  if (!Number.isFinite(liveStart) || liveStart <= safeNow) return null;

  const fixtureStart = fixture?.date ? new Date(fixture.date).getTime() : NaN;
  if (!Number.isFinite(fixtureStart)) return "DELAYED";
  return liveStart > fixtureStart + 60000 ? "DELAYED" : null;
}

function fixtureWinnerSide(fixture, liveMatch, resultDisplay) {
  const cleanSide = (value) => (value === "home" || value === "away" ? value : null);
  const metadataSide = cleanSide(fixture?.winnerSide) || cleanSide(liveMatch?.winnerSide);
  if (metadataSide) return metadataSide;

  const winningTeamId = fixture?.winningTeamId ?? fixture?.winnerTeamId ?? liveMatch?.winningTeamId ?? liveMatch?.winnerTeamId;
  if (winningTeamId && fixture?.homeTeamId && winningTeamId === fixture.homeTeamId) return "home";
  if (winningTeamId && fixture?.awayTeamId && winningTeamId === fixture.awayTeamId) return "away";

  const optionalNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const homeScore = optionalNumber(resultDisplay?.homeScore);
  const awayScore = optionalNumber(resultDisplay?.awayScore);
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";

  const homeShootoutScore = optionalNumber(resultDisplay?.homeShootoutScore);
  const awayShootoutScore = optionalNumber(resultDisplay?.awayShootoutScore);
  if (homeShootoutScore === null || awayShootoutScore === null) return null;
  if (homeShootoutScore > awayShootoutScore) return "home";
  if (awayShootoutScore > homeShootoutScore) return "away";
  return null;
}

function fixtureCompletedDraw(fixture, liveMatch, resultDisplay) {
  const isFinal = !!fixture?.result || fixture?.status === "FINISHED" || liveMatch?.status === "finished";
  if (!isFinal) return false;

  const cleanSide = (value) => (value === "home" || value === "away" ? value : null);
  const hasWinnerMetadata = cleanSide(fixture?.winnerSide)
    || cleanSide(liveMatch?.winnerSide)
    || fixture?.winningTeamId
    || fixture?.winnerTeamId
    || liveMatch?.winningTeamId
    || liveMatch?.winnerTeamId;
  if (hasWinnerMetadata) return false;

  const optionalNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const homeScore = optionalNumber(resultDisplay?.homeScore);
  const awayScore = optionalNumber(resultDisplay?.awayScore);
  if (homeScore === null || awayScore === null || homeScore !== awayScore) return false;

  const homeShootoutScore = optionalNumber(resultDisplay?.homeShootoutScore);
  const awayShootoutScore = optionalNumber(resultDisplay?.awayShootoutScore);
  return homeShootoutScore === null && awayShootoutScore === null;
}

function applyFinishedLiveScoresToGroup(group, liveScores = {}) {
  const optionalLiveNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const finishedLiveWinnerPatch = (lm) => {
    const patch = {};
    const homeShootoutScore = optionalLiveNumber(lm?.homeShootoutScore ?? lm?.homePenaltyScore);
    const awayShootoutScore = optionalLiveNumber(lm?.awayShootoutScore ?? lm?.awayPenaltyScore);
    if (lm?.winningTeamId) patch.winningTeamId = lm.winningTeamId;
    if (lm?.winnerSide) patch.winnerSide = lm.winnerSide;
    if (homeShootoutScore !== null) patch.homeShootoutScore = homeShootoutScore;
    if (awayShootoutScore !== null) patch.awayShootoutScore = awayShootoutScore;
    return patch;
  };
  const patchChangesFixture = (fixture, patch) =>
    Object.entries(patch).some(([key, value]) => fixture?.[key] !== value);

  if (!group || !liveScores || Object.keys(liveScores).length === 0) return group;
  let changed = false;
  const gameweeks = (group.gameweeks || []).map(gwObj => {
    let gwChanged = false;
    const fixtures = (gwObj.fixtures || []).map(fixture => {
      const lm = liveScores[`${fixture.home}|${fixture.away}`];
      if (!lm || lm.status !== "finished" || lm.homeScore == null || lm.awayScore == null) return fixture;
      const finishedPatch = {
        status: "FINISHED",
        liveScore: null,
        elapsed: lm.elapsed || fixture.elapsed || null,
        ...finishedLiveWinnerPatch(lm),
      };
      if (fixture.result) {
        if (!patchChangesFixture(fixture, finishedPatch)) return fixture;
        changed = true;
        gwChanged = true;
        return { ...fixture, ...finishedPatch };
      }
      changed = true;
      gwChanged = true;
      return {
        ...fixture,
        result: String(lm.homeScore) + "-" + String(lm.awayScore),
        ...finishedPatch,
      };
    });
    return gwChanged ? { ...gwObj, fixtures } : gwObj;
  });
  return changed ? { ...group, gameweeks } : group;
}

function getFixtureSeasonIndex(group, fixtureId) {
  const gws = (group.gameweeks || [])
    .slice()
    .sort((a, b) => ((a.season || 0) - (b.season || 0)) || (a.gw - b.gw));
  let idx = 0;
  for (const gw of gws) {
    for (const f of (gw.fixtures || [])) {
      if (f.id === fixtureId) return idx;
      idx++;
    }
  }
  return null;
}

function computeDibsTurn(group, fixtureId) {
  const memberOrder = group.memberOrder || group.members || [];
  const n = memberOrder.length;
  if (n === 0) return null;
  const seasonIdx = getFixtureSeasonIndex(group, fixtureId);
  if (seasonIdx === null) return null;
  const skips = (group.dibsSkips || {})[fixtureId] || [];
  const preds = group.predictions || {};
  const rotStart = seasonIdx % n;
  const queue = [];
  for (let i = 0; i < n; i++) {
    const member = memberOrder[(rotStart + i) % n];
    if (!skips.includes(member)) queue.push(member);
  }
  for (const member of queue) {
    if (!/^\d+-\d+$/.test(preds[member]?.[fixtureId] || "")) return member;
  }
  return null;
}

const PALETTE = ["#60a5fa","#f472b6","#4ade80","#fb923c","#a78bfa","#facc15","#34d399","#f87171"];
const THEMES = [
  { id: "dark", label: "Dark", group: "core", swatches: ["#080810","#1a1a26","#e8e4d9"] },
  { id: "light", label: "Light", group: "core", swatches: ["#f4f1e8","#dddad0","#1a1814"] },
  { id: "nord", label: "Nord", group: "core", swatches: ["#2e3440","#434c5e","#eceff4"] },
  { id: "index", label: "Index", group: "core", swatches: ["#f6f6f7","#e0e0e0","#121417"] },
  { id: "pitch", label: "Pitch", group: "fun", swatches: ["#0d1f0d","#1a3a1a","#d4ecd4"] },
  { id: "terminal", label: "Terminal", group: "fun", swatches: ["#000000","#1a3a1a","#00cc44"] },
  { id: "excel", label: "Excel", group: "fun", swatches: ["#ffffff","#107c41","#1a1a1a"] },
  { id: "spotify", label: "Spotify", group: "fun", swatches: ["#121212","#1ed760","#ffffff"] },
  { id: "velvet", label: "Velvet", group: "secret", swatches: ["#120816","#3a2344","#f7d6ea"] },
  { id: "clarity", label: "Clarity", group: "secret", swatches: ["#111","#666","#fff"] },
];
const CLUB_COLORS = {
  "Arsenal":"#EF0107","Aston Villa":"#95BFE5","Bournemouth":"#DA291C","Brentford":"#E30613",
  "Brighton":"#0057B8","Chelsea":"#034694","Crystal Palace":"#1B458F","Everton":"#003399",
  "Fulham":"#CC0000","Ipswich":"#0044A9","Leicester":"#003090","Liverpool":"#C8102E",
  "Man City":"#6CABDD","Man Utd":"#DA291C","Newcastle":"#241F20","Nott'm Forest":"#DD0000",
  "Southampton":"#D71920","Spurs":"#132257","West Ham":"#7A263A","Wolves":"#FDB913",
  // La Liga
  "Real Madrid":"#FEBE10","Barcelona":"#A50044","Atletico Madrid":"#CB3524",
  "Girona":"#CD2534","Athletic Bilbao":"#EE2523","Real Sociedad":"#0067B1",
  "Real Betis":"#00954C","Villarreal":"#FFED00","Valencia":"#EE3524",
  "Getafe":"#004FA3","Osasuna":"#D91A21","Sevilla":"#F43333",
  "Celta Vigo":"#8AC3EE","Mallorca":"#E20613","Las Palmas":"#FFE400",
  "Rayo Vallecano":"#E53027","Espanyol":"#007FC8","Leganes":"#2E5FA1",
  "Valladolid":"#591C87","Alaves":"#0060A8",
};

// ISO 3166-1 alpha-2 codes for flagcdn.com images (works on all platforms)
const COUNTRY_CODES = {
  "Albania":"al","Algeria":"dz","Argentina":"ar","Australia":"au","Austria":"at",
  "Bahrain":"bh","Belgium":"be","Bolivia":"bo","Bosnia and Herzegovina":"ba","Bosnia-Herzegovina":"ba",
  "Brazil":"br","Burkina Faso":"bf","Cameroon":"cm","Canada":"ca",
  "Cape Verde":"cv","Cape Verde Islands":"cv",
  "Chile":"cl","China":"cn","Colombia":"co","Costa Rica":"cr","Croatia":"hr",
  "Cuba":"cu","Curaçao":"cw","Curacao":"cw",
  "Czech Republic":"cz","Czechia":"cz","Denmark":"dk",
  "DR Congo":"cd","Congo DR":"cd","Congo, DR":"cd",
  "Ecuador":"ec","Egypt":"eg","El Salvador":"sv","England":"gb-eng",
  "France":"fr","Gabon":"ga","Germany":"de","Ghana":"gh","Greece":"gr",
  "Guatemala":"gt","Haiti":"ht","Honduras":"hn","Hungary":"hu","India":"in",
  "Indonesia":"id","Iran":"ir","IR Iran":"ir","Iraq":"iq","Israel":"il",
  "Italy":"it","Ivory Coast":"ci","Côte d'Ivoire":"ci","Cote d'Ivoire":"ci","Jamaica":"jm",
  "Japan":"jp","Jordan":"jo","Korea Republic":"kr","South Korea":"kr",
  "Kuwait":"kw","Lebanon":"lb","Mali":"ml","Mexico":"mx","Montenegro":"me",
  "Morocco":"ma","Mozambique":"mz","Netherlands":"nl","New Zealand":"nz",
  "Nigeria":"ng","North Macedonia":"mk","Norway":"no","Oman":"om",
  "Panama":"pa","Paraguay":"py","Peru":"pe","Poland":"pl","Portugal":"pt",
  "Qatar":"qa","Romania":"ro","Saudi Arabia":"sa","Scotland":"gb-sct",
  "Senegal":"sn","Serbia":"rs","Slovakia":"sk","Slovenia":"si",
  "South Africa":"za","Spain":"es","Sweden":"se","Switzerland":"ch",
  "Tanzania":"tz","Thailand":"th","Trinidad and Tobago":"tt","Tunisia":"tn",
  "Turkey":"tr","UAE":"ae","United Arab Emirates":"ae","Uganda":"ug",
  "Ukraine":"ua","Uruguay":"uy","USA":"us","United States":"us",
  "Uzbekistan":"uz","Venezuela":"ve","Vietnam":"vn","Wales":"gb-wls",
  "Zambia":"zm","Zimbabwe":"zw",
};

const TEAM_BADGES = {
  "Arsenal": "https://resources.premierleague.com/premierleague/badges/t3.png",
  "Aston Villa": "https://resources.premierleague.com/premierleague/badges/t7.png",
  "Bournemouth": "https://resources.premierleague.com/premierleague/badges/t91.png",
  "Brentford": "https://resources.premierleague.com/premierleague/badges/t94.png",
  "Brighton": "https://resources.premierleague.com/premierleague/badges/t36.png",
  "Burnley": "https://resources.premierleague.com/premierleague/badges/t90.png",
  "Chelsea": "https://resources.premierleague.com/premierleague/badges/t8.png",
  "Crystal Palace": "https://resources.premierleague.com/premierleague/badges/t31.png",
  "Everton": "https://resources.premierleague.com/premierleague/badges/t11.png",
  "Fulham": "https://resources.premierleague.com/premierleague/badges/t54.png",
  "Ipswich": "https://resources.premierleague.com/premierleague/badges/t40.png",
  "Leeds": "https://resources.premierleague.com/premierleague/badges/t2.png",
  "Leicester": "https://resources.premierleague.com/premierleague/badges/t13.png",
  "Liverpool": "/badges/liverpool-red.svg",
  "Man City": "https://resources.premierleague.com/premierleague/badges/t43.png",
  "Man Utd": "https://resources.premierleague.com/premierleague/badges/t1.png",
  "Newcastle": "https://resources.premierleague.com/premierleague/badges/t4.png",
  "Nott'm Forest": "https://resources.premierleague.com/premierleague/badges/t17.png",
  "Southampton": "https://resources.premierleague.com/premierleague/badges/t20.png",
  "Spurs": "https://resources.premierleague.com/premierleague/badges/t6.png",
  "Sunderland": "https://resources.premierleague.com/premierleague/badges/t56.png",
  "West Ham": "https://resources.premierleague.com/premierleague/badges/t21.png",
  "Wolves": "https://resources.premierleague.com/premierleague/badges/t39.png",
};

function TeamBadge({ team, crest, size = 22, style = {} }) {
  const countryCode = COUNTRY_CODES[team];
  if (countryCode) {
    return <img src={`https://flagcdn.com/w40/${countryCode}.png`} alt="" aria-hidden="true" style={{width:size,height:size,objectFit:"cover",objectPosition:"center",borderRadius:"50%",flexShrink:0,...style}} />;
  }
  const src = crest || TEAM_BADGES[team];
  if (!src) {
    const fallbackColor = CLUB_COLORS[team] || "var(--text-dim)";
    return <div style={{width:size,height:size,borderRadius:"50%",background:fallbackColor,flexShrink:0,...style}} />;
  }
  return <img src={src} alt="" aria-hidden="true" style={{width:size,height:size,objectFit:"contain",flexShrink:0,...style}} />;
}

function stageLabel(stage, matchday) {
  const stageMap = {
    GROUP_STAGE: `Matchday ${matchday}`,
    LAST_32: "Round of 32",
    ROUND_OF_16: "Round of 16",
    QUARTER_FINAL: "Quarter-Finals",
    SEMI_FINAL: "Semi-Finals",
    THIRD_PLACE: "3rd Place",
    FINAL: "Final",
  };
  const gwFallback = {1:"Matchday 1",2:"Matchday 2",3:"Matchday 3",4:"Round of 32",5:"Round of 16",6:"Quarter-Finals",7:"Semi-Finals",8:"Final"};
  return stageMap[stage] || gwFallback[matchday] || `Round ${matchday}`;
}

function gwLabel(group, gwNum) {
  const comp = isWorldCupGroupLike(group) ? "WC" : (group.competition || "PL");
  if (comp === "PL" || comp === "LL") return `GW${gwNum}`;
  if (comp === "CL") return `Matchday ${gwNum}`;
  const gwObj = (group.gameweeks || []).find(g => g.gw === gwNum);
  const stages = (gwObj?.fixtures || []).map(f => f.stage).filter(Boolean);
  const stage = gwNum === 8 && stages.includes("FINAL") ? "FINAL" : stages[0];
  return stageLabel(stage, gwNum);
}

function competitionLabel(groupOrCompetition, compact = false) {
  const comp = typeof groupOrCompetition === "string"
    ? groupOrCompetition
    : isWorldCupGroupLike(groupOrCompetition) ? "WC" : (groupOrCompetition?.competition || "PL");
  if (comp === "WC") return compact ? "WC 2026" : "World Cup 2026";
  if (comp === "LL") return "La Liga";
  if (comp === "CL") return compact ? "UCL" : "Champions League";
  return compact ? "PL" : "Premier League";
}

function autoSyncTargetGW(group, now = Date.now()) {
  if (isPastGroup(group, new Date(now))) return null;
  if (!group) return null;
  const seas = isWorldCupGroupLike(group) ? (group.season || 2026) : (group.season || 2025);
  const candidates = [];
  const incomplete = [];
  (group.gameweeks || [])
    .filter(gw => (gw.season || seas) === seas)
    .forEach(gw => {
      (gw.fixtures || []).forEach(f => {
        if (f.result || f.status === "POSTPONED") return;
        incomplete.push(gw.gw);
        if (!f.date) return;
        const kickoff = new Date(f.date).getTime();
        if (!Number.isFinite(kickoff)) return;
        const inLiveWindow = kickoff <= now + 30 * 60000 && kickoff >= now - 4 * 3600000;
        const recentMissingResult = kickoff <= now && kickoff >= now - 72 * 3600000;
        const nearUpcoming = kickoff <= now + 24 * 3600000 && kickoff >= now;
        candidates.push({ gw: gw.gw, kickoff, score: inLiveWindow ? 0 : recentMissingResult ? 1 : nearUpcoming ? 2 : kickoff > now ? 3 : 4 });
      });
    });
  if (candidates.length) {
    candidates.sort((a, b) => a.score - b.score || Math.abs(a.kickoff - now) - Math.abs(b.kickoff - now));
    return candidates[0].gw;
  }
  if (incomplete.length) return Math.min(...incomplete);
  return group.currentGW || 1;
}

const DRAW_11_LIMIT_PRESETS = [["unlimited","Unlimited"],["2","2"],["1","1"],["none","None"]];

function cleanDraw11LimitInput(value) {
  return String(value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 2);
}

function normalizeDraw11Limit(value) {
  const raw = String(value || "unlimited").trim().toLowerCase();
  if (raw === "unlimited" || raw === "none") return raw;
  const cleaned = cleanDraw11LimitInput(raw);
  if (!cleaned) return "unlimited";
  const n = Math.max(0, Math.min(99, Number(cleaned)));
  return n === 0 ? "none" : String(n);
}

function draw11LimitMax(value) {
  const limit = normalizeDraw11Limit(value);
  if (limit === "unlimited") return Infinity;
  if (limit === "none") return 0;
  return Number(limit);
}

function draw11LimitPeriod(groupOrCompetition) {
  const comp = typeof groupOrCompetition === "string" ? groupOrCompetition : (groupOrCompetition?.competition || "PL");
  if (typeof groupOrCompetition === "string" ? comp === "WC" : isWorldCupGroupLike(groupOrCompetition)) return "round";
  return comp === "CL" ? "matchday" : "gameweek";
}

function draw11LimitLabel(group) {
  const limit = normalizeDraw11Limit(group.draw11Limit);
  if (limit === "unlimited") return "Unlimited";
  if (limit === "none") return "No 1-1s";
  return `${limit} / ${draw11LimitPeriod(group)}`;
}

const Avatar = ({ name, size = 36, color }) => {
  const ini = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const hue = [...(name||"")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  const bg = color ? `${color}28` : `hsl(${hue},55%,32%)`;
  const fg = color ? color : `hsl(${hue},75%,80%)`;
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.38,flexShrink:0,fontFamily:"'DM Mono',monospace",letterSpacing:-1,userSelect:"none"}}>{ini}</div>;
};

function DevTag({ username, compact = false }) {
  if (!isDeveloper(username)) return null;
  return <span title="Points are Bad developer" style={{display:"inline-flex",alignItems:"center",flexShrink:0,fontSize:compact?8:9,fontWeight:800,lineHeight:1,letterSpacing:compact?.5:.8,textTransform:"uppercase",color:"#22c55e",background:"#22c55e18",border:"1px solid #22c55e45",borderRadius:999,padding:compact?"2px 5px":"3px 7px"}}>dev</span>;
}

const BadgeScore = ({ score, missed=false }) => {
  if (score===null||score===undefined) return <span style={{color:"var(--text-dim2)",fontSize:13}}>—</span>;
  const c = missed?"#6b7280":score===0?"#22c55e":score<=2?"#f59e0b":"#ef4444";
  const perfect = !missed && score === 0;
  return <span style={{
    display:"inline-flex",
    alignItems:"center",
    justifyContent:"center",
    background: perfect ? "linear-gradient(135deg, #22c55e24, #a3e63518)" : c+"20",
    color:c,
    border:`1px solid ${c}40`,
    borderRadius:6,
    height:22,
    minWidth:28,
    padding:"0 8px",
    fontSize:12,
    lineHeight:1,
    fontWeight:700,
    fontFamily:"'DM Mono',monospace",
    fontVariantNumeric:"tabular-nums",
    fontStyle:"normal",
    boxShadow: perfect ? "0 0 0 1px #22c55e20 inset, 0 0 12px #22c55e22" : "none",
    position:"relative",
    overflow:"hidden"
  }}>{perfect && <span style={{position:"absolute",inset:0,background:"linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.45) 48%, transparent 78%)",transform:"translateX(-120%)",animation:"perfectShimmer 2.6s ease-in-out infinite"}}/>}<span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",height:"100%",lineHeight:1}}>{score}</span></span>;
};

const Btn = ({children,onClick,variant="default",disabled,small,style:extra={}}) => {
  const base = {fontFamily:"'DM Mono',monospace",cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:8,fontWeight:500,letterSpacing:0.5,transition:"transform 100ms ease-out,background 0.15s,color 0.15s,border-color 0.15s,opacity 0.15s",opacity:disabled?0.4:1,padding:small?"6px 14px":"10px 22px",fontSize:small?12:13};
  const V = {
    default:{background:"var(--btn-bg)",color:"var(--btn-text)"},
    ghost:{background:"transparent",border:"1px solid var(--border)",color:"var(--text-mid)"},
    danger:{background:"#ef444418",border:"1px solid #ef444435",color:"#ef4444"},
    success:{background:"#22c55e18",border:"1px solid #22c55e35",color:"#22c55e"},
    muted:{background:"var(--border)",border:"1px solid var(--border)",color:"var(--text-dim2)"},
    amber:{background:"#f59e0b18",border:"1px solid #f59e0b35",color:"#f59e0b"},
  };
  return <button className="pab-btn" disabled={disabled} onClick={disabled?undefined:onClick} style={{...base,...V[variant],...extra}}>{children}</button>;
};

const Spinner = ({ size = 4 }) => (
  <span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
    {[0,1,2].map(i => <span key={i} style={{width:size,height:size,borderRadius:"50%",background:"currentColor",animation:`pulse 1.2s ease-in-out infinite`,animationDelay:`${0.2*i}s`}}/>)}
  </span>
);

const Input = ({value,onChange,placeholder,type="text",onKeyDown,style:extra={},autoFocus,inputMode,pattern}) => (
  <input className="pab-input" aria-label={placeholder} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus} inputMode={inputMode} pattern={pattern}
    style={{background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:13,outline:"none",width:"100%",...extra}} />
);

const Section = ({title,children}) => (
  <div style={{marginBottom:32}}>
    <div style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,textTransform:"uppercase",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>{title}</div>
    {children}
  </div>
);

class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`TabErrorBoundary [${this.props.tabName}]:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:40,textAlign:"center"}}>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:32,maxWidth:400,margin:"0 auto"}}>
            <div style={{fontSize:24,marginBottom:12}}>Something went wrong</div>
            <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20}}>{this.props.tabName || "This tab"} ran into an error.</div>
            <button onClick={()=>this.setState({hasError:false,error:null})} style={{background:"var(--btn-bg)",color:"var(--btn-text)",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function currentVisibleViewportWidth() {
  return visibleViewportWidth({
    innerWidth: window.innerWidth,
    visualViewportWidth: window.visualViewport?.width,
    outerWidth: window.outerWidth,
  }) || window.innerWidth;
}

function useMobile() {
  return currentVisibleViewportWidth() < 640;
}

function useVisibleViewportWidth() {
  const [width, setWidth] = useState(currentVisibleViewportWidth);
  useEffect(() => {
    const update = () => setWidth(currentVisibleViewportWidth());
    window.addEventListener("resize", update);
    window.addEventListener("focus", update);
    window.visualViewport?.addEventListener("resize", update);
    const watcher = window.setInterval(update, VIEWPORT_WATCH_INTERVAL_MS);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("focus", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.clearInterval(watcher);
    };
  }, []);
  return width;
}

function useHorizontalScroll() {
  return useCallback(node => {
    if (!node || node._wheelBound) return;
    node._wheelBound = true;
    node.addEventListener("wheel", e => {
      e.preventDefault();
      node.scrollLeft += e.deltaY;
    }, { passive: false });
  }, []);
}

const LIVE_SCORE_CACHE = new Map();
const EMPTY_LIVE_SCORES = {};

function liveScoreDatesForFixtures(fixtures = []) {
  const addUtcDays = (isoDate, days) => {
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const dates = new Set();
  (fixtures || []).forEach(f => {
    const yahooDate = String(f?.yahooDate || "").slice(0, 10);
    if (yahooDate) dates.add(yahooDate);
    if (!f?.date) return;
    const time = new Date(f.date).getTime();
    if (!Number.isFinite(time)) return;
    const utcDate = new Date(time).toISOString().slice(0, 10);
    dates.add(utcDate);
    const previousDate = addUtcDays(utcDate, -1);
    if (previousDate) dates.add(previousDate);
  });
  return [...dates].filter(Boolean).sort();
}

function liveScoreCacheKey(gw, fixtures = [], competition = "PL", season = 2025) {
  const dateKey = competition === "WC" ? liveScoreDatesForFixtures(fixtures).join(",") : "";
  return `${competition}:${season}:${gw}:${dateKey}`;
}

function mergeLiveScoreMaps(...maps) {
  return Object.assign({}, ...maps.filter(Boolean));
}

function shouldFetchLiveScores(fixtures = [], now = Date.now()) {
  const tiedKnockoutMissingWinner = (f) => {
    if (!f?.result || f.status !== "FINISHED") return false;
    const [home, away] = String(f.result).split("-").map(Number);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home !== away) return false;
    const hasWinner = Boolean(f.winnerSide || f.winningTeamId || f.winnerTeamId)
      || (f.homeShootoutScore !== null && f.homeShootoutScore !== undefined && f.awayShootoutScore !== null && f.awayShootoutScore !== undefined);
    if (hasWinner) return false;
    const stage = String(f.stage || "").toUpperCase();
    const isKnockout = (stage && stage !== "GROUP_STAGE") || /^wc-gw[4-8]/i.test(String(f.id || ""));
    if (!isKnockout) return false;
    if (!f.date) return true;
    const kickoff = new Date(f.date).getTime();
    return Number.isFinite(kickoff) && kickoff <= now + 24 * 3600000 && kickoff >= now - 72 * 3600000;
  };

  if (!fixtures?.length) return false;
  return fixtures.some(f => {
    if (tiedKnockoutMissingWinner(f)) return true;
    if (f.result || f.status === "POSTPONED") return false;
    if (f.status === "FINISHED") return true;
    if (f.status === "IN_PLAY" || f.status === "PAUSED") return true;
    if (!f.date) return false;
    const kickoff = new Date(f.date).getTime();
    if (!Number.isFinite(kickoff)) return false;
    return kickoff <= now + 5 * 60000 && kickoff >= now - 72 * 3600000;
  });
}

// Poll the competition's live-score API during active match windows.
function useLiveScores(gw, fixtures, competition = "PL", season = 2025, initialLiveScores = EMPTY_LIVE_SCORES) {
  const cacheKey = liveScoreCacheKey(gw, fixtures, competition, season);
  const [liveData, setLiveData] = useState(() => mergeLiveScoreMaps(LIVE_SCORE_CACHE.get(cacheKey), initialLiveScores));
  const fixturesRef = useRef(fixtures);
  fixturesRef.current = fixtures;

  useEffect(() => {
    const seeded = mergeLiveScoreMaps(LIVE_SCORE_CACHE.get(cacheKey), initialLiveScores);
    if (Object.keys(seeded).length) setLiveData(prev => mergeLiveScoreMaps(seeded, prev));
  }, [cacheKey, initialLiveScores]);

  useEffect(() => {
    if (isPastGroup({competition,season}) || !gw || (competition !== "PL" && competition !== "LL" && competition !== "CL" && competition !== "WC")) {
      setLiveData({});
      return;
    }
    let cancelled = false;
    let timer = null;
    let running = false;

    const schedulePoll = (delay) => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled || running || document.visibilityState !== "visible") return;
      if (!shouldFetchLiveScores(fixturesRef.current)) {
        // No live window: check again in 60s in case a match is about to start
        schedulePoll(60_000);
        return;
      }
      running = true;
      try {
        const dateList = competition === "WC" ? liveScoreDatesForFixtures(fixturesRef.current) : [];
        const params = new URLSearchParams({ week: String(gw), competition, season: String(season) });
        if (dateList.length) params.set("dates", dateList.join(","));
        const res = await fetch(`/api/live?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        const map = {};
        (data.matches || []).forEach(m => {
          map[`${m.home}|${m.away}`] = m;
        });
        LIVE_SCORE_CACHE.set(cacheKey, map);
        setLiveData(map);
      } catch (_) { /* Live polling retries on the next scheduled interval. */ }
      running = false;
      schedulePoll(LIVE_POLL_INTERVAL_MS);
    };

    const onLiveVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (!running && !timer) poll();
    };

    document.addEventListener("visibilitychange", onLiveVisibilityChange);
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onLiveVisibilityChange);
    };
  }, [gw, competition, season, cacheKey]);

  return liveData;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&family=Plus+Jakarta+Sans:wght@500;700;800&family=Nunito+Sans:wght@400;600;700;800&display=swap');
  :root{--bg:#080810;--surface:#0e0e1a;--card:#0c0c18;--card-hi:#0f0f1d;--card-hover:#10101c;--input-bg:#0a0a14;--border:#1a1a26;--border2:#1e1e2e;--border3:#10101e;--text:#e8e4d9;--text-dim:#555566;--text-dim2:#666;--text-dim3:#555;--text-mid:#999;--text-bright:#fff;--text-inv:#000;--scrollbar:#222;--btn-bg:#fff;--btn-text:#000;--font-mono:'DM Mono',monospace;}
  [data-theme="light"]{--bg:#f4f1e8;--surface:#fff;--card:#eeeae0;--card-hi:#e8e5db;--card-hover:#e5e2d8;--input-bg:#fff;--border:#dddad0;--border2:#e0ddd4;--border3:#e4e1d8;--text:#1a1814;--text-dim:#888;--text-dim2:#666;--text-dim3:#777;--text-mid:#444;--text-bright:#0f0d0a;--text-inv:#f4f1e8;--scrollbar:#ccc;--btn-bg:#111;--btn-text:#f4f1e8;--font-mono:'DM Mono',monospace;}
  [data-theme="excel"]{--bg:#ffffff;--surface:#ffffff;--card:#f9f9f9;--card-hi:#f2f2f2;--card-hover:#efefef;--input-bg:#fff;--border:#d0d0d0;--border2:#e0e0e0;--border3:#e8e8e8;--text:#1a1a1a;--text-dim:#888;--text-dim2:#999;--text-dim3:#aaa;--text-mid:#444;--text-bright:#000;--text-inv:#fff;--scrollbar:#ccc;--btn-bg:#107c41;--btn-text:#fff;--font-mono:Arial,Calibri,sans-serif;}
  [data-theme="terminal"]{--bg:#000000;--surface:#0a0a0a;--card:#050505;--card-hi:#0d0d0d;--card-hover:#111;--input-bg:#000;--border:#1a3a1a;--border2:#1f3f1f;--border3:#0d200d;--text:#00cc44;--text-dim:#005522;--text-dim2:#006622;--text-dim3:#004418;--text-mid:#00aa33;--text-bright:#00ff55;--text-inv:#000;--scrollbar:#003311;--btn-bg:#00cc44;--btn-text:#000;--font-mono:'DM Mono',monospace;}
  [data-theme="nord"]{--bg:#2e3440;--surface:#3b4252;--card:#353c4a;--card-hi:#3b4357;--card-hover:#404858;--input-bg:#2e3440;--border:#434c5e;--border2:#4c566a;--border3:#3a4154;--text:#eceff4;--text-dim:#616e88;--text-dim2:#555f73;--text-dim3:#4a5368;--text-mid:#d8dee9;--text-bright:#eceff4;--text-inv:#2e3440;--scrollbar:#434c5e;--btn-bg:#88c0d0;--btn-text:#2e3440;--font-mono:'DM Mono',monospace;}
  [data-theme="pitch"]{--bg:#0d1f0d;--surface:#122012;--card:#0f1c0f;--card-hi:#142214;--card-hover:#162516;--input-bg:#0a180a;--border:rgba(255,255,255,0.22);--border2:rgba(255,255,255,0.32);--border3:rgba(255,255,255,0.1);--text:#d4ecd4;--text-dim:#3a6a3a;--text-dim2:#2e562e;--text-dim3:#264426;--text-mid:#7ab87a;--text-bright:#e8f5e8;--text-inv:#0d1f0d;--scrollbar:rgba(255,255,255,0.15);--btn-bg:#4caf50;--btn-text:#0d1f0d;--font-mono:'DM Mono',monospace;}
  [data-theme="velvet"]{--bg:#120816;--surface:#1a0f1f;--card:#180d1d;--card-hi:#221229;--card-hover:#291631;--input-bg:#140a18;--border:#3a2344;--border2:#4a2d58;--border3:#26132d;--text:#f7d6ea;--text-dim:#7a5a71;--text-dim2:#8f6d84;--text-dim3:#62485c;--text-mid:#d6adc7;--text-bright:#fff2fa;--text-inv:#120816;--scrollbar:#4a2d58;--btn-bg:#f472b6;--btn-text:#1b0d18;--font-mono:'DM Mono',monospace;}
  [data-theme="clarity"]{--bg:#111;--surface:#1a1a1a;--card:#171717;--card-hi:#222;--card-hover:#252525;--input-bg:#141414;--border:#444;--border2:#555;--border3:#2a2a2a;--text:#f1f1f1;--text-dim:#999;--text-dim2:#888;--text-dim3:#777;--text-mid:#d0d0d0;--text-bright:#fff;--text-inv:#111;--scrollbar:#555;--btn-bg:#d7d7d7;--btn-text:#111;--font-mono:'DM Mono',monospace;filter:grayscale(1);}
  [data-theme="spotify"]{--bg:#121212;--surface:#181818;--card:#1f1f1f;--card-hi:#252525;--card-hover:#2a2a2a;--input-bg:#1f1f1f;--border:#333;--border2:#3a3a3a;--border3:#292929;--text:#ffffff;--text-dim:#727272;--text-dim2:#6a6a6a;--text-dim3:#5a5a5a;--text-mid:#b3b3b3;--text-bright:#ffffff;--text-inv:#121212;--scrollbar:#535353;--btn-bg:#1ed760;--btn-text:#000000;--font-mono:'Nunito Sans',sans-serif;--spotify-green:#1ed760;--spotify-green-dim:#1db954;--spotify-pill:500px;--spotify-shadow:rgba(0,0,0,0.5) 0px 8px 24px;--spotify-shadow-sm:rgba(0,0,0,0.3) 0px 4px 12px;}
  [data-theme="index"]{--bg:#f6f6f7;--surface:#ffffff;--card:#f0f0f2;--card-hi:#f7f7f8;--card-hover:#ebebee;--input-bg:#ffffff;--border:rgba(0,0,0,0.06);--border2:rgba(0,0,0,0.08);--border3:rgba(0,0,0,0.05);--text:#121417;--text-dim:#7b818a;--text-dim2:#8f959d;--text-dim3:#6f7680;--text-mid:#565d66;--text-bright:#111315;--text-inv:#ffffff;--scrollbar:#cfd4db;--btn-bg:#15181c;--btn-text:#ffffff;--font-mono:Inter,system-ui,sans-serif;}
  html,body{background:var(--bg);}
  html[data-theme="index"],body[data-theme="index"]{background:#f6f6f7;}
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:var(--scrollbar);border-radius:2px;}
  @keyframes fadein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  @keyframes perfectShimmer{0%{transform:translateX(-120%);}55%,100%{transform:translateX(130%);}}
  @keyframes dotP{0%,100%{opacity:0.3;transform:scale(0.75);}50%{opacity:1;transform:scale(1);}}
  @keyframes overlayIn{from{opacity:0;}to{opacity:1;}}
  @keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(6px);}to{opacity:1;transform:scale(1) translateY(0);}}
  .fade{animation:fadein 0.2s cubic-bezier(0.23,1,0.32,1) forwards;}
  .frow{transition:background 0.12s;}.frow:hover{background:var(--card-hover)!important;}
  .modal-overlay{animation:overlayIn 0.18s ease forwards;}
  .modal-panel{animation:modalIn 0.2s cubic-bezier(0.23,1,0.32,1) forwards;}
  .pab-btn:active:not([disabled]){transform:scale(0.97);}
  .pab-input{transition:border-color 0.15s,box-shadow 0.15s;}.pab-input:focus{border-color:var(--text-dim)!important;box-shadow:0 0 0 1px var(--text-dim)!important;outline:none;}
  .title-tooltip{display:none;}
  @media(hover:hover) and (pointer:fine){
    .title-badge{cursor:help;}
    .title-tooltip-floating{display:block;position:fixed;width:max-content;max-width:230px;background:var(--surface);border:1px solid var(--border2);border-radius:6px;padding:7px 9px;color:var(--text-mid);font-size:10px;font-weight:500;letter-spacing:.2px;line-height:1.35;text-transform:none;text-shadow:none;white-space:normal;box-shadow:0 10px 24px rgba(0,0,0,.24);z-index:9999;pointer-events:none;}
  }
  @media(prefers-reduced-motion:reduce){.fade,.modal-overlay,.modal-panel{animation-duration:0.01ms!important;}.pab-btn:active:not([disabled]){transform:none;}.title-tooltip-floating{transition:none!important;}}
  .nb{background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;transition:color 0.15s,border-color 0.15s,background 0.15s;}
  .nb:hover{color:var(--text-mid)!important;}
  .nb.active{color:var(--text-bright)!important;border-bottom-color:var(--text)!important;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
  @keyframes thumbdown{0%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(-70px) scale(1.5);}}
  @keyframes ballspin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
  @keyframes ptsGlitch{0%{transform:translateX(0)}20%{transform:translateX(-0.5px)}40%{transform:translateX(0.8px)}60%{transform:translateX(-0.7px)}100%{transform:translateX(0)}}
  @keyframes ptsPulse{0%,100%{opacity:1}50%{opacity:.72}}
  @keyframes ptsShimmer{0%{background-position:200% center}100%{background-position:-200% center}}
  .thumbdown{position:fixed;pointer-events:none;font-size:26px;animation:thumbdown 0.8s ease-out forwards;z-index:9999;}
  .pts-label-glitch{animation:ptsGlitch 1.1s ease-in-out infinite alternate;display:inline-block}
  .pts-label-pulse{animation:ptsPulse 1.6s ease-in-out infinite;display:inline-block}
  .pts-label-shimmer{background:linear-gradient(90deg,currentColor 0%, #fff 45%, currentColor 90%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ptsShimmer 1.8s linear infinite;display:inline-block}
  .group-tab-nav{display:flex;gap:0;flex-shrink:0;}
  .group-tab-nav .nb{min-width:0;overflow:hidden;}
  .group-tab-nav .group-tab-icon{display:none;line-height:0;}
  .group-tab-nav .group-tab-label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  [data-theme="index"] body{background-attachment:fixed;}
  [data-theme="index"] .frow:hover{background:#f5f5f6!important;}
  [data-theme="index"] .nb{border-bottom-width:1px;font-weight:500;letter-spacing:.2px;color:var(--text-dim2)!important;}
  [data-theme="index"] .nb:hover{color:var(--text-bright)!important;}
  [data-theme="index"] .nb.active{color:var(--text-bright)!important;border-bottom-color:rgba(0,0,0,.18)!important;}
  [data-theme="index"] .group-tab-nav{background:transparent;}
  [data-theme="index"] button,[data-theme="index"] input,[data-theme="index"] select{transition:background .18s ease,color .18s ease,border-color .18s ease,box-shadow .22s ease,transform .18s ease;}
  [data-theme="index"] button:hover{box-shadow:none;}
  [data-theme="index"] input{box-shadow:0 0 0 1px rgba(0,0,0,.03) inset;}
  [data-theme="index"] .glass-panel{background:var(--surface);border:1px solid var(--border2);box-shadow:0 2px 8px rgba(25,35,20,.025);}
  [data-theme="index"] .liquid-card{position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--border2);box-shadow:none;}
  [data-theme="index"] .index-grid-bg{position:relative;}
  [data-theme="index"] .index-grid-bg::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(0,0,0,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.04) 1px, transparent 1px);background-size:48px 48px;mask-image:linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.14));pointer-events:none;}
  [data-theme="index"] .liquid-card::before,[data-theme="index"] .liquid-card::after{content:none;}
  [data-theme="index"] .pill-nav{background:var(--surface);border:1px solid var(--border2);box-shadow:0 2px 8px rgba(25,35,20,.025);}
  [data-theme="index"] .pill-nav-link{background:transparent;border-radius:12px;transition:background .15s,color .15s;}
  [data-theme="index"] .pill-nav-link:hover{background:rgba(0,0,0,.05)!important;color:var(--text-bright)!important;}
  [data-theme="index"] .mint-text{color:var(--text-bright);}
  :root{--dashboard-card-bg:#0e0e1a;--dashboard-summary-bg:#11111e;--dashboard-summary-text:#e8e4d9;--dashboard-accent:#8888cc;--dashboard-accent-text:#0b0b14;--dashboard-attention:#aaa4dc;--dashboard-urgent:#e06c75;--dashboard-track:#29293a;}
  [data-theme="light"]{--dashboard-card-bg:#fff;--dashboard-summary-bg:#e8e5db;--dashboard-summary-text:#1a1814;--dashboard-accent:#22201b;--dashboard-accent-text:#f4f1e8;--dashboard-attention:#8b5c09;--dashboard-urgent:#ac3026;--dashboard-track:#d5d1c7;}
  [data-theme="excel"]{--dashboard-card-bg:#fff;--dashboard-summary-bg:#edf6f1;--dashboard-summary-text:#153d29;--dashboard-accent:#107c41;--dashboard-accent-text:#fff;--dashboard-attention:#107c41;--dashboard-urgent:#c43131;--dashboard-track:#c9ded2;}
  [data-theme="terminal"]{--dashboard-card-bg:#050505;--dashboard-summary-bg:#071309;--dashboard-summary-text:#00dd49;--dashboard-accent:#00cc44;--dashboard-accent-text:#000;--dashboard-attention:#00cc44;--dashboard-urgent:#00ff55;--dashboard-track:#14351c;}
  [data-theme="nord"]{--dashboard-card-bg:#3b4252;--dashboard-summary-bg:#434c5e;--dashboard-summary-text:#eceff4;--dashboard-accent:#88c0d0;--dashboard-accent-text:#26303d;--dashboard-attention:#ebcb8b;--dashboard-urgent:#bf616a;--dashboard-track:#596579;}
  [data-theme="pitch"]{--dashboard-card-bg:#122012;--dashboard-summary-bg:#183018;--dashboard-summary-text:#e8f5e8;--dashboard-accent:#6bcf70;--dashboard-accent-text:#0d1f0d;--dashboard-attention:#81c784;--dashboard-urgent:#ef9a9a;--dashboard-track:#315431;}
  [data-theme="velvet"]{--dashboard-card-bg:#1a0f1f;--dashboard-summary-bg:#28162f;--dashboard-summary-text:#fff2fa;--dashboard-accent:#f472b6;--dashboard-accent-text:#1b0d18;--dashboard-attention:#f0a6cf;--dashboard-urgent:#ff7f9f;--dashboard-track:#553260;}
  [data-theme="clarity"]{--dashboard-card-bg:#1a1a1a;--dashboard-summary-bg:#252525;--dashboard-summary-text:#f1f1f1;--dashboard-accent:#d7d7d7;--dashboard-accent-text:#111;--dashboard-attention:#d7d7d7;--dashboard-urgent:#f1f1f1;--dashboard-track:#595959;}
  [data-theme="spotify"]{--dashboard-card-bg:#1f1f1f;--dashboard-summary-bg:#242424;--dashboard-summary-text:#fff;--dashboard-accent:#1ed760;--dashboard-accent-text:#000;--dashboard-attention:#1ed760;--dashboard-urgent:#f15e6c;--dashboard-track:#4a4a4a;}
  [data-theme="index"]{--dashboard-card-bg:#fff;--dashboard-summary-bg:#f0f0f2;--dashboard-summary-text:#202328;--dashboard-accent:#15181c;--dashboard-accent-text:#fff;--dashboard-attention:#8b5c09;--dashboard-urgent:#ac3026;--dashboard-track:#d7d8dc;}
  :root{--countdown-calm:#aaa4dc;--countdown-soon:#f6a21a;--countdown-urgent:#e06c75;--countdown-critical:#ff4054;}
  [data-theme="light"],[data-theme="excel"],[data-theme="index"]{--countdown-calm:#6555a5;--countdown-soon:#9a5700;--countdown-urgent:#b33a49;--countdown-critical:#c9152d;}
  .group-dashboard-shell{max-width:920px;margin:0 auto;padding:48px 24px 64px;}
  .group-dashboard-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;margin-bottom:24px;}
  .group-dashboard-summary{display:flex;align-items:center;justify-content:space-between;gap:20px;background:var(--dashboard-summary-bg);color:var(--dashboard-summary-text);border:1px solid var(--border2);border-radius:14px;padding:16px 18px;margin-bottom:14px;}
  .group-dashboard-summary-copy{display:flex;align-items:center;gap:12px;min-width:0;}
  .group-dashboard-summary-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 4px color-mix(in srgb,#f59e0b 18%,transparent);flex:0 0 auto;}
  .group-dashboard-list{display:flex;flex-direction:column;gap:10px;margin-bottom:40px;}
  .group-dashboard-card{background:var(--dashboard-card-bg);border:1px solid var(--border2);border-radius:14px;padding:18px;transition:border-color .18s ease,transform .18s ease;}
  .group-dashboard-card:hover{border-color:color-mix(in srgb,var(--text-dim) 45%,var(--border2));}
  .group-dashboard-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;}
  .group-dashboard-open{min-width:0;background:none;border:none;padding:0;text-align:left;cursor:pointer;color:inherit;font-family:inherit;}
  .group-dashboard-status{display:inline-flex;align-items:center;gap:7px;border:1px solid currentColor;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:700;line-height:1;white-space:nowrap;}
  .group-dashboard-status::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;}
  .group-dashboard-card-grid{display:grid;grid-template-columns:minmax(250px,1.4fr) minmax(180px,.8fr) auto;gap:24px;align-items:end;}
  .group-dashboard-fixture{display:flex;flex-direction:column;gap:7px;min-width:0;}
  .group-dashboard-fixture-time{display:grid;grid-template-columns:auto 1fr;align-items:baseline;column-gap:8px;row-gap:2px;margin-bottom:2px;}
  .group-dashboard-fixture-time>span:first-child{font-size:10px;color:var(--text-dim2);letter-spacing:1px;text-transform:uppercase;}
  .group-dashboard-fixture-time strong{font-size:13px;color:var(--dashboard-accent);font-weight:700;}
  .dashboard-countdown[data-urgency="calm"]{color:var(--countdown-calm)!important;}
  .dashboard-countdown[data-urgency="soon"]{color:var(--countdown-soon)!important;}
  .dashboard-countdown[data-urgency="urgent"]{color:var(--countdown-urgent)!important;}
  .dashboard-countdown[data-urgency="critical"]{color:var(--countdown-critical)!important;font-weight:800!important;animation:deadlinePulse 1.05s ease-in-out infinite;}
  @keyframes deadlinePulse{0%,100%{opacity:1}50%{opacity:.52}}
  .group-dashboard-fixture-date{grid-column:1/-1;font-size:10px;color:var(--text-dim);}
  .group-dashboard-team{display:flex;align-items:center;gap:9px;min-width:0;font-size:13px;color:var(--text-bright);font-weight:600;}
  .group-dashboard-team span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .group-dashboard-progress{display:flex;flex-direction:column;gap:8px;min-width:0;}
  .group-dashboard-progress-copy{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px;color:var(--text-mid);}
  .group-dashboard-progress-track{height:8px;border:1px solid color-mix(in srgb,var(--dashboard-track) 75%,var(--text-mid));border-radius:999px;background:var(--dashboard-track);overflow:hidden;}
  .group-dashboard-progress-fill{height:100%;border-radius:999px;background:var(--dashboard-accent);transition:transform .25s cubic-bezier(.23,1,.32,1);transform-origin:left center;}
  .group-dashboard-action{min-height:44px;padding:0 16px;border:1px solid var(--border2);border-radius:10px;background:var(--card);color:var(--text-bright);font:600 12px 'DM Mono',monospace;cursor:pointer;white-space:nowrap;}
  .group-dashboard-action[data-primary="true"]{background:var(--dashboard-accent);border-color:var(--dashboard-accent);color:var(--dashboard-accent-text);}
  [data-theme="index"] .group-dashboard-shell{font-family:'Plus Jakarta Sans',sans-serif;}
  [data-theme="index"] .group-dashboard-card{border-radius:18px;padding:20px;box-shadow:0 1px 0 rgba(0,0,0,.02);}
  [data-theme="index"] .group-dashboard-action{font-family:'Plus Jakarta Sans',sans-serif;}
  [data-theme="index"] .group-dashboard-summary{border-radius:18px;}
  @media(prefers-reduced-motion:reduce){.dashboard-countdown[data-urgency="critical"]{animation:none!important;}}
  @keyframes liquidFlow{0%,100%{transform:translate3d(0,0,0) scale(1);}50%{transform:translate3d(1.5%, -2%, 0) scale(1.04);}}
  @keyframes liquidFlowB{0%,100%{transform:translate3d(0,0,0) scale(1);}50%{transform:translate3d(-1%, 1.5%, 0) scale(1.02);}}
  @keyframes marqueeScroll{from{transform:translate3d(0,0,0);}to{transform:translate3d(-50%,0,0);}}
  @keyframes brandTicker{from{transform:translate3d(0,0,0);}to{transform:translate3d(-50%,0,0);}}
  @media(max-width:900px){.group-tab-nav{position:fixed!important;display:flex!important;bottom:0;left:0;right:0;width:100%;height:calc(58px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);border-top:1px solid var(--border);background:var(--bg);z-index:100;justify-content:stretch;align-items:stretch;overflow:hidden;}.mob-hide{display:none!important;}.group-tab-nav .nb{height:58px!important;flex:1 1 0;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px;padding:4px 2px!important;border:none!important;border-radius:0!important;background:transparent!important;transition:color .15s,background .15s!important;}.group-tab-nav .nb.active{border:none!important;background:var(--card-hi)!important;}.group-tab-nav .group-tab-icon{display:block;}.pad-bot{padding-bottom:calc(78px + env(safe-area-inset-bottom))!important;}[data-theme="index"] .group-tab-nav{background:rgba(255,255,255,.96);border-top-color:rgba(0,0,0,.08);}}
  @media(max-width:620px){input{font-size:16px!important;}.gw-outer{width:100%!important;}.gw-controls{width:100%!important;}.gw-controls .gw-strip{flex:1!important;max-width:none!important;}}
  @media(max-width:360px){.demo-exit-label{display:none;}}
  .pab-app-shell[data-compact="true"] .mob-hide{display:none!important;}
  .pab-app-shell[data-compact="true"] .group-tab-nav{position:fixed!important;display:flex!important;bottom:0;left:0;right:0;width:var(--pab-visible-width,100%);height:calc(58px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);border-top:1px solid var(--border);background:var(--bg);z-index:100;justify-content:stretch;align-items:stretch;overflow:hidden;}
  .pab-app-shell[data-compact="true"] .group-tab-nav .nb{height:58px!important;flex:1 1 0;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px;padding:4px 2px!important;border:none!important;border-radius:0!important;background:transparent!important;}
  .pab-app-shell[data-compact="true"] .group-tab-nav .nb.active{background:var(--card-hi)!important;}
  .pab-app-shell[data-compact="true"] .group-tab-nav .group-tab-icon{display:block;}
  .pab-app-shell[data-compact="true"] .pad-bot{padding-bottom:calc(78px + env(safe-area-inset-bottom))!important;}
  .pab-app-shell[data-phone="true"] input{font-size:16px!important;}
  .pab-app-shell[data-phone="true"] .gw-outer{width:100%!important;}
  .pab-app-shell[data-phone="true"] .gw-controls{width:100%!important;}
  .pab-app-shell[data-phone="true"] .gw-controls .gw-strip{flex:1!important;max-width:none!important;}
  .pab-app-shell[data-small-phone="true"] .demo-exit-label{display:none;}
  @media(max-width:820px){
    [data-theme="index"] .land-hero{grid-template-columns:1fr!important;gap:28px!important;padding-top:20px!important;}
    [data-theme="index"] .land-steps{grid-template-columns:1fr!important;gap:14px!important;}
    [data-theme="index"] .land-feats{grid-template-columns:1fr!important;}
  }
  @media(max-width:620px){
    [data-theme="index"] .pill-nav{max-width:none!important;margin:0 8px!important;padding:8px 10px!important;height:auto!important;display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;row-gap:8px!important;column-gap:8px!important;}
    [data-theme="index"] .index-mobile-brand{padding:0 4px!important;height:auto!important;font-size:12px!important;}
    [data-theme="index"] .index-mobile-links{display:none!important;}
    [data-theme="index"] .index-mobile-links button{height:30px!important;padding:0 10px!important;font-size:12px!important;}
    [data-theme="index"] .index-mobile-cta{height:34px!important;padding:0 12px!important;font-size:12px!important;white-space:nowrap!important;}
    [data-theme="index"] .hero-glow{overflow:visible;}
    [data-theme="index"] .index-mobile-stack{max-width:100%!important;}
    [data-theme="index"] .index-mobile-card{left:0!important;top:0!important;position:relative!important;margin-bottom:12px;}
    [data-theme="index"] .index-mobile-marquee{margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important;}
    .group-dashboard-shell{padding:30px 16px 48px;}
    .group-dashboard-heading{grid-template-columns:1fr;gap:8px;align-items:start;margin-bottom:20px;}
    .group-dashboard-summary{align-items:flex-start;padding:15px 16px;}
    .group-dashboard-summary-copy{align-items:flex-start;}
    .group-dashboard-summary-time{text-align:right;line-height:1.15;}
    .group-dashboard-card{padding:16px;}
    .group-dashboard-card-head{margin-bottom:16px;}
    .group-dashboard-card-grid{grid-template-columns:1fr;gap:18px;align-items:stretch;}
    .group-dashboard-action{width:100%;}
  }
  .gw-strip{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}.gw-strip::-webkit-scrollbar{display:none;}
  .wc-standings-scroll::-webkit-scrollbar{display:none;}
  .excel-mode table,.excel-mode table *{font-family:Arial,Calibri,sans-serif!important;}
  .excel-mode table td,.excel-mode table th{border:1px solid #888888;border-radius:0!important;padding:5px 8px!important;}
  .excel-mode table thead tr{background:var(--card-hi)!important;}
  .excel-mode table thead th{font-weight:700!important;color:var(--text-mid)!important;}
  .excel-mode table{border-collapse:collapse!important;border:1px solid var(--border2)!important;}

  [data-theme="spotify"],[data-theme="spotify"] *,[data-theme="spotify"] button,[data-theme="spotify"] input,[data-theme="spotify"] span,[data-theme="spotify"] div,[data-theme="spotify"] td,[data-theme="spotify"] th,[data-theme="spotify"] a,[data-theme="spotify"] h1,[data-theme="spotify"] h2,[data-theme="spotify"] h3,[data-theme="spotify"] p{font-family:'Nunito Sans',sans-serif!important;}
  [data-theme="spotify"] body{background:#121212;}

  [data-theme="spotify"] header{background:linear-gradient(180deg,#121212 0%,#121212ee 100%)!important;border-bottom:none!important;box-shadow:0 4px 20px rgba(0,0,0,0.5)!important;backdrop-filter:blur(12px)!important;}

  [data-theme="spotify"] button{border-radius:500px!important;font-weight:700!important;letter-spacing:0.8px!important;text-transform:uppercase!important;font-size:12px!important;transition:background 0.2s ease,color 0.2s ease,box-shadow 0.2s ease,border-color 0.2s ease,transform 0.1s ease!important;border-color:transparent!important;}
  [data-theme="spotify"] button:hover{transform:scale(1.03);}
  [data-theme="spotify"] button:active{transform:scale(0.97);}

  [data-theme="spotify"] input{border-radius:500px!important;border:none!important;box-shadow:rgb(18,18,18) 0px 1px 0px, rgb(62,62,62) 0px 0px 0px 1px inset!important;background:#2a2a2a!important;padding:12px 20px!important;font-weight:600!important;font-size:14px!important;color:#fff!important;}
  [data-theme="spotify"] input:focus{box-shadow:rgb(18,18,18) 0px 1px 0px, #1ed760 0px 0px 0px 2px inset!important;outline:none!important;}
  [data-theme="spotify"] input::placeholder{color:#727272!important;}
  [data-theme="spotify"] input[inputmode="numeric"]{border-radius:8px!important;padding:5px 0!important;font-size:inherit!important;box-shadow:none!important;border:1px solid #3a3a3a!important;background:var(--input-bg)!important;}
  [data-theme="spotify"] input[inputmode="numeric"]:focus{border-color:#1ed760!important;box-shadow:0 0 0 1px #1ed76050!important;}

  [data-theme="spotify"] .nb{border:none!important;border-bottom:none!important;border-radius:500px!important;padding:8px 18px!important;margin:0 2px!important;font-weight:700!important;font-size:11px!important;letter-spacing:1.6px!important;text-transform:uppercase!important;transition:background 0.2s, color 0.2s!important;color:#b3b3b3!important;}
  [data-theme="spotify"] .nb:hover{background:#282828!important;color:#fff!important;}
  [data-theme="spotify"] .nb.active{background:#333!important;color:#1ed760!important;border:none!important;border-bottom:none!important;}

  [data-theme="spotify"] .group-tab-nav{background:linear-gradient(180deg,#121212ee,#121212)!important;border-top:none!important;box-shadow:0 -6px 24px rgba(0,0,0,0.7)!important;backdrop-filter:blur(12px)!important;}
  [data-theme="spotify"] .group-tab-nav .nb{border:none!important;border-bottom:none!important;border-radius:0!important;margin:0!important;letter-spacing:0!important;}
  [data-theme="spotify"] .group-tab-nav .nb.active{color:#1ed760!important;border:none!important;}

  [data-theme="spotify"] .frow:hover{background:#282828!important;}
  [data-theme="spotify"] .gw-strip button{border-radius:500px!important;font-weight:700!important;}
  [data-theme="spotify"] ::-webkit-scrollbar-thumb{background:#535353;border-radius:500px;}
  [data-theme="spotify"] ::selection{background:#1ed76040;color:#fff;}

  [data-theme="spotify"] div[style*="dashed"]{border-style:solid!important;border-color:#333!important;}
  [data-theme="spotify"] .land-hero-btns button{font-size:14px!important;padding:14px 32px!important;letter-spacing:1.4px!important;-webkit-font-smoothing:antialiased!important;-moz-osx-font-smoothing:grayscale!important;backface-visibility:hidden!important;transform:translateZ(0)!important;}
  [data-theme="spotify"] .land-hero-btns button:hover{transform:translateZ(0) scale(1.03)!important;filter:none!important;}
  [data-theme="spotify"] .land-hero-btns button:active{transform:translateZ(0) scale(0.97)!important;}
  [data-theme="spotify"] .land-cta-section button{font-size:14px!important;padding:14px 32px!important;letter-spacing:1.4px!important;-webkit-font-smoothing:antialiased!important;backface-visibility:hidden!important;transform:translateZ(0)!important;}
  [data-theme="spotify"] .land-cta-section button:hover{transform:translateZ(0) scale(1.03)!important;filter:none!important;}

  @keyframes spotifyPulse{0%,100%{box-shadow:0 0 0 0 rgba(30,215,96,0.35);}50%{box-shadow:0 0 0 8px rgba(30,215,96,0);}}
`;

/* ── AUTH ─────────────────────────────────────────── */
/* ── LANDING PAGE ─────────────────────────────────── */

function AuthScreen({ onLogin, onBack, successMsg, joinCode=null, theme="dark" }) {
  const [mode,setMode]=useState("login");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [demoLoading,setDemoLoading]=useState(false);
  const [email,setEmail]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [thumbs,setThumbs]=useState([]);
  const [forgotMode,setForgotMode]=useState(false);
  const [forgotEmail,setForgotEmail]=useState("");
  const [forgotMsg,setForgotMsg]=useState("");
  const [forgotLoading,setForgotLoading]=useState(false);
  const spawnThumb = (e) => {
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
  };

  const sendReset = async () => {
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    try {
      await fetch("/api/send-reset", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({email: forgotEmail.trim()}),
      });
    } catch { /* Keep password-reset responses intentionally non-enumerating. */ }
    setForgotMsg("If that email is registered, a reset link has been sent.");
    setForgotLoading(false);
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    const u = await sget(`user:${DEMO_SHARED_USERNAME}`);
    onLogin(u || { username: DEMO_SHARED_USERNAME, displayName: "Demo", password: "demo", email: "", groupIds: [] });
  };

  const handle = async () => {
    if (!username.trim()||!password.trim()){setError("Fill in all fields.");return;}
    setLoading(true);setError("");
    if (mode==="register") {
      if (!email.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError("Valid email required.");setLoading(false);return;}
      if (password.trim().length<6){setError("Password must be at least 6 characters.");setLoading(false);return;}
      if (password!==confirmPassword){setError("Passwords do not match.");setLoading(false);return;}
      const uname = username.toLowerCase();
      if (!/^[a-z0-9_-]+$/.test(uname)) {
        setError("Username may only contain letters, numbers, underscores, and hyphens.");
        setLoading(false);
        return;
      }
      const { ok, data } = await callAPI('auth-register', { username: uname, password, email: email.trim().toLowerCase() });
      if (!ok || !data.user){setError(data.error||"Registration failed - please try again.");setLoading(false);return;}
      onLogin(data.user);
    } else {
      const loginResult = await callAPI('auth-login', { username: username.toLowerCase(), password });
      if (!loginResult.ok || !loginResult.data.user) {
        const message = loginResult.status === 401
          ? (loginResult.data.error || "Invalid credentials.")
          : (loginResult.status >= 500
            ? "Sign in is temporarily unavailable. Please try again."
            : (loginResult.error || "Sign in is temporarily unavailable. Please try again."));
        setError(message);
        setLoading(false);
        return;
      }
      onLogin(loginResult.data.user);
    }
    setLoading(false);
  };

  const isIndex = theme === "index";
  const mob = useMobile();

  return (
    <div className={isIndex?"index-grid-bg":undefined} style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",padding:mob?16:24}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:isIndex?(mob?400:920):400,display:isIndex&&!mob?"grid":"block",gridTemplateColumns:isIndex&&!mob?"1.1fr .9fr":undefined,gap:isIndex&&!mob?36:undefined,alignItems:isIndex&&!mob?"center":undefined}}>
        <div style={{textAlign:isIndex?"left":"center",marginBottom:isIndex?(mob?20:0):48}}>
          <div style={{display:"flex",alignItems:"baseline",gap:isIndex?10:8}}>
            <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:isIndex?(mob?"clamp(2rem,8vw,2.6rem)":"clamp(2.4rem,5vw,4rem)"):52,color:"var(--text-bright)",letterSpacing:isIndex?"-0.04em":-3,lineHeight:1.02}}>POINTS</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:400,fontSize:isIndex?(mob?11:13):14,color:"var(--text-dim)",letterSpacing:3}}>are bad</span>
          </div>
          {!mob&&<div style={{fontSize:isIndex?14:10,color:"var(--text-dim)",letterSpacing:isIndex?0.2:7,marginTop:10}}>{isIndex?<>Pick scores. Take the damage. Lowest total wins.</>:<>ARE <span onClick={spawnThumb} style={{cursor:"pointer",userSelect:"none"}}>BAD</span></>}</div>}
          {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}
        </div>
        <div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--surface)",border:"1px solid var(--border2)",borderRadius:isIndex?28:14,padding:32}}>
          {joinCode&&<div style={{background:"#8888cc12",border:"1px solid #8888cc35",borderRadius:8,padding:"10px 12px",marginBottom:18,fontSize:11,color:"#b8b8ff",lineHeight:1.6}}>You're signing in from an invite link. After login, you'll be able to join the group.</div>}
          {forgotMode ? (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{fontSize:12,color:"var(--text-dim)",letterSpacing:1}}>Enter your email and we'll send a reset link.</div>
              <Input value={forgotEmail} onChange={setForgotEmail} placeholder="Email" type="email" autoFocus onKeyDown={e=>e.key==="Enter"&&sendReset()} />
              {forgotMsg&&<div style={{fontSize:12,color:"#22c55e"}}>{forgotMsg}</div>}
              <Btn onClick={sendReset} disabled={forgotLoading||!forgotEmail.trim()||!!forgotMsg} style={{width:"100%",padding:"12px 0",display:"block",textAlign:"center",letterSpacing:2}}>
                {forgotLoading?<Spinner/>:"SEND LINK"}
              </Btn>
              <button onClick={()=>{setForgotMode(false);setForgotMsg("");setForgotEmail("");}} style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,letterSpacing:1,fontFamily:"inherit",padding:0}}>← Back to sign in</button>
            </div>
          ) : (
            <>
              <div style={{display:"flex",background:"var(--bg)",borderRadius:isIndex?14:8,padding:3,marginBottom:28,gap:3}}>
                {["login","register"].map(m=>(
                  <button key={m} onClick={()=>{setMode(m);setError("");setEmail("");setConfirmPassword("");}} style={{flex:1,background:mode===m?"var(--btn-bg)":"transparent",color:mode===m?"var(--btn-text)":"var(--text-dim2)",border:"none",borderRadius:6,padding:"8px 0",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
                    {m==="login"?"Sign In":"Sign Up"}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {mode==="register"&&<Input value={email} onChange={v=>setEmail(v)} placeholder="Email" type="email" autoFocus />}
                <Input value={username} onChange={v=>setUsername(v.toLowerCase())} placeholder="Username" autoFocus={mode==="login"} onKeyDown={e=>e.key==="Enter"&&handle()} />
                <Input value={password} onChange={setPassword} placeholder="Password" type="password" onKeyDown={e=>e.key==="Enter"&&handle()} />
                {mode==="register"&&<Input value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" type="password" onKeyDown={e=>e.key==="Enter"&&handle()} />}
              </div>
              {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:12}}>{error}</div>}
              {successMsg&&<div style={{color:"#22c55e",fontSize:12,marginTop:12}}>{successMsg}</div>}
              <Btn onClick={handle} disabled={loading} style={{width:"100%",marginTop:20,padding:"12px 0",display:"block",textAlign:"center",letterSpacing:2}}>
                {loading?<Spinner/>:mode==="login"?"SIGN IN":"CREATE ACCOUNT"}
              </Btn>
              {mode==="login"&&<div style={{textAlign:"center",marginTop:12}}>
                <button onClick={()=>setForgotMode(true)} style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,letterSpacing:1,fontFamily:"inherit",padding:0}}>Forgot password?</button>
              </div>}
            </>
          )}
        </div>
        <button
          onClick={handleDemo}
          disabled={demoLoading}
          style={{width:"100%",marginTop:16,padding:"11px 0",display:"block",textAlign:"center",
            letterSpacing:isIndex?0.2:2,background:"transparent",border:"1px solid var(--border2)",borderRadius:isIndex?14:8,
            color:"var(--text-dim)",cursor:"pointer",fontSize:isIndex?13:11,fontFamily:isIndex?"inherit":"'DM Mono',monospace",
            transition:"border-color 0.2s,color 0.2s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--text-dim)";e.currentTarget.style.color="var(--text)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.color="var(--text-dim)";}}
        >
          {demoLoading?<Spinner/>:"TRY DEMO"}
        </button>
        {onBack&&<div style={{textAlign:"center",marginTop:16}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,letterSpacing:1,fontFamily:"inherit",padding:0}}>← Back</button>
        </div>}
        <div style={{textAlign:isIndex?"left":"center",marginTop:16,color:"var(--border2)",fontSize:11,letterSpacing:isIndex?0.2:1}}>PL, La Liga, UCL &amp; World Cup 2026 Predictions</div>
      </div>
    </div>
  );
}

/* ── PASSWORD RESET ───────────────────────────────── */
function ResetPasswordScreen({ token, onDone }) {
  const [newPassword,setNewPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const handle = async () => {
    if (!newPassword.trim()){setError("Password required.");return;}
    if (newPassword.trim().length<6){setError("Password must be at least 6 characters.");return;}
    if (newPassword!==confirm){setError("Passwords do not match.");return;}
    setLoading(true);setError("");
    try {
      const res = await fetch("/api/reset-password",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,newPassword}),
      });
      const data = await res.json();
      if (!res.ok){setError(data.error||"Reset failed.");setLoading(false);return;}
      onDone();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",padding:24}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:52,fontWeight:900,color:"var(--text-bright)",letterSpacing:-3,lineHeight:1}}>POINTS</div>
          <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:7,marginTop:10}}>ARE BAD</div>
        </div>
        <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:32}}>
          <div style={{fontSize:12,color:"var(--text-dim)",letterSpacing:2,marginBottom:20}}>SET NEW PASSWORD</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Input value={newPassword} onChange={setNewPassword} placeholder="New password" type="password" autoFocus onKeyDown={e=>e.key==="Enter"&&handle()} />
            <Input value={confirm} onChange={setConfirm} placeholder="Confirm password" type="password" onKeyDown={e=>e.key==="Enter"&&handle()} />
          </div>
          {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:12}}>{error}</div>}
          <Btn onClick={handle} disabled={loading} style={{width:"100%",marginTop:20,padding:"12px 0",display:"block",textAlign:"center",letterSpacing:2}}>
            {loading?<Spinner/>:"SET PASSWORD"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── ACCOUNT SETUP MODAL ─────────────────────────────── */
function AccountSetupModal({ user, onDone, onLogout }) {
  const needsEmail = !user.email;
  const needsPassword = user.password === "password123";

  const [emailVal, setEmailVal] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const pendingUser = useRef(null);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => onDone(pendingUser.current), 1500);
    return () => clearTimeout(t);
  }, [success, onDone]);

  const handle = async () => {
    setError("");
    // Client-side validation
    if (needsEmail) {
      if (!emailVal.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
    }
    const trimmedPw = needsPassword ? pwNew.trim() : "";
    if (needsPassword) {
      if (trimmedPw.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (trimmedPw !== pwConfirm.trim()) { setError("Passwords do not match."); return; }
    }
    setLoading(true);
    try {
      const normEmail = emailVal.trim().toLowerCase();
      if (needsEmail) {
        const { ok, data } = await callAPI('account-change-email', { email: normEmail });
        if (!ok) { setError(data.error || "Failed to save email."); setLoading(false); return; }
      }
      if (needsPassword) {
        const { ok, data } = await callAPI('account-change-password', { currentPassword: user.password || "password123", newPassword: trimmedPw });
        if (!ok) { setError(data.error || "Failed to save password."); setLoading(false); return; }
      }
      pendingUser.current = {
        ...user,
        ...(needsEmail && { email: normEmail }),
        ...(needsPassword && { password: undefined, passwordHash: "set" }),
      };
      setSuccess(true);
    } catch {
      setError("Something went wrong, please try again.");
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.53)",
      zIndex: 2000, display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24,
    }}>
      <div className="modal-panel" style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 14, padding: 32, width: "100%", maxWidth: 400,
        fontFamily: "'DM Mono',monospace",
      }}>
        <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, marginBottom: 8 }}>
          COMPLETE YOUR ACCOUNT
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 24 }}>
          Before you continue, please secure your account.
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "24px 0", fontSize: 14, color: "#22c55e" }}>
            All set!
          </div>
        ) : (
          <>
            {needsEmail && (
              <div style={{ marginBottom: needsPassword ? 16 : 0 }}>
                <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, marginBottom: 6 }}>
                  ADD YOUR EMAIL
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>
                  Add an email address so you can reset your password if you ever get locked out.
                </div>
                <Input value={emailVal} onChange={setEmailVal} placeholder="Email address" type="email" onKeyDown={e => e.key === "Enter" && handle()} />
              </div>
            )}

            {needsEmail && needsPassword && (
              <div style={{ borderTop: "1px solid var(--border3)", margin: "16px 0" }} />
            )}

            {needsPassword && (
              <div>
                <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, marginBottom: 6 }}>
                  SET A NEW PASSWORD
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>
                  Your account is using the default password. Please set a secure one.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Input value={pwNew} onChange={setPwNew} placeholder="New password" type="password" onKeyDown={e => e.key === "Enter" && handle()} />
                  <Input value={pwConfirm} onChange={setPwConfirm} placeholder="Confirm new password" type="password"
                    onKeyDown={e => e.key === "Enter" && handle()} />
                </div>
              </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 12 }}>{error}</div>}
            <Btn onClick={handle} disabled={loading} style={{ width: "100%", marginTop: 20, padding: "12px 0", display: "block", textAlign: "center", letterSpacing: 2 }}>
              {loading ? <Spinner/> : "SAVE & CONTINUE"}
            </Btn>
          </>
        )}
      <div style={{textAlign:"center",marginTop:20}}>
        <button onClick={onLogout} style={{background:"none",border:"none",color:"var(--text-dim3)",cursor:"pointer",fontSize:11,letterSpacing:1,fontFamily:"inherit",padding:0}}>Log out</button>
      </div>
    </div>
    </div>,
    document.body
  );
}

/* ─── WHATS NEW MODAL ───────────────────────────────────────────────────────── */
function WhatsNewModal({ user, onClose, theme="dark" }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [formEmoji, setFormEmoji] = useState("");
  const [formVersion, setFormVersion] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formBullets, setFormBullets] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const isFaris = isDeveloper(user?.username);

  const fetchEntries = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/changelog");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setEntries(data.entries || []);
      lset("pab_changelog_seen", (data.entries || [])[0]?.createdAt ?? 0);
    } catch {
      setError("Couldn't load entries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntries(); }, []);

  const today = () => new Date().toISOString().slice(0, 10);

  const openCreate = () => {
    setEditingId("new");
    setFormEmoji("🎉");
    setFormVersion("");
    setFormTitle("");
    setFormDate(today());
    setFormBullets("");
    setFormError("");
  };

  const openEdit = (e) => {
    setEditingId(e.id);
    setFormEmoji(e.emoji || "🎉");
    setFormVersion(e.version || "");
    setFormTitle(e.title || "");
    setFormDate(e.date || today());
    setFormBullets((e.bullets || []).join("\n"));
    setFormError("");
  };

  const cancelEdit = () => { setEditingId(null); setFormError(""); };

  const saveEntry = async () => {
    setFormError("");
    const title = formTitle.trim();
    const bullets = formBullets.split("\n").map(b => b.trim()).filter(Boolean);
    if (!title) { setFormError("Title is required."); return; }
    if (bullets.length === 0) { setFormError("At least one bullet is required."); return; }
    setFormLoading(true);
    try {
      const isNew = editingId === "new";
      const body = {
        title,
        bullets,
        version: formVersion.trim(),
        emoji: formEmoji.trim() || "🎉",
        date: formDate,
        ...(isNew ? {} : { id: editingId }),
      };
      const res = await fetch("/api/changelog", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFormError(d.error || "Save failed.");
        return;
      }
      setEditingId(null);
      await fetchEntries();
    } catch {
      setFormError("Something went wrong.");
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDelete = async (id) => {
    try {
      const res = await fetch("/api/changelog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDeleteConfirm(null);
      if (res.ok) {
        await fetchEntries();
      } else {
        setError("Delete failed. Please try again.");
      }
    } catch {
      setDeleteConfirm(null);
      setError("Delete failed. Please try again.");
    }
  };

  const formatDate = (d) => {
    if (!d) return "";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch { return d; }
  };

  const formBlock = (
    <div style={{ background: "var(--card)", border: "1px solid var(--border2)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Input value={formEmoji} onChange={setFormEmoji} placeholder="🎉" style={{ width: 52 }} />
        <Input value={formVersion} onChange={setFormVersion} placeholder="v2.5" style={{ width: 80 }} />
        <Input value={formTitle} onChange={setFormTitle} placeholder="Title" style={{ flex: 1 }} />
        <Input value={formDate} onChange={setFormDate} type="date" style={{ width: 140 }} />
      </div>
      <textarea
        value={formBullets}
        onChange={e => setFormBullets(e.target.value)}
        placeholder={"One bullet per line\nAnother change\nAnd another"}
        rows={4}
        style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border2)", borderRadius: 6, color: "var(--text)", fontFamily: "inherit", fontSize: 12, padding: "8px 10px", resize: "vertical", boxSizing: "border-box" }}
      />
      {formError && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 6 }}>{formError}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Btn onClick={saveEntry} disabled={formLoading} style={{ letterSpacing: 1.5 }}>{formLoading ? <Spinner/> : "SAVE"}</Btn>
        <Btn variant="ghost" onClick={cancelEdit}>Cancel</Btn>
      </div>
    </div>
  );

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.53)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column", fontFamily: theme==="index"?"'Plus Jakarta Sans',sans-serif":"inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, fontFamily: theme==="index"?"'Plus Jakarta Sans',sans-serif":"inherit", fontWeight: theme==="index"?600:undefined }}>WHAT'S NEW</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {isFaris && editingId !== "new" && (
            <button onClick={openCreate} style={{ background: "var(--card)", border: "1px dashed var(--border2)", borderRadius: 8, padding: "8px 14px", fontSize: 11, color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, marginBottom: 12, width: "100%", fontWeight: theme==="index"?600:undefined }}>＋ New entry</button>
          )}
          {isFaris && editingId === "new" && formBlock}
          {loading && (
            <div style={{ display: "flex", gap: 5, justifyContent: "center", padding: 32 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-dim)", animation: "dotP 1.2s ease-in-out infinite", animationDelay: `${0.2 * i}s` }} />)}
            </div>
          )}
          {!loading && error && <div style={{ color: "#ef4444", fontSize: 12, textAlign: "center", padding: 32 }}>{error}</div>}
          {!loading && !error && entries.length === 0 && (
            <div style={{ color: "var(--text-dim)", fontSize: 12, textAlign: "center", padding: 32 }}>Nothing here yet.</div>
          )}
          {!loading && !error && entries.map(e => {
            if (editingId === e.id) return (<div key={e.id}>{formBlock}</div>);
            if (deleteConfirm === e.id) return (
              <div key={e.id} style={{ background: "var(--card)", border: "1px solid #ef444440", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-mid)", marginBottom: 10 }}>Delete this entry?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="danger" onClick={() => confirmDelete(e.id)}>Yes, delete</Btn>
                  <Btn variant="ghost" onClick={() => setDeleteConfirm(null)}>No</Btn>
                </div>
              </div>
            );
            return (
              <div key={e.id} style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{e.emoji || "🎉"}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-bright)", fontFamily: theme==="index"?"'Plus Jakarta Sans',sans-serif":"inherit" }}>{e.title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {e.version && <span style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: 1, fontFamily: theme==="index"?"'Plus Jakarta Sans',sans-serif":"inherit" }}>{e.version}</span>}
                    {isFaris && (
                      <>
                        <button onClick={() => openEdit(e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-dim)", padding: "2px 4px" }} title="Edit">✏</button>
                        <button onClick={() => setDeleteConfirm(e.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-dim)", padding: "2px 4px" }} title="Delete">🗑</button>
                      </>
                    )}
                  </div>
                </div>
                {e.date && <div style={{ fontSize: 10, color: "var(--text-dim2)", marginBottom: 10, fontFamily: theme==="index"?"'Plus Jakarta Sans',sans-serif":"inherit" }}>{formatDate(e.date)}</div>}
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {(e.bullets || []).map((b, i) => (
                    <li key={i} style={{ fontSize: 12, color: "var(--text-mid)", lineHeight: 1.7, fontFamily: theme==="index"?"'Plus Jakarta Sans',sans-serif":"inherit" }}>{b}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── GROUP LOBBY ─────────────────────────────────── */
function GroupLobby({ user, groups: initialGroups = [], onEnterGroup, onUpdateUser, onLogout, initialJoinCode=null, onAreBadTap, theme="dark", setTheme=()=>{} }) {
  const [groups,setGroups]=useState(initialGroups);
  const [loading,setLoading]=useState(false);
  const [createName,setCreateName]=useState("");
  const [joinCode,setJoinCode]=useState(initialJoinCode||"");
  const [error,setError]=useState("");
  const [inviteGroup,setInviteGroup]=useState(null);
  const [inviteLoading,setInviteLoading]=useState(false);
  const [thumbs,setThumbs]=useState([]);
  const spawnThumb = (e) => {
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
    onAreBadTap?.();
  };
  const [profileOpen,setProfileOpen]=useState(false);
  const [accountOpen,setAccountOpen]=useState(false);
  const [pwCurrent,setPwCurrent]=useState("");
  const [pwNew,setPwNew]=useState("");
  const [pwConfirm,setPwConfirm]=useState("");
  const [pwError,setPwError]=useState("");
  const [pwSuccess,setPwSuccess]=useState(false);
  const [pwLoading,setPwLoading]=useState(false);
  const [themePickerOpen,setThemePickerOpen]=useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [dashboardNow, setDashboardNow] = useState(()=>Date.now());
  const hScrollRef = useHorizontalScroll();
  const profileRef=useRef(null);
  /* eslint-disable react-hooks/set-state-in-effect -- these effects reconcile persisted theme, boot, and browser route state. */
  useEffect(()=>{
    if(!profileOpen)return;
    const handler=(e)=>{if(profileRef.current&&!profileRef.current.contains(e.target))setProfileOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[profileOpen]);
  const changePassword = async () => {
    if (!pwCurrent||!pwNew||!pwConfirm){setPwError("Fill in all fields.");return;}
    if (pwNew.trim().length<6){setPwError("Password must be at least 6 characters.");return;}
    if (pwNew!==pwConfirm){setPwError("New passwords do not match.");return;}
    setPwLoading(true);setPwError("");
    const { ok, data } = await callAPI('account-change-password', { currentPassword: pwCurrent, newPassword: pwNew });
    if (!ok){setPwError(data.error||"Failed to change password.");setPwLoading(false);return;}
    setPwSuccess(true);setPwLoading(false);
    setTimeout(()=>{setAccountOpen(false);setPwCurrent("");setPwNew("");setPwConfirm("");setPwSuccess(false);},2000);
  };
  const saveEmail = async () => {
    const normEmail = emailInput.trim().toLowerCase();
    setEmailError("");
    if (!normEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    // No-op: same as current email
    if (user.email && normEmail === user.email.toLowerCase()) {
      setEmailChanging(false);
      setEmailInput("");
      return;
    }
    setEmailLoading(true);
    try {
      const { ok, data } = await callAPI('account-change-email', { email: normEmail });
      if (!ok) { setEmailError(data.error || "Failed to update email."); return; }
      onUpdateUser({ ...user, email: normEmail });
      setEmailSuccess(true);
      setTimeout(() => {
        setEmailSuccess(false);
        setEmailChanging(false);
        setEmailInput("");
      }, 1500);
    } catch {
      setEmailError("Something went wrong, please try again.");
    } finally {
      setEmailLoading(false);
    }
  };
  const [creating,setCreating]=useState(false);
  const [setupMode,setSetupMode]=useState(false);
  const [setupCompetition,setSetupCompetition]=useState("PL");
  const [setupGW,setSetupGW]=useState("1");
  const [setupLimit,setSetupLimit]=useState("unlimited");
  const [setupCustomLimit,setSetupCustomLimit]=useState("");
  const [setupGWLoading,setSetupGWLoading]=useState(false);
  const [setupPickMode,setSetupPickMode]=useState("open");
  const setupMaxGW = competitionRoundCount(setupCompetition);

  useEffect(()=>{
    setGroups(initialGroups);
    setLoading(false);
  },[initialGroups]);

  useEffect(()=>{
    if (!groups.length) return;
    const timer = setInterval(()=>setDashboardNow(Date.now()), 60000);
    return ()=>clearInterval(timer);
  },[groups.length]);

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      if (!cancelled && !user?.username) setGroups([]);
      if (cancelled || !initialJoinCode || !user?.username) return;
      try {
        const code = initialJoinCode.trim().toUpperCase();
        const id = await sget(`groupcode:${code}`);
        if (!id) {
          if (!cancelled) setError("Invite link is invalid or expired.");
          return;
        }
        const group = await sget(`group:${id}`);
        if (!group) {
          if (!cancelled) setError("Invite link is invalid or expired.");
          return;
        }
        if (!cancelled) {
          setJoinCode(code);
          if (group.members?.includes(user.username)) {
            setError("You're already in this group.");
          } else {
            setInviteGroup(group);
          }
        }
      } catch {
        if (!cancelled) setError("Couldn't load invite link.");
      }
    })();
    return ()=>{ cancelled = true; };
  },[user?.username, initialJoinCode, initialGroups.length]);

  useEffect(()=>{
    if (!setupMode || setupCompetition === "WC") return;
    setSetupGWLoading(true);
    (async()=>{
      try {
        const cacheKey = `fixtures:${setupCompetition}:${CURRENT_LEAGUE_SEASON}`;
        const globalDoc = await sget(cacheKey);
        const now = new Date();
        if (globalDoc&&(globalDoc.gameweeks||[]).length) {
          const allFixtures = globalDoc.gameweeks.flatMap(gwObj=>
            (gwObj.fixtures||[]).map(f=>({...f,matchday:gwObj.gw}))
          );
          const upcoming = allFixtures.filter(f=>f.status!=="FINISHED"&&f.date&&new Date(f.date)>=now);
          const gw = upcoming.length
            ? Math.min(...upcoming.map(f=>f.matchday))
            : allFixtures.length
              ? Math.max(...allFixtures.map(f=>f.matchday))
              : null;
          if (gw!==null&&gw>=1&&gw<=setupMaxGW) setSetupGW(String(gw));
        } else {
          const resp = await fetch(`/api/fixtures?season=${CURRENT_LEAGUE_SEASON}&competition=${setupCompetition}`);
          if (!resp.ok) return;
          const data = await resp.json();
          const matches = data.matches||[];
          if (!matches.length) return;
          const upcoming = matches.filter(m=>m.status!=="FINISHED"&&m.utcDate&&new Date(m.utcDate)>=now);
          const gw = upcoming.length ? Math.min(...upcoming.map(m=>m.matchday)) : Math.max(...matches.map(m=>m.matchday));
          if (gw>=1&&gw<=setupMaxGW) setSetupGW(String(gw));
        }
      } catch { /* Setup keeps its current round if fixture discovery fails. */ } finally {
        setSetupGWLoading(false);
      }
    })();
  },[setupMode, setupCompetition, setupMaxGW]);

  const createGroup = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const { ok, data } = await callAPI('create-group', { name:createName.trim(), competition:setupCompetition, setupGW, setupLimit:normalizeDraw11Limit(setupLimit), setupPickMode });
      if (!ok || !data.group || !data.user) return;
      onUpdateUser(data.user);setCreateName("");setSetupMode(false);setSetupGW("1");setSetupLimit("unlimited");setSetupCustomLimit("");setSetupPickMode("open");setSetupCompetition("PL");
      onEnterGroup(data.group);
    } finally {
      setCreating(false);
    }
  };

  const joinGroup = async (codeOverride=null) => {
    const code = (codeOverride ?? joinCode).trim().toUpperCase();
    if (code.length!==6){setError("Enter a 6-character code.");return;}
    setInviteLoading(true);
    try {
      const { ok, data } = await callAPI('join-group', { code });
      if (!ok) { setError(data.error || 'Group not found.'); return; }
      if (!data.group || !data.user) return;
      onUpdateUser(data.user);setJoinCode("");setError("");setInviteGroup(null);
      onEnterGroup(data.group);
    } finally {
      setInviteLoading(false);
    }
  };
  const normalizedSetupLimit = normalizeDraw11Limit(setupLimit);
  const setupLimitPeriod = draw11LimitPeriod(setupCompetition);
  const setupCustomActive = !DRAW_11_LIMIT_PRESETS.some(([val]) => val === normalizedSetupLimit);
  const dashboardItems = useMemo(()=>sortGroupDashboardItems(groups.map(group=>{
    const state = buildGroupDashboardState(group,user.username,dashboardNow);
    const standings = getGroupStats(group);
    const rankIndex = standings.findIndex(player=>player.username===user.username);
    const playerStats = rankIndex>=0?standings[rankIndex]:null;
    return {
      ...state,
      rank:playerStats?.rank??null,
      points:playerStats?.total??null,
    };
  })),[groups,user.username,dashboardNow]);
  const attentionItems = dashboardItems.filter(item=>item.mode==="picks-due");
  const firstAttention = attentionItems[0]||null;
  const duePickCount = attentionItems.reduce((total,item)=>total+item.dueSoonCount,0);
  const liveGroupCount = dashboardItems.filter(item=>item.mode==="live").length;
  const firstUpcoming = dashboardItems
    .filter(item=>item.nextKickoffMs&&item.nextKickoffMs>dashboardNow)
    .slice()
    .sort((a,b)=>a.nextKickoffMs-b.nextKickoffMs)[0]||null;
  const firstAttentionIsUrgent = firstAttention?.deadlineMs && firstAttention.deadlineMs-dashboardNow<=24*3600000;
  const attentionColor = firstAttentionIsUrgent ? "var(--dashboard-urgent)" : "var(--dashboard-attention)";
  const summaryCountdownDiff = firstAttention ? firstAttention.deadlineMs-dashboardNow : firstUpcoming?.nextKickoffMs-dashboardNow;

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",fontFamily:"'DM Mono',monospace",color:"var(--text)"}}>
      <style>{CSS}</style>
      <header className="app-top-header" style={{borderBottom:"1px solid var(--border)",padding:"0 24px",height:60}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}><span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:18,color:"var(--text-bright)"}}>POINTS</span><span onClick={spawnThumb} style={{color:"var(--text-dim)",fontSize:9,letterSpacing:3,fontFamily:"'DM Mono',monospace",fontWeight:400,cursor:"pointer",userSelect:"none"}}>are bad</span></div>
          {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}
          {user.username===DEMO_SHARED_USERNAME?(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <DemoThemeSwitcher theme={theme} setTheme={setTheme}/>
              <button className="app-header-action" onClick={onLogout} aria-label="Exit demo" style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:0,color:"#8888cc",fontSize:11,letterSpacing:1.5,fontFamily:"inherit",whiteSpace:"nowrap"}}><LogOut size={13} color="#8888cc"/><span className="demo-exit-label">EXIT DEMO</span></button>
            </div>
          ):(
            <div ref={profileRef} style={{position:"relative",display:"flex",alignItems:"center"}}>
              <button className="app-header-action" aria-label="Open account menu" onClick={()=>setProfileOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,padding:0,borderRadius:4}}>
                <Avatar name={user.displayName} size={28}/>
                <span style={{fontSize:12,color:"var(--text-dim2)"}}>{user.displayName}</span>
              </button>
              {profileOpen&&(
                <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:6,zIndex:100,minWidth:120,boxShadow:"0 4px 16px #00000030"}}>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:1,padding:"4px 8px 6px",borderBottom:"1px solid var(--border)",marginBottom:4,whiteSpace:"nowrap"}}>{user.displayName}</div>
                  <button onClick={()=>{setProfileOpen(false);setPwError("");setPwSuccess(false);setAccountOpen(true);}} style={{width:"100%",background:"none",border:"none",borderRadius:6,color:"var(--text-mid)",cursor:"pointer",fontSize:11,letterSpacing:1.5,padding:"6px 8px",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:6,marginBottom:2}}><User size={13} color="currentColor"/>ACCOUNT</button>
                  <button onClick={()=>{setProfileOpen(false);onLogout();}} style={{width:"100%",background:"none",border:"none",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:11,letterSpacing:1.5,padding:"6px 8px",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:6}}><LogOut size={13} color="#ef4444"/>LOG OUT</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {inviteGroup&&createPortal(
  <div className="modal-overlay" onClick={()=>setInviteGroup(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div className="modal-panel" onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:32,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto"}}>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:12}}>GROUP INVITE</div>
      <div style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:28,fontWeight:theme==="index"?800:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:10}}>{inviteGroup.name}</div>
      <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.7,marginBottom:20}}>You've been invited to join this group with code <span style={{color:"var(--text-bright)"}}>{inviteGroup.code}</span>.</div>
      <div style={{background:"var(--surface)",border:"1px solid var(--border3)",borderRadius:10,padding:"12px 14px",marginBottom:20,fontSize:11,color:"var(--text-mid)",lineHeight:1.8}}>
        <div>{inviteGroup.memberCount??inviteGroup.members?.length??0} member{(inviteGroup.memberCount??inviteGroup.members?.length)===1?"":"s"}</div>
        <div>{competitionLabel(inviteGroup)}</div>
        <div>{(inviteGroup.mode||"open").toUpperCase()} mode</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn variant="ghost" onClick={()=>setInviteGroup(null)} style={{flex:1,textAlign:"center"}}>Cancel</Btn>
        <Btn onClick={()=>joinGroup(inviteGroup.code)} disabled={inviteLoading} style={{flex:1,textAlign:"center"}}>{inviteLoading?<Spinner/>:"Join Group"}</Btn>
      </div>
    </div>
  </div>,
  document.body
)}
      {accountOpen&&createPortal(
  <div className="modal-overlay" onClick={()=>setAccountOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div className="modal-panel profile-dialog" onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:32,width:"100%",maxWidth:400,maxHeight:"85vh",overflowY:"auto"}}>
      <div className="dialog-section-title" style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,marginBottom:12,fontWeight:600}}>Profile</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"10px 0",borderBottom:"1px solid var(--border3)"}}>
          <span style={{color:"var(--text-dim)"}}>Username</span><span style={{color:"var(--text-bright)",fontWeight:500}}>{user.username}</span>
        </div>
        <div style={{borderBottom:"1px solid var(--border3)",paddingBottom:8,marginBottom:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"6px 0"}}>
            <span style={{color:"var(--text-dim)"}}>Email</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"var(--text-bright)",fontWeight:500}}>{user.email||"--"}</span>
              <button
                onClick={()=>{setEmailChanging(o=>!o);setEmailInput("");setEmailError("");setEmailSuccess(false);setEmailLoading(false);}}
                style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,
                  letterSpacing:1,fontFamily:"inherit",padding:0}}>
                {emailChanging?"CANCEL":user.email?"CHANGE":"ADD"}
              </button>
            </div>
          </div>
          {emailChanging&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
              <Input value={emailInput} onChange={setEmailInput} placeholder="Email address" type="email"
                onKeyDown={e=>e.key==="Enter"&&saveEmail()} autoFocus />
              {emailError&&<div style={{color:"#ef4444",fontSize:12}}>{emailError}</div>}
              {emailSuccess&&<div style={{color:"#22c55e",fontSize:12}}>Email updated.</div>}
              <Btn onClick={saveEmail} disabled={emailLoading||emailSuccess}
                style={{padding:"8px 0",textAlign:"center"}}>
                {emailLoading?<Spinner/>:"SAVE"}
              </Btn>
            </div>
          )}
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <button onClick={()=>setThemePickerOpen(p=>!p)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
          <span className="dialog-section-title" style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,fontWeight:600}}>Appearance</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"var(--text-dim)"}}>{THEMES.find(t=>t.id===theme)?.label||theme}</span>
            <span style={{fontSize:11,color:"var(--text-dim2)",transition:"transform 0.2s",transform:themePickerOpen?"rotate(180deg)":"rotate(0deg)"}}>&#9662;</span>
          </div>
        </button>
        {themePickerOpen && (
          <div style={{marginTop:12}}>
            <div style={{position:"relative"}}>
              <div ref={hScrollRef} style={{display:"flex",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"2px 0 8px",scrollbarWidth:"none",msOverflowStyle:"none"}}>
                {[...getSecretThemeMeta(user),...(theme==="clarity"?[{key:"clarity",label:"Clarity",swatches:["#111","#666","#fff"]}]:[])].map(t=>{
                  const active=theme===t.key;
                  return (
                    <button key={t.key} onClick={()=>setTheme(t.key)} style={{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"10px 12px",background:active?"var(--surface)":"var(--card)",border:`1.5px solid ${active?"var(--btn-bg)":"var(--border2)"}`,borderRadius:10,cursor:"pointer",fontFamily:"inherit",transition:"border-color 0.15s,background 0.15s"}}>
                      <div style={{display:"flex",gap:4}}>{t.swatches.map((c,i)=><div key={i} style={{width:13,height:13,borderRadius:"50%",background:c,border:"1px solid rgba(128,128,128,0.18)"}}/>)}</div>
                      <span style={{fontSize:9,letterSpacing:0.8,textTransform:"uppercase",fontWeight:active?700:400,color:active?"var(--btn-bg)":"var(--text-dim)",whiteSpace:"nowrap",lineHeight:1}}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{position:"absolute",right:0,top:0,bottom:0,width:32,background:"linear-gradient(to right, transparent, var(--bg))",pointerEvents:"none"}}/>
            </div>
            {isSecretThemeUnlockedForUser(user)&&<div style={{fontSize:10,color:"var(--text-dim3)",marginTop:4}}>Secret theme unlocked.</div>}
          </div>
        )}
      </div>
      <div style={{borderTop:"1px solid var(--border3)",paddingTop:18}}>
        <div className="dialog-section-title" style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,marginBottom:14,fontWeight:600}}>Security</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <Input value={pwCurrent} onChange={setPwCurrent} placeholder="Current password" type="password" />
          <Input value={pwNew} onChange={setPwNew} placeholder="New password" type="password" />
          <Input value={pwConfirm} onChange={setPwConfirm} placeholder="Confirm new password" type="password" onKeyDown={e=>e.key==="Enter"&&changePassword()} />
        </div>
        {pwError&&<div style={{color:"#ef4444",fontSize:12,marginTop:10}}>{pwError}</div>}
        {pwSuccess&&<div style={{color:"#22c55e",fontSize:12,marginTop:10}}>Password updated.</div>}
        <div style={{display:"flex",gap:10,marginTop:18}}>
          <Btn onClick={changePassword} disabled={pwLoading||pwSuccess} style={{flex:1,padding:"10px 0",textAlign:"center"}}>{pwLoading?<Spinner/>:"SAVE"}</Btn>
          <Btn variant="ghost" onClick={()=>setAccountOpen(false)} style={{flex:1,padding:"10px 0",textAlign:"center"}}>Cancel</Btn>
        </div>
      </div>
    </div>
  </div>,
  document.body
)}
      <div className="group-dashboard-shell">
        <div className="group-dashboard-heading">
          <div>
            <h1 style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:theme==="index"?36:32,fontWeight:theme==="index"?800:900,color:"var(--text-bright)",letterSpacing:theme==="index"?-1.4:-1,marginBottom:7}}>Your groups</h1>
            <p style={{color:"var(--text-dim)",fontSize:theme==="index"?13:11,letterSpacing:theme==="index"?0:1,lineHeight:1.5}}>{groups.length?"Picks, deadlines and standings at a glance.":"Create or join a group to start predicting."}</p>
          </div>
          {groups.length>0&&<div className="group-dashboard-count" style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:theme==="index"?0:1,textAlign:"right"}}>{groups.length} group{groups.length===1?"":"s"}</div>}
        </div>
        {!loading&&groups.length>0&&(
          <div className="group-dashboard-summary">
            <div className="group-dashboard-summary-copy">
              <span className="group-dashboard-summary-dot" style={{background:firstAttention?attentionColor:liveGroupCount?"#60a5fa":theme==="index"?"#626872":"#22c55e",boxShadow:`0 0 0 4px color-mix(in srgb, ${firstAttention?attentionColor:liveGroupCount?"#60a5fa":theme==="index"?"#626872":"#22c55e"} 18%, transparent)`}}/>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,lineHeight:1.35}}>{firstAttention?`${duePickCount} pick${duePickCount===1?"":"s"} need attention`:liveGroupCount?`${liveGroupCount} group${liveGroupCount===1?" is":"s are"} live now`:"You're caught up"}</div>
                <div style={{fontSize:11,opacity:.65,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{firstAttention?`${firstAttention.group.name} · ${firstAttention.nextFixture?.home} vs ${firstAttention.nextFixture?.away}`:liveGroupCount?"Your picks are locked. Follow the scores.":firstUpcoming?`${firstUpcoming.group.name} · ${firstUpcoming.nextFixture?.home} vs ${firstUpcoming.nextFixture?.away}`:"No upcoming fixtures are scheduled yet."}</div>
              </div>
            </div>
            {(firstAttention||firstUpcoming)&&<div className="group-dashboard-summary-time dashboard-countdown" data-urgency={getDashboardCountdownUrgency(summaryCountdownDiff)} style={{fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>{`in ${formatDashboardCountdown(summaryCountdownDiff)}`}</div>}
          </div>
        )}
        {loading?<LoadingSkeleton/>:dashboardItems.length>0?(
          <div className="group-dashboard-list">
            {dashboardItems.filter(item=>!isPastGroup(item.group)).map(item=>{
              const g=item.group;
              const deadlineDiff=item.deadlineMs?item.deadlineMs-dashboardNow:null;
              const statusMeta=item.mode==="picks-due"
                ? {label:`${item.dueSoonCount} due soon`,color:deadlineDiff<=24*3600000?"var(--dashboard-urgent)":"var(--dashboard-attention)"}
                :item.mode==="live"
                  ? {label:"Live",color:theme==="index"?"#285bbb":"#3b82f6"}
                  :item.mode==="picks-open"
                    ? {label:`${item.missingPickCount} open`,color:"var(--text-mid)"}
                    :item.mode==="waiting-turn"
                      ? {label:"Waiting on turn",color:"var(--text-mid)"}
                    :item.mode==="ready"
                      ? {label:"Ready",color:theme==="index"?"#626872":"#22c55e"}
                      :{label:"Waiting",color:"var(--text-dim)"};
              const progress=item.totalPickCount?Math.min(1,item.pickedCount/item.totalPickCount):0;
              const {label:actionLabel,tab:actionTab}=getGroupDashboardAction(item.mode,item.missingPickCount);
              const timing=getDashboardFixtureTiming(item,dashboardNow);
              const timingTarget=item.mode==="picks-due"||item.mode==="picks-open"?item.deadlineMs:item.nextKickoffMs;
              const timingDiff=Number.isFinite(timingTarget)?timingTarget-dashboardNow:null;
              const fixtureTimeLabel=item.mode==="live" ? (matchClockLabel(item.nextFixture,null,dashboardNow)||"LIVE") : timing?.countdown;
              return (
                <article key={g.id} className="group-dashboard-card">
                  <div className="group-dashboard-card-head">
                    <button className="group-dashboard-open" onClick={()=>onEnterGroup(g,"League")} aria-label={`Open ${g.name}`}>
                      <div style={{fontSize:18,fontWeight:theme==="index"?800:700,color:"var(--text-bright)",letterSpacing:theme==="index"?-.35:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
                      <div style={{fontSize:10,color:"var(--text-dim)",marginTop:5,letterSpacing:theme==="index"?.1:1,textTransform:theme==="index"?"none":"uppercase"}}>{competitionLabel(g,true)} · {gwLabel(g,item.roundNumber)} · {(g.members||[]).length} member{(g.members||[]).length===1?"":"s"}</div>
                    </button>
                    <span className="group-dashboard-status" style={{color:statusMeta.color,background:`color-mix(in srgb, ${statusMeta.color} 8%, transparent)`}}>{statusMeta.label}</span>
                  </div>
                  <div className="group-dashboard-card-grid">
                    <div className="group-dashboard-fixture">
                      <div className="group-dashboard-fixture-time">
                        <span>{item.mode==="live"?"Playing now":timing?.label||"Next fixture"}</span>
                        <strong className={item.mode!=="live"&&timing?"dashboard-countdown":undefined} data-urgency={item.mode!=="live"&&timing?getDashboardCountdownUrgency(timingDiff):undefined}>{fixtureTimeLabel||"Schedule TBD"}</strong>
                        {item.mode!=="live"&&item.nextFixture?.date&&<span className="group-dashboard-fixture-date">{formatFixtureDate(item.nextFixture.date)}</span>}
                      </div>
                      {item.nextFixture?(
                        <>
                          <div className="group-dashboard-team"><TeamBadge team={item.nextFixture.home} crest={item.nextFixture.homeCrest} size={20}/><span>{item.nextFixture.home}</span></div>
                          <div className="group-dashboard-team"><TeamBadge team={item.nextFixture.away} crest={item.nextFixture.awayCrest} size={20}/><span>{item.nextFixture.away}</span></div>
                        </>
                      ):<div style={{fontSize:13,color:"var(--text-dim)",padding:"8px 0"}}>Waiting for the next round.</div>}
                    </div>
                    <div className="group-dashboard-progress">
                      <div className="group-dashboard-progress-copy">
                        <span>{item.totalPickCount?`${item.pickedCount}/${item.totalPickCount} picked`:"No picks open"}</span>
                        <span style={{fontWeight:700,color:"var(--text-bright)"}}>{item.rank?`#${item.rank}`:"—"}{item.points!==null&&item.points!==undefined?<span style={{fontWeight:400,color:"var(--text-dim)",marginLeft:6}}>{item.points} pts</span>:null}</span>
                      </div>
                      <div className="group-dashboard-progress-track" role="progressbar" aria-label={`${g.name} picks completed`} aria-valuemin="0" aria-valuemax={Math.max(1,item.totalPickCount)} aria-valuenow={item.pickedCount}>
                        <div className="group-dashboard-progress-fill" style={{transform:`scaleX(${progress})`,background:item.missingPickCount?"var(--dashboard-accent)":"#22c55e"}}/>
                      </div>
                      <div style={{fontSize:10,color:"var(--text-dim2)"}}>{item.missingPickCount?`${item.missingPickCount} still to pick`:item.mode==="live"?"Picks locked":item.mode==="waiting-turn"?"Another player is up":"All available picks made"}</div>
                    </div>
                    <button className="group-dashboard-action" data-primary={item.missingPickCount>0?"true":"false"} onClick={()=>onEnterGroup(g,actionTab)}>{actionLabel}</button>
                  </div>
                </article>
              );
            })}
          </div>
        ):<div style={{color:"var(--text-dim)",fontSize:13,padding:"20px 0 36px"}}>No groups yet.</div>}
        {dashboardItems.some(item=>isPastGroup(item.group))&&<details className="past-groups">
          <summary>Past groups <span>{dashboardItems.filter(item=>isPastGroup(item.group)).length}</span></summary>
          <p>Your old seasons, predictions and standings stay here.</p>
          {dashboardItems.filter(item=>isPastGroup(item.group)).map(item=><article key={item.group.id}>
            <div><strong>{item.group.name}</strong><small>{competitionLabel(item.group,true)} · {item.group.season}{item.group.competition==='WC'?'':`/${String(Number(item.group.season)+1).slice(-2)}`} · {item.mode==='completed'?'Completed':'Results pending'}</small></div>
            <span>{item.mode==='completed'?'Final':'Recorded'} #{item.rank || '—'} · {item.points ?? '—'} pts</span>
            <button className="group-dashboard-action" onClick={()=>onEnterGroup(item.group,"League")}>View results</button>
          </article>)}
        </details>}
        <div className="group-dashboard-actions" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
          <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:12,padding:20}}>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>CREATE GROUP</div>
            {!setupMode?(
              <>
                <Input value={createName} onChange={setCreateName} placeholder="Group name..." onKeyDown={e=>e.key==="Enter"&&createName.trim()&&setSetupMode(true)} />
                <Btn onClick={()=>setSetupMode(true)} disabled={!createName.trim()} style={{width:"100%",marginTop:10,padding:"9px 0",display:"block",textAlign:"center"}}>Next →</Btn>
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{fontSize:13,color:"var(--text-bright)",fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontWeight:700,marginBottom:2}}>{createName}</div>
                <div>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>COMPETITION</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[["PL","Premier League"],["LL","La Liga"],["CL","Champions League"],["WC","World Cup 2026"]].map(([val,label])=>(
                      <button key={val} onClick={()=>setSetupCompetition(val)} style={{background:setupCompetition===val?"var(--btn-bg)":"var(--card)",color:setupCompetition===val?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>
                    ))}
                  </div>
                </div>
                {(setupCompetition === "PL" || setupCompetition === "LL" || setupCompetition === "CL") && (
                <div>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>STARTING {setupCompetition==="CL"?"MATCHDAY":"GW"}{setupGWLoading&&<span style={{color:"var(--text-dim3)",letterSpacing:0,marginLeft:6,textTransform:"none"}}>detecting...</span>}</div>
                  <Input value={setupGW} onChange={setSetupGW} placeholder="1" style={{width:80}} />
                </div>
                )}
                <div>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>SEASON MODE</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      ["open","Open","Everyone picks freely each gameweek."],
                      ["dibs","Dibs","Take turns claiming scorelines, no duplicates per match."],
                    ].map(([val,label,desc])=>(
                      <button key={val} onClick={()=>setSetupPickMode(val)}
                        style={{background:setupPickMode===val?"var(--btn-bg)":"var(--card)",color:setupPickMode===val?"var(--btn-text)":"var(--text-dim2)",border:`1px solid ${setupPickMode===val?"var(--btn-bg)":"var(--border)"}`,borderRadius:6,padding:"8px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,textAlign:"left",transition:"all 0.15s"}}>
                        <span style={{fontWeight:700,letterSpacing:2}}>{label.toUpperCase()}</span>
                        <span style={{display:"block",fontSize:10,opacity:0.7,marginTop:2,letterSpacing:0}}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>1-1 LIMIT PER {setupLimitPeriod.toUpperCase()}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {DRAW_11_LIMIT_PRESETS.map(([val,label])=>(
                      <button key={val} onClick={()=>setSetupLimit(val)} style={{background:normalizedSetupLimit===val?"var(--btn-bg)":"var(--card)",color:normalizedSetupLimit===val?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>
                    ))}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                    <Input value={setupCustomLimit} onChange={v=>{const cleaned=cleanDraw11LimitInput(v);setSetupCustomLimit(cleaned);if(cleaned)setSetupLimit(cleaned);}} placeholder="Custom" inputMode="numeric" pattern="[0-9]*" style={{width:96,padding:"6px 10px",fontSize:11}} />
                    <span style={{fontSize:11,color:setupCustomActive?"var(--text-bright)":"var(--text-dim2)",letterSpacing:1}}>{setupCustomActive?`${normalizedSetupLimit} / ${setupLimitPeriod}`:`/ ${setupLimitPeriod}`}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <Btn variant="ghost" small onClick={()=>{setSetupMode(false);setSetupPickMode("open");setSetupCompetition("PL");setSetupCustomLimit("");}}>← Back</Btn>
                  <Btn onClick={createGroup} disabled={creating} style={{flex:1,textAlign:"center"}}>{creating?<Spinner/>:"Create Group →"}</Btn>
                </div>
              </div>
            )}
          </div>
          <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:12,padding:20}}>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>JOIN WITH CODE</div>
            <Input value={joinCode} onChange={v=>{setJoinCode(v.replace(/[^A-Za-z0-9]/g,"").toUpperCase().slice(0,6));setError("");}} placeholder="6-character code" onKeyDown={e=>e.key==="Enter"&&joinGroup()} />
            <Btn onClick={joinGroup} disabled={joinCode.length!==6} style={{width:"100%",marginTop:10,padding:"9px 0",display:"block",textAlign:"center"}}>Join →</Btn>
          </div>
        </div>
        {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:12}}>{error}</div>}
      </div>
    </div>
  );
}

/* ── MAIN APP ────────────────────────────────────── */
const NAV = ["League","Fixtures","Trends","Members","Group"];
const BOT_NAV_ICONS = {
  League:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v8a6 6 0 01-12 0V3zM6 6H3a1 1 0 00-1 1v1a4 4 0 003.8 4M18 6h3a1 1 0 011 1v1a4 4 0 01-3.8 4M12 17v4M8 21h8"/></svg>,
  Fixtures: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/></svg>,
  Trends:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,18 9,11 13,14 21,6"/><path d="M3 21h18"/></svg>,
  Members:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  Group:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  Standings:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16V9M12 16V7M16 16v-4M20 16V5"/></svg>,
};
const SECRET_THEME = "velvet";
const SECRET_THEME_CLICKS_REQUIRED = 99;
const KONAMI_SEQUENCE = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
const THEME_META=[
  {key:"dark",   label:"Dark",     swatches:["#080810","#0e0e1a","#e8e4d9"]},
  {key:"light",  label:"Light",    swatches:["#f4f1e8","#fff","#1a1814"]},
  {key:"excel",  label:"Excel",    swatches:["#ffffff","#f2f2f2","#1a1a1a"]},
  {key:"terminal",label:"Terminal",swatches:["#000000","#0a0a0a","#00cc44"]},
  {key:"nord",   label:"Nord",     swatches:["#2e3440","#3b4252","#eceff4"]},
  {key:"pitch",  label:"Pitch",    swatches:["#0d1f0d","#122012","#d4ecd4"]},
  {key:"index", label:"Index", swatches:["#f6f6f7","#ffffff","#15181c"]},
  {key:"spotify",label:"Spotify",swatches:["#121212","#1ed760","#ffffff"]},
  {key:SECRET_THEME,label:"Velvet",  swatches:["#120816","#1d1024","#f7d6ea"],secret:true},
];

function isSecretThemeUnlockedForUser(user) {
  return !!user?.unlockedThemes?.includes(SECRET_THEME);
}

function getAvailableThemes(user) {
  return THEMES.filter(t => t.id !== SECRET_THEME || isSecretThemeUnlockedForUser(user)).map(t => t.id);
}

function getSecretThemeMeta(user) {
  return THEME_META.filter(t => t.key !== SECRET_THEME || isSecretThemeUnlockedForUser(user));
}

function DemoThemeSwitcher({ theme, setTheme }) {
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  const demoThemes=THEME_META.filter(t=>!t.secret);
  const current=demoThemes.find(t=>t.key===theme) || demoThemes[0];
  useEffect(()=>{
    if(!open)return;
    const handler=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[open]);
  return (
    <div ref={ref} style={{position:"relative",display:"flex",alignItems:"center",height:"100%"}}>
      <button
        onClick={()=>setOpen(o=>!o)}
        className="app-header-action"
        title="Try a different theme"
        style={{height:34,background:open?"var(--surface)":"var(--card)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-mid)",cursor:"pointer",fontSize:10,letterSpacing:1.2,fontFamily:"inherit",display:"flex",alignItems:"center",gap:8,padding:"0 10px",whiteSpace:"nowrap"}}
      >
        <span className="mob-hide">THEME</span>
        <span style={{display:"flex",gap:3}}>
          {current.swatches.map((c,i)=><span key={i} style={{width:10,height:10,borderRadius:"50%",background:c,border:"1px solid rgba(128,128,128,0.22)"}} />)}
        </span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,zIndex:120,background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:8,minWidth:238,boxShadow:"0 10px 26px #00000038"}}>
          <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,padding:"3px 4px 8px"}}>TRY A THEME</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {demoThemes.map(t=>{
              const active=theme===t.key;
              return (
                <button key={t.key} onClick={()=>{setTheme(t.key);setOpen(false);}} style={{background:active?"var(--surface)":"var(--card)",color:active?"var(--text-bright)":"var(--text-dim2)",border:`1.5px solid ${active?"var(--btn-bg)":"var(--border2)"}`,borderRadius:8,padding:"9px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <span>{t.label}</span>
                  <span style={{display:"flex",gap:3}}>
                    {t.swatches.map((c,i)=><span key={i} style={{width:9,height:9,borderRadius:"50%",background:c,border:"1px solid rgba(128,128,128,0.2)"}} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getWeeklyWinnerFlavor(minPts, winnerCount, totalGoals) {
  if (winnerCount > 1) return "Shared honours.";
  if (minPts === 0) return "Perfect week.";
  if (minPts < 10) return "Locked in.";
  if (totalGoals >= 30) return "Chaotic week.";
  if (minPts >= 25) return "Rough week.";
  return null;
}

function getPointsLabelMeta(totalPoints, theme) {
  if (theme !== "clarity") return { label: "PTS", color: "var(--text-dim)", glow: "none", effect: "none" };
  if (totalPoints === 69) return { label: "nice. still bad.", color: "#d9f99d", glow: "0 0 10px rgba(163,230,53,.28)", effect: "none" };
  if (totalPoints === 100) return { label: "triple digits. embarrassing.", color: "#fcd34d", glow: "0 0 10px rgba(252,211,77,.22)", effect: "none" };
  if (totalPoints === 404) return { label: "points not found", color: "#93c5fd", glow: "0 0 10px rgba(96,165,250,.24)", effect: "glitch" };
  if (totalPoints === 666) return { label: "comically evil total", color: "#f87171", glow: "0 0 12px rgba(239,68,68,.35)", effect: "pulse" };
  if (totalPoints === 1000) return { label: "briefly impressed. immediately disappointed.", color: "#fde68a", glow: "0 0 12px rgba(250,204,21,.26)", effect: "shimmer" };
  const words = [
    { label: "tokens", color: "var(--text-dim)", glow: "none", effect: "none" },
    { label: "sins", color: "#fca5a5", glow: "0 0 8px rgba(239,68,68,.18)", effect: "none" },
    { label: "regrets", color: "#d8b4fe", glow: "0 0 8px rgba(168,85,247,.16)", effect: "none" },
    { label: "damage", color: "#fdba74", glow: "0 0 8px rgba(249,115,22,.15)", effect: "none" },
  ];
  return words[Math.abs(totalPoints || 0) % words.length];
}

const TITLE_STYLES = {
  "The Standard": { text: "#f8e7a1", glow: "0 0 14px rgba(248,231,161,.28)" },
  Perfectionist: { text: "#b8ffcf", glow: "0 0 14px rgba(34,197,94,.26)" },
  "Draw Merchant": { text: "#ffd089", glow: "0 0 13px rgba(255,180,90,.24)" },
  "Chaos Goblin": { text: "#ffb1f2", glow: "0 0 16px rgba(217,70,239,.34)" },
  Metronome: { text: "#bfe8ff", glow: "0 0 13px rgba(56,189,248,.24)" },
  "Near Miss Specialist": { text: "#ddd6fe", glow: "0 0 13px rgba(139,92,246,.22)" },
  Liability: { text: "#ffb3a8", glow: "0 0 12px rgba(239,68,68,.24)" },
};

const TITLE_DESCRIPTIONS = {
  "The Standard": "Lowest average points per scored pick.",
  Perfectionist: "Most exact score predictions.",
  "Draw Merchant": "Picks draws more than anyone else.",
  "Chaos Goblin": "Predicts the highest-scoring games.",
  Metronome: "Most consistent gameweek scores.",
  "Near Miss Specialist": "Most picks off by exactly 1 total goal.",
  Liability: "High variance and high damage.",
};

function getTitleStyle(title) {
  return TITLE_STYLES[title] || { text: "var(--text-mid)", glow: "none" };
}

function TitleBadge({ title }) {
  const badgeRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const style = getTitleStyle(title);
  const description = TITLE_DESCRIPTIONS[title];
  if (!title) return <div style={{height:14, marginTop:4}} />;
  const showTooltip = () => {
    if (!description || typeof window === "undefined" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const rect = badgeRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxWidth = 230;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - maxWidth - 8));
    setTooltipPos({ top: rect.bottom + 6, left });
  };
  const hideTooltip = () => setTooltipPos(null);
  return (
    <>
      <div ref={badgeRef} className="title-badge" aria-label={description ? `${title}: ${description}` : title} onMouseEnter={showTooltip} onMouseLeave={hideTooltip} style={{
        display:"inline-flex",
        alignItems:"center",
        minWidth:0,
        maxWidth:"100%",
        marginTop:4,
        paddingLeft:2,
        paddingRight:2,
        position:"relative",
        zIndex:2,
        fontSize:10,
        fontWeight:700,
        letterSpacing:1.1,
        textTransform:"uppercase",
        color:style.text,
        textShadow:`-1px 0 rgba(0,0,0,.26), 1px 0 rgba(0,0,0,.26), 0 -1px rgba(0,0,0,.26), 0 1px rgba(0,0,0,.26), 0 0 6px rgba(255,255,255,.05), ${style.glow}`,
        whiteSpace:"nowrap",
        overflow:"visible",
        textOverflow:"clip"
      }}>
        {title}
      </div>
      {description&&tooltipPos&&typeof document!=="undefined"&&createPortal(
        <span className="title-tooltip title-tooltip-floating" role="tooltip" style={{top:tooltipPos.top,left:tooltipPos.left}}>{description}</span>,
        document.body
      )}
    </>
  );
}

function computeGroupRelativeTitles(group, stats) {
  const preds = group.predictions || {};
  const activeSeason = group.season || 2025;
  const scope = group.scoreScope || "all";
  const filteredGWs = (group.gameweeks || []).filter(g => scope === "all" || (g.season || activeSeason) === activeSeason);
  const completedGWs = filteredGWs.filter(g => (g.fixtures || []).some(f => f.result));
  const minimumScoredPicks = 20;
  const minimumCompletedGWs = 3;

  const profiles = (stats || []).map(s => {
    const predictions = preds[s.username] || {};
    let drawPickCount = 0;
    let predictedGoalsTotal = 0;
    let submittedPickCount = 0;
    let nearMissCount = 0;
    let winnerHits = 0;
    let winnerScored = 0;

    filteredGWs.forEach(gw => {
      (gw.fixtures || []).forEach(f => {
        const pred = predictions[f.id];
        if (!pred || !/^\d+-\d+$/.test(pred)) return;
        const [ph, pa] = pred.split("-").map(Number);
        submittedPickCount++;
        predictedGoalsTotal += ph + pa;
        if (ph === pa) drawPickCount++;
        if (f.result) {
          const pts = calcPts(pred, f.result);
          if (pts === 1) nearMissCount++;
          const [rh, ra] = f.result.split("-").map(Number);
          const predResult = ph > pa ? 1 : ph < pa ? -1 : 0;
          const realResult = rh > ra ? 1 : rh < ra ? -1 : 0;
          winnerScored++;
          if (predResult === realResult) winnerHits++;
        }
      });
    });

    const gwCompletedTotals = (s.gwTotals || []).filter(gw => gw.points !== null && completedGWs.some(c => c.gw === gw.gw && (c.season || activeSeason) === (gw.season || activeSeason)));
    const gwValues = gwCompletedTotals.map(gw => gw.points);
    const gwMean = gwValues.length ? gwValues.reduce((a,b)=>a+b,0) / gwValues.length : null;
    const gwVariance = gwValues.length > 1 ? gwValues.reduce((sum, pts) => sum + Math.pow(pts - gwMean, 2), 0) / gwValues.length : null;

    return {
      ...s,
      drawPickCount,
      drawPickRate: submittedPickCount ? drawPickCount / submittedPickCount : null,
      predictedGoalsAvg: submittedPickCount ? predictedGoalsTotal / submittedPickCount : null,
      nearMissCount,
      winnerRate: winnerScored ? winnerHits / winnerScored : null,
      gwVariance,
      eligible: s.scored >= minimumScoredPicks || completedGWs.length >= minimumCompletedGWs,
    };
  });

  const candidates = profiles.filter(p => p.eligible);
  if (!candidates.length) return {};

  const scoreBy = {
    max: values => {
      const min = Math.min(...values), max = Math.max(...values);
      return v => max === min ? 1 : (v - min) / (max - min);
    }
  };

  const menaceBoldNorm = scoreBy.max(candidates.map(p => p.predictedGoalsAvg ?? 0));
  const menaceBadNorm = scoreBy.max(candidates.map(p => Number(p.avg) || 0));
  const menaceVarianceNorm = scoreBy.max(candidates.map(p => p.gwVariance ?? 0));

  const leaders = {
    "The Standard": [...candidates].sort((a,b)=>(Number(a.avg)||999)-(Number(b.avg)||999) || b.perfects-a.perfects || b.scored-a.scored)[0]?.username,
    Perfectionist: [...candidates].sort((a,b)=>b.perfects-a.perfects || (b.scored?b.perfects/b.scored:0)-(a.scored?a.perfects/a.scored:0) || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    "Draw Merchant": [...candidates].sort((a,b)=>(b.drawPickRate??-1)-(a.drawPickRate??-1) || b.drawPickCount-a.drawPickCount || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    "Chaos Goblin": [...candidates].sort((a,b)=>(b.predictedGoalsAvg??-1)-(a.predictedGoalsAvg??-1) || b.nearMissCount-a.nearMissCount || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    Metronome: [...candidates].filter(p => p.gwVariance !== null).sort((a,b)=>(a.gwVariance??999)-(b.gwVariance??999) || (Number(a.avg)||999)-(Number(b.avg)||999) || b.scored-a.scored)[0]?.username,
    "Near Miss Specialist": [...candidates].sort((a,b)=>b.nearMissCount-a.nearMissCount || (b.scored?b.nearMissCount/b.scored:0)-(a.scored?a.nearMissCount/a.scored:0) || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    Liability: [...candidates].sort((a,b)=>{
      const menaceA = menaceBoldNorm(a.predictedGoalsAvg ?? 0) * 0.4 + menaceBadNorm(Number(a.avg) || 0) * 0.35 + menaceVarianceNorm(a.gwVariance ?? 0) * 0.25;
      const menaceB = menaceBoldNorm(b.predictedGoalsAvg ?? 0) * 0.4 + menaceBadNorm(Number(b.avg) || 0) * 0.35 + menaceVarianceNorm(b.gwVariance ?? 0) * 0.25;
      return menaceB - menaceA;
    })[0]?.username,
  };

  const priority = [
    { title: "The Standard", user: leaders["The Standard"] },
    { title: "Perfectionist", user: leaders.Perfectionist },
    { title: "Draw Merchant", user: leaders["Draw Merchant"] },
    { title: "Chaos Goblin", user: leaders["Chaos Goblin"] },
    { title: "Metronome", user: leaders.Metronome },
    { title: "Near Miss Specialist", user: leaders["Near Miss Specialist"] },
    { title: "Liability", user: leaders.Liability },
  ];

  const assigned = {};
  const used = new Set();

  priority.forEach(({ title, user }) => {
    if (!user || used.has(user)) return;
    assigned[user] = title;
    used.add(user);
  });

  return assigned;
}

const RADAR_TIPS = {
  Accuracy: "Avg penalty pts per pick. Lower is better.",
  Consistency: "How stable your per-GW score is. Low variance scores higher.",
  "Perfect Rate": "% of picks where you got the exact scoreline (0 pts).",
  Boldness: "Avg total goals you predict per fixture. Higher means more ambitious predictions.",
  "Winner Rate": "% of picks where you correctly called the result (home win / draw / away win), regardless of exact score.",
};
const BREAKDOWN_TIPS = {
  Perfect: "Exact scoreline (0 pts). Best possible outcome.",
  Close:   "Off by 1-2 pts total, e.g. predicted 2-1 and result was 1-1.",
  Bad:     "Off by 3+ pts total. More than a goal out on the combined score.",
  Missed:  "No pick submitted for this fixture.",
};
function BreakdownLegend({payload}) {
  return (
    <ul style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",listStyle:"none",padding:0,margin:"8px 0 0",justifyContent:"center"}}>
      {(payload||[]).map(entry => (
        <li key={entry.value} title={BREAKDOWN_TIPS[entry.value]} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"var(--text-mid)",cursor:"help"}}>
          <span style={{width:10,height:10,borderRadius:2,background:entry.color,flexShrink:0}}/>
          {entry.value}
        </li>
      ))}
    </ul>
  );
}
function RadarTooltip({active, payload, rawMap, tt}) {
  if (!active || !payload?.length) return null;
  const axis = payload[0]?.payload?.subject;
  if (!axis) return null;
  const players = payload.filter(p => p.name !== "Group Avg");
  return (
    <div style={{...tt, padding:"8px 12px", minWidth:140}}>
      <div style={{fontWeight:600, marginBottom:4, color:"var(--text-bright)"}}>{axis}</div>
      {players.map(p => (
        <div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:16,color:p.color,fontSize:11}}>
          <span>{p.name}</span>
          <span style={{fontWeight:600}}>{rawMap?.[p.name]?.[axis] ?? p.value}</span>
        </div>
      ))}
    </div>
  );
}
function RadarTick({x, y, payload, textAnchor}) {
  const label = payload.value;
  return (
    <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central"
      fill="var(--text-mid)" fontSize={10} fontFamily="'DM Mono',monospace"
      style={{cursor:"help"}}
    >
      <title>{RADAR_TIPS[label]}</title>
      {label}
    </text>
  );
}

function getInviteCodeFromLocation() {
  const search = new URLSearchParams(window.location.search);
  const queryCode = search.get("join");
  if (queryCode) return queryCode;

  const match = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]+)$/i);
  return match ? match[1] : null;
}

function DiscordLinkScreen({user,onDone}) {
  const [state,setState]=useState("idle");
  const [message,setMessage]=useState("");
  const token=new URLSearchParams(window.location.search).get("token")||"";
  const confirm=async()=>{
    setState("loading");
    try{
      const response=await fetch("/api/security",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"discord-link-confirm",token})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Could not link Discord right now.");
      setState("done");
      setMessage(`Discord is linked to ${data.username}. You can return to Discord.`);
    }catch(error){setState("error");setMessage(error.message);}
  };
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"var(--bg)",color:"var(--text)"}}>
    <section style={{width:"min(100%,440px)",background:"var(--card)",border:"1px solid var(--border2)",borderRadius:18,padding:"clamp(24px,6vw,38px)",boxShadow:"0 18px 60px rgba(0,0,0,.12)"}}>
      <div style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:14}}>Whistlebot</div>
      <h1 style={{fontSize:28,lineHeight:1.15,margin:"0 0 12px",color:"var(--text-bright)"}}>Link Discord to PAB</h1>
      <p style={{fontSize:14,lineHeight:1.65,color:"var(--text-mid)",margin:"0 0 24px"}}>Signed in as <strong style={{color:"var(--text-bright)"}}>{user.displayName||user.username}</strong>. Whistlebot will only receive pick counts and deadlines, never your predictions.</p>
      {message&&<div role="status" style={{padding:"12px 14px",borderRadius:10,marginBottom:16,fontSize:13,lineHeight:1.5,background:state==="done"?"#22c55e18":"#ef444418",color:state==="done"?"#22c55e":"#ef4444"}}>{message}</div>}
      {state!=="done"&&<button disabled={!token||state==="loading"} onClick={confirm} style={{width:"100%",minHeight:48,border:0,borderRadius:10,background:"var(--text-bright)",color:"var(--bg)",fontWeight:700,cursor:"pointer",opacity:(!token||state==="loading")?.65:1}}>{state==="loading"?"Linking…":"Link Discord"}</button>}
      <button onClick={onDone} style={{width:"100%",marginTop:10,minHeight:42,border:0,background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>{state==="done"?"Open dashboard":"Cancel"}</button>
    </section>
  </main>;
}

export default function App() {
  const visibleWidth = useVisibleViewportWidth();
  const viewportLayout = viewportLayoutState(visibleWidth);
  const [route,setRoute]=useState(()=>parseAppRoute(window.location.pathname));
  const [user,setUserRaw]=useState(null);
  const setUser=useCallback((u)=>{ userRef.current=u; setUserRaw(u); },[]);
  const [group,setGroup]=useState(null);
  const [tab,setTab]=useState("League");
  const [boot,setBoot]=useState(false);
  const [showLanding,setShowLanding]=useState(()=>parseAppRoute(window.location.pathname).page === "home" && !getInviteCodeFromLocation());
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [sitePrefs,setSitePrefs]=useState(null);
  const [sitePrefsLoaded,setSitePrefsLoaded]=useState(false);
  const [theme,setThemeRaw]=useState(()=>localStorage.getItem("theme")||"dark");
  const userRef=useRef(null);
  const setTheme=useCallback((t)=>{
    setThemeRaw(t);
    // /api/db is read-only; theme persistence goes through the auth endpoint so it
    // survives to other devices. Fire-and-forget — localStorage already keeps it
    // snappy on this device.
    if(userRef.current?.username&&userRef.current.username!==DEMO_SHARED_USERNAME)callAPI('account-set-theme',{theme:t}).catch(()=>{});
  },[]);
  const [toast,setToast]=useState(null);
  const konamiIndexRef=useRef(0);
  const [bootError,setBootError]=useState(false);
  const toastTimer=useRef(null);
  const [resetToken]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get("reset")||null;
  });
  const [joinParam]=useState(()=>getInviteCodeFromLocation());
  const [resetDone,setResetDone]=useState(false);
  const [groups, setGroups] = useState([]);
  const [names, setNames] = useState({});
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--pab-visible-width", viewportLayout.widthCss);
    root.dataset.pabCompact = viewportLayout.compact;
    root.dataset.pabDashboardStack = viewportLayout.dashboardStack;
    root.dataset.pabPhone = viewportLayout.phone;
    root.dataset.pabSmallPhone = viewportLayout.smallPhone;
  }, [viewportLayout.widthCss, viewportLayout.compact, viewportLayout.dashboardStack, viewportLayout.phone, viewportLayout.smallPhone]);
  const navigateTo=useCallback((nextRoute,{replace=false}={})=>{
    const path=appPath(nextRoute);
    window.history[replace?"replaceState":"pushState"]({pab:true},"",path);
    setRoute(nextRoute);
  },[]);
  const fetchGroupNames = useCallback(async (groupToLoad, userObj) => {
    if (!groupToLoad || !userObj) return;
    const demoMap = Object.fromEntries(DEMO_MEMBERS.map(m=>[m.username,m.displayName]));
    const init = {};
    (groupToLoad.members||[]).forEach(u=>{ init[u] = demoMap[u] || (u[0].toUpperCase()+u.slice(1)); });
    init[userObj.username] = userObj.displayName;
    setNames(init);
    try {
      const res = await fetch(`/api/security?action=member-names&groupId=${groupToLoad.id}`);
      if (res.ok) {
        const data = await res.json().catch(()=>({}));
        if (data.names) Object.assign(init, data.names, { [userObj.username]: userObj.displayName });
      }
    } catch { /* Fallback member names are already rendered. */ }
    setNames({...init});
  }, []);
  const handleSetupDone = useCallback((updatedUser) => {
    setUser(updatedUser);
    setNeedsSetup(false);
  }, []);
  const showToast=useCallback((msg)=>{
    setToast(msg);
    if(toastTimer.current)clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),4000);
  },[]);

  useEffect(()=>{
    if (!boot) return;
    const available = [...getAvailableThemes(user), "clarity"];
    const fallback = sitePrefs?.defaultTheme || "dark";
    if (!available.includes(theme)) setTheme(fallback);
  },[theme,user,sitePrefs,boot]);

  // Keep the saved theme while session status is unknown so dark users never
  // receive a light loading frame. Confirmed signed-out pages use Index.
  const effectiveTheme = !boot ? theme : user ? theme : "index";

  useEffect(()=>{
    document.documentElement.setAttribute("data-theme",effectiveTheme);
    document.documentElement.style.background="var(--bg)";
    localStorage.setItem("theme",theme);
  },[theme,effectiveTheme]);

  useEffect(()=>{
    const onPopState=()=>setRoute(parseAppRoute(window.location.pathname));
    window.addEventListener("popstate",onPopState);
    return()=>window.removeEventListener("popstate",onPopState);
  },[]);

  useEffect(()=>{
    window.destroyPoints = () => {
      showToast("Points destroyed. For now.");
      return 0;
    };
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const currentIndex = konamiIndexRef.current;
      const expected = KONAMI_SEQUENCE[currentIndex];
      if (key === expected) {
        if (currentIndex === KONAMI_SEQUENCE.length - 1) {
          setTheme("clarity");
          showToast("Post-Optimization Clarity unlocked.");
          konamiIndexRef.current = 0;
          return;
        }
        konamiIndexRef.current = currentIndex + 1;
        return;
      }
      konamiIndexRef.current = key === KONAMI_SEQUENCE[0] ? 1 : 0;
    };
    window.addEventListener("keydown", onKey, { passive: true });
    return () => window.removeEventListener("keydown", onKey);
  },[showToast]);

  const unlockSecretTheme = useCallback(()=>{
    if (!user) return Promise.resolve(false);
    const alreadyUnlocked = isSecretThemeUnlockedForUser(user);
    const clicks = (user.badClicks || 0) + 1;
    const unlockedThemes = alreadyUnlocked || clicks >= SECRET_THEME_CLICKS_REQUIRED
      ? Array.from(new Set([...(user.unlockedThemes || []), SECRET_THEME]))
      : (user.unlockedThemes || []);
    const updatedUser = { ...user, badClicks: clicks, unlockedThemes };
    setUser(updatedUser);
    if (!alreadyUnlocked && unlockedThemes.includes(SECRET_THEME)) {
      setTheme(SECRET_THEME);
      showToast("Velvet theme unlocked.");
    }
    callAPI('unlock-theme', { theme: SECRET_THEME, badClicks: clicks });
    return Promise.resolve(!alreadyUnlocked && unlockedThemes.includes(SECRET_THEME));
  },[user,showToast]);

  const runBoot=useCallback(async()=>{
    setBootError(false);
    setBoot(false);
    const saved=lget("session");
    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch (error) {
      const networkFailure = navigator.onLine === false
        || error instanceof TypeError
        || /failed to fetch|load failed|networkerror/i.test(String(error?.message || ""));
      setBootError(networkFailure ? "offline" : "connection");
      setSitePrefsLoaded(true);
      setBoot(true);
      return;
    }
    const prefs = bootstrap.sitePreferences && typeof bootstrap.sitePreferences === "object"
      ? bootstrap.sitePreferences
      : { defaultTheme: "dark", landingTheme: null };
    setSitePrefs(prefs);
    setSitePrefsLoaded(true);
    const savedTheme = localStorage.getItem("theme");
    if (!savedTheme && prefs.defaultTheme) setThemeRaw(prefs.defaultTheme);
    const u = bootstrap.user;
    setUser(u || null);
    setGroups(bootstrap.groups || []);
    if(u){
      if(u.username!==DEMO_SHARED_USERNAME&&u.theme)setThemeRaw(u.theme);
      setNeedsSetup(!u.email);
      const allGroups = (bootstrap.groups || []).map(normalizeWorldCupGroup);
      const requestedRoute=parseAppRoute(window.location.pathname);
      if(requestedRoute.page==="group"){
        const g=allGroups.find(x=>x.id===requestedRoute.groupId);
        if(g&&g.members?.includes(u.username)){
          fetchGroupNames(g,u);
          setGroup(g);
          if(saved?.tab)setTab(saved.tab);
          lset("session",{username:u.username,groupId:g.id,tab:saved?.tab||"League"});
        }else{
          window.history.replaceState({pab:true},"","/dashboard");
          setRoute({page:"dashboard"});
        }
      }else if(requestedRoute.page==="discord-link"){
        setGroup(null);
        setShowLanding(false);
      }else{
        setGroup(null);
        if(requestedRoute.page==="home"){
          window.history.replaceState({pab:true},"","/dashboard");
          setRoute({page:"dashboard"});
          setShowLanding(false);
        }else if(requestedRoute.page!=="dashboard"){
          window.history.replaceState({pab:true},"","/dashboard");
          setRoute({page:"dashboard"});
        }
      }
    }
    setBoot(true);
  },[]);

  useEffect(()=>{runBoot();},[]);

  useEffect(()=>{
    if(!bootError)return;
    const retryWhenOnline=()=>runBoot();
    window.addEventListener("online",retryWhenOnline);
    return()=>window.removeEventListener("online",retryWhenOnline);
  },[bootError,runBoot]);

  useEffect(()=>{
    if(!boot)return;
    if(!user){
      setGroup(null);
      if(route.page==="home")setShowLanding(true);
      else if(route.page==="signin"||route.page==="group"||route.page==="dashboard"||route.page==="discord-link")setShowLanding(false);
      else navigateTo({page:"home"},{replace:true});
      return;
    }
    if(route.page==="dashboard"){
      setGroup(null);
      lset("session",{username:user.username});
      return;
    }
    if(route.page==="discord-link"){
      setGroup(null);
      return;
    }
    if(route.page==="home"){
      setGroup(null);
      setShowLanding(false);
      navigateTo({page:"dashboard"},{replace:true});
      return;
    }
    if(route.page==="group"){
      const requested=groups.find(g=>g.id===route.groupId);
      if(!requested){navigateTo({page:"dashboard"},{replace:true});return;}
      if(group?.id!==requested.id){
        setGroup(requested);
        fetchGroupNames(requested,user);
        lset("session",{username:user.username,groupId:requested.id,tab});
      }
      return;
    }
    navigateTo({page:"dashboard"},{replace:true});
  },[boot,user,route,groups,group,tab,fetchGroupNames,navigateTo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(()=>{
    const eggs = [
      ()=>{ console.log("oh. you opened devtools."); console.log("bold move."); },
      ()=>{ console.error("SECURITY BREACH DETECTED"); console.log("(nah you're fine, just checking if you'd panic)"); },
      ()=>{ console.log("nothing to see here."); console.log("seriously. close this tab."); console.log("why are you still reading."); },
      ()=>{ console.log("we're not hiring."); console.log("but if we were, this wouldn't be how."); },
      ()=>{ console.log("👀 hello"); console.log("👀👀 we see you"); console.log("👀👀👀 please predict your scores and leave"); },
      ()=>{ console.log("there are no easter eggs here."); console.log("you imagined this."); },
      ()=>{ console.log("inspecting element won't help your predictions."); console.log("touch grass instead."); },
      ()=>{ console.log("congrats, you found the console."); console.log("your prize is knowing this app has no bugs."); console.log("(please don't look too hard)"); },
    ];
    eggs[Math.floor(Math.random()*eggs.length)]();
  },[]);

  const handleDemoLogin = async () => {
    const { ok, data } = await callAPI('auth-login', { username: DEMO_SHARED_USERNAME, password: 'demo' });
    if (!ok || !data?.user) {
      setShowLanding(false);
      setUser({ username: DEMO_SHARED_USERNAME, displayName: "Demo", groupIds: [] });
      navigateTo({page:"dashboard"},{replace:true});
      return;
    }
    await handleLogin(data.user);
  };

  const handleLogin = async (u) => {
    let nextUser = u;
    let nextSession = { username: u.username };
    if (u.username === DEMO_SHARED_USERNAME) {
      const { ok: demoOk, data: demoState } = await callAPI('demo-bootstrap');
      if (demoOk) {
        const sessionRes = await fetch('/api/security?action=auth-session').catch(() => null);
        const sessionData = sessionRes ? await sessionRes.json().catch(() => ({ user: null })) : { user: null };
        if (sessionData.user) nextUser = sessionData.user;
        else if (demoState?.user) nextUser = demoState.user;
      }
      if (demoOk && demoState?.groupId) nextSession = { ...nextSession, groupId: demoState.groupId, tab: "League" };
      const fallbackTheme = sitePrefs?.defaultTheme || "dark";
      setTheme(fallbackTheme);
      localStorage.setItem("theme", fallbackTheme);
    }
    const loginGroups = (await Promise.all((nextUser.groupIds || []).map(id=>sget(`group:${id}`)))).filter(Boolean).map(normalizeWorldCupGroup);
    lset("session", nextSession);
    setGroups(loginGroups);
    setGroup(null);
    setShowLanding(false);
    setUser(nextUser);
    if(nextUser.username!==DEMO_SHARED_USERNAME&&nextUser.theme)setThemeRaw(nextUser.theme);
    setNeedsSetup(false);
    const requested=parseAppRoute(window.location.pathname);
    if(requested.page==="discord-link"){
      setRoute(requested);
      return;
    }
    const targetId=requested.page==="group"?requested.groupId:nextSession.groupId;
    const target=targetId?loginGroups.find(g=>g.id===targetId):null;
    if(target){
      setGroup(target);
      setTab(nextSession.tab||"League");
      lset("session",{...nextSession,groupId:target.id,tab:nextSession.tab||"League"});
      navigateTo({page:"group",groupId:target.id},{replace:true});
    }else{
      lset("session",{username:nextUser.username});
      navigateTo({page:"dashboard"},{replace:true});
    }
  };
  const handleLogout = async () => {await callAPI('auth-logout'); ldel("session");setUser(null);setGroup(null);setShowLanding(true);navigateTo({page:"home"},{replace:true});};
  const handleEnterGroup = async (g, destinationTab="League") => {
    const fresh = await sget(`group:${g.id}`);
    const resolved = normalizeWorldCupGroup(fresh || g);
    await fetchGroupNames(resolved, user);
    setGroup(resolved);
    setGroups(prev => prev.some(x => x.id === resolved.id) ? prev : [...prev, resolved]);
    setTab(destinationTab);
    lset("session",{...lget("session"),groupId:resolved.id,tab:destinationTab});
    navigateTo({page:"group",groupId:resolved.id});
  };
  const handleLeaveGroup = async () => {
    setGroup(null);
    lset("session",{username:lget("session")?.username});
    navigateTo({page:"dashboard"},{replace:true});
    if (user?.username) {
      const sessionRes = await fetch('/api/security?action=auth-session').catch(()=>null);
      const sessionData = sessionRes ? await sessionRes.json().catch(()=>({user:null})) : {user:null};
      const ids = sessionData.user?.groupIds || [];
      const gs = (await Promise.all(ids.map(id=>sget(`group:${id}`)))).filter(Boolean).map(normalizeWorldCupGroup);
      setGroups(gs);
    }
  };
  const handleSetTab = useCallback((t)=>{
    setTab(t);
    lset("session",{...lget("session"),tab:t});
    if(typeof window!=="undefined")window.scrollTo({top:0,left:0,behavior:"auto"});
  },[]);
  const refreshGroup = useCallback(async()=>{if(!group)return;const fresh=normalizeWorldCupGroup(await sget(`group:${group.id}`));if(fresh&&JSON.stringify(fresh)!==JSON.stringify(group))setGroup(fresh);},[group]);
  const isAdmin=!!(user&&group&&canAdminGroup(group,user.username));
  const isCreator=!!(user&&group&&group.creatorUsername===user.username);
  return (
    <div
      className="pab-app-shell"
      data-compact={viewportLayout.compact}
      data-dashboard-stack={viewportLayout.dashboardStack}
      data-phone={viewportLayout.phone}
      data-small-phone={viewportLayout.smallPhone}
      style={{width:viewportLayout.widthCss,maxWidth:"100%",minWidth:0,overflowX:"clip"}}
    >
      <style>{CSS}</style>
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:"#ef444418",border:"1px solid #ef4444",borderRadius:8,padding:"10px 20px",
          color:"#ef4444",fontSize:12,letterSpacing:1,zIndex:9999,pointerEvents:"none",
          fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>
          {toast}
        </div>
      )}
      {user && needsSetup && boot && (
        <AccountSetupModal user={user} onDone={handleSetupDone} onLogout={handleLogout} />
      )}
      {!boot?(
        <LoadingSkeleton fullPage/>
      ):bootError?(
        bootError==="offline"||navigator.onLine === false?(
          <main style={{minHeight:"100dvh",boxSizing:"border-box",background:"var(--bg)",display:"grid",
            placeItems:"center",padding:"max(28px, env(safe-area-inset-top)) 24px max(28px, env(safe-area-inset-bottom))",
            color:"var(--text)",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
            <section style={{width:"min(100%, 390px)",textAlign:"center"}} aria-labelledby="offline-title">
              <img src="/pab.png" width="64" height="64" alt="" style={{display:"block",margin:"0 auto 22px"}}/>
              <div style={{fontSize:11,fontWeight:750,letterSpacing:2.2,textTransform:"uppercase",
                color:"var(--text-dim2)",marginBottom:12}}>Points Are Bad</div>
              <h1 id="offline-title" style={{fontSize:"clamp(28px, 8vw, 42px)",lineHeight:1.05,
                letterSpacing:"-.04em",margin:"0 0 14px",color:"var(--text-bright)",fontWeight:800}}>You’re offline</h1>
              <p style={{margin:"0 auto 24px",maxWidth:340,fontSize:14,lineHeight:1.65,color:"var(--text-dim)"}}>
                PAB needs a connection for picks and live scores. Reconnect, then try again.
              </p>
              <button onClick={runBoot} style={{minWidth:132,minHeight:46,background:"var(--btn-bg)",
                border:"1px solid var(--border)",borderRadius:12,color:"var(--btn-text)",cursor:"pointer",
                fontSize:13,fontWeight:750,padding:"0 20px",fontFamily:"inherit"}}>Retry</button>
            </section>
          </main>
        ):(
          <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:16,color:"var(--text-dim)",
            fontFamily:"monospace",fontSize:12}}>
            <div>Connection failed.</div>
            <div style={{display:"flex",gap:12}}>
              <button onClick={runBoot} style={{background:"none",border:"1px solid var(--border)",
                borderRadius:6,color:"var(--text)",cursor:"pointer",fontSize:11,letterSpacing:1.5,
                padding:"6px 14px",fontFamily:"inherit"}}>RETRY</button>
              <button onClick={()=>{ldel("session");window.location.reload();}} style={{background:"none",
                border:"none",color:"var(--text-dim3)",cursor:"pointer",fontSize:10,letterSpacing:1,
                padding:"6px 8px",fontFamily:"inherit"}}>clear session</button>
            </div>
          </div>
        )
      ):resetToken&&!resetDone?(
        <ResetPasswordScreen token={resetToken} onDone={()=>{
          window.history.replaceState({},"","/");
          setResetDone(true);
        }}/>
      ):route.page==="discord-link"&&user?(
        <DiscordLinkScreen user={user} onDone={()=>navigateTo({page:"dashboard"},{replace:true})}/>
      ):route.page==="home"&&showLanding&&!joinParam&&sitePrefsLoaded?(
        <IndexLandingPage signedIn={!!user} onContinue={()=>{if(user){navigateTo({page:"dashboard"});}else{setShowLanding(false);navigateTo({page:"signin"});}}} onDemo={handleDemoLogin} onAreBadTap={unlockSecretTheme} onOpenWhatsNew={()=>setWhatsNewOpen(true)}/>
      ):!user&&!sitePrefsLoaded?(
        <LoadingSkeleton fullPage/>
      ):!user?(
        <AuthScreen
          onLogin={handleLogin}
          onBack={()=>{
            if(joinParam){
              window.history.replaceState({},"","/");
              window.location.reload();
              return;
            }
            setShowLanding(true);
            navigateTo({page:"home"},{replace:true});
          }}
          successMsg={resetDone?"Password updated - please sign in.":null}
          joinCode={joinParam}
          theme={effectiveTheme}
        />
      ):!group?(
        <GroupLobby user={user} groups={groups} onEnterGroup={handleEnterGroup} onUpdateUser={u=>setUser(u)} onLogout={handleLogout} initialJoinCode={joinParam} onAreBadTap={unlockSecretTheme} theme={theme} setTheme={setTheme}/>
      ):(
        <GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin}
          isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout} onUpdateUser={u=>setUser(u)}
          refreshGroup={refreshGroup} theme={theme} setTheme={setTheme} setGroup={setGroup} showToast={showToast}
          sitePrefs={sitePrefs} setSitePrefs={setSitePrefs}
          names={names} setNames={setNames}
          onOpenWhatsNew={() => setWhatsNewOpen(true)}/>
      )}
      {whatsNewOpen && <WhatsNewModal user={user} theme={theme} onClose={() => setWhatsNewOpen(false)} />}
    </div>
  );
}

/* ── GAME SHELL ──────────────────────────────────── */
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,onUpdateUser,refreshGroup,theme,setTheme,setGroup,showToast,sitePrefs=null,setSitePrefs=()=>{},names={},setNames=()=>{},onOpenWhatsNew=()=>{}}) {
  const [selectedTab,setSelectedTab]=useState(tab);
  const [isTabPending,startTabTransition]=useTransition();
  const tabFrameRef=useRef(null);
  useEffect(()=>{setSelectedTab(tab);},[tab]);
  useEffect(()=>()=>{
    if(tabFrameRef.current!==null)window.cancelAnimationFrame(tabFrameRef.current);
  },[]);
  const selectTab=useCallback((nextTab)=>{
    setSelectedTab(nextTab);
    if(nextTab===tab)return;
    if(tabFrameRef.current!==null)window.cancelAnimationFrame(tabFrameRef.current);
    tabFrameRef.current=window.requestAnimationFrame(()=>{
      tabFrameRef.current=window.requestAnimationFrame(()=>{
        tabFrameRef.current=null;
        startTabTransition(()=>setTab(nextTab));
      });
    });
  },[tab,setTab,startTabTransition]);
  useEffect(()=>{refreshGroup();},[tab]);
  const liveGroupRef = useRef(group);
  useEffect(()=>{ liveGroupRef.current = group; },[group]);
  /* eslint-disable react-hooks/set-state-in-effect -- fixture updates intentionally reconcile the selected round and quick-pick queue. */
  useEffect(()=>{
    if (!group?.id || group.code === DEMO_GROUP_CODE || group.code === DEMO_WC_GROUP_CODE) return;
    let cancelled = false;
    let running = false;
    let lastScheduleSyncAt = 0;
    const runScheduleSync = async () => {
      const now = Date.now();
      if (cancelled || running || !shouldRunVisibleTask({
        visibilityState: document.visibilityState,
        lastRunAt: lastScheduleSyncAt,
        now,
        intervalMs: SCHEDULE_SYNC_INTERVAL_MS,
      })) return;
      const current = liveGroupRef.current;
      if (isPastGroup(current)) return;
      const targetGW = autoSyncTargetGW(current);
      if (!targetGW) return;
      lastScheduleSyncAt = now;
      running = true;
      try {
        const { ok, data } = await callAPI("group-user", { groupId: current.id, payload: { type: "auto-sync-fixtures", gw: targetGW } });
        if (!cancelled && ok && data.group && JSON.stringify(data.group) !== JSON.stringify(liveGroupRef.current)) {
          setGroup(data.group);
        }
      } catch (_) { /* Schedule sync retries on the next interval. */ }
      running = false;
    };
    const onScheduleVisibilityChange = () => {
      if (document.visibilityState === "visible") runScheduleSync();
    };
    document.addEventListener("visibilitychange", onScheduleVisibilityChange);
    runScheduleSync();
    const timer = setInterval(runScheduleSync, SCHEDULE_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onScheduleVisibilityChange);
    };
  },[group.id, group.code, setGroup]);
  const [profileOpen,setProfileOpen]=useState(false);
  const [accountOpen,setAccountOpen]=useState(false);
  const [pwCurrent,setPwCurrent]=useState("");
  const [pwNew,setPwNew]=useState("");
  const [pwConfirm,setPwConfirm]=useState("");
  const [pwError,setPwError]=useState("");
  const [pwSuccess,setPwSuccess]=useState(false);
  const [pwLoading,setPwLoading]=useState(false);
  const [themePickerOpen,setThemePickerOpen]=useState(false);
  const hScrollRef = useHorizontalScroll();
  const profileRef=useRef(null);
  useEffect(()=>{
    if(!profileOpen)return;
    const handler=(e)=>{if(profileRef.current&&!profileRef.current.contains(e.target))setProfileOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[profileOpen]);
  useEffect(()=>{
    // Only fetch if we have members without a known name (e.g., new member joined mid-session)
    const missing = (group.members||[]).filter(u => !names[u]);
    if (!missing.length) return;
    let cancelled=false;
    (async()=>{
      const res = await fetch(`/api/security?action=member-names&groupId=${group.id}`).catch(()=>null);
      const data = res ? await res.json().catch(()=>({})) : {};
      if (!cancelled && data.names) setNames(n => ({ ...n, ...data.names, [user.username]: user.displayName }));
    })();
    return()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[group.members?.join(",")]);

  const changePassword = async () => {
    if (!pwCurrent||!pwNew||!pwConfirm){setPwError("Fill in all fields.");return;}
    if (pwNew.trim().length<6){setPwError("Password must be at least 6 characters.");return;}
    if (pwNew!==pwConfirm){setPwError("New passwords do not match.");return;}
    setPwLoading(true);setPwError("");
    const { ok, data } = await callAPI('account-change-password', { currentPassword: pwCurrent, newPassword: pwNew });
    if (!ok){setPwError(data.error||"Failed to change password.");setPwLoading(false);return;}
    setPwSuccess(true);setPwLoading(false);
    setTimeout(()=>{setAccountOpen(false);setPwCurrent("");setPwNew("");setPwConfirm("");setPwSuccess(false);},2000);
  };
  const isWCGroup = isWorldCupGroupLike(group);
  const activeSeason = isWCGroup ? (group.season || 2026) : (group.season || 2025);
  const liveScoreGW = autoSyncTargetGW(group);
  const liveScoreFixtures = useMemo(() => {
    return ((group.gameweeks || []).find(g => g.gw === liveScoreGW && (g.season || activeSeason) === activeSeason)?.fixtures || []);
  }, [group.gameweeks, liveScoreGW, activeSeason]);
  const standingsLiveScores = useLiveScores(liveScoreGW, liveScoreFixtures, isWCGroup ? "WC" : (group.competition || "PL"), activeSeason);
  const finalizingLiveScoresRef = useRef(false);
  const lastLiveFinalizationAttemptRef = useRef(0);
  useEffect(() => {
    if (group.code === DEMO_GROUP_CODE || group.code === DEMO_WC_GROUP_CODE) return;
    if (!hasUnpersistedFinishedLiveScores(group, standingsLiveScores)) return;
    if (finalizingLiveScoresRef.current || Date.now() - lastLiveFinalizationAttemptRef.current < FINALIZATION_RETRY_INTERVAL_MS) return;
    let cancelled = false;
    finalizingLiveScoresRef.current = true;
    lastLiveFinalizationAttemptRef.current = Date.now();
    callAPI("group-user", { groupId: group.id, payload: { type: "sync-finished-live-scores" } })
      .then(({ ok, data }) => {
        if (!cancelled && ok && data.group) setGroup(data.group);
      })
      .finally(() => { finalizingLiveScoresRef.current = false; });
    return () => { cancelled = true; };
  }, [group, standingsLiveScores, setGroup]);
  const scoringGroup = useMemo(()=>applyFinishedLiveScoresToGroup(group, standingsLiveScores),[group, standingsLiveScores]);
  const stats = useMemo(()=>getGroupStats(scoringGroup),[scoringGroup]);
  const myRank = stats.find(s => s.username === user.username)?.rank || 0;
  const completedGWs = (scoringGroup.gameweeks || [])
    .filter(g => (g.season || activeSeason) === activeSeason && (g.fixtures || []).length > 0 && (g.fixtures || []).every(f => f.result || f.status === "POSTPONED"));
  const recapGW = completedGWs.length > 0 ? completedGWs.reduce((a, b) => a.gw > b.gw ? a : b) : null;
  const recapKey = recapGW ? `recap:${group.id}:${user.username}:gw${recapGW.gw}` : null;
  const [recapDismissed, setRecapDismissed] = useState(() => recapKey ? !!lget(recapKey) : true);
  useEffect(() => { setRecapDismissed(recapKey ? !!lget(recapKey) : true); }, [recapKey]);
  let recapContent = null;
  if (recapGW && !recapDismissed) {
    const gwNum = recapGW.gw;
    const recapSeason = recapGW.season || activeSeason;
    const weeklyTotals = stats.map(s => {
      const entry = s.gwTotals.find(g => g.gw === gwNum && (g.season || activeSeason) === recapSeason);
      return { username: s.username, pts: entry ? entry.points : null };
    }).filter(s => s.pts !== null);
    const minPts = weeklyTotals.length > 0 ? Math.min(...weeklyTotals.map(t => t.pts)) : null;
    const winners = minPts !== null ? weeklyTotals.filter(t => t.pts === minPts) : [];
    const totalGoals = recapGW.fixtures.reduce((sum, f) => {
      if (!f.result) return sum;
      const [h, a] = f.result.split("-").map(Number);
      return sum + (isNaN(h) || isNaN(a) ? 0 : h + a);
    }, 0);
    recapContent = { gwNum, winners, minPts, totalGoals, flavor: getWeeklyWinnerFlavor(minPts, winners.length, totalGoals) };
  }
  const nav = isWCGroup ? [...NAV.slice(0,2), "Standings", ...NAV.slice(2)] : NAV;
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'DM Mono',monospace"}}>
      <style>{CSS}</style>
      <header className="app-top-header" style={{borderBottom:theme==="index"?"none":"1px solid var(--border)",padding:theme==="index"?"16px 20px 0":"0 20px",position:"sticky",top:0,background:"var(--bg)",zIndex:50}}>
        <div className={theme==="index"?"pill-nav":undefined} style={{maxWidth:theme==="index"?1120:940,margin:"0 auto",display:"flex",alignItems:"center",height:theme==="index"?48:60,gap:0,borderRadius:theme==="index"?18:0,padding:theme==="index"?"0 10px":undefined}}>
          <button className="app-brand-button" onClick={onLeave} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,flexShrink:0,borderRight:theme==="index"?"none":"1px solid var(--border)",marginRight:theme==="index"?12:20,padding:theme==="index"?"0 12px":"0 16px 0 0",height:"100%"}}>
            <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:16,color:"var(--text-bright)",lineHeight:1}}>POINTS</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:400,fontSize:9,color:"var(--text-dim)",letterSpacing:3}}>are bad</span>
          </button>
          <div className="mob-hide" style={{flex:1,fontSize:theme==="index"?13:12,color:"var(--text-dim3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:theme==="index"?500:undefined}}>{group.name}</div>
          {theme!=="index"&&<div className="mob-hide" style={{fontSize:10,color:"#22c55e",letterSpacing:1,marginRight:12,background:"#22c55e15",border:"1px solid #22c55e25",borderRadius:4,padding:"3px 8px",flexShrink:0,display:"flex",alignItems:"center",gap:4}}><Flash size={11} color="#22c55e"/> API LIVE</div>}

          <nav className="group-tab-nav" aria-label="Group sections">
            {nav.map(t=>{
              const active=selectedTab===t;
              return <button key={t} data-content-active={tab===t} aria-current={active?"page":undefined} onClick={()=>selectTab(t)} className={`nb${active?" active":""}`} style={{color:active?"var(--text-bright)":"var(--text-dim)",fontSize:theme==="index"?13:10,letterSpacing:theme==="index"?0.1:2,padding:theme==="index"?"0 12px":"22px 12px 20px",height:theme==="index"?32:undefined,textTransform:theme==="index"?"none":"uppercase",borderRadius:theme==="index"?12:undefined,background:theme==="index"&&active?"rgba(0,0,0,.045)":"transparent"}}><span className="group-tab-icon" aria-hidden="true">{BOT_NAV_ICONS[t]}</span><span className="group-tab-label">{t}</span></button>;
            })}
          </nav>
          {user.username===DEMO_SHARED_USERNAME ? (
            <div style={{marginLeft:"auto",height:"100%",borderLeft:"1px solid var(--border)",paddingLeft:theme==="index"?8:16,display:"flex",alignItems:"center",gap:theme==="index"?6:10,flexShrink:0}}>
              <DemoThemeSwitcher theme={theme} setTheme={setTheme}/>
              <button className="app-header-action" onClick={onLogout} aria-label="Exit demo" style={{height:"100%",background:"none",border:"none",padding:0,cursor:"pointer",color:"#8888cc",fontSize:11,letterSpacing:1.5,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,flexShrink:0,whiteSpace:"nowrap"}}><LogOut size={13} color="#8888cc"/><span className="demo-exit-label">EXIT DEMO</span></button>
            </div>
          ) : (
          <div ref={profileRef} style={{position:"relative",display:"flex",alignItems:"center",marginLeft:"auto",borderLeft:"1px solid var(--border)",paddingLeft:20,height:"100%"}}>
            <button className="app-header-action" aria-label="Open account menu" onClick={()=>setProfileOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:7,borderRadius:4}}>
              <Avatar name={user.displayName} size={26}/>
              {myRank > 0 && (
                <span style={{fontSize:11,color:"var(--text-dim2)",fontFamily:"'DM Mono',monospace",letterSpacing:0.5,lineHeight:1}}>
                  {myRank===1?"🥇":myRank===2?"🥈":myRank===3?"🥉":`#${myRank}`}
                </span>
              )}
            </button>
            {profileOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:6,zIndex:100,minWidth:120,boxShadow:"0 4px 16px #00000030"}}>
                <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:1,padding:"4px 8px 6px",borderBottom:"1px solid var(--border)",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{user.displayName}</div>
                <button onClick={()=>{setProfileOpen(false);setPwError("");setPwSuccess(false);setAccountOpen(true);}} style={{width:"100%",background:"none",border:"none",borderRadius:6,color:"var(--text-mid)",cursor:"pointer",fontSize:11,letterSpacing:1.5,padding:"6px 8px",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:6,marginBottom:2}}><User size={13} color="currentColor"/>ACCOUNT</button>
                <button onClick={()=>{setProfileOpen(false);onLogout();}} style={{width:"100%",background:"none",border:"none",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:11,letterSpacing:1.5,padding:"6px 8px",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:6}}><LogOut size={13} color="#ef4444"/>LOG OUT</button>
              </div>
            )}
          </div>
          )}
        </div>
      </header>
      {accountOpen&&createPortal(
  <div className="modal-overlay" onClick={()=>setAccountOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div onClick={e=>e.stopPropagation()} className={`modal-panel profile-dialog${theme==="index"?" liquid-card":""}`} style={{background:theme==="index"?undefined:"var(--card)",border:"1px solid var(--border)",borderRadius:theme==="index"?24:14,padding:32,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto"}}>
      <div className="dialog-section-title" style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,marginBottom:12,fontWeight:600}}>Profile</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"10px 0",borderBottom:"1px solid var(--border3)"}}>
          <span style={{color:"var(--text-dim)"}}>Username</span><span style={{color:"var(--text-bright)",fontWeight:500}}>{user.username}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"10px 0",borderBottom:"1px solid var(--border3)"}}>
          <span style={{color:"var(--text-dim)"}}>Email</span><span style={{color:"var(--text-bright)",fontWeight:500}}>{user.email||"--"}</span>
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <button onClick={()=>setThemePickerOpen(p=>!p)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
          <span style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,fontWeight:600}}>Appearance</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"var(--text-dim)"}}>{THEMES.find(t=>t.id===theme)?.label||theme}</span>
            <span style={{fontSize:11,color:"var(--text-dim2)",transition:"transform 0.2s",transform:themePickerOpen?"rotate(180deg)":"rotate(0deg)"}}>&#9662;</span>
          </div>
        </button>
        {themePickerOpen && (
          <div style={{marginTop:12}}>
            <div style={{position:"relative"}}>
              <div ref={hScrollRef} style={{display:"flex",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"2px 0 8px",scrollbarWidth:"none",msOverflowStyle:"none"}}>
                {[...getSecretThemeMeta(user), ...(theme==="clarity"?[{key:"clarity",label:"Clarity",swatches:["#111","#666","#fff"]}]:[])].map(t=>{
                  const active=theme===t.key;
                  return (
                    <button key={t.key} onClick={()=>setTheme(t.key)} style={{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"10px 12px",background:active?"var(--surface)":"var(--card)",border:`1.5px solid ${active?"var(--btn-bg)":"var(--border2)"}`,borderRadius:10,cursor:"pointer",fontFamily:"inherit",transition:"border-color 0.15s,background 0.15s"}}>
                      <div style={{display:"flex",gap:4}}>
                        {t.swatches.map((c,i)=><div key={i} style={{width:13,height:13,borderRadius:"50%",background:c,border:"1px solid rgba(128,128,128,0.18)"}}/>)}
                      </div>
                      <span style={{fontSize:9,letterSpacing:0.8,textTransform:"uppercase",fontWeight:active?700:400,color:active?"var(--btn-bg)":"var(--text-dim)",whiteSpace:"nowrap",lineHeight:1}}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{position:"absolute",right:0,top:0,bottom:0,width:32,background:"linear-gradient(to right, transparent, var(--bg))",pointerEvents:"none"}}/>
            </div>
            {isSecretThemeUnlockedForUser(user)&&<div style={{fontSize:10,color:"var(--text-dim3)",marginTop:4}}>Secret theme unlocked.</div>}
          </div>
        )}
      </div>
      <div style={{borderTop:"1px solid var(--border3)",paddingTop:18}}>
        <div className="dialog-section-title" style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,marginBottom:14,fontWeight:600}}>Security</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <Input value={pwCurrent} onChange={setPwCurrent} placeholder="Current password" type="password" />
          <Input value={pwNew} onChange={setPwNew} placeholder="New password" type="password" />
          <Input value={pwConfirm} onChange={setPwConfirm} placeholder="Confirm new password" type="password" onKeyDown={e=>e.key==="Enter"&&changePassword()} />
        </div>
        {pwError&&<div style={{color:"#ef4444",fontSize:12,marginTop:10}}>{pwError}</div>}
        {pwSuccess&&<div style={{color:"#22c55e",fontSize:12,marginTop:10}}>Password updated.</div>}
        <div style={{display:"flex",gap:10,marginTop:18}}>
          <Btn onClick={changePassword} disabled={pwLoading||pwSuccess} style={{flex:1,padding:"10px 0",textAlign:"center"}}>{pwLoading?<Spinner/>:"SAVE"}</Btn>
          <Btn variant="ghost" onClick={()=>setAccountOpen(false)} style={{flex:1,padding:"10px 0",textAlign:"center"}}>Cancel</Btn>
        </div>
      </div>
    </div>
  </div>,
  document.body
)}
      <main aria-busy={isTabPending||selectedTab!==tab} style={{maxWidth:theme==="index"?1120:940,margin:"0 auto",padding:"32px 20px"}} className="fade pad-bot group-main" key={tab}>
        {(isTabPending||selectedTab!==tab)&&<div className="tab-loading-line" aria-label={`Loading ${selectedTab}`}/>}
        {theme==="index"&&<div className="group-context-bar">
          <div><button onClick={onLeave}>Your groups</button><span aria-hidden="true"> / </span><span>{competitionLabel(group,true)}</span><h2>{group.name}</h2></div>
          <div className="group-context-meta"><span>{(group.members||[]).length} members</span><span>{gwLabel(group,group.currentGW)}</span></div>
        </div>}
        {recapContent && (
          <div className="group-recap" style={{background:"#8888cc12",border:"1px solid #8888cc25",borderRadius:8,padding:"10px 16px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div style={{fontSize:12,color:"#8888cc",letterSpacing:1,flex:1,minWidth:0}}>
              <span style={{opacity:0.6,marginRight:10}}>{gwLabel(group,recapContent.gwNum)} RECAP</span>
              {recapContent.winners.length > 0 && <span style={{marginRight:8}}>{recapContent.winners.map(w => names[w.username] || w.username).join(" & ")} won the week <span style={{opacity:0.7}}>({recapContent.minPts} pts)</span></span>}
              {recapContent.totalGoals > 0 && <span style={{opacity:0.7}}>· {recapContent.totalGoals} goals total</span>}
              {recapContent.flavor && <span style={{opacity:0.9}}> · {recapContent.flavor}</span>}
            </div>
            <button className="group-recap-close" aria-label="Dismiss gameweek recap" onClick={() => { lset(recapKey, true); setRecapDismissed(true); }}
              style={{background:"none",border:"none",color:"#8888cc",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px",opacity:0.6,flexShrink:0}}>×</button>
          </div>
        )}
        <TabErrorBoundary key={tab} tabName={tab}>
          {tab==="League"&&<LeagueTab group={scoringGroup} user={user} names={names} theme={theme}/>}
          {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} names={names} theme={theme} setGroup={setGroup} showToast={showToast} initialLiveScores={standingsLiveScores}/>}
          {tab==="Standings"&&<WCStandingsTab group={group} theme={theme}/>}
          {tab==="Trends"&&<TrendsTab group={scoringGroup} names={names} theme={theme}/>}
          {tab==="Members"&&<MembersTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} names={names} theme={theme} setGroup={setGroup} setNames={setNames}/>}
          {tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} onLeave={onLeave} onUpdateUser={onUpdateUser} theme={theme} names={names} sitePrefs={sitePrefs} setSitePrefs={setSitePrefs} onOpenWhatsNew={onOpenWhatsNew} setGroup={setGroup}/>}
        </TabErrorBoundary>
      </main>
    </div>
  );
}

/* World Cup standings */
function WCStandingsTab({ group, theme="dark" }) {
  const [section,setSection]=useState("groups");
  const [standings,setStandings]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    const load=(showLoading=false)=>{
      if(showLoading)setLoading(true);
      setError("");
      fetch("/api/wc-standings")
        .then(r=>r.ok?r.json():Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(data=>{if(!cancelled)setStandings(data);})
        .catch(()=>{if(!cancelled)setError("Standings unavailable");})
        .finally(()=>{if(!cancelled&&showLoading)setLoading(false);});
    };
    load(true);
    const refresh=setInterval(()=>load(false),120000);
    return()=>{cancelled=true;clearInterval(refresh);};
  },[]);

  const groups=standings?.groups||[];
  const hasLive=groups.some(g=>g.rows?.some(r=>r.live));

  return (
    <div>
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:16,marginBottom:20,flexWrap:"wrap"}}>
        <div>
          <h1 style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:34,fontWeight:theme==="index"?800:900,color:"var(--text-bright)",letterSpacing:-1}}>Standings</h1>
          <p style={{color:"var(--text-dim)",fontSize:11,letterSpacing:2,marginTop:4}}>WORLD CUP 2026</p>
        </div>
        {hasLive&&<div style={{fontSize:10,color:"#22c55e",letterSpacing:1.4,textTransform:"uppercase"}}>Live</div>}
      </div>

      <div style={{borderBottom:"1px solid var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",marginBottom:24}}>
        {[["groups","Group Stage"],["knockout","Knockout Stage"]].map(([key,label])=>{
          const active=section===key;
          return (
            <button key={key} onClick={()=>setSection(key)} style={{background:"none",border:"none",borderBottom:`2px solid ${active?"var(--text-bright)":"transparent"}`,color:active?"var(--text-bright)":"var(--text-dim2)",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:active?700:500,padding:"13px 10px 14px",transition:"color 0.15s,border-color 0.15s"}}>
              {label}
            </button>
          );
        })}
      </div>

      {section==="groups"
        ? <WCGroupStageStandings groups={groups} loading={loading} error={error} theme={theme}/>
        : <WCKnockoutStage group={group} theme={theme} embedded/>
      }
    </div>
  );
}

function WCGroupStageStandings({ groups, loading, error, theme="dark" }) {
  const mob=useMobile();
  if (loading && !groups.length) return <div style={{color:"var(--text-dim)",fontSize:12,padding:"28px 0"}}>Loading standings...</div>;
  if (error && !groups.length) return <div style={{color:"#ef4444",fontSize:12,padding:"28px 0"}}>{error}</div>;
  if (!groups.length) return <div style={{color:"var(--text-dim)",fontSize:12,padding:"28px 0"}}>No group standings yet.</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:26}}>
      {groups.map(group=>(
        <WCStandingsGroupTable key={group.name} group={group} theme={theme} mob={mob}/>
      ))}
      <div style={{background:"var(--card-hi)",border:"1px solid var(--border2)",borderRadius:4,padding:"14px 16px",display:"flex",gap:24,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,color:"var(--text-bright)",fontWeight:800,marginBottom:8}}>Qualification</div>
          <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--text-mid)",fontSize:10,fontWeight:700}}>
            <span style={{width:7,height:7,background:"#3b82f6",display:"inline-block"}}/>
            Knockout stage
          </div>
        </div>
      </div>
    </div>
  );
}

function WCStandingsGroupTable({ group, theme="dark", mob=false }) {
  const scrollRef=useRef(null);
  const [fade,setFade]=useState({left:false,right:false});
  const updateFade=useCallback(()=>{
    const node=scrollRef.current;
    if(!node)return;
    const max=node.scrollWidth-node.clientWidth;
    setFade({left:node.scrollLeft>2,right:node.scrollLeft<max-2});
  },[]);
  useEffect(()=>{
    updateFade();
    const node=scrollRef.current;
    if(!node)return;
    const onScroll=()=>updateFade();
    const onResize=()=>updateFade();
    node.addEventListener("scroll",onScroll,{passive:true});
    window.addEventListener("resize",onResize);
    return()=>{node.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onResize);};
  },[group.rows,updateFade]);

  const headers=["","Team","MP","W","D","L","GF","GA","GD","Pts"];
  const rankW=mob?24:30;
  const teamW=mob?150:190;
  const statW=mob?36:44;
  const rowPad=mob?"9px 6px":"9px 8px";
  const stickyBg="var(--bg)";
  const fadeColor=({
    light:"rgba(42,40,35,0.22)",
    excel:"rgba(32,32,32,0.16)",
    terminal:"rgba(0,10,2,0.42)",
    nord:"rgba(34,39,49,0.34)",
    pitch:"rgba(6,18,6,0.36)",
    velvet:"rgba(24,12,30,0.38)",
    clarity:"rgba(24,24,24,0.34)",
    spotify:"rgba(18,18,18,0.36)",
    index:"rgba(58,62,68,0.24)",
  })[theme]||"rgba(12,12,20,0.34)";

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
        <h2 style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:mob?15:16,fontWeight:800,color:"var(--text-bright)",margin:0,letterSpacing:-0.2}}>{group.name}</h2>
      </div>
      <div style={{position:"relative"}}>
        <div ref={scrollRef} style={{overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}} className="wc-standings-scroll">
          <table style={{width:"max-content",minWidth:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:mob?12:12,tableLayout:"fixed"}}>
            <thead>
              <tr>
                {headers.map((h,i)=>{
                  const sticky=i<=1;
                  const left=i===0?0:rankW;
                  return (
                    <th key={h||"pos"} style={{position:sticky?"sticky":"static",left:sticky?left:undefined,zIndex:sticky?3:1,background:stickyBg,padding:"8px 6px",textAlign:i<=1?"left":"center",color:h==="Pts"?"var(--text-bright)":"var(--text-dim2)",fontSize:10,fontWeight:h==="Pts"?800:500,letterSpacing:i<=1?0:0.8,width:i===0?rankW:i===1?teamW:statW,minWidth:i===0?rankW:i===1?teamW:statW,borderBottom:"1px solid var(--border2)"}}>{h}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(group.rows||[]).map(row=>{
                const advanced=row.qualified ?? row.pos<=2;
                const rowBg=advanced?"color-mix(in srgb, var(--bg) 94%, #3b82f6 6%)":stickyBg;
                const values=[row.p,row.w,row.d,row.l,row.gf,row.ga,row.gd,row.pts];
                return (
                  <tr key={row.teamId||row.team} className="frow">
                    <td style={{position:"sticky",left:0,zIndex:2,background:rowBg,padding:rowPad,color:advanced?"var(--text-bright)":"var(--text-dim)",fontWeight:advanced?700:500,textAlign:"center",width:rankW,minWidth:rankW,borderBottom:"1px solid var(--border3)",boxShadow:advanced?"inset 3px 0 0 #3b82f6":"none"}}>{row.pos}</td>
                    <td style={{position:"sticky",left:rankW,zIndex:2,background:rowBg,padding:rowPad,width:teamW,minWidth:teamW,borderBottom:"1px solid var(--border3)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:mob?8:9,minWidth:0}}>
                        <TeamBadge team={row.team} crest={row.crest} size={mob?18:20}/>
                        <span title={row.team} style={{color:"var(--text-mid)",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mob?shortTeamName(row.team):row.team}</span>
                      </div>
                    </td>
                    {values.map((v,i)=>(
                      <td key={i} style={{padding:rowPad,textAlign:"center",color:i===7?"var(--text-bright)":"var(--text-mid)",fontWeight:i===7?800:700,width:statW,minWidth:statW,borderBottom:"1px solid var(--border3)",background:advanced?"color-mix(in srgb, var(--bg) 94%, #3b82f6 6%)":"transparent"}}>{v}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fade.left&&<div style={{position:"absolute",left:rankW+teamW,top:0,bottom:0,width:16,pointerEvents:"none",background:`linear-gradient(90deg, ${fadeColor}, transparent)`,zIndex:4}}/>}
        {fade.right&&<div style={{position:"absolute",right:0,top:0,bottom:0,width:26,pointerEvents:"none",background:`linear-gradient(270deg, ${fadeColor}, transparent)`,zIndex:4}}/>}
      </div>
    </div>
  );
}

/* eslint-disable react-hooks/static-components -- bracket cards intentionally close over responsive bracket geometry. */
function WCKnockoutStage({ group, theme="dark", embedded=false }) {
  const mob = useMobile();
  const SLOT_H = mob ? 36 : 56;
  const CARD_H = mob ? 28 : 46;
  const COL_W  = mob ? 150 : 196;
  const CONN_W = mob ? 12 : 16;
  const TOTAL_H = 16 * SLOT_H;
  const bracketGameweeks = useMemo(() => resolveWorldCupBracketAdvancement(group.gameweeks || []), [group.gameweeks]);

  const getGWFixtures = (gwNum) =>
    sortWorldCupBracketFixturesForDisplay(gwNum, bracketGameweeks.find(g => g.gw === gwNum)?.fixtures || []);

  const gw8 = getGWFixtures(8);
  const finalMatch = gw8.find(f => f.stage === "FINAL") || gw8[0] || null;
  const thirdMatch = gw8.find(f => f.stage === "THIRD_PLACE") || (gw8.length > 1 ? gw8[1] : null);

  const MatchCard = ({ f, blockH, gw, matchIndex }) => {
    const winner = winnerSideForWorldCupFixture(f);
    const matchMeta = formatWorldCupBracketMatchMeta(f);
    const dateW = mob ? 52 : 68;
    return (
      <div style={{
        position:"absolute",
        top:Math.max(0,(blockH-CARD_H)/2),
        left:4,right:4,
        height:CARD_H,
        background:"var(--card)",
        border:"1px solid var(--border)",
        borderRadius:6,
        overflow:"hidden",
        display:"grid",
        gridTemplateColumns:matchMeta?`minmax(0,1fr) ${dateW}px`:"1fr",
      }}>
        <div style={{display:"flex",flexDirection:"column",minWidth:0}}>
          {["home","away"].map(side => {
            const rawTeam = f?.[side] || null;
            const unresolved = isUnresolvedWorldCupTeamSlot(rawTeam);
            const team = unresolved ? getWorldCupKnockoutPlaceholderLabel(gw, matchIndex, side, f?.stage, f) : rawTeam;
            const crest = unresolved ? null : (f?.[`${side}Crest`] || null);
            const score = f?.result ? f.result.split("-")[side==="home"?0:1] : null;
            const wins = winner === side;
            const loses = winner && winner !== side;
            return (
              <div key={side} style={{
                flex:1,display:"flex",alignItems:"center",gap:mob?3:5,padding:mob?"0 4px":"0 7px",
                borderBottom:side==="home"?"1px solid var(--border3)":"none",
                opacity:loses?0.38:1,
                background:wins?"var(--card-hi)":"transparent",
                minWidth:0,
              }}>
                <TeamBadge team={team||"?"} crest={crest} size={mob?11:16} />
                <span title={team||"TBD"} style={{fontSize:mob?9:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:wins?"var(--text-bright)":"var(--text-mid)",fontWeight:wins?700:400}}>{team ? formatWorldCupBracketTeamName(team) : "TBD"}</span>
                {score!=null&&<span style={{fontSize:mob?9:11,fontWeight:700,color:"var(--text-bright)",fontFamily:"'DM Mono',monospace",minWidth:mob?10:14,textAlign:"right"}}>{score}</span>}
              </div>
            );
          })}
        </div>
        {matchMeta&&(
          <div style={{borderLeft:"1px solid var(--border3)",display:"flex",flexDirection:"column",alignItems:"flex-start",justifyContent:"center",paddingLeft:mob?6:9,color:"var(--text-bright)",lineHeight:1.15,minWidth:0}}>
            <span style={{fontSize:mob?9:11,fontWeight:700,whiteSpace:"nowrap"}}>{matchMeta.primary}</span>
            {matchMeta.secondary&&<span style={{fontSize:mob?8:10,fontWeight:600,color:matchMeta.primary==="FT"?"#93c5fd":"var(--text-mid)",whiteSpace:"nowrap"}}>{matchMeta.secondary}</span>}
          </div>
        )}
      </div>
    );
  };

  const BracketConnector = ({ fromCount }) => {
    const slotH = TOTAL_H / fromCount;
    const pairCount = fromCount / 2;
    const lines = [];
    for (let i = 0; i < pairCount; i++) {
      const y0 = (2*i+0.5)*slotH;
      const y1 = (2*i+1.5)*slotH;
      const yMid = (y0+y1)/2;
      lines.push(
        <line key={`a${i}`} x1={0} y1={y0} x2={CONN_W/2} y2={y0} stroke="var(--border2)" strokeWidth={1}/>,
        <line key={`b${i}`} x1={0} y1={y1} x2={CONN_W/2} y2={y1} stroke="var(--border2)" strokeWidth={1}/>,
        <line key={`c${i}`} x1={CONN_W/2} y1={y0} x2={CONN_W/2} y2={y1} stroke="var(--border2)" strokeWidth={1}/>,
        <line key={`d${i}`} x1={CONN_W/2} y1={yMid} x2={CONN_W} y2={yMid} stroke="var(--border2)" strokeWidth={1}/>,
      );
    }
    return (
      <svg width={CONN_W} height={TOTAL_H} style={{flexShrink:0,display:"block",marginTop:24}}>
        {lines}
      </svg>
    );
  };

  const ROUNDS = [
    {gw:4,label:"ROUND OF 32",count:16},
    {gw:5,label:"ROUND OF 16",count:8},
    {gw:6,label:"QUARTER-FINALS",count:4},
    {gw:7,label:"SEMI-FINALS",count:2},
    {gw:8,label:"FINAL",count:1},
  ];

  return (
    <div>
      {!embedded&&<div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:34,fontWeight:theme==="index"?800:900,color:"var(--text-bright)",letterSpacing:-1}}>Knockout Stage</h1>
          <p style={{color:"var(--text-dim)",fontSize:11,letterSpacing:2,marginTop:4}}>WORLD CUP 2026 · KNOCKOUT STAGE</p>
        </div>
      </div>}
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-start",paddingBottom:8}}>
          {ROUNDS.map(({gw,label,count},ri) => {
            const isLast = ri === ROUNDS.length - 1;
            const allFixtures = getGWFixtures(gw);
            const displayFixtures = gw === 8 ? [finalMatch] : allFixtures;
            const blockH = TOTAL_H / count;
            return [
              <div key={`col-${gw}`} style={{width:COL_W,flexShrink:0}}>
                <div style={{fontSize:mob?6:8,color:"var(--text-dim)",letterSpacing:mob?1:2,textAlign:"center",marginBottom:6,height:18}}>{label}</div>
                <div style={{height:TOTAL_H,position:"relative"}}>
                  {Array.from({length:count},(_,i)=>(
                    <div key={i} style={{position:"absolute",top:i*blockH,left:0,right:0,height:blockH}}>
                      <MatchCard f={displayFixtures[i]||null} blockH={blockH} gw={gw} matchIndex={i}/>
                    </div>
                  ))}
                </div>
              </div>,
              !isLast && <BracketConnector key={`conn-${gw}`} fromCount={count}/>,
            ];
          })}
        </div>
      </div>
      {thirdMatch && (
        <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--border3)"}}>
          <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:2,marginBottom:8}}>3RD PLACE PLAYOFF</div>
          <div style={{position:"relative",width:COL_W,height:CARD_H}}>
            <MatchCard f={thirdMatch} blockH={CARD_H} gw={8} matchIndex={0}/>
          </div>
        </div>
      )}
    </div>
  );
}
/* eslint-enable react-hooks/static-components */

/* ── LEAGUE ──────────────────────────────────────── */
function LeagueTab({group,user,names,theme}) {
  const mob = useMobile();
  const isIndex = theme === "index";
  const stats = useMemo(()=>getGroupStats(group),[group]);
  const titles = useMemo(()=>computeGroupRelativeTitles(group, stats),[group, stats]);
  const totalResults = (group.gameweeks||[]).reduce((a,g)=>a+(g.fixtures||[]).filter(f=>f.result).length,0);
  const comp = isWorldCupGroupLike(group) ? "WC" : (group.competition || "PL");
  const isLeague = comp === "PL" || comp === "LL" || comp === "CL";
  const activeSeason = group.season || 2025;
  const [leagueTable, setLeagueTable] = useState(null);
  const [showTable, setShowTable] = useState(false);
  useEffect(() => {
    if (!isLeague) return;
    let c = false;
    fetch(`/api/standings?competition=${comp}&season=${activeSeason}`).then(r=>r.ok?r.json():null).then(d=>{if(!c&&d?.table)setLeagueTable(d.table);}).catch(()=>{});
    return ()=>{c=true;};
  }, [comp, isLeague, activeSeason]);
  const zoneColor = pos => comp === "CL"
    ? pos<=8?"#3b82f6":pos<=24?"#f97316":"#ef4444"
    : pos<=4?"#3b82f6":pos===5?"#f97316":pos===6?"#10b981":pos>=18?"#ef4444":null;
  const tableTitle = comp === "LL" ? "LA LIGA TABLE" : comp === "CL" ? "CHAMPIONS LEAGUE TABLE" : "PREMIER LEAGUE TABLE";
  const tableLegend = comp === "CL"
    ? [["#3b82f6","TOP 8"],["#f97316","PLAY-OFF"],["#ef4444","OUT"]]
    : [["#3b82f6","UCL"],["#f97316","UEL"],["#10b981","UECL"],["#ef4444","REL"]];
  return (
    <div>
      <div className={isIndex?"liquid-card":undefined} style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:32,padding:isIndex?"26px 28px":"0",borderRadius:isIndex?28:0}}>
        <div>
          <h1 style={{fontFamily:isIndex?"Inter,system-ui,sans-serif":"'Playfair Display',serif",fontSize:mob?(isIndex?26:28):(isIndex?34:38),fontWeight:isIndex?700:900,color:"var(--text-bright)",letterSpacing:isIndex?"-0.03em":-1}}>Standings</h1>
          <p style={{color:"var(--text-dim)",fontSize:isIndex?12:11,letterSpacing:isIndex?0.2:2,marginTop:6}}>{totalResults} RESULTS COUNTED · LOWER IS BETTER</p>
        </div>
      </div>
      {stats.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"var(--text-dim)"}}>No members yet.</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {stats.map((p,i)=>{
            const place=p.rank??i+1;
            const title = titles[p.username];
            const pointsMeta = getPointsLabelMeta(p.total, theme);
            const pointsLabelClass = pointsMeta.effect === "glitch" ? "pts-label-glitch" : pointsMeta.effect === "pulse" ? "pts-label-pulse" : pointsMeta.effect === "shimmer" ? "pts-label-shimmer" : "";
            return (
            <div key={p.username} className={isIndex?"liquid-card":undefined} style={{display:"grid",gridTemplateColumns:mob?"40px 1fr 80px":"52px 1fr 80px 80px 90px",alignItems:"center",gap:mob?8:12,padding:mob?"12px 14px":"16px 20px",background:isIndex?undefined:(p.username===user.username?"var(--card-hi)":"var(--card)"),borderRadius:isIndex?22:10,border:`1px solid ${p.username===user.username?"var(--border2)":"var(--border3)"}`}}>
              <div style={{textAlign:"center"}}>
                <span style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:place<=3?(mob?18:22):(mob?13:16),fontWeight:theme==="index"?800:900,color:place===1?"#fbbf24":place===2?"#9ca3af":place===3?"#b45309":"var(--text-dim)"}}>
                  {place===1?"🥇":place===2?"🥈":place===3?"🥉":place}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:mob?8:12,minWidth:0}}>
                <Avatar name={names[p.username]||p.username} size={mob?28:34} color={PALETTE[(group.members||[]).indexOf(p.username)%PALETTE.length]}/>
                <div style={{display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0,flex:1,overflow:"visible",position:"relative",zIndex:1}}>
                  <div style={{fontSize:mob?13:15,color:p.username===user.username?"#8888cc":"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",lineHeight:1.2}}>{names[p.username]||p.username}{p.username===user.username&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:6}}>you</span>}</div>
                  <TitleBadge title={title} />
                </div>
              </div>
              {!mob&&<div style={{textAlign:"center"}}><div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>PERFECT</div><div style={{color:"#22c55e",fontWeight:700}}>{p.perfects}</div></div>}
              {!mob&&<div style={{textAlign:"center"}}><div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>AVG</div><div style={{color:"var(--text-mid)"}}>{p.avg}</div></div>}
              <div style={{textAlign:"right"}}><div className={pointsLabelClass} style={{fontSize:11,color:pointsMeta.color,letterSpacing:2,marginBottom:3,textShadow:pointsMeta.glow==="none"?"none":pointsMeta.glow}}>{pointsMeta.label.toUpperCase()}</div><div style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:mob?22:28,fontWeight:theme==="index"?800:900,color:p.total===666?"#ef4444":place===1?"#fbbf24":"var(--text-bright)",lineHeight:1,textShadow:p.total===666?"0 0 10px rgba(239,68,68,.45)":p.total===1000?"0 0 10px rgba(250,204,21,.28)":"none"}}>{p.total}</div></div>
            </div>
          )})}
        </div>
      )}
      {leagueTable&&leagueTable.length>0&&(
        <div style={{marginTop:36}}>
          <div onClick={()=>setShowTable(!showTable)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10,marginBottom:showTable?12:0,userSelect:"none"}}>
            <div style={{width:2,height:14,background:isIndex?"#7c8aa0":"#6366f1",borderRadius:2,flexShrink:0}}/>
            <span style={{fontSize:11,fontWeight:700,letterSpacing:3,color:isIndex?"#7c8aa0":"#6366f1",textTransform:"uppercase",flex:1}}>{tableTitle}</span>
            <span style={{fontSize:10,color:"var(--text-dim)",transition:"transform 0.2s",transform:showTable?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
          </div>
          {showTable&&(
            <div style={{border:"1px solid var(--border3)",borderRadius:isIndex?20:10,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:mob?"28px 1fr 40px 40px":"28px 1fr 32px 32px 32px 32px 40px 40px",gap:0,padding:"8px 12px",fontSize:10,color:"var(--text-dim2)",letterSpacing:1,borderBottom:"1px solid var(--border)",background:"var(--surface)"}}>
                <div>#</div>
                <div>TEAM</div>
                {!mob&&<div style={{textAlign:"center"}}>W</div>}
                {!mob&&<div style={{textAlign:"center"}}>D</div>}
                {!mob&&<div style={{textAlign:"center"}}>L</div>}
                {!mob&&<div style={{textAlign:"center"}}>P</div>}
                <div style={{textAlign:"center"}}>GD</div>
                <div style={{textAlign:"right"}}>PTS</div>
              </div>
              {leagueTable.map((r,idx)=>{
                const zc = zoneColor(r.pos);
                return (
                  <div key={r.pos} style={{display:"grid",gridTemplateColumns:mob?"28px 1fr 40px 40px":"28px 1fr 32px 32px 32px 32px 40px 40px",gap:0,padding:"8px 12px",fontSize:mob?12:13,color:"var(--text-mid)",borderBottom:idx<leagueTable.length-1?"1px solid var(--border)":"none",borderLeft:zc?`3px solid ${zc}`:"3px solid transparent",background:"var(--card)"}}>
                    <div style={{color:"var(--text-dim)",fontSize:11}}>{r.pos}</div>
                    <div style={{display:"flex",alignItems:"center",gap:mob?6:8,color:"var(--text-bright)",fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",paddingRight:4}}><TeamBadge team={r.team} crest={r.crest} size={mob?16:18}/><span title={r.team} style={{overflow:"hidden",textOverflow:"ellipsis"}}>{mob?shortTeamName(r.team):r.team}</span></div>
                    {!mob&&<div style={{textAlign:"center"}}>{r.w}</div>}
                    {!mob&&<div style={{textAlign:"center"}}>{r.d}</div>}
                    {!mob&&<div style={{textAlign:"center"}}>{r.l}</div>}
                    {!mob&&<div style={{textAlign:"center",color:"var(--text-dim)"}}>{r.p}</div>}
                    <div style={{textAlign:"center",color:r.gd>0?"#22c55e":r.gd<0?"#ef4444":"var(--text-dim)"}}>{r.gd>0?"+":""}{r.gd}</div>
                    <div style={{textAlign:"right",fontWeight:700,color:"var(--text-bright)"}}>{r.pts}</div>
                  </div>
                );
              })}
              <div style={{display:"flex",gap:16,padding:"10px 12px",fontSize:10,color:"var(--text-dim2)",background:"var(--surface)",borderTop:"1px solid var(--border)",flexWrap:"wrap"}}>
                {tableLegend.map(([color,label])=>(
                  <span key={label}><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:color,marginRight:4,verticalAlign:"middle"}}/>{label}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── FIXTURES ────────────────────────────────────── */
function NextMatchCountdown({ fixtureGameweeks = [], myPreds = EMPTY_LIVE_SCORES, competition = "PL", season = 2025, initialLiveScores = EMPTY_LIVE_SCORES }) {
  const [now, setNow] = useState(new Date());
  const [expanded, setExpanded] = useState(false);
  const mob = useMobile();
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const liveScoreTarget = useMemo(()=>findNextMatchLiveScoreTarget(fixtureGameweeks, now),[fixtureGameweeks, now]);
  const cardLiveScores = useLiveScores(liveScoreTarget?.gw, liveScoreTarget?.fixtures || [], competition, season, initialLiveScores);
  const cardState = buildNextMatchCardState({ fixtureGameweeks, liveScores: cardLiveScores, myPreds, now });

  if (!cardState) return null;

  const next = cardState.fixture;
  const isLiveCard = cardState.mode === "live";
  const diff = cardState.diff || 0;
  const urgent = !!cardState.urgent;
  const warning = !!cardState.warning;
  const label = cardState.label;
  const deadpanLine = null;
  const borderColor = isLiveCard ? "#f59e0b45" : urgent ? "#ef444435" : warning ? "#f59e0b35" : "var(--border3)";
  const bgColor = isLiveCard ? "#f59e0b08" : urgent ? "#ef444408" : warning ? "#f59e0b08" : "var(--card)";
  const textColor = isLiveCard ? "#f59e0b" : urgent ? "#ef4444" : warning ? "#f59e0b" : "var(--text-dim)";
  const timerColor = isLiveCard ? "#f59e0b" : urgent ? "#ef4444" : warning ? "#f59e0b" : "var(--text-bright)";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");

  const timerEl = (
    <div onClick={() => setExpanded(e => !e)} style={{fontFamily:"'DM Mono',monospace",fontSize:mob?15:16,color:timerColor,letterSpacing:mob?2:3,animation:urgent?"pulse 1s ease-in-out infinite":undefined,cursor:"pointer",userSelect:"none"}}>
      {expanded ? (
        <>{Math.floor(diff / 3600000)}<span style={{fontSize:"0.75em",letterSpacing:1}}>h </span>{pad(mins)}<span style={{fontSize:"0.75em",letterSpacing:1}}>m </span>{pad(secs)}<span style={{fontSize:"0.75em",letterSpacing:1}}>s</span></>
      ) : (
        <>
          {days > 0 && <span style={{color:"var(--text-mid)"}}>{days}d </span>}
          {pad(hours)}:{pad(mins)}:{pad(secs)}
        </>
      )}
    </div>
  );

  const liveStatusEl = isLiveCard ? (
    <div style={{fontFamily:"'DM Mono',monospace",fontSize:mob?14:15,color:"#f59e0b",letterSpacing:2,animation:"pulse 1.5s infinite",whiteSpace:"nowrap"}}>
      {cardState.secondaryLabel || "LIVE"}
    </div>
  ) : null;
  const liveScoreEl = isLiveCard ? (
    <div style={{fontFamily:"'DM Mono',monospace",fontSize:mob?15:16,color:"var(--text-bright)",letterSpacing:1,textAlign:"center",whiteSpace:"nowrap"}}>
      {cardState.scoreText || "vs"}
    </div>
  ) : null;
  const moreLiveText = isLiveCard && cardState.moreLiveCount > 0 ? `+${cardState.moreLiveCount} MORE LIVE` : null;

  if (isLiveCard && mob) return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 14px",marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7,gap:10}}>
        <div>
          <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
          {moreLiveText&&<div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1,textTransform:"uppercase",marginTop:3}}>{moreLiveText}</div>}
        </div>
        {liveStatusEl}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 58px minmax(0,1fr)",alignItems:"center",gap:8,fontSize:13,color:"var(--text-mid)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6,minWidth:0}}>
          <span title={next.home} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortTeamName(next.home)}</span>
          <TeamBadge team={next.home} crest={next.homeCrest} size={22} />
        </div>
        {liveScoreEl}
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:6,minWidth:0}}>
          <TeamBadge team={next.away} crest={next.awayCrest} size={22} />
          <span title={next.away} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortTeamName(next.away)}</span>
        </div>
      </div>
    </div>
  );

  if (mob) return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 14px",marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
        <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
        {timerEl}
      </div>
      <div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>{deadpanLine}</div>
      <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--text-mid)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6,flex:1,minWidth:0}}>
          <span title={next.home} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortTeamName(next.home)}</span>
          <TeamBadge team={next.home} crest={next.homeCrest} size={22} />
        </div>
        <span style={{color:"var(--text-dim)",flexShrink:0}}>vs</span>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:6,flex:1,minWidth:0}}>
          <TeamBadge team={next.away} crest={next.awayCrest} size={22} />
          <span title={next.away} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortTeamName(next.away)}</span>
        </div>
      </div>
    </div>
  );

  if (isLiveCard) return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 14px",marginBottom:18,display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase",lineHeight:1.3}}>{label}</div>
        {moreLiveText&&<div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1,textTransform:"uppercase",lineHeight:1.3,marginTop:4}}>{moreLiveText}</div>}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,minWidth:0,fontSize:14,color:"var(--text-mid)"}}>
        <span title={next.home} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.home}</span>
        <TeamBadge team={next.home} crest={next.homeCrest} size={22} />
      </div>
      {liveScoreEl}
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8,minWidth:0,fontSize:14,color:"var(--text-mid)"}}>
        <TeamBadge team={next.away} crest={next.awayCrest} size={22} />
        <span title={next.away} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.away}</span>
      </div>
      <div style={{gridColumn:"5/7",display:"flex",justifyContent:"flex-end"}}>{liveStatusEl}</div>
    </div>
  );

  return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 14px",marginBottom:18,display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase",lineHeight:1.3}}>{label}</div>
        <div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1,textTransform:"uppercase",lineHeight:1.3,marginTop:4}}>{deadpanLine}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,minWidth:0,fontSize:14,color:"var(--text-mid)"}}>
        <span title={next.home} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.home}</span>
        <TeamBadge team={next.home} crest={next.homeCrest} size={22} />
      </div>
      <div style={{textAlign:"center",fontSize:13,color:"var(--text-dim)"}}>vs</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8,minWidth:0,fontSize:14,color:"var(--text-mid)"}}>
        <TeamBadge team={next.away} crest={next.awayCrest} size={22} />
        <span title={next.away} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.away}</span>
      </div>
      <div style={{gridColumn:"5/7"}}>{timerEl}</div>
    </div>
  );
}

function PickCompletionPanel({ group, season, gw, names, theme }) {
  const completion = group.pickCompletion?.[String(season)]?.[String(gw)];
  if (!completion) return null;
  const members = group.members || [];
  const doneCount = members.filter(username => completion[username]?.status === "done").length;
  const statusStyle = status => status === "done"
    ? { color:"#22c55e", background:"#22c55e16", borderColor:"#22c55e42" }
    : status === "in-progress"
      ? { color:"#f59e0b", background:"#f59e0b16", borderColor:"#f59e0b42" }
      : { color:"var(--text-dim2)", background:"var(--surface)", borderColor:"var(--border3)" };

  return (
    <section aria-label="Member pick completion" className={theme === "index" ? "liquid-card" : undefined} style={{background:theme === "index"?undefined:"var(--card)",border:"1px solid var(--border3)",borderRadius:theme === "index"?22:10,padding:"16px 18px",marginBottom:18}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-bright)",marginBottom:4}}>Pick check</div>
          <div style={{fontSize:10,color:"var(--text-dim)",lineHeight:1.45}}>See who has finished. Individual picks stay hidden.</div>
        </div>
        <span style={{fontSize:11,color:"var(--text-dim2)",whiteSpace:"nowrap"}}>{doneCount}/{members.length}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:7}}>
        {members.map(username => {
          const item = completion[username] || { picked:0, total:0, status:"not-started" };
          const label = `${item.picked}/${item.total}`;
          return (
            <div key={username} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,minWidth:0,padding:"9px 10px",background:"var(--surface)",border:"1px solid var(--border3)",borderRadius:10}}>
              <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                <Avatar name={names[username]||username} size={24}/>
                <span style={{fontSize:11,color:"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names[username]||username}</span>
              </div>
              <span style={{...statusStyle(item.status),fontSize:9,fontWeight:700,whiteSpace:"nowrap",border:"1px solid",borderRadius:999,padding:"3px 6px"}}>{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FixturesTab({group,user,isAdmin,names,theme,setGroup,showToast,initialLiveScores=EMPTY_LIVE_SCORES}) {
  const mob = useMobile();
  const isIndex = theme === "index";
  const gwStripRef = useRef(null);
  const pickInputRefs = useRef({});
  const [predDraft,setPredDraft]=useState({});
  const [wizardQueue, setWizardQueue] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [deleteGWStep, setDeleteGWStep] = useState(0);
  const [removeGWStep, setRemoveGWStep] = useState(0);
  const [wizardPred, setWizardPred] = useState("");
  const wizardKey = `wizard-seen:${group.id}:${user.username}`;
  const isWC = isWorldCupGroupLike(group);
  const activeSeason = isWC ? (group.season||2026) : (group.season||2025);
  const fixtureGroup = useMemo(()=>isWC?normalizeWorldCupGroup(group):group,[isWC,group]);
  const fixtureCompetition = isWC ? "WC" : (fixtureGroup.competition || "PL");
  const fixtureGameweeks = fixtureGroup.gameweeks||[];
  const [viewGW, setViewGW] = useState(()=>{
    const seas = activeSeason;
    const seasonGWs = (fixtureGameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
    // Find lowest GW with at least one non-postponed fixture missing a result
    const activeGW = seasonGWs.find(gwObj =>
      (gwObj.fixtures||[]).some(f => !f.result && f.status !== "POSTPONED")
    );
    if (activeGW) return activeGW.gw;
    // All complete: show last GW with results
    const withResults = seasonGWs.filter(gwObj=>(gwObj.fixtures||[]).some(f=>f.result));
    if (withResults.length) return withResults[withResults.length-1].gw;
    return fixtureGroup.currentGW||1;
  });
  const currentGW = viewGW;
  const gwFixtures = useMemo(()=>((fixtureGameweeks||[]).find(g=>g.gw===currentGW&&(g.season||activeSeason)===activeSeason)?.fixtures||[]).slice().sort((a,b)=>{
    const da=a.date?new Date(a.date).getTime():Infinity;
    const db=b.date?new Date(b.date).getTime():Infinity;
    return da-db;
  }),[fixtureGameweeks,currentGW,activeSeason]);
  const liveScores = useLiveScores(currentGW, gwFixtures, fixtureCompetition, activeSeason, initialLiveScores);
  const liveClockActive = gwFixtures.some(f => {
    const lm = liveScores[`${f.home}|${f.away}`];
    const liveStatus = lm?.status === "in_progress" || lm?.status === "halftime" || f.status === "IN_PLAY" || f.status === "PAUSED";
    const finalStatus = !!f.result || f.status === "FINISHED" || lm?.status === "finished";
    return liveStatus && !finalStatus && f.status !== "POSTPONED";
  });
  const [matchClockNow, setMatchClockNow] = useState(()=>Date.now());
  useEffect(()=>{
    if (!liveClockActive) return;
    const immediate = setTimeout(()=>setMatchClockNow(Date.now()), 0);
    const timer = setInterval(()=>setMatchClockNow(Date.now()), 60000);
    return () => { clearTimeout(immediate); clearInterval(timer); };
  },[liveClockActive, currentGW]);
  const gwObj = (fixtureGameweeks||[]).find(g=>g.gw===currentGW&&(g.season||activeSeason)===activeSeason);
  const firstPicks = useMemo(()=>computeFirstPickGW(fixtureGroup),[fixtureGroup]);
  const userPreJoin = gwObj ? isPreJoinGW(firstPicks, user.username, gwObj, activeSeason) : false;
  const picksLocked = !!(fixtureGroup.picksLocked?.[user.username]?.[activeSeason]?.[currentGW]);
  const allFixturesFinished = gwFixtures.length>0 && gwFixtures.every(f=>{
    const hiddenPostponed = (fixtureGroup.hiddenFixtures||[]).includes(f.id) && f.status === "POSTPONED";
    return !!f.result || hiddenPostponed;
  });
  const myPreds = fixtureGroup.predictions?.[user.username]||EMPTY_LIVE_SCORES;
  const gwAdminLocked = !isAdmin && (fixtureGroup.hiddenGWs||[]).includes(currentGW);
  const dibsTurnFor = fixtureGroup.mode==="dibs"
    ? Object.fromEntries(gwFixtures.map(f=>[f.id, computeDibsTurn(fixtureGroup,f.id)]))
    : {};
  const fixtureClosedForPicks = f => {
    const hiddenPostponed = (fixtureGroup.hiddenFixtures||[]).includes(f.id) && f.status === "POSTPONED";
    return hiddenPostponed||!!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||f.status==="POSTPONED"||(f.date&&new Date(f.date)<=new Date()));
  };
  const allFixturesClosedForPicks = gwFixtures.length>0&&gwFixtures.every(fixtureClosedForPicks);
  const unpickedUnlocked = (gwAdminLocked||picksLocked) ? [] : gwFixtures.filter(f=>{
    if (fixtureClosedForPicks(f)) return false;
    if (myPreds[f.id]) return false;
    if (fixtureGroup.mode==="dibs" && dibsTurnFor[f.id] !== user.username) return false;
    return true;
  });
  const canViewAllPicks = picksLocked||allFixturesClosedForPicks||unpickedUnlocked.length===0;

  const savePred = async (fixtureId, val) => {
    const f = gwFixtures.find(fx => fx.id === fixtureId);
    const locked = !!(f?.result || f?.status==="FINISHED" || f?.status==="IN_PLAY" || f?.status==="PAUSED" || (f?.date && new Date(f.date) <= new Date()));
    if (locked) return;
    if (!/^\d+-\d+$/.test(val)) return;
    // Dibs mode checks
    if (fixtureGroup.mode === "dibs") {
      const turn = computeDibsTurn(fixtureGroup, fixtureId);
      if (turn !== user.username) return; // not your turn
      // block duplicate scoreline
      const taken = Object.entries(fixtureGroup.predictions || {})
        .filter(([u]) => u !== user.username)
        .some(([, picks]) => /^\d+-\d+$/.test(picks?.[fixtureId] || "") && picks[fixtureId] === val);
      if (taken) {
        alert(`"${val}" has already been claimed for this match. Pick a different scoreline.`);
        setPredDraft(d => ({...d, [fixtureId]: myPreds[fixtureId] || ""}));
        return;
      }
    }
    if (val === "1-1") {
      const max = draw11LimitMax(fixtureGroup.draw11Limit);
      if (Number.isFinite(max)) {
        const used = gwFixtures.filter(f => f.id !== fixtureId && myPreds[f.id] === "1-1").length;
        if (used >= max) {
          alert(max === 0
            ? "1-1 predictions are not allowed in this group."
            : `You can only make ${max} 1-1 prediction${max > 1 ? "s" : ""} per ${draw11LimitPeriod(fixtureGroup)}. Limit reached.`);
          setPredDraft(d => ({...d, [fixtureId]: myPreds[fixtureId] || ""}));
          return;
        }
      }
    }
    const { ok, data } = await callAPI('group-user', { groupId: group.id, payload:{ type:'save-prediction', fixtureId, value: val } });
    if (ok && data.group) {
      setGroup(data.group);
      setPredDraft(d=>{const n={...d};delete n[fixtureId];return n;});
    } else {
      showToast(data?.error || 'Save failed - check your connection.');
    }
  };

  const toggleFixtureHidden = async (fixtureId) => {
    const { ok, data } = await callAPI('group-admin', { groupId: group.id, payload:{ type:'toggle-hidden-fixture', fixtureId } });
    if (ok && data.group) setGroup(data.group);
  };

  const deleteGW = async () => {
    const { ok, data } = await callAPI('group-admin', { groupId: group.id, payload:{ type:'delete-gw', gw: currentGW } });
    if (ok && data.group) {
      setGroup(data.group);
      setDeleteGWStep(0);
    }
  };

  const removeGW = async () => {
    const { ok, data } = await callAPI('group-admin', { groupId: group.id, payload:{ type:'remove-gw', gw: currentGW } });
    if (ok && data.group) {
      setGroup(data.group);
      setRemoveGWStep(0);
    }
  };

  const setGW = (gw) => {setDeleteGWStep(0);setRemoveGWStep(0);setViewGW(gw);};

  useEffect(()=>{
    const seas = activeSeason;
    const exists = (fixtureGameweeks||[]).some(g=>g.gw===viewGW&&(g.season||seas)===seas);
    if (!exists) setViewGW(fixtureGroup.currentGW||1);
  },[fixtureGameweeks, activeSeason, viewGW, fixtureGroup.currentGW]);

  useEffect(()=>{
    if (!gwStripRef.current) return;
    return observeSelectedGameweek(gwStripRef.current, viewGW);
  },[fixtureGameweeks, activeSeason, viewGW]);

  useEffect(()=>{
    if (lget(wizardKey)===currentGW) return;
    if (!isAdmin && (fixtureGroup.hiddenGWs||[]).includes(currentGW)) { setWizardQueue(null); return; }
    const now = new Date();
    let nearestUpcomingGW = null;
    let nearestDate = null;
    for (const gwObj of (fixtureGameweeks||[]).filter(g=>(g.season||activeSeason)===activeSeason)) {
      for (const f of (gwObj.fixtures||[])) {
        if (f.date&&!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||new Date(f.date)<=now)) {
          const d=new Date(f.date);
          if (!nearestDate||d<nearestDate){nearestDate=d;nearestUpcomingGW=gwObj.gw;}
        }
      }
    }
    if (nearestUpcomingGW!==null&&currentGW!==nearestUpcomingGW){setWizardQueue(null);return;}
    const unpicked = gwFixtures.filter(f=>{
      const locked=!!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=now));
      return !locked&&!myPreds[f.id];
    });
    if (unpicked.length>0){setWizardQueue(unpicked);setWizardStep(0);setWizardPred("");}
    else setWizardQueue(null);
  },[currentGW, wizardKey, isAdmin, fixtureGroup.hiddenGWs, fixtureGameweeks, activeSeason, gwFixtures, myPreds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const showWizard = wizardQueue!==null&&wizardStep<(wizardQueue?.length??0)&&lget(wizardKey)!==currentGW;
  const wizardFixture = showWizard?wizardQueue[wizardStep]:null;
  const advanceWizard = ()=>{
    setWizardPred("");
    if(!wizardQueue||wizardStep+1>=wizardQueue.length){lset(wizardKey,currentGW);setWizardQueue(null);}
    else setWizardStep(s=>s+1);
  };
  const handleWizardSubmit = async ()=>{
    if(wizardPred&&/^\d+-\d+$/.test(wizardPred)&&wizardFixture) await savePred(wizardFixture.id,wizardPred);
    advanceWizard();
  };
  const handleWizardSkip = ()=>advanceWizard();

  return (
    <div>
      {showWizard&&wizardFixture&&createPortal(
        <div className="modal-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="modal-panel quick-pick-dialog" style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:16,padding:"36px 32px",maxWidth:420,width:"100%",textAlign:"center"}}>
            <div className="quick-pick-caption" style={{fontSize:13,color:"var(--text-dim)",letterSpacing:2,marginBottom:24}}>{gwLabel(group,currentGW)} · {wizardQueue.length-wizardStep} {theme==="index" ? `match${wizardQueue.length-wizardStep!==1?"es":""} left to pick` : `MATCH${wizardQueue.length-wizardStep!==1?"ES":""} TO PICK`}</div>
            <div style={{display:"flex",justifyContent:"center",gap:12,alignItems:"center",marginBottom:24}}>
              <div style={{textAlign:"right",flex:1,minWidth:0,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8}}>
                <span title={wizardFixture.home} style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:22,color:"var(--text-bright)",letterSpacing:-0.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mob?shortTeamName(wizardFixture.home):wizardFixture.home}</span>
                <TeamBadge team={wizardFixture.home} crest={wizardFixture.homeCrest} size={22}/>
              </div>
              <span style={{fontSize:12,color:"var(--text-dim)",letterSpacing:3,flexShrink:0}}>VS</span>
              <div style={{textAlign:"left",flex:1,minWidth:0,display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8}}>
                <TeamBadge team={wizardFixture.away} crest={wizardFixture.awayCrest} size={22}/>
                <span title={wizardFixture.away} style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:22,color:"var(--text-bright)",letterSpacing:-0.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mob?shortTeamName(wizardFixture.away):wizardFixture.away}</span>
              </div>
            </div>
            {wizardFixture.date&&<div style={{fontSize:13,color:"var(--text-dim)",marginBottom:20}}>{formatFixtureDate(wizardFixture.date)}</div>}
            <Input key={wizardStep} value={wizardPred} onChange={setWizardPred} placeholder="e.g. 2-1" autoFocus
              onKeyDown={e=>e.key==="Enter"&&wizardPred&&/^\d+-\d+$/.test(wizardPred)&&handleWizardSubmit()}
              style={{textAlign:"center",fontSize:22,marginBottom:18,letterSpacing:6}}/>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <Btn variant="ghost" small onClick={handleWizardSkip}>Skip</Btn>
              <Btn onClick={handleWizardSubmit} disabled={!wizardPred||!/^\d+-\d+$/.test(wizardPred)}>
                {wizardStep+1<wizardQueue.length?"Submit →":"Submit & Done"}
              </Btn>
            </div>
            {wizardQueue.length>1&&(
              <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:22}}>
                {wizardQueue.map((_,i)=>(
                  <div key={i} style={{width:7,height:7,borderRadius:"50%",background:i<wizardStep?"#22c55e":i===wizardStep?"var(--text)":"var(--border)",transition:"background 0.2s"}}/>
                ))}
              </div>
            )}
            <div style={{marginTop:18,borderTop:"1px solid var(--border)",paddingTop:14}}>
              <Btn variant="muted" small onClick={()=>{lset(wizardKey,currentGW);setWizardQueue(null);}}>Skip all</Btn>
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className={`fixture-round-picker${isIndex?" liquid-card":""}`} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12,padding:isIndex?"24px 28px":"0",borderRadius:isIndex?28:0}}>
        <div>
          <h1 style={{fontFamily:isIndex?"Inter,system-ui,sans-serif":"'Playfair Display',serif",fontSize:isIndex?34:34,fontWeight:isIndex?700:900,color:"var(--text-bright)",letterSpacing:isIndex?"-0.03em":-1}}>{fixtureCompetition === "CL" || isWC ? gwLabel(fixtureGroup,currentGW) : `Gameweek ${currentGW}`}</h1>
          {isIndex&&<div style={{fontSize:12,color:"var(--text-dim)",marginTop:6}}>Set your picks before the whistle.</div>}
        </div>
        <div className="gw-outer" style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <div className="gw-controls" style={{display:"flex",alignItems:"center",gap:3}}>
            <button onClick={()=>gwStripRef.current&&gwStripRef.current.scrollBy({left:-gwStripRef.current.clientWidth,behavior:"smooth"})} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim2)",cursor:"pointer",fontSize:13,padding:"4px 8px",lineHeight:1,flexShrink:0}}>‹</button>
            <div style={{position:"relative",flex:1,maxWidth:396}}>
            <div ref={node => { gwStripRef.current = node; if (node && !node._wheelBound) { node._wheelBound = true; node.addEventListener("wheel", e => { e.preventDefault(); node.scrollLeft += e.deltaY; }, { passive: false }); } }} className="gw-strip" style={{display:"flex",gap:3,overflowX:"auto",flex:1}}>
              {(fixtureGameweeks||[]).filter(g=>(g.season||activeSeason)===activeSeason).sort((a,b)=>a.gw-b.gw).map(g=>{
                const adminHidden = !isAdmin && (fixtureGroup.hiddenGWs||[]).includes(g.gw);
                const status = gameweekStatus(g, fixtureGroup.hiddenGWs, isAdmin);
                return (
                  <button key={g.gw} data-gameweek={g.gw} onClick={()=>setGW(g.gw)} style={{
                    background:currentGW===g.gw?"var(--btn-bg)":"var(--card)",
                    color:currentGW===g.gw?"var(--btn-text)":"var(--text-dim2)",
                    border:status==="active"&&currentGW!==g.gw?"1.5px solid var(--text-dim)":"1px solid var(--border)",
                    borderRadius:isIndex?999:6,
                    padding:isIndex?"6px 12px":"4px 0",
                    fontSize:11,
                    cursor:"pointer",
                    fontFamily:"inherit",
                    letterSpacing:isIndex?0.2:1,
                    flexShrink:0,
                    minWidth:isIndex?64:54,
                    textAlign:"center",
                    opacity:adminHidden?0.4:1,
                    display:"flex",
                    flexDirection:"column",
                    alignItems:"center",
                    gap:2,
                  }}>
                    <span>{adminHidden&&<Lock size={10} color="currentColor" style={{marginRight:3}}/>}{isWC?`R${g.gw}`:gwLabel(group,g.gw)}</span>
                    {(()=>{
                      const dotColor = status==="complete"?"#22c55e":status==="active"?"#f59e0b":status==="locked"?"#ef4444":null;
                      return dotColor ? <span style={{width:5,height:5,borderRadius:"50%",background:dotColor,flexShrink:0}}/> : <span style={{width:5,height:5}}/>;
                    })()}
                  </button>
                );
              })}
            </div>
              <div style={{position:"absolute",left:0,top:0,bottom:0,width:20,background:"linear-gradient(to right, var(--bg), transparent)",pointerEvents:"none",zIndex:1}}/>
              <div style={{position:"absolute",right:0,top:0,bottom:0,width:20,background:"linear-gradient(to left, var(--bg), transparent)",pointerEvents:"none",zIndex:1}}/>
            </div>
            <button onClick={()=>gwStripRef.current&&gwStripRef.current.scrollBy({left:gwStripRef.current.clientWidth,behavior:"smooth"})} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim2)",cursor:"pointer",fontSize:13,padding:"4px 8px",lineHeight:1,flexShrink:0}}>›</button>
          </div>
          {isAdmin&&deleteGWStep===0&&removeGWStep===0&&<Btn variant="danger" small onClick={()=>setDeleteGWStep(1)}>Clear GW</Btn>}
          {isAdmin&&deleteGWStep===1&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Clear {gwLabel(group,currentGW)}?</span>
            <Btn variant="danger" small onClick={()=>setDeleteGWStep(2)}>Confirm</Btn>
            <Btn variant="muted" small onClick={()=>setDeleteGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&deleteGWStep===2&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Really clear {gwLabel(group,currentGW)}? All picks lost.</span>
            <Btn variant="danger" small onClick={deleteGW}>Yes, clear</Btn>
            <Btn variant="muted" small onClick={()=>setDeleteGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&removeGWStep===0&&deleteGWStep===0&&<Btn variant="danger" small onClick={()=>setRemoveGWStep(1)}>Delete GW</Btn>}
          {isAdmin&&removeGWStep===1&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Delete {gwLabel(group,currentGW)}?</span>
            <Btn variant="danger" small onClick={()=>setRemoveGWStep(2)}>Confirm</Btn>
            <Btn variant="muted" small onClick={()=>setRemoveGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&removeGWStep===2&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Permanently remove {gwLabel(group,currentGW)}?</span>
            <Btn variant="danger" small onClick={removeGW}>Yes, delete</Btn>
            <Btn variant="muted" small onClick={()=>setRemoveGWStep(0)}>Cancel</Btn>
          </div>}
        </div>
      </div>

      <NextMatchCountdown fixtureGameweeks={fixtureGameweeks} myPreds={myPreds} competition={fixtureCompetition} season={activeSeason} initialLiveScores={initialLiveScores} />

      {isAdmin&&<PickCompletionPanel group={fixtureGroup} season={activeSeason} gw={currentGW} names={names} theme={theme}/>}

      {gwAdminLocked && (
        <div style={{background:"#ef444410",border:"1px solid #ef444430",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#ef4444",letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
          <Lock size={12} color="#ef4444"/> THIS GAMEWEEK IS LOCKED BY YOUR ADMIN
        </div>
      )}

      {!mob&&<div style={{display:"grid",gridTemplateColumns:"72px minmax(0,1fr) 54px minmax(0,1fr) 105px 70px",gap:10,padding:"6px 14px",fontSize:11,color:"var(--text-dim)",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
        <div></div>
        <div style={{textAlign:"right",paddingRight:46}}>Home</div>
        <div></div>
        <div style={{paddingLeft:46}}>Away</div>
        <div style={{textAlign:"center"}}>Your Pick</div>
        <div style={{textAlign:"center"}}>Pts</div>
      </div>}

      {gwFixtures.length===0?<div style={{color:"var(--text-dim)",textAlign:"center",padding:60}}>No fixtures. {isAdmin&&"Global fixtures will appear automatically."}</div>:gwFixtures.map(f=>{
        const myPred = predDraft[f.id]!==undefined?predDraft[f.id]:(myPreds[f.id]||"");
        const [draftHome, draftAway] = String(myPred).split("-");
        const liveMatch = liveScores[`${f.home}|${f.away}`];
        const effectiveStatus = effectiveFixtureStatus(f, liveMatch);
        const effResult = effectiveFixtureResult(f, liveScores);
        const pts = calcPts(myPreds[f.id], effResult);
        const effectivePts = pts!==null?pts:(effResult&&!myPreds[f.id]?(userPreJoin?null:MISSED_PICK_PTS):null);
        const hardLocked = gwAdminLocked || !!(f.result||effectiveStatus==="FINISHED"||effectiveStatus==="IN_PLAY"||effectiveStatus==="PAUSED"||effectiveStatus==="POSTPONED"||(f.date&&new Date(f.date)<=new Date()));
        const locked = hardLocked || picksLocked;
        const lockReason = hardLocked?gwAdminLocked?"admin locked":effectiveStatus==="IN_PLAY"||effectiveStatus==="PAUSED"?"in play":effectiveStatus==="POSTPONED"?"postponed":f.result||effectiveStatus==="FINISHED"?"result set":"kicked off":picksLocked?"picks locked":null;
        const searchHref = `https://www.google.com/search?q=${encodeURIComponent(f.home+" vs "+f.away)}`;
        const isHidden = (fixtureGroup.hiddenFixtures||[]).includes(f.id);
        const dateStr = formatFixtureDate(liveMatch?.startTime || f.date);
        const yahooScored = !f.result && liveMatch && (liveMatch.status==="in_progress"||liveMatch.status==="halftime"||liveMatch.status==="finished") && liveMatch.homeScore != null && liveMatch.awayScore != null;
        const yahooFinal = yahooScored && liveMatch.status==="finished";
        const storedFinal = !!f.result || f.status==="FINISHED";
        const isLive = (effectiveStatus==="IN_PLAY"||effectiveStatus==="PAUSED") && !yahooFinal && !storedFinal;
        const scoreStr = effResult;
        const elapsed = isLive ? matchClockLabel(f, liveMatch, matchClockNow) : null;
        const resultDisplay = fixtureResultDisplayParts(f, liveMatch, scoreStr);
        const scoreParts = resultDisplay ? [resultDisplay.homeScore, resultDisplay.awayScore] : null;
        const delayStatus = !scoreParts ? fixtureDelayStatus(f, liveMatch) : null;
        const pendingScoreSync = !scoreParts && !delayStatus && shouldFetchLiveScores([f]);
        const completedWinnerSide = (storedFinal || yahooFinal) ? fixtureWinnerSide(f, liveMatch, resultDisplay) : null;
        const completedDraw = (storedFinal || yahooFinal) ? fixtureCompletedDraw(f, liveMatch, resultDisplay) : false;
        const homeSideEmphasized = completedDraw || completedWinnerSide === "home";
        const awaySideEmphasized = completedDraw || completedWinnerSide === "away";
        const mutedOpacity = hardLocked ? 0.55 : 1;
        const homeSideOpacity = hardLocked && !homeSideEmphasized ? 0.55 : 1;
        const awaySideOpacity = hardLocked && !awaySideEmphasized ? 0.55 : 1;
        const scoreSlotWidth = 32;
        const scoreNumberStyle = {fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--text-bright)",letterSpacing:0,lineHeight:1};
        const shootoutNumberStyle = {fontSize:9,fontWeight:700,color:"var(--text-bright)",opacity:0.9,lineHeight:1,alignSelf:"flex-start",marginTop:-2};
        const homeScoreBlock = scoreParts?(
          <span style={{display:"inline-flex",alignItems:"flex-start",justifyContent:"flex-start",gap:1,minWidth:scoreSlotWidth,flexShrink:0}}>
            <span style={{...scoreNumberStyle,textAlign:"right"}}>{resultDisplay.homeScore}</span>
            {resultDisplay.homeShootoutScore!==null&&<span style={shootoutNumberStyle}>({resultDisplay.homeShootoutScore})</span>}
          </span>
        ):null;
        const awayScoreBlock = scoreParts?(
          <span style={{display:"inline-flex",alignItems:"flex-start",justifyContent:"flex-end",gap:1,minWidth:scoreSlotWidth,flexShrink:0}}>
            <span style={scoreNumberStyle}>{resultDisplay.awayScore}</span>
            {resultDisplay.awayShootoutScore!==null&&<span style={shootoutNumberStyle}>({resultDisplay.awayShootoutScore})</span>}
          </span>
        ):null;
        const emptyScoreBlock = <span aria-hidden="true" style={{display:"inline-flex",minWidth:scoreSlotWidth,flexShrink:0}}/>;
        const homeScoreSlot = homeScoreBlock || emptyScoreBlock;
        const awayScoreSlot = awayScoreBlock || emptyScoreBlock;
        const resultStatusBlock = scoreParts?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",minWidth:54}}>
            {resultDisplay.statusLabel&&<span style={{fontSize:9,color:"#22c55e",letterSpacing:1,opacity:0.65,textAlign:"center"}}>{resultDisplay.statusLabel}</span>}
            {isLive&&<span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,animation:"pulse 1.5s infinite",textAlign:"center"}}>{elapsed||"LIVE"}</span>}
          </div>
        ):effectiveStatus==="POSTPONED"?(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              <span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,opacity:0.8}}>POSTPONED</span>
              {isAdmin&&<button onClick={()=>toggleFixtureHidden(f.id)} title={isHidden?"Show in picks table":"Hide from picks table"} style={{background:"#f59e0b20",border:"1px solid #f59e0b40",borderRadius:4,cursor:"pointer",lineHeight:1,padding:"4px 6px",color:"#f59e0b",transition:"all 0.15s",display:"flex",alignItems:"center",opacity:isHidden?0.4:1}}>{isHidden?<EyeOff size={14} color="#f59e0b"/>:<Eye size={14} color="#f59e0b"/>}</button>}
              </div>
            ):delayStatus?(
              <span style={{color:"#f59e0b",fontSize:9,letterSpacing:1,opacity:0.8}}>{delayStatus}</span>
            ):pendingScoreSync?(
              <span style={{color:"var(--text-dim)",fontSize:11,letterSpacing:1}}>SYNCING</span>
            ):<span style={{color:"var(--text-dim)",fontSize:11}}>TBD</span>;
        const mobileScoreBlock = scoreParts?(
          <span style={{display:"inline-flex",alignItems:"flex-start",justifyContent:"center",gap:3,minWidth:52,flexShrink:0}}>
            <span style={{display:"inline-flex",alignItems:"flex-start",gap:1}}>
              <span style={scoreNumberStyle}>{resultDisplay.homeScore}</span>
              {resultDisplay.homeShootoutScore!==null&&<span style={shootoutNumberStyle}>({resultDisplay.homeShootoutScore})</span>}
            </span>
            <span style={{...scoreNumberStyle,fontSize:13,fontWeight:600,color:"var(--text-dim2)",lineHeight:1.12,marginTop:1}}>–</span>
            <span style={{display:"inline-flex",alignItems:"flex-start",gap:1}}>
              <span style={scoreNumberStyle}>{resultDisplay.awayScore}</span>
              {resultDisplay.awayShootoutScore!==null&&<span style={shootoutNumberStyle}>({resultDisplay.awayShootoutScore})</span>}
            </span>
          </span>
        ):null;
        const mobileScoreMeta = scoreParts?(
          <>
            {resultDisplay.statusLabel&&<span style={{position:"absolute",top:19,left:"50%",transform:"translateX(-50%)",fontSize:9,color:"#22c55e",letterSpacing:1,opacity:0.65,textAlign:"center",whiteSpace:"nowrap"}}>{resultDisplay.statusLabel}</span>}
            {isLive&&<span style={{position:"absolute",top:19,left:"50%",transform:"translateX(-50%)",fontSize:9,color:"#f59e0b",letterSpacing:1,animation:"pulse 1.5s infinite",textAlign:"center",whiteSpace:"nowrap"}}>{elapsed||"LIVE"}</span>}
          </>
        ):null;
        const mobileResultStatusBlock = scoreParts?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",position:"relative",textAlign:"center",flexShrink:0,minWidth:60}}>
            {mobileScoreBlock}
            {mobileScoreMeta}
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",flexShrink:0,minWidth:60}}>
            {resultStatusBlock}
          </div>
        );
        const isMyDibsTurn = fixtureGroup.mode !== "dibs" || dibsTurnFor[f.id] === user.username;
        const waitingFor = fixtureGroup.mode === "dibs" && !locked && !isMyDibsTurn ? dibsTurnFor[f.id] : null;
        const pickBlock = picksLocked && !hardLocked ? (
          <span style={{display:"flex",alignItems:"center",gap:6}}>
            <span title="picks locked" style={{display:"flex",alignItems:"center",color:"var(--text-dim3)",cursor:"default"}}><Lock size={16}/></span>
            {myPreds[f.id]
              ? <span style={{color:"#8888cc",fontSize:12}}>{myPreds[f.id]}</span>
              : <span style={{color:"var(--text-dim)",fontSize:12}}>–</span>}
          </span>
        ) : locked?(
          <span style={{display:"flex",alignItems:"center",gap:6}}>
            {lockReason&&<span title={lockReason} style={{display:"flex",alignItems:"center",color:"var(--text-dim3)",cursor:"default"}}><Lock size={16}/></span>}
            {myPreds[f.id]
              ? <span style={{color:"#8888cc",fontSize:12}}>{myPreds[f.id]}</span>
              : (effResult||effectiveStatus==="IN_PLAY"||effectiveStatus==="PAUSED")
                ? <span style={{color:"#ef4444",fontWeight:700,fontSize:18}}>×</span>
                : <span style={{color:"var(--text-dim)",fontSize:12}}>–</span>}
          </span>
        ) : waitingFor ? (
          <span style={{color:"var(--text-dim2)",fontSize:11,fontStyle:"italic"}}>
            waiting for {names[waitingFor]||waitingFor}
          </span>
        ) : (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={draftHome||""}
              placeholder="1"
              ref={el => {
                if (el) pickInputRefs.current[`${f.id}:home`] = el;
                else delete pickInputRefs.current[`${f.id}:home`];
              }}
              onChange={e=>{
                const val = e.target.value.replace(/\D/g, "").slice(0,1);
                setPredDraft(d=>({...d,[f.id]:`${val}-${draftAway||""}`}));
                if (val) {
                  setTimeout(()=>pickInputRefs.current[`${f.id}:away`]?.focus(),0);
                }
              }}
              onBlur={()=>{
                const combined = `${draftHome||""}-${draftAway||""}`;
                if (/^\d+-\d+$/.test(combined)) savePred(f.id, combined);
              }}
              onKeyDown={e=>{
                if (e.key === "Enter") {
                  e.preventDefault();
                  pickInputRefs.current[`${f.id}:away`]?.focus();
                }
              }}
              style={{width:mob?30:26,background:"var(--input-bg)",borderRadius:6,textAlign:"center",border:`1px solid ${(draftHome||myPreds[f.id])?"#5b5bd655":"var(--border2)"}`,color:(draftHome||myPreds[f.id])?"#2f2f8f":"#8888cc",padding:"5px 0",fontFamily:"inherit",fontSize:mob?16:12,outline:"none"}}
            />
            <span style={{color:"var(--text-dim)",fontSize:12}}>–</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={draftAway||""}
              placeholder="1"
              ref={el => {
                if (el) pickInputRefs.current[`${f.id}:away`] = el;
                else delete pickInputRefs.current[`${f.id}:away`];
              }}
              onChange={e=>{
                const val = e.target.value.replace(/\D/g, "").slice(0,1);
                setPredDraft(d=>({...d,[f.id]:`${draftHome||""}-${val}`}));
              }}
              onBlur={()=>{
                const combined = `${draftHome||""}-${draftAway||""}`;
                if (/^\d+-\d+$/.test(combined)) savePred(f.id, combined);
              }}
              onKeyDown={e=>{
                if (e.key === "Enter") {
                  e.preventDefault();
                  const combined = `${draftHome||""}-${draftAway||""}`;
                  if (/^\d+-\d+$/.test(combined)) savePred(f.id, combined);
                  e.currentTarget.blur();
                }
              }}
              style={{width:mob?30:26,background:"var(--input-bg)",borderRadius:6,textAlign:"center",border:`1px solid ${(draftAway||myPreds[f.id])?"#5b5bd655":"var(--border2)"}`,color:(draftAway||myPreds[f.id])?"#2f2f8f":"#8888cc",padding:"5px 0",fontFamily:"inherit",fontSize:mob?16:12,outline:"none"}}
            />
          </div>
        );
        if (mob) return (
          <div key={f.id} className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--card)",borderRadius:isIndex?20:10,border:"1px solid var(--border3)",padding:"12px 14px",marginBottom:6,transition:"opacity 0.2s"}}>
            {dateStr&&<div style={{fontSize:10,color:"var(--text-dim)",marginBottom:7,letterSpacing:0.3,opacity:mutedOpacity}}>{dateStr}</div>}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,opacity:homeSideOpacity}}>
                <TeamBadge team={f.home} crest={f.homeCrest} size={22} />
                <a href={searchHref} target="_blank" rel="noopener noreferrer" title={f.home} style={{fontSize:14,color:homeSideEmphasized?"var(--text-bright)":"var(--text-mid)",fontWeight:homeSideEmphasized?700:400,textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shortTeamName(f.home)}</a>
              </div>
              {mobileResultStatusBlock}
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,justifyContent:"flex-end",opacity:awaySideOpacity}}>
                <a href={searchHref} target="_blank" rel="noopener noreferrer" title={f.away} style={{fontSize:14,color:awaySideEmphasized?"var(--text-bright)":"var(--text-mid)",fontWeight:awaySideEmphasized?700:400,textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right"}}>{shortTeamName(f.away)}</a>
                <TeamBadge team={f.away} crest={f.awayCrest} size={22} />
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,opacity:mutedOpacity}}>
                <span style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1,flexShrink:0}}>PICK</span>
                <div style={{minWidth:0}}>
                  {pickBlock}
                </div>
              </div>
              <span style={{opacity:mutedOpacity}}><BadgeScore score={effectivePts} missed={pts===null&&effectivePts!==null}/></span>
            </div>
          </div>
        );
        return (
          <div key={f.id} className={`frow${isIndex?" liquid-card":""}`} style={{display:"grid",gridTemplateColumns:"72px minmax(0,1fr) 54px minmax(0,1fr) 105px 70px",gap:10,padding:"13px 14px",background:isIndex?undefined:"var(--card)",borderRadius:isIndex?20:10,border:"1px solid var(--border3)",alignItems:"center",marginBottom:6,transition:"opacity 0.2s"}}>
            <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:0.3,lineHeight:1.4,opacity:mutedOpacity}}>{dateStr||""}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:10,opacity:homeSideOpacity}}>
              <a href={searchHref} target="_blank" rel="noopener noreferrer" title={f.home} style={{fontSize:14,color:homeSideEmphasized?"var(--text-bright)":"var(--text-mid)",fontWeight:homeSideEmphasized?700:400,textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color=homeSideEmphasized?"var(--text-bright)":"var(--text-mid)"}>{f.home}</a>
              <TeamBadge team={f.home} crest={f.homeCrest} size={22} />
              <span style={{display:"flex",alignItems:"center",marginLeft:4,flexShrink:0}}>{homeScoreSlot}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}>{resultStatusBlock}</div>
            <div style={{display:"flex",alignItems:"center",gap:10,opacity:awaySideOpacity}}>
              <span style={{display:"flex",alignItems:"center",marginRight:4,flexShrink:0}}>{awayScoreSlot}</span>
              <TeamBadge team={f.away} crest={f.awayCrest} size={22} />
              <a href={searchHref} target="_blank" rel="noopener noreferrer" title={f.away} style={{fontSize:14,color:awaySideEmphasized?"var(--text-bright)":"var(--text-mid)",fontWeight:awaySideEmphasized?700:400,textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color=awaySideEmphasized?"var(--text-bright)":"var(--text-mid)"}>{f.away}</a>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4,opacity:mutedOpacity}}>{pickBlock}</div>
            <div style={{textAlign:"center",opacity:mutedOpacity}}><BadgeScore score={effectivePts} missed={pts===null&&effectivePts!==null}/></div>
          </div>
        );
      })}
      {unpickedUnlocked.length===0&&!picksLocked&&!allFixturesFinished&&(fixtureGroup.members||[]).length>1&&(
        <div style={{marginTop:16,marginBottom:8}}>
          <Btn variant="success" style={{width:"100%"}} onClick={async()=>{
            const{ok,data}=await callAPI('group-user',{groupId:group.id,payload:{type:'lock-picks',season:activeSeason,gw:currentGW}});
            if(ok&&data.group)setGroup(data.group);
            else showToast(data?.error||'Save failed - check your connection.');
          }}>
            LOCK IN PICKS
          </Btn>
          <div style={{fontSize:11,color:"var(--text-dim)",textAlign:"center",marginTop:8}}>You won't be able to change your picks after locking.</div>
        </div>
      )}
      {(fixtureGroup.mode==="dibs"
        ? (fixtureGroup.members||[]).length>1
        : (picksLocked||allFixturesFinished||allFixturesClosedForPicks)&&(fixtureGroup.members||[]).length>1&&canViewAllPicks
      )&&<AllPicksTable group={fixtureGroup} gwFixtures={gwFixtures.filter(f=>!(fixtureGroup.hiddenFixtures||[]).includes(f.id))} isAdmin={isAdmin} names={names} viewedGW={currentGW} theme={theme} dibsTurnFor={dibsTurnFor} setGroup={setGroup} liveScores={liveScores}/>}
      {gwFixtures.some(f=>f.result)&&fixtureGroup.mode!=="dibs"&&(fixtureGroup.members||[]).length>1&&!canViewAllPicks&&(
        <div style={{marginTop:40,background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"36px",textAlign:"center"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><Lock size={28} color="var(--text-dim)"/></div>
          <div style={{fontSize:13,color:"var(--text-mid)",marginBottom:6}}>Submit your picks to unlock all picks</div>
          <div style={{fontSize:11,color:"var(--text-dim)"}}>{unpickedUnlocked.length} fixture{unpickedUnlocked.length!==1?"s":""} remaining</div>
        </div>
      )}
    </div>
  );
}

function AllPicksTable({group,gwFixtures,isAdmin,names,viewedGW,theme,dibsTurnFor={},setGroup,liveScores={}}) {
  const mob = useMobile();
  const [editing,setEditing]=useState({}); // {`${username}:${fixtureId}`: draftValue}
  const [editConfirm,setEditConfirm]=useState(null); // {u,fid,val,oldVal}
  const members = group.members||[];
  const preds = group.predictions||{};
  // "scored" here means "has an effective scoreline to project against" — final result
  // OR current live score. Trends/standings keep filtering on f.result only; this
  // inclusive filter is a display-only thing and never reaches getGroupStats.
  const effResults = useMemo(()=>{const m={};gwFixtures.forEach(f=>{m[f.id]=effectiveFixtureResult(f,liveScores);});return m;},[gwFixtures,liveScores]);
  const scored = gwFixtures.filter(f=>effResults[f.id]);
  const gwObj = (group.gameweeks||[]).find(g=>g.gw===(viewedGW??group.currentGW)&&(g.fixtures||[]).some(f=>gwFixtures.some(gf=>gf.id===f.id)));
  const activeSeason = group.season||2025;
  const firstPicks = useMemo(()=>computeFirstPickGW(group),[group]);
  const preJoinMap = useMemo(()=>{const m={};members.forEach(u=>{m[u]=gwObj?isPreJoinGW(firstPicks,u,gwObj,activeSeason):false;});return m;},[members,gwObj,firstPicks,activeSeason]);
  const weeklyTotals = members.map(u=>{if(preJoinMap[u])return null;return scored.reduce((sum,f)=>{const pts=calcPts(preds[u]?.[f.id],effResults[f.id]);return sum+(pts!==null?pts:MISSED_PICK_PTS);},0);});
  const hasAnyPicks = scored.some(f=>members.some(u=>preds[u]?.[f.id]));
  const sortedUnique = [...new Set(weeklyTotals.filter(t=>t!==null))].sort((a,b)=>a-b);
  const weeklyColor = t=>{if(t===null||!hasAnyPicks)return "var(--text-dim)";const r=sortedUnique.indexOf(t);return r===0?"#fbbf24":r===1?"#9ca3af":r===2?"#cd7f32":"var(--text)";};
  const weeklyGlow = t=>{if(t===null||!hasAnyPicks)return "none";const r=sortedUnique.indexOf(t);return r===0?"0 0 10px #fbbf2499,0 0 22px #fbbf2455":r===1?"0 0 7px #9ca3af66,0 0 14px #9ca3af33":r===2?"0 0 5px #cd7f3255,0 0 10px #cd7f3222":"none";};

  const editKey = (u,fid) => `${u}:${fid}`;
  const startEdit = (u,fid) => setEditing(e=>({...e,[editKey(u,fid)]:preds[u]?.[fid]||""}));
  const savePred = async (u,fid) => {
    const val = editing[editKey(u,fid)];
    if (val && /^\d+-\d+$/.test(val)) {
      const oldVal = preds[u]?.[fid]||null;
      if (val !== oldVal) {
        setEditConfirm({u,fid,val,oldVal});
        return;
      }
    }
    setEditing(e=>{const n={...e};delete n[editKey(u,fid)];return n;});
  };
  const confirmSave = async () => {
    const {u,fid,val,oldVal} = editConfirm;
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'edit-pick',username:u,fixtureId:fid,value:val,oldValue:oldVal,gw:viewedGW??group.currentGW}});
    if(ok&&data.group)setGroup(data.group);
    setEditing(e=>{const n={...e};delete n[editKey(u,fid)];return n;});
    setEditConfirm(null);
  };
  const cancelConfirm = () => {
    const {u,fid} = editConfirm;
    setEditing(e=>{const n={...e};delete n[editKey(u,fid)];return n;});
    setEditConfirm(null);
  };

  return (
    <div style={{marginTop:40}}>
      {editConfirm&&createPortal(
        <div className="modal-overlay" onClick={cancelConfirm} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div className="modal-panel" onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:28,width:"100%",maxWidth:340}}>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>EDIT PICK</div>
            <div style={{fontSize:13,color:"var(--text-mid)",marginBottom:6}}>{names[editConfirm.u]||editConfirm.u}</div>
            <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:18}}>{gwFixtures.find(f=>f.id===editConfirm.fid)?.home} vs {gwFixtures.find(f=>f.id===editConfirm.fid)?.away}</div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,fontSize:16,fontWeight:700}}>
              <span style={{color:"var(--text-dim2)"}}>{editConfirm.oldVal||"—"}</span>
              <span style={{fontSize:11,color:"var(--text-dim3)"}}>→</span>
              <span style={{color:"var(--text-bright)"}}>{editConfirm.val}</span>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={confirmSave} style={{flex:1,padding:"10px 0",textAlign:"center",letterSpacing:2}}>SAVE</Btn>
              <Btn variant="ghost" onClick={cancelConfirm} style={{flex:1,padding:"10px 0",textAlign:"center"}}>Cancel</Btn>
            </div>
          </div>
        </div>,
        document.body
      )}
      <h2 style={{fontFamily:theme==="index"?"Inter,system-ui,sans-serif":"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:4,letterSpacing:theme==="index"?"-0.02em":-0.5,fontWeight:theme==="index"?700:undefined}}>All Picks This Week</h2>
      {isAdmin&&<div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:theme==="index"?0.2:1,marginBottom:14}}>ADMIN · click any pick to edit</div>}
      <div style={{overflowX:"auto"}} className={theme==="excel"?"excel-mode":""}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"1px solid var(--border)",background:theme==="excel"?"#1a1a1a":undefined}}>
            <th style={{padding:"8px 12px",textAlign:"left",color:theme==="excel"?"#fff":"var(--text-dim)",letterSpacing:2,fontWeight:400}}>FIXTURE</th>
            <th style={{padding:"8px 12px",textAlign:"center",color:theme==="excel"?"#fff":"var(--text-dim)",letterSpacing:2,fontWeight:400}}>RESULT</th>
            {members.map((u,ui)=>{
              const isWinner=hasAnyPicks&&scored.length>0&&weeklyTotals[ui]!==null&&weeklyTotals[ui]===sortedUnique[0];
              const excelBg=theme==="excel"?PALETTE[ui%PALETTE.length]:undefined;
              const isAwaiting = Object.values(dibsTurnFor).some(turn => turn === u);
              const headerWidth = isWinner ? 96 : 76;
              const nameLabel = names[u] || u;
              return <th key={u} colSpan={theme==="excel"?2:1} style={{padding:theme==="excel"?"8px 12px":"8px 6px",textAlign:"center",width:theme==="excel"?undefined:headerWidth,minWidth:theme==="excel"?undefined:headerWidth,maxWidth:theme==="excel"?undefined:headerWidth,background:excelBg,color:theme==="excel"?"#fff":isWinner?"#fbbf24":"var(--text-mid)",fontWeight:700,fontSize:theme==="excel"?13:undefined,textShadow:isWinner&&!excelBg?"0 0 10px #fbbf2488":"none"}}>{isAwaiting
                ? <span style={{animation:"pulse 1.2s ease-in-out infinite",display:"inline-flex",alignItems:"center",justifyContent:"center",maxWidth:"100%",minWidth:0}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{nameLabel}</span></span>
                : <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:3,maxWidth:"100%",minWidth:0,verticalAlign:"middle"}}>{isWinner&&!excelBg&&<Star size={12} color="#fbbf24" filled style={{filter:"drop-shadow(0 0 4px #fbbf24aa)",flex:"0 0 auto"}}/>}<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{nameLabel}</span></span>
              }</th>;
            })}
          </tr></thead>
          <tbody>
            {gwFixtures.map((f,fi)=>{
              const rowBg=theme==="excel"?(fi%2===0?"#ffffff":"#f5f5f5"):undefined;
              return (
              <tr key={f.id} style={{borderBottom:"1px solid var(--border3)",background:rowBg}}>
                <td style={{padding:theme==="excel"?"6px 8px":"10px 12px",color:"var(--text-mid)",fontSize:theme==="excel"?13:undefined,fontWeight:theme==="excel"?600:undefined}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"flex-start",flexWrap:"nowrap",whiteSpace:"nowrap",overflow:"hidden"}}>
                    <TeamBadge team={f.home} crest={f.homeCrest} size={22} />
                    <span title={f.home} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mob?shortTeamName(f.home):f.home}</span>
                    <span style={{color:"var(--text-dim)",fontSize:10,letterSpacing:1,flexShrink:0}}>vs</span>
                    <TeamBadge team={f.away} crest={f.awayCrest} size={22} />
                    <span title={f.away} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mob?shortTeamName(f.away):f.away}</span>
                  </div>
                </td>
                <td style={{padding:"10px 12px",textAlign:"center",fontFamily:theme==="excel"?"Arial,sans-serif":theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:theme==="excel"?12:15,color:"var(--text-bright)",letterSpacing:theme==="excel"?0.5:2,whiteSpace:"nowrap"}}>{(()=>{
                  const lm = liveScores[`${f.home}|${f.away}`];
                  const effectiveStatus = effectiveFixtureStatus(f, lm);
                  const liveStr = effectiveFixtureResult(f, liveScores);
                  const finalish = effectiveStatus==="FINISHED";
                  const liveLabel = matchClockLabel(f, lm);
                  if (f.result) return f.result;
                  if (effectiveStatus==="POSTPONED") return <span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,fontFamily:"'DM Mono',monospace"}}>PPD</span>;
                  if (liveStr) return <span style={{color:finalish?"var(--text-bright)":"#f59e0b"}}>{liveStr} <span style={{fontSize:9,letterSpacing:1,animation:finalish?undefined:"pulse 1.5s infinite",color:finalish?"#22c55e":undefined}}>{finalish?"FT":liveLabel||"LIVE"}</span></span>;
                  return null;
                })()}</td>
                {members.map(u=>{
                  const pred=preds[u]?.[f.id];
                  const effRes=effResults[f.id];
                  const pts=calcPts(pred,effRes);
                  const effectivePts=pts!==null?pts:(effRes&&!pred?(preJoinMap[u]?null:MISSED_PICK_PTS):null);
                  const key=editKey(u,f.id);
                  const isEditingCell=editing[key]!==undefined;
                  if(theme==="excel"){
                    const ptsBg=effectivePts===null?"transparent":effectivePts===0?"#d4edda":effectivePts<MISSED_PICK_PTS?"transparent":effectivePts===MISSED_PICK_PTS?"#fef3c7":"#fee2e2";
                    const ptsColor=effectivePts===null?"#999":effectivePts===0?"#16a34a":effectivePts<MISSED_PICK_PTS?"#666":effectivePts===MISSED_PICK_PTS?"#ca8a04":"#dc2626";
                    return [
                      <td key={`${u}-pick`} style={{padding:"5px 6px",textAlign:"center",borderRight:"none",background:rowBg,cursor:isAdmin?"pointer":"default",whiteSpace:"nowrap"}} onClick={()=>isAdmin&&startEdit(u,f.id)}>
                        {isAdmin&&isEditingCell?(
                          <input autoFocus value={editing[key]}
                            onChange={e=>setEditing(ev=>({...ev,[key]:e.target.value}))}
                            onBlur={()=>savePred(u,f.id)}
                            onKeyDown={e=>{if(e.key==="Enter")savePred(u,f.id);if(e.key==="Escape")setEditing(ev=>{const n={...ev};delete n[key];return n;});}}
                            style={{width:40,background:"#fff",border:"1px solid #8888cc",borderRadius:3,color:"#333",padding:"2px 4px",fontFamily:"inherit",fontSize:13,textAlign:"center",outline:"none"}}/>
                        ):(
                          pred
                            ? <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{pred}</span>
                            : (effRes||f.status==="IN_PLAY"||f.status==="PAUSED")
                              ? <span style={{fontSize:18,fontWeight:700,color:"#ef4444"}}>×</span>
                              : <span style={{fontSize:13,fontWeight:600,color:"#999"}}>–</span>
                        )}
                      </td>,
                      <td key={`${u}-pts`} style={{padding:"5px 5px",textAlign:"center",borderLeft:"none",background:`linear-gradient(to right,#e0e0e0 0px,#e0e0e0 1px,${ptsBg==="transparent"?(rowBg||"#fff"):ptsBg} 1px)`,minWidth:20}}>
                        <span style={{fontSize:13,fontWeight:600,color:ptsColor}}>{effectivePts!==null?(effectivePts%1===0?effectivePts:effectivePts.toFixed(1)):""}</span>
                      </td>
                    ];
                  }
                  const isCellAwaiting = dibsTurnFor[f.id] === u && !/^\d+-\d+$/.test(preds[u]?.[f.id] || "");
                  const pickLineStyle={height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1};
                  return (
                    <td key={u} style={{
                      padding:"10px 12px",
                      textAlign:"center",
                      outline: isCellAwaiting ? "1px solid #8888cc44" : "none",
                      background: isCellAwaiting ? "#8888cc08" : "transparent",
                      animation: isCellAwaiting ? "pulse 1.5s ease-in-out infinite" : "none",
                    }}>
                      {isAdmin&&isEditingCell?(
                        <input autoFocus value={editing[key]}
                          onChange={e=>setEditing(ev=>({...ev,[key]:e.target.value}))}
                          onBlur={()=>savePred(u,f.id)}
                          onKeyDown={e=>{if(e.key==="Enter")savePred(u,f.id);if(e.key==="Escape")setEditing(ev=>{const n={...ev};delete n[key];return n;});}}
                          style={{width:52,background:"var(--input-bg)",border:"1px solid #8888cc55",borderRadius:6,color:"#8888cc",padding:"4px 6px",fontFamily:"inherit",fontSize:12,textAlign:"center",outline:"none"}}/>
                      ):(
                        <div onClick={()=>isAdmin&&startEdit(u,f.id)}
                          style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:isAdmin?"pointer":"default",borderRadius:6,padding:"2px 4px",transition:"background 0.15s"}}
                          onMouseEnter={e=>{if(isAdmin)e.currentTarget.style.background="var(--border3)";}}
                          onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                          <span style={pickLineStyle}>
                            {pred
                              ? <span style={{color:"var(--text-dim3)",fontSize:11,lineHeight:1}}>{pred}</span>
                              : (effRes||f.status==="IN_PLAY"||f.status==="PAUSED")
                                ? <span style={{color:"#ef4444",fontWeight:700,fontSize:18,lineHeight:1}}>×</span>
                                : <span style={{color:"var(--text-dim3)",fontSize:11,lineHeight:1}}>–</span>}
                          </span>
                          <BadgeScore score={effectivePts} missed={pts===null&&effectivePts!==null}/>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
          {gwFixtures.length>0&&<tfoot><tr style={{borderTop:"2px solid var(--border)"}}>
            <td style={{padding:"10px 12px",color:"var(--text-dim)",letterSpacing:2,fontSize:10}}>TOTAL</td>
            <td/>
            {members.map((u,ui)=>{
              const total=weeklyTotals[ui];
              const totalDisp=total===null?"\u2014":total;
              if(theme==="excel") return <td key={u} colSpan={2} style={{padding:"7px 8px",textAlign:"center",fontSize:13,fontWeight:700,color:weeklyColor(total)}}>{totalDisp}</td>;
              return <td key={u} style={{padding:"10px 12px",textAlign:"center",fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:16,fontWeight:700,color:weeklyColor(total),textShadow:weeklyGlow(total)}}>{totalDisp}</td>;
            })}
          </tr></tfoot>}
        </table>
      </div>
    </div>
  );
}

/* ── TRENDS ──────────────────────────────────────── */
function TrendsTab({group,names,theme}) {
  const mob = useMobile();
  const isIndex = theme === "index";
  const stats = useMemo(()=>getGroupStats(group),[group]);
  const trendStats=group.trendStats || computeTrendStats(group);
  const MATCH_UPDATE_LABEL = "Updated after every final result";
  const GW_UPDATE_LABEL = "Updates when the gameweek is complete";
  const members = group.members||[];
  const AUTO_PALETTE = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ec4899", "#eab308", "#06b6d4", "#ef4444"];
  const memberColor = u => isIndex ? AUTO_PALETTE[members.indexOf(u)%AUTO_PALETTE.length] : PALETTE[members.indexOf(u)%PALETTE.length];
  const activeSeason = group.season || 2025;
  const scope = group.scoreScope || "all";
  const gws = useMemo(()=>(group.gameweeks||[]).filter(g => scope === "all" || (g.season||activeSeason) === activeSeason),[group.gameweeks,scope,activeSeason]);
  const hasData = stats.some(p=>p.scored>0);
  const tt={background:"var(--input-bg)",border:"1px solid var(--border2)",borderRadius:8,fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--text-bright)",boxShadow:"0 12px 32px rgba(0,0,0,.36)"};
  const chartTooltipProps={contentStyle:tt,labelStyle:{color:"var(--text-bright)",fontWeight:700},itemStyle:{color:"var(--text)"},wrapperStyle:{outline:"none"}};
  const ds = useMemo(()=>stats.map(p=>({...p,dn:names[p.username]||p.username})),[stats,names]);
  const completedGws = useMemo(()=>gws.filter(g=>(g.fixtures||[]).length>0&&(g.fixtures||[]).every(f=>f.result||f.status==="POSTPONED")),[gws]);
  const firstPicks = useMemo(()=>computeFirstPickGW(group),[group]);
  const gwLine=useMemo(()=>completedGws.map(g=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{const e=p.gwTotals.find(e=>e.gw===g.gw&&e.season===(g.season||activeSeason));if(e&&e.points!==null)r[p.dn]=e.points;});return r;}),[completedGws,ds,activeSeason]);
  const cumLine=useMemo(()=>completedGws.map((g,gi)=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{const entries=p.gwTotals.filter(e=>completedGws.slice(0,gi+1).some(cg=>cg.gw===e.gw&&(cg.season||activeSeason)===(e.season||activeSeason))&&e.points!==null);if(entries.length===0)return;r[p.dn]=entries.reduce((a,e)=>a+e.points,0)+(p.startingBonus||0);});return r;}),[completedGws,ds,activeSeason]);
  const perfectsData=useMemo(()=>ds.map(p=>({name:p.dn,perfects:p.perfects})),[ds]);
  const preds=group.predictions||{};
  const distData=useMemo(()=>[0,1,2,3,4,5].map(pts=>{const key=pts===5?"5+":String(pts);const r={pts:key};ds.forEach(p=>{r[p.dn]=trendStats?.players?.[p.username]?.pointsDistribution?.[key]||0;});return r;}),[ds,trendStats]);
  const CC=({title,sub,cadence,children})=>(<div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--surface)",border:"1px solid var(--border)",borderRadius:isIndex?22:12,padding:mob?"14px 14px 12px":"20px 20px 18px",marginBottom:mob?12:18}}><div style={{marginBottom:mob?10:16}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div style={{fontSize:11,fontWeight:700,letterSpacing:isIndex?0.2:2,color:"var(--text-dim3)",textTransform:isIndex?"none":"uppercase"}}>{title}</div>{cadence&&<span style={{fontSize:9,fontWeight:600,color:"var(--text-dim2)",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:999,padding:"3px 7px",whiteSpace:"nowrap"}}>{cadence}</span>}</div>{sub&&<div style={{fontSize:mob?10:11,color:"var(--text-dim)",marginTop:3}}>{sub}</div>}</div>{children}</div>);
  const SH=({label})=>(<div style={{display:"flex",alignItems:"center",gap:10,margin:mob?"18px 0 10px":"32px 0 18px"}}><div style={{width:2,height:14,background:isIndex?"#7c8aa0":"#6366f1",borderRadius:2,flexShrink:0}}/><span style={{fontSize:11,fontWeight:700,letterSpacing:3,color:isIndex?"#7c8aa0":"#6366f1",textTransform:"uppercase"}}>{label}</span><div style={{flex:1,height:1,background:"var(--border)"}}/></div>);
  const gwTickInterval = mob ? "preserveStartEnd" : (gws.length > 30 ? Math.ceil(gws.length / 15) - 1 : 0);
  const gwTickProps = { fill:"var(--text-dim3)", fontSize:10 };
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const gwHeatmapData = useMemo(() => {
    const result = {};
    ds.forEach(p => {
      result[p.username] = {};
      completedGws.forEach(g => {
        const gwKey = `${g.gw}-${g.season||activeSeason}`;
        if (isPreJoinGW(firstPicks, p.username, g, activeSeason)) { result[p.username][gwKey] = "prejoin"; return; }
        let gwPts = 0, hasMiss = false, allPostponed = true;
        (g.fixtures||[]).forEach(f => {
          if (f.status === "POSTPONED") return;
          allPostponed = false;
          if (!f.result) return;
          const pred = preds[p.username]?.[f.id];
          if (!pred) { hasMiss = true; gwPts += MISSED_PICK_PTS; }
          else gwPts += calcPts(pred, f.result) ?? 0;
        });
        if (allPostponed) result[p.username][gwKey] = "postponed";
        else result[p.username][gwKey] = { pts: gwPts, missed: hasMiss };
      });
    });
    return result;
  }, [ds, completedGws, preds, activeSeason, firstPicks]);
  const rankData = useMemo(() => {
    return completedGws.map((g, gi) => {
      const gwsUpTo = completedGws.slice(0, gi + 1);
      const cumulative = ds.filter(p => !isPreJoinGW(firstPicks, p.username, g, activeSeason)).map(p => {
        let pts = p.startingBonus || 0, perfs = 0;
        gwsUpTo.forEach(cg => {
          if (isPreJoinGW(firstPicks, p.username, cg, activeSeason)) return;
          (cg.fixtures||[]).forEach(f => {
            if (f.status === "POSTPONED" || !f.result) return;
            const pred = preds[p.username]?.[f.id];
            const fp = pred ? (calcPts(pred, f.result) ?? 0) : MISSED_PICK_PTS;
            pts += fp;
            if (pred && fp === 0) perfs++;
          });
        });
        return { username: p.username, dn: p.dn, pts, perfs };
      });
      const sorted = [...cumulative].sort((a, b) =>
        a.pts !== b.pts ? a.pts - b.pts :
        b.perfs !== a.perfs ? b.perfs - a.perfs :
        a.username.localeCompare(b.username)
      );
      const entry = { name: `GW${g.gw}` };
      sorted.forEach((p, i) => { entry[p.dn] = i + 1; entry[`${p.dn}_pts`] = p.pts; });
      return entry;
    });
  }, [completedGws, ds, preds, activeSeason, firstPicks]);
  const breakdownData = useMemo(() => buildPointsBreakdownRows(ds), [ds]);
  const radarData = useMemo(() => {
    const raw = ds.map(p => {
      const player = trendStats?.players?.[p.username] || {};
      const rawScored = Object.values(player.pointsDistribution || {}).reduce((sum,value)=>sum+value,0);
      const rawPicked = player.submittedPicks || 0;
      const rawAvg = rawPicked > 0 ? (player.submittedPoints || 0) / rawPicked : 0;
      const boldness = rawPicked > 0 ? (player.predictedGoals || 0) / rawPicked : 0;
      const stddev = player.completedGwStdDev || 0;
      const perfectRate = rawScored > 0 ? (player.perfects || 0) / rawScored : 0;
      const winnerRate = rawPicked > 0 ? (player.winnerCorrect || 0) / rawPicked : 0;
      return { username: p.username, dn: p.dn, rawAvg, boldness, stddev, perfectRate, winnerRate };
    });
    if (raw.length === 0) return [];
    // Mean-centred: avg = 50, most extreme player reaches 0 or 100
    // lowerIsBetter axes are inverted so "good" always means higher score
    const centreNorm = (vals, lowerIsBetter) => {
      const mean = vals.reduce((s,v)=>s+v,0) / vals.length;
      const maxDev = Math.max(...vals.map(v => Math.abs(v - mean)), 0.001);
      return vals.map(v => {
        const dev = lowerIsBetter ? mean - v : v - mean;
        return Math.round(Math.max(0, Math.min(100, 50 + (dev / maxDev) * 50)));
      });
    };
    const axes = ["Accuracy","Consistency","Perfect Rate","Boldness","Winner Rate"];
    const rawVals = {
      "Accuracy":     centreNorm(raw.map(r=>r.rawAvg),      true),
      "Consistency":  centreNorm(raw.map(r=>r.stddev),      true),
      "Perfect Rate": centreNorm(raw.map(r=>r.perfectRate), false),
      "Boldness":     centreNorm(raw.map(r=>r.boldness),    false),
      "Winner Rate":  centreNorm(raw.map(r=>r.winnerRate),  false),
    };
    const rawMap = {};
    raw.forEach(r => {
      rawMap[r.dn] = {
        "Accuracy":     `${r.rawAvg.toFixed(2)} pts avg`,
        "Consistency":  `\u00b1${r.stddev.toFixed(2)} pts/GW`,
        "Perfect Rate": `${(r.perfectRate*100).toFixed(1)}%`,
        "Boldness":     `${r.boldness.toFixed(1)} goals/pick`,
        "Winner Rate":  `${(r.winnerRate*100).toFixed(0)}%`,
      };
    });
    const data = axes.map(axis => {
      const scores = rawVals[axis];
      const entry = { subject: axis, Avg: 50 };
      raw.forEach((r, i) => { entry[r.dn] = scores[i]; });
      return entry;
    });
    return { data, rawMap };
  }, [ds, trendStats]);
  const swingData = useMemo(() => {
    return completedGws.map(g => {
      const scores = ds.filter(p => !isPreJoinGW(firstPicks, p.username, g, activeSeason)).map(p => {
        let total = 0;
        (g.fixtures||[]).forEach(f => {
          if (!f.result || f.status === "POSTPONED") return;
          const pred = preds[p.username]?.[f.id];
          total += pred ? (calcPts(pred, f.result) ?? 0) : MISSED_PICK_PTS;
        });
        return { dn: p.dn, username: p.username, total };
      });
      const vals = scores.map(s => s.total);
      const entry = { name: `GW${g.gw}`, min: vals.length?Math.min(...vals):0, max: vals.length?Math.max(...vals):0, avg: vals.length?+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1):0 };
      scores.forEach(s => { entry[s.dn] = s.total; });
      return entry;
    });
  }, [completedGws, ds, preds, activeSeason, firstPicks]);
  const scoreGridData = useMemo(() => {
    const grid = {};
    for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) grid[`${h}-${a}`] = 0;
    const targets = selectedPlayer ? [selectedPlayer] : members;
    targets.forEach(username => {
      Object.entries(trendStats?.players?.[username]?.scoreHeatmap || {}).forEach(([score,count]) => {
        if (Object.hasOwn(grid, score)) grid[score] += count;
      });
    });
    return grid;
  }, [selectedPlayer, members, trendStats]);

  const resultGridData = useMemo(() => {
    const grid = {};
    for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) grid[`${h}-${a}`] = 0;
    Object.entries(trendStats?.actualResultsHeatmap || {}).forEach(([score,count]) => {
      if (Object.hasOwn(grid, score)) grid[score] += count;
    });
    return grid;
  }, [trendStats]);

  const predStyleData = useMemo(() => {
    return ds.map(p => {
      const {home=0,draw=0,away=0}=trendStats?.players?.[p.username]?.predictionStyle || {};
      const total = home + draw + away;
      const homePct = total ? +((home/total)*100).toFixed(1) : 0;
      const drawPct = total ? +((draw/total)*100).toFixed(1) : 0;
      const awayPct = total ? +Math.max(0, 100 - homePct - drawPct).toFixed(1) : 0;
      return {
        name: p.dn,
        Home: homePct,
        Draw: drawPct,
        Away: awayPct,
      };
    });
  }, [ds, trendStats]);

  const goalInflationData = useMemo(() => {
    return ds.map(p => {
      const player=trendStats?.players?.[p.username] || {};
      const count=player.submittedPicks || 0;
      return { name: p.dn, value: count > 0 ? +(((player.predictedGoals||0) - (player.actualGoals||0)) / count).toFixed(2) : 0, color: memberColor(p.username) };
    }).sort((a, b) => a.value - b.value);
  }, [ds, trendStats]);

  const boldnessAccuracyData = useMemo(() => {
    return ds.map(p => {
      const player=trendStats?.players?.[p.username] || {};
      const count=player.submittedPicks || 0;
      return { name: p.dn, boldness: count > 0 ? +((player.predictedGoals||0)/count).toFixed(2) : 0, accuracy: count > 0 ? +((player.submittedPoints||0)/count).toFixed(2) : 0, color: memberColor(p.username) };
    });
  }, [ds, trendStats]);

  if (!hasData) return <div style={{textAlign:"center",padding:"80px 0",color:"var(--text-dim)"}}><div style={{fontSize:40,marginBottom:14}}>📊</div><div style={{fontSize:11,letterSpacing:2}}>SYNC RESULTS TO SEE TRENDS</div></div>;
  return (
    <div>
      <div className={isIndex?"liquid-card":undefined} style={{marginBottom:mob?16:28,padding:isIndex?"24px 28px":"0",borderRadius:isIndex?28:0}}>
        <h1 style={{fontFamily:isIndex?"Inter,system-ui,sans-serif":"'Playfair Display',serif",fontSize:mob?(isIndex?24:24):(isIndex?34:36),fontWeight:isIndex?700:900,color:"var(--text-bright)",letterSpacing:isIndex?"-0.03em":-1,marginBottom:8}}>Trends</h1>
        {isIndex&&<p style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.6}}>Performance swings, cumulative damage, and who keeps getting away with it.</p>}
      </div>
      <div style={{fontSize:10,fontWeight:600,color:"var(--text-dim2)",margin:"0 0 8px 2px"}}>{MATCH_UPDATE_LABEL}</div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${mob?140:155}px,1fr))`,gap:mob?8:10,marginBottom:mob?20:30}}>
        {ds.map((p,ri)=>{
          const rank=ri+1;
          const medal=rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":null;
          const color=memberColor(p.username);
          const isSelected=selectedPlayer===p.username;
          return (
            <div key={p.username} onClick={()=>setSelectedPlayer(prev=>prev===p.username?null:p.username)}
              style={{background:"var(--surface)",border:`1px solid ${isSelected?color:"var(--border)"}`,borderRadius:12,padding:"12px 14px",cursor:"pointer",opacity:selectedPlayer&&!isSelected?0.35:1,transition:"opacity 0.15s,border-color 0.15s",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:color,borderRadius:"12px 12px 0 0"}}/>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,marginTop:4}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--text-dim3)",minWidth:20}}>{medal||`#${rank}`}</span>
                <Avatar name={p.dn} size={21} color={color}/>
                <span style={{fontSize:11,fontWeight:600,color:"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.dn}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:2}}>
                {[["PTS",p.total,color,theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",17],["AVG",p.avg,"var(--text-mid)","inherit",13],["PERF",p.perfects,"#22c55e","inherit",13]].map(([l,v,c,ff,fs])=>(
                  <div key={l} style={{textAlign:"center",flex:1}}>
                    <div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1.5,marginBottom:2}}>{l}</div>
                    <div style={{fontSize:fs,fontWeight:800,color:c,fontFamily:ff,lineHeight:1}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <SH label="Season Story"/>
      <CC title="Rankings Over Time" sub="Leaderboard position after each gameweek" cadence={GW_UPDATE_LABEL}>
        <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:40),mob?160:200)}>
          <LineChart data={rankData} margin={{top:20,right:20,left:-10,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis reversed domain={[1,ds.length]} allowDecimals={false} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false} ticks={ds.map((_,i)=>i+1)}/>
            <Tooltip {...chartTooltipProps} formatter={(val,name,props)=>{const pts=props.payload[`${name}_pts`];return [`#${val} (${pts}pts)`,name];}}/>
            {ds.map(p=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={selectedPlayer===p.username?3:2} strokeOpacity={selectedPlayer&&selectedPlayer!==p.username?0.15:1} dot={{r:mob?3:4,fill:memberColor(p.username)}} activeDot={{r:6}}/>)}
          </LineChart>
        </ResponsiveContainer>
      </CC>
      <CC title="Cumulative Points Race" sub="Running total. Lower is winning." cadence={GW_UPDATE_LABEL}>
        <ResponsiveContainer width="100%" height={mob?160:200}>
          <LineChart data={cumLine} margin={{top:4,right:20,left:-22,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip {...chartTooltipProps}/><Legend wrapperStyle={{fontSize:10}}/>
            {ds.filter(p=>!selectedPlayer||selectedPlayer===p.username).map(p=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2.5} dot={false}/>)}
          </LineChart>
        </ResponsiveContainer>
      </CC>

      <SH label="Gameweek Performance"/>
      <CC title="Points Per Gameweek" cadence={GW_UPDATE_LABEL}>
        <ResponsiveContainer width="100%" height={mob?200:260}>
          <LineChart data={gwLine} margin={{top:4,right:20,left:-22,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip {...chartTooltipProps}/><Legend wrapperStyle={{fontSize:10,color:"var(--text-mid)"}}/>
            {ds.filter(p=>!selectedPlayer||selectedPlayer===p.username).map(p=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2} dot={{r:mob?2:3}} activeDot={{r:5}}/>)}
          </LineChart>
        </ResponsiveContainer>
      </CC>
      <CC title="GW Spread" sub="Shaded area = full range, dashed = avg" cadence={GW_UPDATE_LABEL}>
        <ResponsiveContainer width="100%" height={mob?170:220}>
          <ComposedChart data={swingData} margin={{top:4,right:20,left:-22,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip {...chartTooltipProps}/>
            <Area type="monotone" dataKey="max" stroke="none" fill="var(--border)" fillOpacity={1} legendType="none"/>
            <Area type="monotone" dataKey="min" stroke="none" fill="var(--surface)" fillOpacity={1} legendType="none"/>
            <Line type="monotone" dataKey="avg" stroke="var(--text-mid)" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
            {selectedPlayer&&(()=>{const p=ds.find(x=>x.username===selectedPlayer);return p?<Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2} dot={{r:4,fill:memberColor(p.username)}}/>:null;})()}
          </ComposedChart>
        </ResponsiveContainer>
      </CC>

      {/* ── GW HEATMAP ──────────────────────────────── */}
      <CC title="GW Heatmap" sub="Points per gameweek. Low is good, high is bad." cadence={GW_UPDATE_LABEL}>
        {(()=>{
          // build relative color scale from actual data
          const allPts = ds.flatMap(p => completedGws.map(g => {
            const cell = (gwHeatmapData[p.username]||{})[`${g.gw}-${g.season||activeSeason}`];
            if (!cell || cell === "postponed" || cell === "prejoin") return null;
            return cell.pts;
          }).filter(v=>v!==null));
          const heatMin = allPts.length ? Math.min(...allPts) : 0;
          const heatMax = allPts.length ? Math.max(...allPts) : 1;
          const heatColor = pts => {
            const t = heatMax === heatMin ? 0.5 : Math.max(0, Math.min(1, (pts - heatMin) / (heatMax - heatMin)));
            if (isIndex) {
              if (t < 0.5) {
                const tt = t * 2;
                return `hsl(${105 - tt*55}, ${52 + tt*28}%, ${53 + tt*6}%)`;
              }
              const tt = (t - 0.5) * 2;
              return `hsl(${50 - tt*40}, ${85 + tt*7}%, ${59 - tt*4}%)`;
            }
            // green → amber → red
            if (t < 0.5) { const h = 142 - t*2*87; return `hsl(${h},72%,${42-t*2*4}%)`; }
            const tt = (t-0.5)*2;
            return `hsl(${55-tt*55},${80+tt*5}%,${38+tt*5}%)`;
          };
          const cellW = mob?22:30, rowH = mob?22:30, labelW = mob?72:100;
          return (
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              <svg width={Math.max(completedGws.length*cellW+labelW,200)} height={ds.length*rowH+32} style={{display:"block"}}>
                {completedGws.map((g,ci)=>(
                  <text key={`ch-${ci}`} x={labelW+ci*cellW+cellW/2} y={14} textAnchor="middle" fill="var(--text-dim3)" fontSize={mob?7:8} fontFamily="'DM Mono',monospace">{mob?String(g.gw):`GW${g.gw}`}</text>
                ))}
                {ds.map((p,ri)=>{
                  const row = gwHeatmapData[p.username]||{};
                  return (
                    <g key={p.username}>
                      <text x={labelW-4} y={32+ri*rowH+rowH/2} textAnchor="end" fill="var(--text-mid)" fontSize={mob?9:10} fontFamily="'DM Mono',monospace" dominantBaseline="middle">{p.dn}</text>
                      {completedGws.map((g,ci)=>{
                        const gwKey = `${g.gw}-${g.season||activeSeason}`;
                        const cell = row[gwKey];
                        if (!cell || cell === "postponed" || cell === "prejoin") return <rect key={`${ri}-${ci}`} x={labelW+ci*cellW+1} y={32+ri*rowH+1} width={cellW-2} height={rowH-2} rx={3} fill={cell==="prejoin"?(isIndex?"#e5e7eb":"#1e1e30"):"var(--border)"}/>;
                        const fill = heatColor(cell.pts);
                        const textFill = isIndex ? "#ffffff" : (cell.pts/(heatMax||1) < 0.45 ? "#fff" : "#111");
                        return (
                          <g key={`${ri}-${ci}`}>
                            <rect x={labelW+ci*cellW+1} y={32+ri*rowH+1} width={cellW-2} height={rowH-2} rx={3} fill={fill}>
                              <title>{String(cell.pts)}</title>
                            </rect>
                            {!mob && <text x={labelW+ci*cellW+cellW/2} y={32+ri*rowH+rowH/2} textAnchor="middle" dominantBaseline="middle" fill={textFill} fontSize={10} fontFamily="'DM Mono',monospace" fontWeight={700}>{cell.pts}</text>}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })()}
      </CC>

      <SH label="Pick Quality"/>
      <CC title="Points Breakdown" sub="How each player's picks land across outcome types" cadence={MATCH_UPDATE_LABEL}>
        <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:40),mob?150:180)}>
          <BarChart data={breakdownData} layout="vertical" margin={{top:0,right:mob?8:18,left:mob?50:60,bottom:0}}>
            <XAxis type="number" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" width={mob?48:58} tick={{fill:"var(--text-mid)",fontSize:mob?9:10}} axisLine={false} tickLine={false}/>
            <Tooltip {...chartTooltipProps}/>
            <Legend content={<BreakdownLegend/>}/>
            <Bar dataKey="Perfect" stackId="a" fill={isIndex?"#22c55e":"#22c55e"}/>

            <Bar dataKey="Close" stackId="a" fill={isIndex?"#f59e0b":"#f59e0b"}/>

            <Bar dataKey="Bad" stackId="a" fill={isIndex?"#ef4444":"#ef4444"}/>

            <Bar dataKey="Missed" stackId="a" fill={isIndex?"#94a3b8":"#555566"} radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </CC>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
        <CC title="Perfect Predictions" cadence={MATCH_UPDATE_LABEL}><ResponsiveContainer width="100%" height={180}><BarChart data={perfectsData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip {...chartTooltipProps}/><Bar dataKey="perfects" fill={isIndex?"#22c55e":"#22c55e"} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></CC>
        <CC title="Points Distribution" sub="How often each score outcome occurs per player" cadence={MATCH_UPDATE_LABEL}><ResponsiveContainer width="100%" height={180}><BarChart data={distData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="pts" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip {...chartTooltipProps}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map(p=><Bar key={p.username} dataKey={p.dn} fill={memberColor(p.username)} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer></CC>
      </div>

      <SH label="Playing Style"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:18}}>
        <CC title="Prediction Style" sub="How often each player backs home win / draw / away win" cadence={MATCH_UPDATE_LABEL}>
          <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:44),mob?160:200)}>
            <BarChart data={predStyleData} layout="vertical" margin={{top:0,right:mob?8:40,left:mob?50:60,bottom:0}}>
              <XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" width={mob?48:58} tick={{fill:"var(--text-mid)",fontSize:mob?9:10}} axisLine={false} tickLine={false}/>
              <Tooltip {...chartTooltipProps} formatter={(v,n)=>[`${+Number(v).toFixed(1)}%`,n]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="Home" stackId="a" fill={isIndex?"#3b82f6":"#6366f1"}/>

              <Bar dataKey="Draw" stackId="a" fill={isIndex?"#f59e0b":"#f59e0b"}/>

              <Bar dataKey="Away" stackId="a" fill="#22c55e" radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </CC>
        <CC title="Player Radar" sub="Normalized vs group average. Consistency uses completed gameweeks." cadence={MATCH_UPDATE_LABEL}>
          <ResponsiveContainer width="100%" height={mob?220:260}>
            <RadarChart data={radarData.data} margin={{top:10,right:mob?20:30,bottom:10,left:mob?20:30}}>
              <PolarGrid stroke="var(--border)"/>
              <PolarAngleAxis dataKey="subject" tick={<RadarTick/>}/>
              <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/>
              <Tooltip content={<RadarTooltip rawMap={radarData.rawMap} tt={tt}/>}/>
              <Radar name="Group Avg" dataKey="Avg" stroke={isIndex?"#94a3b8":"#555577"} fill={isIndex?"#cbd5e1":"#555577"} fillOpacity={0.2} strokeWidth={1.5} strokeDasharray="5 3"/>
              {ds.filter(p=>!selectedPlayer||selectedPlayer===p.username).map(p=>(
                <Radar key={p.username} name={p.dn} dataKey={p.dn} stroke={memberColor(p.username)} fill={memberColor(p.username)} fillOpacity={selectedPlayer?0.4:0.15} strokeWidth={selectedPlayer?2.5:1.5}/>
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </CC>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:18}}>
        <CC title="Goal Inflation" sub="Avg predicted total goals minus actual goals per pick" cadence={MATCH_UPDATE_LABEL}>
          <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:44),mob?160:200)}>
            <BarChart data={goalInflationData} layout="vertical" margin={{top:0,right:mob?24:50,left:mob?50:60,bottom:0}}>
              <XAxis type="number" tickFormatter={v=>v>0?`+${v}`:String(v)} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" width={mob?48:58} tick={{fill:"var(--text-mid)",fontSize:mob?9:10}} axisLine={false} tickLine={false}/>
              <Tooltip {...chartTooltipProps} formatter={v=>[v>0?`+${v} goals/pick`:v===0?"on the dot":`${v} goals/pick`,"Goal diff"]}/>
              <ReferenceLine x={0} stroke="var(--text-dim3)" strokeDasharray="3 3"/>
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {goalInflationData.map((e,i)=><Cell key={i} fill={e.value>=0?(isIndex?"#f59e0b":"#f59e0b"):(isIndex?"#3b82f6":"#6366f1")}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:10,fontSize:10,color:"var(--text-dim3)"}}>
            <span><span style={{color:isIndex?"#f59e0b":"#f59e0b"}}>■</span> Over-predicts</span>
            <span><span style={{color:isIndex?"#3b82f6":"#6366f1"}}>■</span> Under-predicts</span>
          </div>
        </CC>
        <CC title="Boldness vs Accuracy" sub="Avg points per submitted pick; misses excluded." cadence={MATCH_UPDATE_LABEL}>
          {(()=>{
            const data=boldnessAccuracyData;
            if(!data.length) return null;
            const xs=data.map(d=>d.boldness),ys=data.map(d=>d.accuracy);
            const xMin=Math.min(...xs)-0.15,xMax=Math.max(...xs)+0.15;
            const yMin=Math.min(...ys)-0.08,yMax=Math.max(...ys)+0.08;
            const W=320,H=220,PL=44,PR=16,PT=12,PB=36;
            const tx=v=>PL+(v-xMin)/(xMax-xMin)*(W-PL-PR);
            const ty=v=>PT+(1-(v-yMin)/(yMax-yMin))*(H-PT-PB);
            return (
              <div style={{overflowX:"auto"}}>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",maxWidth:480,margin:"0 auto"}}>
                  <line x1={PL} y1={H-PB} x2={W-PR} y2={H-PB} stroke="var(--border)"/>
                  <line x1={PL} y1={PT} x2={PL} y2={H-PB} stroke="var(--border)"/>
                  <text x={W/2} y={H-4} textAnchor="middle" fill="var(--text-dim3)" fontSize={8} fontFamily="'DM Mono',monospace">avg goals predicted / pick</text>
                  <text x={10} y={H/2} textAnchor="middle" fill="var(--text-dim3)" fontSize={8} fontFamily="'DM Mono',monospace" transform={`rotate(-90,10,${H/2})`}>avg pts / pick</text>
                  {data.map((d,i)=>{
                    const x=tx(d.boldness),y=ty(d.accuracy),goRight=x<W-80;
                    return (<g key={i}><circle cx={x} cy={y} r={4} fill={d.color} opacity={0.9}/><text x={goRight?x+8:x-8} y={y+4} textAnchor={goRight?"start":"end"} fill="var(--text-mid)" fontSize={9} fontFamily="'DM Mono',monospace">{d.name}</text></g>);
                  })}
                </svg>
              </div>
            );
          })()}
        </CC>
      </div>

      <SH label="Scorelines"/>
      {/* ── SCORE HEATMAPS ──────────────────────────── */}
      {(()=>{
        const renderHeatmap = (grid, color, label) => {
          const maxCount = Math.max(...Object.values(grid), 1);
          const cellSize = mob?36:44, pad = mob?22:28;
          const svgSize = 6*cellSize+pad+20;
          return (
            <div style={{overflowX:"auto"}}>
              <svg width={svgSize} height={svgSize} style={{display:"block",margin:"0 auto"}}>
                <text x={pad+3*cellSize} y={12} textAnchor="middle" fill="var(--text-dim3)" fontSize={9} fontFamily="'DM Mono',monospace">AWAY GOALS →</text>
                {[0,1,2,3,4,5].map(v=>(
                  <text key={`ax-${v}`} x={pad+v*cellSize+cellSize/2} y={24} textAnchor="middle" fill="var(--text-dim3)" fontSize={9} fontFamily="'DM Mono',monospace">{v}</text>
                ))}
                {[0,1,2,3,4,5].map(v=>(
                  <text key={`ay-${v}`} x={pad-4} y={pad+v*cellSize+cellSize/2+4} textAnchor="end" fill="var(--text-dim3)" fontSize={9} fontFamily="'DM Mono',monospace">{v}</text>
                ))}
                <text x={12} y={pad+3*cellSize} textAnchor="middle" fill="var(--text-dim3)" fontSize={9} fontFamily="'DM Mono',monospace" transform={`rotate(-90,12,${pad+3*cellSize})`}>HOME →</text>
                {[0,1,2,3,4,5].map(h=>[0,1,2,3,4,5].map(a=>{
                  const count = grid[`${h}-${a}`]||0;
                  const opacity = count===0?0:0.15+0.85*(count/maxCount);
                  return (
                    <g key={`${h}-${a}`}>
                      <rect x={pad+a*cellSize+2} y={pad+h*cellSize+2} width={cellSize-4} height={cellSize-4} rx={6} fill={color} opacity={opacity===0?0:opacity}/>
                      {count>0&&<text x={pad+a*cellSize+cellSize/2} y={pad+h*cellSize+cellSize/2+4} textAnchor="middle" fill={opacity>0.5?"#000":"var(--text-mid)"} fontSize={11} fontFamily="'DM Mono',monospace" fontWeight={600}>{count}</text>}
                    </g>
                  );
                }))}
              </svg>
              <div style={{textAlign:"center",fontSize:9,color:"var(--text-dim3)",marginTop:4,letterSpacing:1}}>{label}</div>
            </div>
          );
        };
        return (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:18}}>
            <CC title={`Score Prediction Heatmap${selectedPlayer?`: ${ds.find(p=>p.username===selectedPlayer)?.dn||selectedPlayer}`:""}`} cadence={MATCH_UPDATE_LABEL}>
              {renderHeatmap(scoreGridData,isIndex?"rgba(245,158,11,1)":"rgba(245,158,11,1)",selectedPlayer?"YOUR PICKS":"ALL PICKS")}
            </CC>
            <CC title="Actual Results Heatmap" cadence={MATCH_UPDATE_LABEL}>
              {renderHeatmap(resultGridData,isIndex?"rgba(59,130,246,1)":"rgba(99,102,241,1)","REAL RESULTS")}
            </CC>
          </div>
        );
      })()}

    </div>
  );
}

/* ── MEMBERS ─────────────────────────────────────── */
function MembersTab({group,user,isAdmin,isCreator,names,theme,setGroup,setNames}) {
  const members=group.members||[];
  const admins=group.admins||[];
  const [editingNick,setEditingNick]=useState(null);
  const [nickDraft,setNickDraft]=useState("");
  const [logCount,setLogCount]=useState(20);
  const isIndex = theme === "index";
  const saveNick=async(username)=>{
    if(nickDraft.trim()&&nickDraft.trim()!==(names[username]||username)){
      const oldName=names[username]||username;
      const newName=nickDraft.trim();
      const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'rename-member',username,oldName,newName}});
      if(ok&&data.group){
        setGroup(data.group);
        setNames(n => ({...n, [username]: newName}));
      }
    }
    setEditingNick(null);
  };
  const toggleAdmin=async(username)=>{
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'toggle-admin',username}});
    if(ok&&data.group)setGroup(data.group);
  };
  const kick=async(username)=>{
    if(username===group.creatorUsername)return;
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'kick',username}});
    if(ok&&data.group)setGroup(data.group);
  };
  return (
    <div>
      <div className={isIndex?"liquid-card":undefined} style={{marginBottom:32,padding:isIndex?"24px 28px":"0",borderRadius:isIndex?28:0}}>
        <h1 style={{fontFamily:isIndex?"Inter,system-ui,sans-serif":"'Playfair Display',serif",fontSize:isIndex?34:36,fontWeight:isIndex?700:900,color:"var(--text-bright)",letterSpacing:isIndex?"-0.03em":-1,marginBottom:8}}>Members</h1>
        <p style={{color:"var(--text-dim)",fontSize:isIndex?12:11,letterSpacing:isIndex?0.2:2}}>{members.length} PLAYER{members.length!==1?"S":""}</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {members.map(username=>{
          const mIsAdmin=admins.includes(username)||isDeveloper(username);
          const mIsCreator=username===group.creatorUsername;
          const isMe=username===user.username;
          return (
            <div key={username} className={isIndex?"liquid-card":undefined} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:isIndex?undefined:"var(--card)",border:`1px solid ${isMe?"var(--border2)":"var(--border3)"}`,borderRadius:isIndex?22:10,padding:"14px 18px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                <Avatar name={names[username]||username} color={PALETTE[members.indexOf(username)%PALETTE.length]}/>
                <div style={{flex:1,minWidth:0}}>
                  {editingNick===username ? (
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <Input value={nickDraft} onChange={setNickDraft} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveNick(username);if(e.key==="Escape")setEditingNick(null);}} style={{padding:"3px 8px",fontSize:13,height:"auto"}}/>
                      <Btn small onClick={()=>saveNick(username)}>Save</Btn>
                      <Btn small variant="ghost" onClick={()=>setEditingNick(null)}>Cancel</Btn>
                    </div>
                  ) : (
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:15,color:isMe?"#8888cc":"var(--text-mid)"}}>{names[username]||username}{isMe&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:8}}>you</span>}</span>
                      {isAdmin&&<button onClick={()=>{setEditingNick(username);setNickDraft(names[username]||username);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-dim3)",padding:"0 2px",lineHeight:1,display:"flex",alignItems:"center"}}><EditLine size={13} color="currentColor"/></button>}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    {isDeveloper(username)?(
                      <DevTag username={username}/>
                    ):mIsCreator?(
                      <span style={{fontSize:9,color:"#f59e0b",letterSpacing:2,background:"#f59e0b15",border:"1px solid #f59e0b30",borderRadius:4,padding:"1px 6px"}}>CREATOR</span>
                    ):mIsAdmin&&!mIsCreator?(
                      <span style={{fontSize:9,color:"#60a5fa",letterSpacing:2,background:"#60a5fa15",border:"1px solid #60a5fa30",borderRadius:4,padding:"1px 6px"}}>ADMIN</span>
                    ):null}
                  </div>
                </div>
              </div>
              {isCreator&&!isMe&&(
                <div style={{display:"flex",gap:6}}>
                  {!mIsCreator&&!isDeveloper(username)&&<Btn variant={mIsAdmin?"ghost":"muted"} small onClick={()=>toggleAdmin(username)}>{mIsAdmin?"Remove Admin":"Make Admin"}</Btn>}
                  {!mIsCreator&&<Btn variant="danger" small onClick={()=>kick(username)}>Kick</Btn>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isAdmin&&(()=>{
        const fullLog=[...(group.adminLog||[])].reverse().filter(e=>e.old!==e.new);
        const log=fullLog.slice(0,logCount);
        if(!log.length) return null;
        return (
          <div style={{marginTop:40}}>
            <h2 style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:16,letterSpacing:-0.5}}>Admin Log</h2>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {log.map(e=>{
                const by=<span style={{color:"var(--text-dim)"}}>by {names[e.by]||e.by}</span>;
                const who=<span style={{color:"#8888cc"}}>{names[e.for]||e.for}</span>;
                let badge,content;
                if(e.action==="kick"){
                  badge="#ef4444";
                  content=<>{who}<span style={{color:"var(--text-dim)"}}>kicked</span>{by}</>;
                } else if(e.action==="rename"){
                  badge="#a78bfa";
                  content=<>{who}<span style={{color:"var(--text-dim3)"}}>{e.old}</span><span style={{color:"var(--text-dim)"}}>→</span><span style={{color:"#4ade80"}}>{e.new}</span>{by}</>;
                } else if(e.action==="make-admin"){
                  badge="#22c55e";
                  content=<>{who}<span style={{color:"var(--text-dim)"}}>made admin</span>{by}</>;
                } else if(e.action==="remove-admin"){
                  badge="#f87171";
                  content=<>{who}<span style={{color:"var(--text-dim)"}}>admin removed</span>{by}</>;
                } else if(e.action==="api-sync"){
                  badge="#22c55e";
                  content=<><span style={{color:"#f59e0b"}}>GW{e.gw}</span><span style={{color:"var(--text-dim)"}}>synced {e.fixtures} fixtures{e.results>0?`, ${e.results} results`:""}</span>{by}</>;
                } else if(e.action==="result"){
                  badge="#f59e0b";
                  content=<><span style={{color:"#f59e0b"}}>GW{e.gw}</span><span style={{color:"var(--text-mid)"}}>{e.fixture}</span><span style={{color:"var(--text-dim3)"}}>{e.old||"–"}</span><span style={{color:"var(--text-dim)"}}>→</span><span style={{color:"#4ade80"}}>{e.new}</span>{by}</>;
                } else if(e.action==="result-clear"){
                  badge="#ef4444";
                  content=<><span style={{color:"#f59e0b"}}>GW{e.gw}</span><span style={{color:"var(--text-mid)"}}>{e.fixture}</span><span style={{color:"var(--text-dim)"}}>result cleared</span>{by}</>;
                } else if(e.action==="dibs-skip"){
                  badge="#f59e0b";
                  content=<><span style={{color:"#f59e0b"}}>GW{e.gw}</span><span style={{color:"var(--text-mid)"}}>{e.fixture}</span>{who}<span style={{color:"var(--text-dim)"}}>skipped</span>{by}</>;
                } else {
                  badge="#8888cc";
                  content=<><span style={{color:"#f59e0b"}}>GW{e.gw}</span><span style={{color:"var(--text-mid)"}}>{e.fixture}</span>{who}<span style={{color:"var(--text-dim3)"}}>{e.old||"–"}</span><span style={{color:"var(--text-dim)"}}>→</span><span style={{color:"#4ade80"}}>{e.new}</span>{by}</>;
                }
                return(
                  <div key={e.id} style={{background:"var(--card)",border:`1px solid var(--border3)`,borderLeft:`3px solid ${badge}`,borderRadius:8,padding:"10px 16px",fontSize:11,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{content}</div>
                    <span style={{color:"var(--text-dim)",fontSize:10}}>{new Date(e.at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                );
              })}
            </div>
            {fullLog.length>logCount&&(
              <div style={{textAlign:"center",marginTop:12}}>
                <Btn variant="ghost" small onClick={()=>setLogCount(c=>c+20)}>Show more ({fullLog.length-logCount} remaining)</Btn>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ── ACCORDION ──────────────────────────────────── */
function Accordion({ sections, openId, setOpenId }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {sections.map(s => {
        if (s.hidden) return null;
        const isOpen = openId === s.id;
        return (
          <div key={s.id} style={{
            background:"var(--card)",
            border:s.danger?"1px solid #ef444430":"1px solid var(--border)",
            borderRadius:10,
            overflow:"hidden",
          }}>
            <button onClick={()=>setOpenId(isOpen?null:s.id)} style={{
              width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"14px 18px",background:"none",border:"none",cursor:"pointer",
              fontFamily:"inherit",textAlign:"left",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:12,fontWeight:600,color:"var(--text-bright)",letterSpacing:0.5}}>{s.title}</span>
                {s.admin&&<span style={{fontSize:9,letterSpacing:1.5,color:"var(--text-dim)",border:"1px solid var(--border)",borderRadius:4,padding:"1px 6px"}}>ADMIN</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {s.summary&&<span style={{fontSize:11,color:"var(--text-dim)"}}>{s.summary}</span>}
                <span style={{fontSize:11,color:"var(--text-dim2)",transition:"transform 0.2s",transform:isOpen?"rotate(180deg)":"rotate(0deg)"}}>&#9662;</span>
              </div>
            </button>
            <div style={{
              display:"grid",
              gridTemplateRows:isOpen?"1fr":"0fr",
              transition:"grid-template-rows 0.25s ease",
            }}>
              <div style={{overflow:"hidden"}}>
                <div style={{padding:"0 18px 18px"}}>{s.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── GROUP TAB ───────────────────────────────────── */
function GroupTab({group,user,isAdmin,isCreator,onLeave,onUpdateUser,theme,names={},sitePrefs=null,setSitePrefs=()=>{},onOpenWhatsNew=()=>{},setGroup}) {
  const mob = useMobile();
  const isAutoStocks = theme === "index";
  const resolvedSitePrefs = sitePrefs || { defaultTheme: "dark", landingTheme: null };
  const [latestVersion, setLatestVersion] = useState("");
  useEffect(() => {
    fetch("/api/changelog")
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(data => { setLatestVersion((data.entries || [])[0]?.version || ""); })
      .catch(() => {});
  }, []);
  const [newName,setNewName]=useState(group.name);
  const [nameSaved,setNameSaved]=useState(false);
  const [apiSaved,setApiSaved]=useState(false);
  const [season,setSeason]=useState(String(group.season||2025));
  const [copied,setCopied]=useState(false);
  const [limitSaved,setLimitSaved]=useState(false);
  const currentDraw11Limit = normalizeDraw11Limit(group.draw11Limit);
  const [custom11Limit,setCustom11Limit]=useState(DRAW_11_LIMIT_PRESETS.some(([val])=>val===currentDraw11Limit) ? "" : currentDraw11Limit);
  const [backfillMsg, setBackfillMsg] = useState("");
  const [syncDatesMsg, setSyncDatesMsg] = useState("");
  const [syncingDates, setSyncingDates] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [skipModal, setSkipModal] = useState(null); // {playerId, fixtureId, home, away}
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderMsg, setReminderMsg] = useState("");
  const [openSection, setOpenSection] = useState("info");
  useEffect(()=>{
    if (!DRAW_11_LIMIT_PRESETS.some(([val])=>val===currentDraw11Limit)) setCustom11Limit(currentDraw11Limit);
    else setCustom11Limit("");
  },[currentDraw11Limit]);

  const activeSeason=group.season||2025;
  const seasonStats = useMemo(()=>getGroupStats(group),[group]);
  const seasonWinners = seasonStats.filter(player=>player.rank===1);
  const seasonWinner = seasonWinners[0] || null;
  const seasonWinnerNames = new Intl.ListFormat("en", { style:"long", type:"conjunction" })
    .format(seasonWinners.map(player=>names[player.username]||player.username));
  const seasonComplete = useMemo(()=>{
    const scoped = (group.gameweeks||[]).filter(gw=>(gw.season||activeSeason)===activeSeason);
    return scoped.length > 0 && scoped.every(gw => (gw.fixtures||[]).every(f => f.result || f.status === "POSTPONED"));
  },[group.gameweeks,activeSeason]);
  const reminderTargetGW=useMemo(()=>{
    const seasonGWs=(group.gameweeks||[]).filter(gw=>(gw.season||activeSeason)===activeSeason).sort((a,b)=>a.gw-b.gw);
    const gw=seasonGWs.find(gw=>(gw.fixtures||[]).some(f=>!f.result&&f.status!=="FINISHED"&&f.status!=="IN_PLAY"&&f.status!=="PAUSED"&&f.status!=="POSTPONED"));
    return gw?.gw||group.currentGW;
  },[group.gameweeks,group.season,group.currentGW]);
  const sendReminders=async()=>{
    setReminderLoading(true);setReminderMsg("");
    try {
      const res=await fetch("/api/send-picks-reminder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId:group.id,gw:reminderTargetGW,season:activeSeason})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Failed");
      setReminderMsg(data.sent>0?`Sent to ${data.sent} member${data.sent!==1?"s":""}.`:data.reason||"Nobody to remind.");
    } catch(_error){setReminderMsg("Failed to send.");}
    setReminderLoading(false);
    setTimeout(()=>setReminderMsg(""),4000);
  };
  const copyCode=()=>{navigator.clipboard?.writeText(group.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const [copiedLink,setCopiedLink]=useState(false);
  const copyLink=()=>{navigator.clipboard?.writeText(`https://pab.wtf/join/${group.code}`).catch(()=>{});setCopiedLink(true);setTimeout(()=>setCopiedLink(false),2000);};
  const save11Limit=async(val)=>{const nextLimit=normalizeDraw11Limit(val);const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'save-11-limit',value:nextLimit}});if(ok&&data.group){setGroup(data.group);setLimitSaved(true);setTimeout(()=>setLimitSaved(false),2000);}};
  const custom11LimitValue=cleanDraw11LimitInput(custom11Limit);
  const saveCustom11Limit=()=>{if(!custom11LimitValue)return;save11Limit(custom11LimitValue);};
  const saveName=async()=>{if(!newName.trim())return;const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'save-name',name:newName.trim()}});if(ok&&data.group){setGroup(data.group);setNameSaved(true);setTimeout(()=>setNameSaved(false),2000);}};
  const saveApiKey=async()=>{const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'save-api-settings',apiKey:group.apiKey,season:parseInt(season)||2025}});if(ok&&data.group){setGroup(data.group);setApiSaved(true);setTimeout(()=>setApiSaved(false),2000);}};
  const saveScope=async(val)=>{const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'save-scope',value:val}});if(ok&&data.group)setGroup(data.group);};
  const backfillGWs = async () => {
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'backfill-gws'}});
    if(ok&&data.group){setGroup(data.group);setBackfillMsg(`Backfilled missing ${roundNoun.toLowerCase()}.`);}else{setBackfillMsg(data.error||"Backfill failed.");}
    setTimeout(()=>setBackfillMsg(""),3000);
  };
  const backfillAllGWs = async () => {
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'backfill-all-gws'}});
    if(ok&&data.group){setGroup(data.group);setBackfillMsg(`Rebuilt all ${roundNoun.toLowerCase()}.`);}else{setBackfillMsg(data.error||"Backfill failed.");}
    setTimeout(()=>setBackfillMsg(""),3000);
  };
  const syncAllDates = async () => {
    setSyncingDates(true);
    setSyncDatesMsg("Fetching full season fixtures...");
    try {
      const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'sync-all-dates'}});
      if(ok&&data.group){
        setGroup(data.group);
        setSyncDatesMsg(data.updated > 0 ? `✓ Filled in ${data.updated} missing date${data.updated!==1?"s":""}.` : "All dates already present.");
      } else {
        setSyncDatesMsg(data.error || "Sync failed.");
      }
    } catch(e) { setSyncDatesMsg(`Error: ${e.message}`); }
    setSyncingDates(false);
    setTimeout(()=>setSyncDatesMsg(""),5000);
  };
  const issueSkip = async (playerId, fixtureId) => {
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'dibs-skip',playerId,fixtureId}});
    if(ok&&data.group){
      setGroup(data.group);
      setSkipModal(null);
      setSkipConfirm(false);
    }
  };
  const leaveGroup=async()=>{
    if(isCreator)return;
    if(group.code===DEMO_GROUP_CODE||group.code===DEMO_WC_GROUP_CODE)return;
    const{ok,data}=await callAPI('leave-group',{groupId:group.id});
    if(ok&&data.user){
      onUpdateUser(data.user);
      onLeave();
    }
  };
  const deleteGroup = async () => {
    if (group.code === DEMO_GROUP_CODE || group.code === DEMO_WC_GROUP_CODE) { setDeleteError("The demo group cannot be deleted."); return; }
    if (!deletePw) { setDeleteError("Enter your password."); return; }
    setDeleteLoading(true); setDeleteError("");
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'delete-group',currentPassword:deletePw}});
    if(!ok){
      setDeleteError(data.error || "Failed to delete group.");
      setDeleteLoading(false);
      return;
    }
    onLeave();
  };

  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'create-backup'}});
      if(!ok||!data.group)throw new Error(data.error||'Failed to create backup');
      setGroup(data.group);
      setBackupMsg("✓ Backup created");
      setTimeout(() => setBackupMsg(""), 3000);
    } catch(e) {
      setBackupMsg("Error: " + e.message);
      setTimeout(() => setBackupMsg(""), 4000);
    }
    setBackupBusy(false);
  };

  const deleteBackup = async (id) => {
    setBackupBusy(true);
    const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'delete-backup',id}});
    if(ok&&data.group){
      setGroup(data.group);
      setRestoringId(null);
    }
    setBackupBusy(false);
  };

  const restoreBackup = async (id) => {
    setBackupBusy(true);
    try {
      const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'restore-backup',id}});
      if(!ok||!data.group){setBackupMsg(data.error||"Backup not found.");setBackupBusy(false);return;}
      setGroup(data.group);
      setRestoringId(null);
      setBackupMsg("✓ Restored");
      setTimeout(() => setBackupMsg(""), 3000);
    } catch(e) {
      setBackupMsg("Error: " + e.message);
      setTimeout(() => setBackupMsg(""), 4000);
    }
    setBackupBusy(false);
  };

  const isIndex = theme === "index";

  const drawLimitLabel = draw11LimitLabel(group);
  const drawLimitPeriod = draw11LimitPeriod(group);
  const custom11LimitActive = !DRAW_11_LIMIT_PRESETS.some(([val])=>val===currentDraw11Limit);
  const scopeLabel = (group.scoreScope||"all")==="all"?"All seasons":"Current only";
  const groupCompetition = isWorldCupGroupLike(group) ? "WC" : (group.competition || "PL");
  const roundNoun = groupCompetition === "CL" ? "Matchdays" : "Gameweeks";

  const sections = [
    {
      id:"info", title:"Group Info", summary:group.name,
      content:(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {/* Invite code */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>INVITE CODE</div>
            <div style={{display:"flex",alignItems:"center",gap:mob?12:16,flexDirection:mob?"column":"row"}}>
              <div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:isIndex?(mob?18:24):12,padding:mob?"0 16px":"0 24px",height:mob?56:80,display:"flex",alignItems:"center",justifyContent:mob?"center":undefined,fontFamily:isIndex?"Inter,system-ui,sans-serif":"'Playfair Display',serif",fontSize:mob?24:36,fontWeight:isIndex?800:900,color:"var(--text-bright)",letterSpacing:isIndex?2:(mob?6:8),lineHeight:1,width:mob?"100%":undefined}}>{group.code}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,width:mob?"100%":undefined}}>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={copyCode} variant={copied?"success":"ghost"} small>{copied?"Copied!":"Copy Code"}</Btn>
                  <Btn onClick={copyLink} variant={copiedLink?"success":"ghost"} small>{copiedLink?"Copied!":"Copy Link"}</Btn>
                </div>
                <div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:0.3}}>Share the link or code with friends to join.</div>
              </div>
            </div>
          </div>
          {/* Group name (creator only) */}
          {isCreator&&(
            <div>
              <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>GROUP NAME</div>
              <div style={{display:"flex",gap:8}}>
                <Input value={newName} onChange={setNewName} onKeyDown={e=>e.key==="Enter"&&saveName()}/>
                <Btn onClick={saveName} variant={nameSaved?"success":"default"}>{nameSaved?"Saved!":"Save"}</Btn>
              </div>
            </div>
          )}
          {/* Info card */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>INFO</div>
            <div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--card)",border:"1px solid var(--border3)",borderRadius:isIndex?24:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:2.2}}>
              {[["Members",group.members?.length],[roundNoun,(group.gameweeks||[]).filter(g=>(g.season||group.season||2025)===(group.season||2025)).length],["Fixture Data","Automatic"],["Competition",competitionLabel(group)],["Active Season",group.season||2025],["Score Scope",(group.scoreScope||"all")==="all"?"All Seasons":"Current Season"],["Your role",isCreator?"Creator":isAdmin?"Admin":"Member"]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",borderBottom:"1px solid var(--border3)",paddingBottom:4}}>
                  <span style={{color:"var(--text-dim)"}}>{l}</span>
                  <span style={{color:l==="Fixture Data"?"#22c55e":l==="Your role"?(isCreator?"#f59e0b":isAdmin?"#60a5fa":"var(--text-dim2)"):"inherit"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {/* What's New */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>WHAT'S NEW</div>
            <button onClick={onOpenWhatsNew} style={{background:"var(--card)",border:"1px solid var(--border2)",borderRadius:8,padding:"10px 14px",width:"100%",textAlign:"left",cursor:"pointer",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:"var(--text-mid)"}}>Patch notes &amp; announcements</span>
              <span style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{latestVersion ? `${latestVersion} >` : ">"}</span>
            </button>
          </div>
        </div>
      )
    },
    {
      id:"rules", title:"Rules", summary:`${drawLimitLabel} · ${scopeLabel}`,
      content:(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {/* Prediction limits */}
          {isAdmin ? (
            <div>
              <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>MAX 1-1 PREDICTIONS PER {drawLimitPeriod.toUpperCase()}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {DRAW_11_LIMIT_PRESETS.map(([val,label])=>{
                  const displayLabel = val==="unlimited" || val==="none" ? label : `${label} / ${drawLimitPeriod}`;
                  const active=currentDraw11Limit===val;
                  return <button key={val} onClick={()=>save11Limit(val)} style={{background:active?"var(--btn-bg)":"var(--card)",color:active?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{displayLabel}</button>;
                })}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,flexWrap:"wrap"}}>
                <Input value={custom11Limit} onChange={v=>setCustom11Limit(cleanDraw11LimitInput(v))} placeholder="Custom" inputMode="numeric" pattern="[0-9]*" style={{width:96,padding:"7px 10px",fontSize:11}} onKeyDown={e=>e.key==="Enter"&&saveCustom11Limit()} />
                <Btn small variant={custom11LimitActive?"default":"ghost"} disabled={!custom11LimitValue} onClick={saveCustom11Limit}>Set</Btn>
                <span style={{fontSize:11,color:custom11LimitActive?"var(--text-bright)":"var(--text-dim2)",letterSpacing:0.5}}>{custom11LimitActive?`${currentDraw11Limit} / ${drawLimitPeriod}`:`Custom / ${drawLimitPeriod}`}</span>
              </div>
              {limitSaved&&<div style={{fontSize:11,color:"#22c55e",marginTop:8}}>Saved</div>}
            </div>
          ) : (
            <div>
              <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>1-1 DRAW LIMIT</div>
              <div style={{fontSize:12,color:"var(--text-mid)"}}>{drawLimitLabel}</div>
            </div>
          )}
          {/* Score scope */}
          {isAdmin ? (
            <div>
              <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>INCLUDE IN SCORES &amp; TRENDS</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["all","All Seasons"],["current","Current Season Only"]].map(([val,label])=>{
                  const active=(group.scoreScope||"all")===val;
                  return <button key={val} onClick={()=>saveScope(val)} style={{background:active?"var(--btn-bg)":"var(--card)",color:active?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>;
                })}
              </div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>SCORE SCOPE</div>
              <div style={{fontSize:12,color:"var(--text-mid)"}}>{scopeLabel}</div>
            </div>
          )}
          {/* Scoring rules */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>SCORING</div>
            <div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--card)",border:"1px solid var(--border3)",borderRadius:isIndex?24:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:1.9}}>
              <div style={{color:"var(--text-mid)",marginBottom:8,fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:14}}>Keep your points low.</div>
              <div>Each goal your prediction is off = 1 point.</div>
              <div style={{marginTop:6}}><span style={{color:"var(--text-dim)"}}>Predict 1-1, actual 2-3 = 1+2 = </span><strong style={{color:"#ef4444"}}>3 pts</strong></div>
              <div><span style={{color:"var(--text-dim)"}}>Predict 2-1, actual 2-1 = 0+0 = </span><strong style={{color:"#22c55e"}}>0 pts</strong></div>
            </div>
          </div>
        </div>
      )
    },
    {
      id:"gameweeks", title:roundNoun, admin:true, hidden:!isAdmin,
      content:(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {/* GW visibility */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>VISIBILITY</div>
            <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:12,letterSpacing:0.3,lineHeight:1.5}}>Choose which rounds players can submit picks for.</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {(group.gameweeks||[])
                .filter(g=>(g.season||group.season||2025)===(group.season||2025))
                .sort((a,b)=>a.gw-b.gw)
                .map(g=>{
                  const hidden=(group.hiddenGWs||[]).includes(g.gw);
                  const label=gwLabel(group,g.gw);
                  const isWC=isWorldCupGroupLike(group);
                  return (
                    <button key={g.gw} onClick={async()=>{
                      const{ok,data}=await callAPI('group-admin',{groupId:group.id,payload:{type:'toggle-hidden-gw',gw:g.gw}});
                      if(ok&&data.group)setGroup(data.group);
                    }} style={{
                      background:hidden?"var(--card)":"var(--btn-bg)",
                      color:hidden?"var(--text-dim)":"var(--btn-text)",
                      border:`1px solid ${hidden?"var(--border)":"var(--btn-bg)"}`,
                      borderRadius:999,
                      padding:mob?"8px 12px":"9px 14px",
                      minHeight:mob?36:38,
                      fontSize:isWC?10:11,
                      cursor:"pointer",
                      fontFamily:"'DM Mono',monospace",
                      letterSpacing:isWC?0.6:0.9,
                      lineHeight:1.2,
                      flexShrink:0,
                      display:"inline-flex",
                      alignItems:"center",
                      justifyContent:"center",
                      textAlign:"center",
                      whiteSpace:"nowrap",
                      opacity:hidden?0.6:1,
                      transition:"all 0.15s ease",
                      boxShadow:hidden?"none":"0 0 0 1px #ffffff0a inset",
                    }} title={`${hidden?"Hidden":"Visible"}: ${label}`}>
                      {label}
                    </button>
                  );
                })}
            </div>
            <div style={{fontSize:10,color:"var(--text-dim)",marginTop:10,letterSpacing:0.4,lineHeight:1.5}}>Visible rounds are bright. Hidden rounds are dimmed.</div>
          </div>
          {/* Create GWs + fill dates */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>MANAGE</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <Btn variant="muted" small onClick={backfillGWs}>Create future {roundNoun}</Btn>
              <Btn variant="muted" small onClick={backfillAllGWs}>Create all {roundNoun}</Btn>
              {backfillMsg&&<span style={{fontSize:11,color:"#22c55e"}}>{backfillMsg}</span>}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:8}}>
              <Btn variant="amber" small onClick={syncAllDates} disabled={syncingDates}>{syncingDates?"Filling...":"Fill missing dates"}</Btn>
              {syncDatesMsg&&<span style={{fontSize:11,color:syncDatesMsg.startsWith("\u2713")?"#22c55e":"#ef4444"}}>{syncDatesMsg}</span>}
            </div>
          </div>
          {/* Fixture data */}
          <div>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:10}}>FIXTURE DATA</div>
            <div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--card)",border:"1px solid var(--border3)",borderRadius:isIndex?24:10,padding:"18px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e"}}/>
                <span style={{color:"#22c55e",fontSize:13,fontWeight:500,letterSpacing:0.5}}>Automatic Results Active</span>
              </div>
              <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.9}}>
                Premier League and World Cup refresh from the shared fixture cache. La Liga and Champions League sync through Football-Data.
              </div>
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border3)"}}>
                <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>SEASON YEAR</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <Input value={season} onChange={setSeason} placeholder="2025" style={{width:90}}/>
                  <Btn onClick={saveApiKey} variant={apiSaved?"success":"default"} small>{apiSaved?"Saved!":"Save"}</Btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id:"seasons", title:"Seasons", admin:true, hidden:!isAdmin||isWorldCupGroupLike(group)||((group.competition||"PL")!=="PL"&&(group.competition||"PL")!=="LL"&&(group.competition||"PL")!=="CL"), summary:`Season ${activeSeason}`,
      content:(()=>{
        const allSeasons=[...new Set((group.gameweeks||[]).map(g=>g.season||activeSeason))].sort((a,b)=>a-b);
        return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allSeasons.map(s=>{
                const gwCount=(group.gameweeks||[]).filter(g=>(g.season||activeSeason)===s).length;
                const isActive=s===activeSeason;
                return (
                  <div key={s} style={{background:isActive?"var(--card-hi)":"var(--card)",border:`1px solid ${isActive?"#3a3a6a":"var(--border)"}`,borderRadius:8,padding:"8px 14px",fontSize:11,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:isActive?"var(--text-bright)":"var(--text-mid)",fontWeight:isActive?700:400}}>{s}</span>
                    <span style={{color:"var(--text-dim)"}}>{gwCount} GW{gwCount!==1?"s":""}</span>
                    {isActive&&<span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,background:"#f59e0b15",border:"1px solid #f59e0b30",borderRadius:3,padding:"1px 5px"}}>ACTIVE</span>}
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{fontSize:12,color:"var(--text-mid)",lineHeight:1.7}}>For a new season, return to Your groups and create a new group. This keeps your past predictions and standings intact.</div>
            </div>
          </div>
        );
      })()
    },
    {
      id:"backups", title:"Backups", admin:true, hidden:!isAdmin,
      content:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Btn variant="amber" small onClick={createBackup} disabled={backupBusy}>{backupBusy?"Saving...":"BACKUP NOW"}</Btn>
            {backupMsg&&<span style={{fontSize:11,color:backupMsg.startsWith("\u2713")?"#22c55e":"#ef4444"}}>{backupMsg}</span>}
          </div>
          {(group.backups||[]).length===0&&(
            <div style={{fontSize:11,color:"var(--text-dim)"}}>No backups yet.</div>
          )}
          {(group.backups||[]).map(bk=>{
            const dateStr=new Date(bk.createdAt).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
            const displayName=`${bk.createdBy[0].toUpperCase()}${bk.createdBy.slice(1)}`;
            const isRestoring=restoringId===bk.id;
            return (
              <div key={bk.id} className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"var(--card)",border:"1px solid var(--border3)",borderRadius:isIndex?22:8,padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <div>
                    <span style={{fontSize:12,color:"var(--text-mid)"}}>{dateStr}</span>
                    <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:8}}>by {displayName}</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <Btn variant="ghost" small onClick={()=>deleteBackup(bk.id)} disabled={backupBusy}>Delete</Btn>
                    <Btn variant="danger" small onClick={()=>setRestoringId(isRestoring?null:bk.id)} disabled={backupBusy}>Restore</Btn>
                  </div>
                </div>
                {isRestoring&&(
                  <div style={{borderTop:"1px solid var(--border3)",paddingTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#ef4444",flex:1}}>This will overwrite all current group data.</span>
                    <Btn variant="muted" small onClick={()=>setRestoringId(null)}>Cancel</Btn>
                    <Btn variant="danger" small onClick={()=>restoreBackup(bk.id)} disabled={backupBusy}>Yes, restore</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )
    },
    {
      id:"reminders", title:"Reminders", admin:true, hidden:!isAdmin,
      content:(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Btn variant="amber" onClick={sendReminders} disabled={reminderLoading}>{reminderLoading?"Sending...":"Send pick reminders"}</Btn>
            {reminderMsg&&<span style={{fontSize:12,color:"var(--text-mid)"}}>{reminderMsg}</span>}
          </div>
          <div style={{fontSize:11,color:"var(--text-dim2)",marginTop:8}}>Emails GW{reminderTargetGW} members who haven't submitted all picks yet.</div>
        </div>
      )
    },
    {
      id:"danger", title:"Danger Zone", danger:true,
      content:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {!isCreator&&<Btn variant="danger" onClick={leaveGroup}>Leave Group</Btn>}
          {isCreator&&<Btn variant="danger" onClick={()=>{setDeleteModalOpen(true);setDeletePw("");setDeleteError("");}}>Delete Group</Btn>}
        </div>
      )
    },
  ];

  return (
    <div>
      {seasonComplete && seasonWinner && (
        <div style={{marginBottom:16}}>
          <div className={isIndex?"liquid-card":undefined} style={{background:isIndex?undefined:"linear-gradient(180deg, var(--card), var(--surface))",border:"1px solid var(--border3)",borderRadius:isIndex?24:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:1.9}}>
            <div style={{fontFamily:theme==="index"?"'Plus Jakarta Sans',sans-serif":"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:8}}>&#127942; {seasonWinnerNames}</div>
            <div style={{marginBottom:6}}>Official title: <span style={{color:"#fbbf24"}}>The Standard</span></div>
            <div style={{marginBottom:6}}>Finished on <span style={{color:"var(--text-bright)"}}>{seasonWinner.total} pts</span> with <span style={{color:"#22c55e"}}>{seasonWinner.perfects} perfect</span> pick{seasonWinner.perfects===1?"":"s"}.</div>
            <div style={{color:"var(--text-dim)"}}>A completely meaningless honour. Naturally everyone will care a lot.</div>
          </div>
        </div>
      )}

      {group.mode==="dibs"&&isAdmin&&(()=>{
        const season = group.season||2025;
        const openFixtures = (group.gameweeks||[])
          .filter(gw=>(gw.season||season)===season)
          .sort((a,b)=>a.gw-b.gw)
          .flatMap(gw=>(gw.fixtures||[])
            .filter(f=>!f.result&&f.status!=="FINISHED")
            .map(f=>({...f,gw:gw.gw}))
          );
        const memberOrder = group.memberOrder || group.members || [];
        return (
          <Section title="Dibs: Pick Order">
            <div style={{fontSize:11,color:"var(--text-dim)",marginBottom:14,letterSpacing:0}}>
              Pick rotation for this season. Order determines who has first pick each fixture.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:24}}>
              {memberOrder.map((u,i)=>(
                <div key={u} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)"}}>
                  <span style={{fontSize:10,color:"var(--text-dim3)",width:18,textAlign:"right"}}>{i+1}</span>
                  <span style={{fontSize:13,color:"var(--text)",flex:1}}>{names[u]||u}</span>
                </div>
              ))}
            </div>

            {openFixtures.length>0&&(
              <>
                <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:12}}>SKIP PLAYER FOR FIXTURE</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {openFixtures.map(f=>{
                    const turn = computeDibsTurn(group, f.id);
                    if (!turn) return null;
                    const skips = (group.dibsSkips||{})[f.id]||[];
                    const waiting = memberOrder.filter(u=>!skips.includes(u)&&!/^\d+-\d+$/.test((group.predictions||{})[u]?.[f.id]||""));
                    if (!waiting.length) return null;
                    return (
                      <div key={f.id} style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:8,padding:"10px 14px"}}>
                        <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:8}}>GW{f.gw} · {f.home} vs {f.away}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {waiting.map(u=>(
                            <Btn key={u} small variant="ghost"
                              onClick={()=>{setSkipModal({playerId:u,fixtureId:f.id,home:f.home,away:f.away});setSkipConfirm(false);}}>
                              Skip {names[u]||u}
                            </Btn>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Section>
        );
      })()}

      {(isDeveloper(user?.username) && user?.username!==DEMO_SHARED_USERNAME) && <Section title="Appearance">
        {
          <div style={{marginBottom:18,padding:"14px 16px",border:"1px solid var(--border3)",borderRadius:isAutoStocks?20:10,background:isAutoStocks?"var(--card-hi)":"var(--card)"}}>
            <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:10}}>Default theme for new users</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
              {getSecretThemeMeta(user).filter(t=>!t.secret).map(t=>{
                const active=(resolvedSitePrefs.defaultTheme||"dark")===t.key;
                return <button key={`default-${t.key}`} onClick={async()=>{
                  const next={...resolvedSitePrefs,defaultTheme:t.key,landingTheme:(resolvedSitePrefs.landingTheme===null||resolvedSitePrefs.landingTheme===undefined)?t.key:resolvedSitePrefs.landingTheme};
                  await callAPI('site-preferences',next);setSitePrefs(next);
                }} style={{background:active?"var(--btn-bg)":"var(--card)",color:active?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:999,padding:"7px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>;
              })}
            </div>
            <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:10}}>Landing page theme override</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={async()=>{const next={...resolvedSitePrefs,landingTheme:null};await callAPI('site-preferences',next);setSitePrefs(next);}} style={{background:(resolvedSitePrefs.landingTheme??null)===null?"var(--btn-bg)":"var(--card)",color:(resolvedSitePrefs.landingTheme??null)===null?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:999,padding:"7px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Use default</button>
              {getSecretThemeMeta(user).filter(t=>!t.secret).map(t=>{
                const active=resolvedSitePrefs.landingTheme===t.key;
                return <button key={`landing-${t.key}`} onClick={async()=>{const next={...resolvedSitePrefs,landingTheme:t.key,defaultTheme:resolvedSitePrefs.defaultTheme||t.key};await callAPI('site-preferences',next);setSitePrefs(next);}} style={{background:active?"var(--btn-bg)":"var(--card)",color:active?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:999,padding:"7px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>;
              })}
            </div>
          </div>
        }
      </Section>}

      <Accordion sections={sections} openId={openSection} setOpenId={setOpenSection} />

      {skipModal&&createPortal(
        <div className="modal-overlay" style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div className="modal-panel" style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:28,maxWidth:400,width:"100%"}}>
            {!skipConfirm ? (
              <>
                <div style={{fontSize:15,color:"var(--text-bright)",marginBottom:10,fontWeight:700}}>
                  Skip {names[skipModal.playerId]||skipModal.playerId} for {skipModal.home} vs {skipModal.away}?
                </div>
                <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20,lineHeight:1.6}}>
                  This will permanently remove {names[skipModal.playerId]||skipModal.playerId}'s turn for this fixture and unblock the next player. They will not be able to pick this match. This cannot be undone.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn variant="ghost" onClick={()=>{setSkipModal(null);setSkipConfirm(false);}}>Cancel</Btn>
                  <Btn variant="amber" onClick={()=>setSkipConfirm(true)}>Continue</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:15,color:"#f59e0b",marginBottom:10,fontWeight:700}}>Are you sure?</div>
                <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20,lineHeight:1.6}}>
                  Skipping {names[skipModal.playerId]||skipModal.playerId} for {skipModal.home} vs {skipModal.away} is permanent.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn variant="ghost" onClick={()=>setSkipConfirm(false)}>Back</Btn>
                  <Btn variant="danger" onClick={()=>issueSkip(skipModal.playerId,skipModal.fixtureId)}>Yes, Skip</Btn>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {deleteModalOpen&&createPortal(
        <div className="modal-overlay" onClick={()=>setDeleteModalOpen(false)} style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div className="modal-panel" onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid #ef444440",borderRadius:14,padding:32,width:"100%",maxWidth:400,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{fontSize:10,color:"#ef4444",letterSpacing:3,marginBottom:12}}>DELETE GROUP</div>
            <div style={{fontSize:13,color:"var(--text)",marginBottom:6}}>This permanently deletes <strong>{group.name}</strong> and all its data.</div>
            <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20}}>Enter your password to confirm.</div>
            <Input value={deletePw} onChange={setDeletePw} placeholder="Your password" type="password" onKeyDown={e=>e.key==="Enter"&&deleteGroup()} />
            {deleteError&&<div style={{color:"#ef4444",fontSize:12,marginTop:10}}>{deleteError}</div>}
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <Btn variant="danger" onClick={deleteGroup} disabled={deleteLoading} style={{flex:1,textAlign:"center"}}>
                {deleteLoading?<Spinner/>:"Delete permanently"}
              </Btn>
              <Btn variant="ghost" onClick={()=>setDeleteModalOpen(false)} style={{flex:1,textAlign:"center"}}>Cancel</Btn>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
