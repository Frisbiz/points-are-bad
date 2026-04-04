import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Area, Cell, ReferenceLine } from "recharts";
import { Eye, EyeOff, Flash, Star, EditLine, Lock, LogOut, User, Sync } from "griddy-icons";

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
async function sget(key, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("/api/db?key=" + encodeURIComponent(key), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data.value;
  } catch(e) { console.error("sget error", key, e); return null; }
}

async function sset(key, val) {
  try {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: val }),
    });
    if (!res.ok) { console.error("sset error", key, res.status); return false; }
    return true;
  } catch(e) { console.error("sset error", key, e); return false; }
}

async function sdel(key) {
  try {
    const res = await fetch(`/api/db?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    return res.ok;
  } catch(e) { console.error("sdel error", key, e); return false; }
}

async function spatch(key, path, value) {
  try {
    const res = await fetch("/api/db", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, path, value }),
    });
    if (!res.ok) { console.error("spatch error", key, path, res.status); return false; }
    return true;
  } catch(e) { console.error("spatch error", key, path, e); return false; }
}

function applyPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  if (parts.length === 1) return { ...obj, [parts[0]]: value };
  const nested = (obj[parts[0]] !== null && typeof obj[parts[0]] === "object") ? obj[parts[0]] : {};
  return { ...obj, [parts[0]]: applyPath(nested, parts.slice(1).join("."), value) };
}

// Session stored locally (only needed on this browser)
function lget(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lset(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function ldel(key) {
  try { localStorage.removeItem(key); } catch {}
}

const FD_BASE = "https://api.football-data.org/v4";
const PL_CODE = "PL";
// Global API key (works for all groups automatically)
const GLOBAL_API_KEY = import.meta.env.VITE_FD_API_KEY;

const TEAM_NAME_MAP = {
  "Arsenal FC": "Arsenal", "Aston Villa FC": "Aston Villa", "AFC Bournemouth": "Bournemouth",
  "Brentford FC": "Brentford", "Brighton & Hove Albion FC": "Brighton", "Burnley FC": "Burnley",
  "Chelsea FC": "Chelsea", "Crystal Palace FC": "Crystal Palace", "Everton FC": "Everton",
  "Fulham FC": "Fulham", "Ipswich Town FC": "Ipswich", "Leeds United FC": "Leeds",
  "Leicester City FC": "Leicester", "Liverpool FC": "Liverpool",
  "Manchester City FC": "Man City", "Manchester United FC": "Man Utd", "Newcastle United FC": "Newcastle",
  "Nottingham Forest FC": "Nott'm Forest", "Southampton FC": "Southampton",
  "Sunderland AFC": "Sunderland", "Tottenham Hotspur FC": "Spurs", "West Ham United FC": "West Ham",
  "Wolverhampton Wanderers FC": "Wolves",
};

function normName(n) { return TEAM_NAME_MAP[n] || n?.replace(/ FC$/, "").replace(/ AFC$/, "") || n; }

async function fetchMatchweek(apiKey, matchday, season = 2025, competition = "PL") {
  const url = matchday != null
    ? `/api/fixtures?matchday=${matchday}&season=${season}&competition=${competition}`
    : `/api/fixtures?season=${season}&competition=${competition}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 403) throw new Error("Invalid API key.");
    if (res.status === 429) throw new Error("Rate limited. Wait a minute and try again.");
    if (res.status === 404) throw new Error("Gameweek not found. Check the GW number.");
    throw new Error(`API error ${res.status}`);
  }
  const data = await res.json();
  return data.matches || [];
}

async function fetchLiveMatches() {
  const res = await fetch(`/api/fixtures?live=true`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.matches || [];
}

function parseMatchesToFixtures(matches, matchday, competition = "PL") {
  const isWC = competition === "WC";
  return matches.map((m, i) => {
    const home = normName(m.homeTeam?.name || m.homeTeam?.shortName);
    const away = normName(m.awayTeam?.name || m.awayTeam?.shortName);
    const status = m.status;
    let result = null;
    if (status === "FINISHED") {
      // For WC knockout rounds, use extraTime score if available (covers goals in ET),
      // otherwise fall back to fullTime. Group stage never has ET so fullTime is always correct.
      const isKnockout = isWC && m.stage && m.stage !== "GROUP_STAGE";
      const scoreObj = isKnockout && m.score?.extraTime?.home != null
        ? m.score.extraTime
        : m.score?.fullTime;
      if (scoreObj) {
        const { home: h, away: a } = scoreObj;
        if (h !== null && a !== null) result = `${h}-${a}`;
      }
    }
    const date = m.utcDate ? new Date(m.utcDate) : null;
    const scoreObj = m.score?.fullTime;
    const liveScore = (status==="IN_PLAY"||status==="PAUSED") && scoreObj?.home!=null && scoreObj?.away!=null ? `${scoreObj.home}-${scoreObj.away}` : null;
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

function mergeGlobalIntoGroup(globalDoc, g) {
  const seas = g.season||2025;
  const globalGWMap = {};
  (globalDoc.gameweeks||[]).filter(gwObj=>(gwObj.season||seas)===seas).forEach(gwObj=>{globalGWMap[gwObj.gw]=gwObj.fixtures;});
  const preds = g.predictions||{};
  const hasPick = id=>Object.values(preds).some(up=>up[id]!==undefined);
  const updatedGameweeks = (g.gameweeks||[]).map(gwObj=>{
    if ((gwObj.season||seas)!==seas) return gwObj;
    const globalFixtures = globalGWMap[gwObj.gw];
    if (!globalFixtures||!globalFixtures.length) return gwObj;
    const oldFixtures = gwObj.fixtures||[];
    const gwHasPicks=oldFixtures.some(f=>hasPick(f.id));
    if (!gwHasPicks) return {...gwObj,fixtures:globalFixtures};
    const oldByApiId={};
    const oldByTeams={};
    oldFixtures.forEach(f=>{
      if(f.apiId) oldByApiId[String(f.apiId)]=f;
      oldByTeams[`${f.home}|${f.away}`]=f;
    });
    const working=[...oldFixtures];
    const toAdd=[];
    globalFixtures.forEach(gf=>{
      const existing=(gf.apiId&&oldByApiId[String(gf.apiId)])||oldByTeams[`${gf.home}|${gf.away}`];
      if(existing){
        const idx=working.findIndex(f=>f.id===existing.id);
        if(idx>=0) working[idx]={...existing,result:gf.result,status:gf.status,date:gf.date,apiId:gf.apiId,home:gf.home,away:gf.away};
      } else {
        toAdd.push(gf);
      }
    });
    return {...gwObj,fixtures:[...working,...toAdd]};
  });
  // WC groups skip cross-GW dedup: team names change from TBD to real names after pairings,
  // which would break the home|away key lookup. Global doc is authoritative per matchday for WC.
  if ((g.competition || "PL") === "WC") {
    return {...g, gameweeks:updatedGameweeks, lastAutoSync:Date.now()};
  }

  // Build index: "home|away" -> GW number from global doc
  const globalPairToGW = {};
  (globalDoc.gameweeks||[]).forEach(gwObj=>{
    (gwObj.fixtures||[]).forEach(f=>{globalPairToGW[`${f.home}|${f.away}`]=gwObj.gw;});
  });

  // Remove fixtures that have been re-assigned to a different GW in the global doc
  const deduped = updatedGameweeks.map(gwObj=>{
    if((gwObj.season||seas)!==seas) return gwObj;
    const filtered=(gwObj.fixtures||[]).filter(f=>{
      const globalGW=globalPairToGW[`${f.home}|${f.away}`];
      if(globalGW===undefined||globalGW===gwObj.gw) return true;
      return hasPick(f.id);
    });
    return {...gwObj,fixtures:filtered};
  });

  return {...g,gameweeks:deduped,lastAutoSync:Date.now()};
}

function regroupGlobalDoc(globalDoc, gwNum, newFixtures) {
  const otherGWs = (globalDoc.gameweeks||[]).filter(g=>g.gw!==gwNum);

  // Compute median date of incoming fixtures
  const dates = newFixtures
    .filter(f=>f.date)
    .map(f=>new Date(f.date).getTime())
    .sort((a,b)=>a-b);

  // Not enough dated fixtures to determine median - skip re-grouping
  if (dates.length < 3) {
    return {...globalDoc, updatedAt:Date.now(), gameweeks:[...otherGWs,{gw:gwNum,fixtures:newFixtures}]};
  }

  const median = dates[Math.floor(dates.length/2)];
  const THRESHOLD = 14*24*60*60*1000;

  // Compute median date for each other GW already in the global doc
  const otherMedians = {};
  otherGWs.forEach(gwObj=>{
    const d=(gwObj.fixtures||[]).filter(f=>f.date).map(f=>new Date(f.date).getTime()).sort((a,b)=>a-b);
    if(d.length>=3) otherMedians[gwObj.gw]=d[Math.floor(d.length/2)];
  });

  // Split fixtures into normal and orphaned
  const normal=[], orphaned=[];
  newFixtures.forEach(f=>{
    if(!f.date){normal.push(f);return;}
    const fDate=new Date(f.date).getTime();
    if(median-fDate>THRESHOLD){
      let bestGW=null, bestDiff=Infinity;
      Object.entries(otherMedians).forEach(([gw,m])=>{
        const diff=Math.abs(m-fDate);
        if(diff<bestDiff){bestDiff=diff;bestGW=Number(gw);}
      });
      bestGW!==null ? orphaned.push({fixture:f,targetGW:bestGW}) : normal.push(f);
    } else {
      normal.push(f);
    }
  });

  // Abort if too few normal fixtures remain
  if(normal.length<3&&orphaned.length>0){
    return {...globalDoc, updatedAt:Date.now(), gameweeks:[...otherGWs,{gw:gwNum,fixtures:newFixtures}]};
  }

  // Add orphaned fixtures to their target GWs, avoiding duplicates by home|away pair
  const updatedOthers = otherGWs.map(gwObj=>{
    const additions=orphaned.filter(o=>o.targetGW===gwObj.gw).map(o=>o.fixture);
    if(!additions.length) return gwObj;
    const addPairs=new Set(additions.map(f=>`${f.home}|${f.away}`));
    const kept=(gwObj.fixtures||[]).filter(f=>!addPairs.has(`${f.home}|${f.away}`));
    return {...gwObj,fixtures:[...kept,...additions]};
  });

  return {...globalDoc, updatedAt:Date.now(), gameweeks:[...updatedOthers,{gw:gwNum,fixtures:normal}]};
}

const MISSED_PICK_PTS = 4;
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

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seedStr) {
  let state = hashSeed(seedStr) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeDemoPick(username, fixture, gw, season) {
  const rng = seededRng(`${username}|${fixture.id}|${fixture.home}|${fixture.away}|${gw}|${season}`);
  const base = {
    farisdemo: [1.5, 1.1],
    damondemo: [1.8, 1.4],
    valldemo:  [1.6, 1.0],
    aamerdemo: [1.9, 1.1],
    demo:      [1.4, 1.0],
  }[username] || [1.4, 1.1];
  const isWC = !!fixture.stage;
  const WC_FAV = ["Argentina","Brazil","France","England","Spain","Portugal","Netherlands","Germany","Croatia","Morocco"];
  const homeAdv = isWC
    ? (WC_FAV.includes(fixture.home) ? 0.4 : 0)
    : (fixture.home === "Man City" || fixture.home === "Liverpool" || fixture.home === "Arsenal" ? 0.45 : 0);
  const awayAdv = isWC
    ? (WC_FAV.includes(fixture.away) ? 0.2 : 0)
    : (fixture.away === "Man City" || fixture.away === "Liverpool" || fixture.away === "Arsenal" ? 0.25 : 0);
  const volatility = {
    farisdemo: 2.6,
    damondemo: 3.0,
    valldemo:  3.8,
    aamerdemo: 3.7,
    demo:      2.8,
  }[username] || 2.8;
  const cap = isWC ? 4 : 5;
  const bh = isWC ? Math.max(0.8, base[0] - 0.3) : base[0];
  const ba = isWC ? Math.max(0.6, base[1] - 0.2) : base[1];
  let h = Math.max(0, Math.min(cap, Math.round(bh + homeAdv - awayAdv * 0.35 + (rng() - 0.5) * volatility)));
  let a = Math.max(0, Math.min(cap, Math.round(ba + awayAdv - homeAdv * 0.2 + (rng() - 0.5) * volatility)));

  if (rng() < 0.24) {
    const d = Math.max(0, Math.min(cap - 1, Math.round((h + a) / 2 + (rng() - 0.5))));
    h = d; a = d;
  }

  if (rng() < 0.16) {
    if (rng() < 0.5) h = Math.max(0, Math.min(cap, h + 1));
    else a = Math.max(0, Math.min(cap, a + 1));
  }

  if ((username === "valldemo" || username === "aamerdemo") && rng() < 0.22) {
    const homeBlowout = rng() < 0.62;
    const wild = rng();
    const bigWin = wild < 0.08 ? cap : wild < 0.4 ? cap - 1 : cap - 2;
    const loser = wild < 0.25 ? 0 : 1;
    if (homeBlowout) { h = bigWin; a = loser; }
    else { h = loser; a = bigWin; }
  }

  if (rng() < 0.1) { const sw = h; h = a; a = sw; }

  return `${h}-${a}`;
}

async function ensureDemoWCGroup() {
  const F = (id,home,away,result,date,stage) => ({id,home,away,result,status:result?"FINISHED":"SCHEDULED",date,stage});
  const WC_GWS = [
    { gw:1, fixtures:[
      F("wc-gw1-f1","Qatar","Ecuador","0-2","2026-06-12T16:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f2","England","Iran","6-2","2026-06-13T13:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f3","Argentina","Saudi Arabia","1-2","2026-06-13T16:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f4","France","Australia","4-1","2026-06-14T19:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f5","Morocco","Croatia","0-0","2026-06-14T10:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f6","Germany","Japan","1-2","2026-06-14T13:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f7","Brazil","Serbia","2-0","2026-06-15T19:00:00Z","GROUP_STAGE"),
      F("wc-gw1-f8","Portugal","Ghana","3-2","2026-06-15T16:00:00Z","GROUP_STAGE"),
    ]},
    { gw:2, fixtures:[
      F("wc-gw2-f1","Netherlands","Ecuador","1-1","2026-06-19T19:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f2","England","USA","0-0","2026-06-19T19:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f3","Argentina","Mexico","2-0","2026-06-20T19:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f4","France","Denmark","2-1","2026-06-20T19:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f5","Belgium","Morocco","0-2","2026-06-21T19:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f6","Croatia","Canada","4-1","2026-06-21T16:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f7","Brazil","Switzerland","1-0","2026-06-22T13:00:00Z","GROUP_STAGE"),
      F("wc-gw2-f8","Portugal","Uruguay","2-0","2026-06-22T19:00:00Z","GROUP_STAGE"),
    ]},
    { gw:3, fixtures:[
      F("wc-gw3-f1","Netherlands","Qatar","2-0","2026-06-26T19:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f2","England","Wales","3-0","2026-06-26T19:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f3","Argentina","Poland","2-0","2026-06-26T19:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f4","Tunisia","France","1-0","2026-06-25T19:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f5","Japan","Spain","2-1","2026-06-25T19:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f6","Morocco","Canada","2-1","2026-06-25T16:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f7","South Korea","Portugal","2-1","2026-06-26T15:00:00Z","GROUP_STAGE"),
      F("wc-gw3-f8","Cameroon","Brazil","1-0","2026-06-26T19:00:00Z","GROUP_STAGE"),
    ]},
    { gw:4, fixtures:[
      F("wc-gw4-f1", "Netherlands","Scotland",  "2-0","2026-07-05T15:00:00Z","LAST_32"),
      F("wc-gw4-f2", "USA",        "Jamaica",   "3-0","2026-07-05T18:00:00Z","LAST_32"),
      F("wc-gw4-f3", "Argentina",  "El Salvador","3-1","2026-07-06T15:00:00Z","LAST_32"),
      F("wc-gw4-f4", "Australia",  "Indonesia", "2-1","2026-07-06T18:00:00Z","LAST_32"),
      F("wc-gw4-f5", "France",     "Algeria",   "3-0","2026-07-07T15:00:00Z","LAST_32"),
      F("wc-gw4-f6", "Poland",     "Slovakia",  "2-1","2026-07-07T18:00:00Z","LAST_32"),
      F("wc-gw4-f7", "England",    "Panama",    "4-1","2026-07-07T21:00:00Z","LAST_32"),
      F("wc-gw4-f8", "Senegal",    "Ivory Coast","2-0","2026-07-08T15:00:00Z","LAST_32"),
      F("wc-gw4-f9", "Japan",      "Vietnam",   "2-0","2026-07-08T18:00:00Z","LAST_32"),
      F("wc-gw4-f10","Croatia",    "Romania",   "3-1","2026-07-08T21:00:00Z","LAST_32"),
      F("wc-gw4-f11","Brazil",     "Venezuela", "5-1","2026-07-09T15:00:00Z","LAST_32"),
      F("wc-gw4-f12","South Korea","Thailand",  "2-1","2026-07-09T18:00:00Z","LAST_32"),
      F("wc-gw4-f13","Morocco",    "Cameroon",  "1-0","2026-07-09T21:00:00Z","LAST_32"),
      F("wc-gw4-f14","Spain",      "Costa Rica","3-0","2026-07-10T15:00:00Z","LAST_32"),
      F("wc-gw4-f15","Portugal",   "Ghana",     "4-1","2026-07-10T18:00:00Z","LAST_32"),
      F("wc-gw4-f16","Switzerland","Hungary",   "2-1","2026-07-10T21:00:00Z","LAST_32"),
    ]},
    { gw:5, fixtures:[
      F("wc-gw5-f1","Netherlands","USA",        "3-1","2026-07-13T15:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f2","Argentina",  "Australia",  "2-1","2026-07-13T19:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f3","France",     "Poland",     "3-1","2026-07-14T15:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f4","England",    "Senegal",    "3-0","2026-07-14T19:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f5","Japan",      "Croatia",    "1-1","2026-07-15T15:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f6","Brazil",     "South Korea","4-1","2026-07-15T19:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f7","Morocco",    "Spain",      "0-0","2026-07-16T15:00:00Z","ROUND_OF_16"),
      F("wc-gw5-f8","Portugal",   "Switzerland","6-1","2026-07-16T19:00:00Z","ROUND_OF_16"),
    ]},
    { gw:6, fixtures:[
      F("wc-gw6-f1","Argentina","Netherlands","2-2","2026-07-18T19:00:00Z","QUARTER_FINAL"),
      F("wc-gw6-f2","Croatia",  "Brazil",     "1-1","2026-07-18T15:00:00Z","QUARTER_FINAL"),
      F("wc-gw6-f3","Morocco",  "Portugal",   "1-0","2026-07-19T19:00:00Z","QUARTER_FINAL"),
      F("wc-gw6-f4","England",  "France",     "1-2","2026-07-19T15:00:00Z","QUARTER_FINAL"),
    ]},
    { gw:7, fixtures:[
      F("wc-gw7-f1","Argentina","Croatia","3-0","2026-07-22T19:00:00Z","SEMI_FINAL"),
      F("wc-gw7-f2","France",   "Morocco","2-0","2026-07-23T19:00:00Z","SEMI_FINAL"),
    ]},
    { gw:8, fixtures:[
      F("wc-gw8-f1","Argentina","France",null,"2026-07-26T20:00:00Z","FINAL"),
    ]},
  ];

  const wcGroupId_lookup = await sget(`groupcode:${DEMO_WC_GROUP_CODE}`);
  const wcGroupId = wcGroupId_lookup || "demo-wc-2026";
  if (!wcGroupId_lookup) await sset(`groupcode:${DEMO_WC_GROUP_CODE}`, wcGroupId);
  // clean up old demo usernames from any real accounts they contaminated
  const OLD_DEMO_NAMES = ["faris","damon","vall","aamer"];
  for (const old of OLD_DEMO_NAMES) {
    const doc = await sget(`user:${old}`);
    if (!doc) continue;
    const cleaned = (doc.groupIds||[]).filter(id=>id!==wcGroupId&&id!=="demo-wc-2026");
    if (cleaned.length !== (doc.groupIds||[]).length) await sset(`user:${old}`,{...doc,groupIds:cleaned});
  }

  const memberNames = DEMO_MEMBERS.map(m => m.username);

  const predictions = {};
  memberNames.forEach(u => { predictions[u] = {}; });
  WC_GWS.forEach(({ gw, fixtures }) => {
    fixtures.forEach(fixture => {
      DEMO_MEMBERS.forEach(member => {
        if (fixture.result) {
          predictions[member.username][fixture.id] = makeDemoPick(member.username, fixture, gw, 2026);
        } else if (member.username !== DEMO_SHARED_USERNAME) {
          predictions[member.username][fixture.id] = makeDemoPick(member.username, fixture, gw, 2026);
        }
      });
    });
  });

  const nextGroup = {
    id: wcGroupId, name: "World Cup 2026", code: DEMO_WC_GROUP_CODE,
    creatorUsername: DEMO_SHARED_USERNAME, competition: "WC", season: 2026,
    currentGW: 8, scoreScope: "all", draw11Limit: "unlimited", mode: "normal",
    hiddenGWs: [], hiddenFixtures: [], adminLog: [], dibsSkips: {},
    lastAutoSync: Date.now(),
    members: memberNames,
    memberOrder: memberNames,
    admins: [DEMO_SHARED_USERNAME],
    gameweeks: WC_GWS.map(g => ({ ...g, season: 2026 })),
    predictions,
  };

  await sset(`group:${wcGroupId}`, nextGroup);
  return wcGroupId;
}

async function ensureDemoExperience() {
  const groupId = await sget(`groupcode:${DEMO_GROUP_CODE}`);
  if (!groupId) return null;
  const demoGroup = await sget(`group:${groupId}`);
  if (!demoGroup) return null;

  const wcGroupId = await ensureDemoWCGroup();

  // strip demo group IDs from any real accounts that were contaminated by old demo usernames
  const OLD_DEMO_NAMES_PL = ["faris","damon","vall","aamer"];
  for (const old of OLD_DEMO_NAMES_PL) {
    const doc = await sget(`user:${old}`);
    if (!doc) continue;
    const cleaned = (doc.groupIds||[]).filter(id=>id!==groupId&&id!==wcGroupId&&id!=="demo-wc-2026");
    if (cleaned.length !== (doc.groupIds||[]).length) await sset(`user:${old}`,{...doc,groupIds:cleaned});
  }

  for (const member of DEMO_MEMBERS) {
    const key = `user:${member.username}`;
    const existing = await sget(key);
    const userDoc = existing || {
      username: member.username,
      displayName: member.displayName,
      password: member.username === DEMO_SHARED_USERNAME ? "demo" : "password123",
      email: "",
      groupIds: [],
    };
    const nextUser = {
      ...userDoc,
      username: member.username,
      displayName: member.displayName,
      groupIds: Array.from(new Set([...(userDoc.groupIds || []), groupId, ...(wcGroupId ? [wcGroupId] : [])])),
    };
    await sset(key, nextUser);
  }

  const memberNames = DEMO_MEMBERS.map(m => m.username);
  const now = new Date();
  const nextPredictions = { ...(demoGroup.predictions || {}) };
  memberNames.forEach(u => { nextPredictions[u] = { ...(nextPredictions[u] || {}) }; });

  const nextGroup = {
    ...demoGroup,
    members: memberNames,
    memberOrder: memberNames,
    admins: Array.from(new Set([...(demoGroup.admins || []), DEMO_SHARED_USERNAME])),
    predictions: nextPredictions,
  };

  (nextGroup.gameweeks || []).forEach(gwObj => {
    const season = gwObj.season || nextGroup.season || 2025;
    (gwObj.fixtures || []).forEach(fixture => {
      const fixtureDone = !!fixture.result || fixture.status === "POSTPONED" || fixture.status === "FINISHED";
      const isOpen = !fixtureDone && fixture.status !== "IN_PLAY" && fixture.status !== "PAUSED" && (!fixture.date || new Date(fixture.date) > now);
      DEMO_MEMBERS.forEach(member => {
        if (member.username === DEMO_SHARED_USERNAME) return;
        if (fixtureDone || isOpen) {
          nextPredictions[member.username][fixture.id] = makeDemoPick(member.username, fixture, gwObj.gw, season);
        }
      });
      if (isOpen) {
        delete nextPredictions[DEMO_SHARED_USERNAME][fixture.id];
      } else if (fixtureDone && !nextPredictions[DEMO_SHARED_USERNAME][fixture.id]) {
        nextPredictions[DEMO_SHARED_USERNAME][fixture.id] = makeDemoPick(DEMO_SHARED_USERNAME, fixture, gwObj.gw, season);
      }
    });
  });

  await sset(`group:${groupId}`, nextGroup);
  const refreshedDemoUser = await sget(`user:${DEMO_SHARED_USERNAME}`);
  return { groupId, group: nextGroup, user: refreshedDemoUser };
}

function calcPts(pred, result) {
  if (!pred || !result) return null;
  const [ph, pa] = pred.split("-").map(Number);
  const [rh, ra] = result.split("-").map(Number);
  if (isNaN(ph)||isNaN(pa)||isNaN(rh)||isNaN(ra)) return null;
  return Math.abs(ph - rh) + Math.abs(pa - ra);
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

function genCode() { const chars="ABCDEFGHJKMNPQRSTUVWXYZ23456789"; return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(""); }
const PALETTE = ["#60a5fa","#f472b6","#4ade80","#fb923c","#a78bfa","#facc15","#34d399","#f87171"];
const CLUB_COLORS = {
  "Arsenal":"#EF0107","Aston Villa":"#95BFE5","Bournemouth":"#DA291C","Brentford":"#E30613",
  "Brighton":"#0057B8","Chelsea":"#034694","Crystal Palace":"#1B458F","Everton":"#003399",
  "Fulham":"#CC0000","Ipswich":"#0044A9","Leicester":"#003090","Liverpool":"#C8102E",
  "Man City":"#6CABDD","Man Utd":"#DA291C","Newcastle":"#241F20","Nott'm Forest":"#DD0000",
  "Southampton":"#D71920","Spurs":"#132257","West Ham":"#7A263A","Wolves":"#FDB913"
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
  "Liverpool": "https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg",
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
    return <img src={`https://flagcdn.com/w40/${countryCode}.png`} alt={team} style={{width:size,height:size,objectFit:"cover",objectPosition:"center",borderRadius:"50%",flexShrink:0,...style}} />;
  }
  const src = crest || TEAM_BADGES[team];
  if (!src) {
    const fallbackColor = CLUB_COLORS[team] || "var(--text-dim)";
    return <div style={{width:size,height:size,borderRadius:"50%",background:fallbackColor,flexShrink:0,...style}} />;
  }
  return <img src={src} alt={team} style={{width:size,height:size,objectFit:"contain",flexShrink:0,...style}} />;
}

function makeFixturesFallback(gw, season) {
  const CLUBS = ["Arsenal","Aston Villa","Bournemouth","Brentford","Brighton","Chelsea","Crystal Palace","Everton","Fulham","Ipswich","Leicester","Liverpool","Man City","Man Utd","Newcastle","Nott'm Forest","Southampton","Spurs","West Ham","Wolves"];
  const seed = gw * 9301 + 49297;
  const rng = (n) => { let s = seed+n; s=((s>>16)^s)*0x45d9f3b; s=((s>>16)^s)*0x45d9f3b; return ((s>>16)^s)>>>0; };
  const arr = [...CLUBS];
  for (let i = arr.length-1; i > 0; i--) { const j = rng(i)%(i+1); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  const prefix = season && season !== 2025 ? `${season}-` : "";
  return Array.from({length:10}, (_,i) => ({ id:`${prefix}gw${gw}-f${i}`, home:arr[i*2], away:arr[i*2+1], result:null, status:"SCHEDULED" }));
}
function makeAllGWs(season) {
  return Array.from({length:38}, (_,i) => ({gw:i+1, season, fixtures:makeFixturesFallback(i+1, season)}));
}

function makeWCRounds() {
  return Array.from({length:8}, (_,i) => ({gw:i+1, season:2026, fixtures:[]}));
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
  if ((group.competition || "PL") === "PL") return `GW${gwNum}`;
  const gwObj = (group.gameweeks || []).find(g => g.gw === gwNum);
  const stage = (gwObj?.fixtures || []).find(f => f.stage)?.stage;
  return stageLabel(stage, gwNum);
}

const Avatar = ({ name, size = 36, color }) => {
  const ini = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const hue = [...(name||"")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  const bg = color ? `${color}28` : `hsl(${hue},55%,32%)`;
  const fg = color ? color : `hsl(${hue},75%,80%)`;
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.38,flexShrink:0,fontFamily:"'DM Mono',monospace",letterSpacing:-1,userSelect:"none"}}>{ini}</div>;
};

const BadgeScore = ({ score, missed=false }) => {
  if (score===null||score===undefined) return <span style={{color:"var(--text-dim2)",fontSize:13}}>—</span>;
  const c = missed?"#6b7280":score===0?"#22c55e":score<=2?"#f59e0b":"#ef4444";
  const perfect = !missed && score === 0;
  return <span style={{
    background: perfect ? "linear-gradient(135deg, #22c55e24, #a3e63518)" : c+"20",
    color:c,
    border:`1px solid ${c}40`,
    borderRadius:6,
    padding:"2px 9px",
    fontSize:12,
    fontWeight:700,
    fontFamily:"'DM Mono',monospace",
    fontStyle:missed?"italic":"normal",
    boxShadow: perfect ? "0 0 0 1px #22c55e20 inset, 0 0 12px #22c55e22" : "none",
    position:"relative",
    overflow:"hidden"
  }}>{perfect && <span style={{position:"absolute",inset:0,background:"linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.45) 48%, transparent 78%)",transform:"translateX(-120%)",animation:"perfectShimmer 2.6s ease-in-out infinite"}}/>}<span style={{position:"relative"}}>{score}</span></span>;
};

const Btn = ({children,onClick,variant="default",disabled,small,style:extra={}}) => {
  const base = {fontFamily:"'DM Mono',monospace",cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:8,fontWeight:500,letterSpacing:0.5,transition:"all 0.15s",opacity:disabled?0.4:1,padding:small?"6px 14px":"10px 22px",fontSize:small?12:13};
  const V = {
    default:{background:"var(--btn-bg)",color:"var(--btn-text)"},
    ghost:{background:"transparent",border:"1px solid var(--border)",color:"var(--text-mid)"},
    danger:{background:"#ef444418",border:"1px solid #ef444435",color:"#ef4444"},
    success:{background:"#22c55e18",border:"1px solid #22c55e35",color:"#22c55e"},
    muted:{background:"var(--border)",border:"1px solid var(--border)",color:"var(--text-dim2)"},
    amber:{background:"#f59e0b18",border:"1px solid #f59e0b35",color:"#f59e0b"},
  };
  return <button onClick={disabled?undefined:onClick} style={{...base,...V[variant],...extra}}>{children}</button>;
};

const Input = ({value,onChange,placeholder,type="text",onKeyDown,style:extra={},autoFocus}) => (
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus}
    style={{background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:13,outline:"none",width:"100%",...extra}} />
);

const Section = ({title,children}) => (
  <div style={{marginBottom:32}}>
    <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,textTransform:"uppercase",marginBottom:14,borderBottom:"1px solid var(--border)",paddingBottom:8}}>{title}</div>
    {children}
  </div>
);

function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return m;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&display=swap');
  :root{--bg:#080810;--surface:#0e0e1a;--card:#0c0c18;--card-hi:#0f0f1d;--card-hover:#10101c;--input-bg:#0a0a14;--border:#1a1a26;--border2:#1e1e2e;--border3:#10101e;--text:#e8e4d9;--text-dim:#555566;--text-dim2:#666;--text-dim3:#555;--text-mid:#999;--text-bright:#fff;--text-inv:#000;--scrollbar:#222;--btn-bg:#fff;--btn-text:#000;--font-mono:'DM Mono',monospace;}
  [data-theme="light"]{--bg:#f4f1e8;--surface:#fff;--card:#eeeae0;--card-hi:#e8e5db;--card-hover:#e5e2d8;--input-bg:#fff;--border:#dddad0;--border2:#e0ddd4;--border3:#e4e1d8;--text:#1a1814;--text-dim:#888;--text-dim2:#666;--text-dim3:#777;--text-mid:#444;--text-bright:#0f0d0a;--text-inv:#f4f1e8;--scrollbar:#ccc;--btn-bg:#111;--btn-text:#f4f1e8;--font-mono:'DM Mono',monospace;}
  [data-theme="excel"]{--bg:#ffffff;--surface:#ffffff;--card:#f9f9f9;--card-hi:#f2f2f2;--card-hover:#efefef;--input-bg:#fff;--border:#d0d0d0;--border2:#e0e0e0;--border3:#e8e8e8;--text:#1a1a1a;--text-dim:#888;--text-dim2:#999;--text-dim3:#aaa;--text-mid:#444;--text-bright:#000;--text-inv:#fff;--scrollbar:#ccc;--btn-bg:#107c41;--btn-text:#fff;--font-mono:Arial,Calibri,sans-serif;}
  [data-theme="terminal"]{--bg:#000000;--surface:#0a0a0a;--card:#050505;--card-hi:#0d0d0d;--card-hover:#111;--input-bg:#000;--border:#1a3a1a;--border2:#1f3f1f;--border3:#0d200d;--text:#00cc44;--text-dim:#005522;--text-dim2:#006622;--text-dim3:#004418;--text-mid:#00aa33;--text-bright:#00ff55;--text-inv:#000;--scrollbar:#003311;--btn-bg:#00cc44;--btn-text:#000;--font-mono:'DM Mono',monospace;}
  [data-theme="nord"]{--bg:#2e3440;--surface:#3b4252;--card:#353c4a;--card-hi:#3b4357;--card-hover:#404858;--input-bg:#2e3440;--border:#434c5e;--border2:#4c566a;--border3:#3a4154;--text:#eceff4;--text-dim:#616e88;--text-dim2:#555f73;--text-dim3:#4a5368;--text-mid:#d8dee9;--text-bright:#eceff4;--text-inv:#2e3440;--scrollbar:#434c5e;--btn-bg:#88c0d0;--btn-text:#2e3440;--font-mono:'DM Mono',monospace;}
  [data-theme="pitch"]{--bg:#0d1f0d;--surface:#122012;--card:#0f1c0f;--card-hi:#142214;--card-hover:#162516;--input-bg:#0a180a;--border:rgba(255,255,255,0.22);--border2:rgba(255,255,255,0.32);--border3:rgba(255,255,255,0.1);--text:#d4ecd4;--text-dim:#3a6a3a;--text-dim2:#2e562e;--text-dim3:#264426;--text-mid:#7ab87a;--text-bright:#e8f5e8;--text-inv:#0d1f0d;--scrollbar:rgba(255,255,255,0.15);--btn-bg:#4caf50;--btn-text:#0d1f0d;--font-mono:'DM Mono',monospace;}
  [data-theme="velvet"]{--bg:#120816;--surface:#1a0f1f;--card:#180d1d;--card-hi:#221229;--card-hover:#291631;--input-bg:#140a18;--border:#3a2344;--border2:#4a2d58;--border3:#26132d;--text:#f7d6ea;--text-dim:#7a5a71;--text-dim2:#8f6d84;--text-dim3:#62485c;--text-mid:#d6adc7;--text-bright:#fff2fa;--text-inv:#120816;--scrollbar:#4a2d58;--btn-bg:#f472b6;--btn-text:#1b0d18;--font-mono:'DM Mono',monospace;}
  html,body{background:var(--bg);}
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:var(--scrollbar);border-radius:2px;}
  @keyframes fadein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  @keyframes perfectShimmer{0%{transform:translateX(-120%);}55%,100%{transform:translateX(130%);}}
  .fade{animation:fadein 0.25s ease forwards;}
  .frow:hover{background:var(--card-hover)!important;}
  .nb{background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;transition:all 0.18s;}
  .nb:hover{color:var(--text-mid)!important;}
  .nb.active{color:var(--text-bright)!important;border-bottom-color:var(--text)!important;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
  @keyframes thumbdown{0%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(-70px) scale(1.5);}}
  @keyframes ballspin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
  .thumbdown{position:fixed;pointer-events:none;font-size:26px;animation:thumbdown 0.8s ease-out forwards;z-index:9999;}
  .bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;border-top:1px solid var(--border);background:var(--bg);z-index:100;justify-content:space-around;align-items:flex-start;height:calc(54px + env(safe-area-inset-bottom));}
  .bot-nav .nb{height:54px;border-top:none!important;}
  .bot-nav .nb.active{border-bottom-color:var(--text)!important;}
  @media(max-width:620px){.mob-hide{display:none!important;}.bot-nav{display:flex!important;}.pad-bot{padding-bottom:calc(70px + env(safe-area-inset-bottom))!important;}input{font-size:16px!important;}.gw-outer{width:100%!important;}.gw-controls{width:100%!important;}.gw-controls .gw-strip{flex:1!important;max-width:none!important;}}
  .gw-strip{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}.gw-strip::-webkit-scrollbar{display:none;}
  .excel-mode table,.excel-mode table *{font-family:Arial,Calibri,sans-serif!important;}
  .excel-mode table td,.excel-mode table th{border:1px solid #888888;border-radius:0!important;padding:5px 8px!important;}
  .excel-mode table thead tr{background:var(--card-hi)!important;}
  .excel-mode table thead th{font-weight:700!important;color:var(--text-mid)!important;}
  .excel-mode table{border-collapse:collapse!important;border:1px solid var(--border2)!important;}
`;

function computeStats(group) {
  const preds = group.predictions||{};
  const activeSeason = group.season || 2025;
  const scope = group.scoreScope || "all";
  const filteredGWs = (group.gameweeks||[]).filter(g => scope === "all" || (g.season || activeSeason) === activeSeason);
  return (group.members||[]).map(username => {
    let total=0, scored=0, perfects=0;
    const gwTotals = filteredGWs.map(g => {
      let gwPts=0;
      g.fixtures.forEach(f => {
        if (!f.result) return;
        const pts = calcPts(preds[username]?.[f.id], f.result);
        if (pts!==null){total+=pts;scored++;gwPts+=pts;if(pts===0)perfects++;}
        else if(f.result){total+=MISSED_PICK_PTS;scored++;gwPts+=MISSED_PICK_PTS;}
      });
      return {gw:g.gw, season:g.season||activeSeason, points:gwPts};
    });
    return {username, total, scored, perfects, avg:scored>0?(total/scored).toFixed(2):"–", gwTotals};
  }).sort((a,b)=>a.total-b.total);
}

/* ── AUTH ─────────────────────────────────────────── */
/* ── LANDING PAGE ─────────────────────────────────── */
function LandingPage({onContinue, onDemo, onAreBadTap}) {
  const [thumbs,setThumbs]=useState([]);
  const [demoLoading,setDemoLoading]=useState(false);
  const [phase,setPhase]=useState("open");
  const [badTapCount,setBadTapCount]=useState(0);
  const phaseIdx=useRef(0);
  const PHASES=["open","locked","result","score"];
  const PHASE_MS={open:2800,locked:1200,result:2000,score:3200};

  useEffect(()=>{
    let t;
    const tick=()=>{
      phaseIdx.current=(phaseIdx.current+1)%PHASES.length;
      const next=PHASES[phaseIdx.current];
      setPhase(next);
      t=setTimeout(tick,PHASE_MS[next]);
    };
    t=setTimeout(tick,PHASE_MS.open);
    return ()=>clearTimeout(t);
  },[]);

  const spawnThumb=(e)=>{
    const id=Date.now()+Math.random();
    const r=e.currentTarget.getBoundingClientRect();
    const x=r.left+r.width/2+(Math.random()-0.5)*20;
    const y=r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
    setBadTapCount(c=>{
      const next = c + 1;
      if (next >= 7) {
        onAreBadTap?.();
        return 0;
      }
      return next;
    });
  };

  const statusLabel={open:"OPEN",locked:"LOCKED",result:"FINAL",score:"FINAL"}[phase];
  const statusColor={
    open:{color:"#22c55e",bg:"#22c55e15",border:"#22c55e25"},
    locked:{color:"#f59e0b",bg:"#f59e0b15",border:"#f59e0b25"},
    result:{color:"var(--text-dim)",bg:"transparent",border:"var(--border)"},
    score:{color:"var(--text-dim)",bg:"transparent",border:"var(--border)"},
  }[phase];

  const scoreCell=(val,dim)=>(
    <div style={{width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",
      background:"var(--bg)",border:"1px solid var(--border2)",borderRadius:8,
      fontSize:22,fontWeight:500,fontFamily:"'DM Mono',monospace",
      color:"var(--text-bright)",opacity:dim?0.4:1,transition:"opacity 0.4s"}}>
      {val}
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'DM Mono',monospace"}}>
      <style>{CSS}</style>
      {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}

      {/* header */}
      <header style={{borderBottom:"1px solid var(--border)",padding:"0 24px",height:60}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:"var(--text-bright)"}}>POINTS</span>
            <span onClick={spawnThumb} style={{color:"var(--text-dim)",fontSize:9,letterSpacing:3,cursor:"pointer",userSelect:"none"}}>are bad</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <button onClick={onContinue} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"var(--text-dim2)",letterSpacing:2,textTransform:"uppercase",fontFamily:"inherit"}}>Sign In</button>
            <button onClick={onContinue} style={{background:"var(--btn-bg)",color:"var(--btn-text)",fontSize:11,letterSpacing:2,textTransform:"uppercase",padding:"8px 18px",borderRadius:8,fontWeight:500,fontFamily:"inherit",border:"none",cursor:"pointer"}}>Create Group</button>
          </div>
        </div>
      </header>

      <div style={{maxWidth:940,margin:"0 auto",padding:"0 24px"}}>

        {/* hero */}
        <section style={{padding:"80px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:64,alignItems:"center"}} className="land-hero">
          <div className="fade">
            <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:4,textTransform:"uppercase",marginBottom:28}}>Premier League · Score Predictions</div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:"clamp(2.8rem,5vw,4rem)",color:"var(--text-bright)",letterSpacing:-2,lineHeight:1.05,marginBottom:24}}>
              Predict every goal.
            </h1>
            <p style={{fontSize:12,color:"var(--text-mid)",lineHeight:1.8,maxWidth:380,marginBottom:36,letterSpacing:0.3}}>
              A score prediction game to play with your friends. Pick exact scorelines for every Premier League fixture each gameweek. Every goal off costs a point. Lowest total wins.
            </p>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={onContinue} style={{background:"var(--btn-bg)",color:"var(--btn-text)",fontSize:11,letterSpacing:2,textTransform:"uppercase",padding:"12px 28px",borderRadius:8,fontWeight:500,fontFamily:"inherit",border:"none",cursor:"pointer"}}>Create a group</button>
              <button onClick={onContinue} style={{background:"transparent",color:"var(--text-mid)",fontSize:11,letterSpacing:2,textTransform:"uppercase",padding:"12px 28px",borderRadius:8,fontWeight:400,fontFamily:"inherit",border:"1px solid var(--border2)",cursor:"pointer"}}>Sign in</button>
            </div>
            {onDemo&&<button onClick={async()=>{setDemoLoading(true);await onDemo();setDemoLoading(false);}} disabled={demoLoading} style={{marginTop:8,background:"none",border:"none",padding:0,cursor:"pointer",fontSize:11,color:"var(--text-dim2)",fontFamily:"'DM Mono',monospace",letterSpacing:1}}>
              {demoLoading?"loading...":"→ Try the live demo"}
            </button>}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            {/* prediction demo */}
            <div style={{width:"100%",maxWidth:320}}>
              <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:24,minHeight:280}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
                  <div>
                    <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:3,textTransform:"uppercase",marginBottom:5}}>Matchweek 32</div>
                    <div style={{fontSize:14,color:"var(--text-bright)",fontWeight:500}}>Arsenal vs Tottenham</div>
                    <div style={{fontSize:10,color:"var(--text-dim2)",marginTop:2}}>Sat 15 Apr · 12:30</div>
                  </div>
                  <div style={{fontSize:9,letterSpacing:2,fontWeight:500,padding:"3px 9px",borderRadius:4,border:`1px solid ${statusColor.border}`,background:statusColor.bg,color:statusColor.color,transition:"all 0.2s"}}>
                    {statusLabel}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:24,marginBottom:16}}>
                  <div>
                    <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Your pick</div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {scoreCell("2",phase!=="open")}
                      <span style={{color:"var(--text-dim)",fontSize:14}}>-</span>
                      {scoreCell("1",phase!=="open")}
                    </div>
                  </div>
                  {(phase==="result"||phase==="score")&&(
                    <div style={{animation:"fadein 0.2s ease forwards"}}>
                      <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Actual</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {scoreCell("3")}
                        <span style={{color:"var(--text-dim)",fontSize:14}}>-</span>
                        {scoreCell("1")}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{minHeight:62}}>
                  {phase==="locked"&&<div style={{fontSize:10,color:"#f59e0b",letterSpacing:1,marginBottom:12,animation:"fadein 0.2s ease forwards"}}>Picks locked at kickoff</div>}
                  {phase==="score"&&(
                    <div style={{borderTop:"1px solid var(--border)",paddingTop:14,marginTop:4,animation:"fadein 0.2s ease forwards"}}>
                      <div style={{fontSize:11,color:"var(--text-mid)",letterSpacing:0.5,marginBottom:6}}>|2-3| + |1-1| = 1 + 0</div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:20,fontWeight:500,color:"var(--text-bright)"}}>1 point</span>
                        <span style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1}}>LOWER IS BETTER</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section style={{padding:"64px 0",borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:4,textTransform:"uppercase",marginBottom:8}}>The game</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:"var(--text-bright)",letterSpacing:-1,marginBottom:40}}>How it works.</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}} className="land-steps">
            {[
              {num:"01",title:"Join or create a group",body:"Share an invite code. Everyone in your group sees the same fixtures each gameweek."},
              {num:"02",title:"Submit your scorelines",body:"Pick exact home and away goals for every fixture before kickoff. Picks stay hidden until you lock them all in."},
              {num:"03",title:"Lowest total wins",body:"Points are goals off per fixture. Zero is a perfect pick. The leaderboard runs all season."},
            ].map(s=>(
              <div key={s.num} style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:"24px 22px"}}>
                <div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:2,marginBottom:14}}>{s.num}</div>
                <div style={{fontSize:13,color:"var(--text-bright)",fontWeight:500,marginBottom:10}}>{s.title}</div>
                <div style={{fontSize:11,color:"var(--text-mid)",lineHeight:1.75}}>{s.body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* scoring */}
        <section style={{padding:"64px 0",borderTop:"1px solid var(--border)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:64,alignItems:"center"}} className="land-hero">
            <div>
              <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:4,textTransform:"uppercase",marginBottom:8}}>Scoring</div>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:"var(--text-bright)",letterSpacing:-1,marginBottom:16}}>Points = goals off.</h2>
              <p style={{fontSize:11,color:"var(--text-mid)",lineHeight:1.8,marginBottom:12}}>For each fixture, count how many goals off you were on each side and add them up. Zero is a perfect pick. Accumulate the least over the season.</p>
              <p style={{fontSize:11,color:"var(--text-dim2)",lineHeight:1.8}}>Predict 2-1, actual 3-1: 1 goal off on home, 0 on away = 1 point. Predict 0-0, actual 4-3 = 7 points.</p>
            </div>
            <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:28}}>
              <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:3,textTransform:"uppercase",marginBottom:20}}>Formula</div>
              <div style={{fontSize:15,color:"var(--text-bright)",fontWeight:500,letterSpacing:0.5,marginBottom:20}}>pts = |pH - aH| + |pA - aA|</div>
              <div style={{fontSize:10,color:"var(--text-dim2)",lineHeight:2,marginBottom:20}}>
                <div>pH / aH = predicted / actual home goals</div>
                <div>pA / aA = predicted / actual away goals</div>
              </div>
              <div style={{borderTop:"1px solid var(--border)",paddingTop:16,fontSize:11,color:"var(--text-mid)"}}>
                predict 2-1, actual 3-1: |2-3| + |1-1| = <span style={{color:"var(--text-bright)",fontWeight:500}}>1 pt</span>
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section style={{padding:"64px 0",borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:4,textTransform:"uppercase",marginBottom:8}}>Features</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:"var(--text-bright)",letterSpacing:-1,marginBottom:40}}>The details.</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}} className="land-feats">
            {[
              {title:"Hidden picks",body:"Nobody sees your predictions until you lock them all in. No copying."},
              {title:"Locks at kickoff",body:"Picks freeze the moment a match starts. No backdating, no excuses."},
              {title:"Lowest score wins",body:"The leaderboard rewards accuracy, not optimism. Zero is the goal."},
              {title:"Private groups",body:"Invite-only with a share code. Just your group, no strangers."},
            ].map(f=>(
              <div key={f.title} style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:"20px 18px"}}>
                <div style={{fontSize:12,color:"var(--text-bright)",fontWeight:500,marginBottom:10}}>{f.title}</div>
                <div style={{fontSize:11,color:"var(--text-mid)",lineHeight:1.7}}>{f.body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* cta */}
        <section style={{borderTop:"1px solid var(--border)",padding:"80px 0 100px",textAlign:"center"}}>
          <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:4,textTransform:"uppercase",marginBottom:16}}>Play</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:"clamp(2rem,4vw,3rem)",color:"var(--text-bright)",letterSpacing:-2,lineHeight:1.1,marginBottom:16}}>Start a group.</h2>
          <p style={{fontSize:11,color:"var(--text-mid)",letterSpacing:0.3,marginBottom:36}}>Free to use. Invite friends with a code. Picks open each gameweek.</p>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
            <button onClick={onContinue} style={{background:"var(--btn-bg)",color:"var(--btn-text)",fontSize:11,letterSpacing:2,textTransform:"uppercase",padding:"13px 36px",borderRadius:8,fontWeight:500,fontFamily:"inherit",border:"none",cursor:"pointer"}}>Create a group</button>
            {onDemo&&<button onClick={async()=>{setDemoLoading(true);await onDemo();setDemoLoading(false);}} disabled={demoLoading} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:11,color:"var(--text-dim2)",fontFamily:"'DM Mono',monospace",letterSpacing:1}}>
              {demoLoading?"loading...":"→ Try the live demo"}
            </button>}
          </div>
        </section>

      </div>

      <style>{`
        @media(max-width:720px){.land-hero{grid-template-columns:1fr!important;}.land-steps{grid-template-columns:1fr!important;}.land-feats{grid-template-columns:1fr 1fr!important;}}
        @media(max-width:480px){.land-feats{grid-template-columns:1fr!important;}}
      `}</style>
    </div>
  );
}

function AuthScreen({ onLogin, onBack, successMsg, joinCode=null }) {
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
    } catch {}
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
      const ex = await sget(`user:${uname}`);
      if (ex){setError("Username taken.");setLoading(false);return;}
      const emailKey = `useremail:${email.trim().toLowerCase()}`;
      const exEmail = await sget(emailKey);
      if (exEmail){setError("Email already in use.");setLoading(false);return;}
      const user = {username:uname,displayName:uname[0].toUpperCase()+uname.slice(1),password,email:email.trim().toLowerCase(),groupIds:[]};
      const ok1 = await sset(`user:${uname}`,user);
      const ok2 = await sset(emailKey,{username:uname});
      if (!ok1||!ok2){setError("Registration failed - please try again.");setLoading(false);return;}
      onLogin(user);
    } else {
      const user = await sget(`user:${username.toLowerCase()}`);
      if (!user||user.password!==password){setError("Invalid credentials.");setLoading(false);return;}
      onLogin(user);
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",padding:24}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:52,fontWeight:900,color:"var(--text-bright)",letterSpacing:-3,lineHeight:1}}>POINTS</div>
          <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:7,marginTop:10}}>ARE <span onClick={spawnThumb} style={{cursor:"pointer",userSelect:"none"}}>BAD</span></div>
          {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}
        </div>
        <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:32}}>
          {joinCode&&<div style={{background:"#8888cc12",border:"1px solid #8888cc35",borderRadius:8,padding:"10px 12px",marginBottom:18,fontSize:11,color:"#b8b8ff",lineHeight:1.6}}>You're signing in from an invite link. After login, you'll be able to join the group.</div>}
          {forgotMode ? (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{fontSize:12,color:"var(--text-dim)",letterSpacing:1}}>Enter your email and we'll send a reset link.</div>
              <Input value={forgotEmail} onChange={setForgotEmail} placeholder="Email" type="email" autoFocus onKeyDown={e=>e.key==="Enter"&&sendReset()} />
              {forgotMsg&&<div style={{fontSize:12,color:"#22c55e"}}>{forgotMsg}</div>}
              <Btn onClick={sendReset} disabled={forgotLoading||!forgotEmail.trim()||!!forgotMsg} style={{width:"100%",padding:"12px 0",display:"block",textAlign:"center",letterSpacing:2}}>
                {forgotLoading?"...":"SEND LINK"}
              </Btn>
              <button onClick={()=>{setForgotMode(false);setForgotMsg("");setForgotEmail("");}} style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,letterSpacing:1,fontFamily:"inherit",padding:0}}>← Back to sign in</button>
            </div>
          ) : (
            <>
              <div style={{display:"flex",background:"var(--bg)",borderRadius:8,padding:3,marginBottom:28,gap:3}}>
                {["login","register"].map(m=>(
                  <button key={m} onClick={()=>{setMode(m);setError("");setEmail("");setConfirmPassword("");}} style={{flex:1,background:mode===m?"var(--btn-bg)":"transparent",color:mode===m?"var(--btn-text)":"var(--text-dim2)",border:"none",borderRadius:6,padding:"8px 0",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
                    {m==="login"?"Sign In":"Register"}
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
                {loading?"...":mode==="login"?"SIGN IN":"CREATE ACCOUNT"}
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
            letterSpacing:2,background:"transparent",border:"1px solid var(--border2)",borderRadius:8,
            color:"var(--text-dim)",cursor:"pointer",fontSize:11,fontFamily:"'DM Mono',monospace",
            transition:"border-color 0.2s,color 0.2s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--text-dim)";e.currentTarget.style.color="var(--text)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.color="var(--text-dim)";}}
        >
          {demoLoading?"...":"TRY DEMO"}
        </button>
        {onBack&&<div style={{textAlign:"center",marginTop:16}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,letterSpacing:1,fontFamily:"inherit",padding:0}}>← Back</button>
        </div>}
        <div style={{textAlign:"center",marginTop:16,color:"var(--border2)",fontSize:11,letterSpacing:1}}>PL &amp; World Cup 2026 Predictions</div>
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
            {loading?"...":"SET PASSWORD"}
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
      // Email uniqueness check
      if (needsEmail) {
        const existing = await sget(`useremail:${normEmail}`);
        if (existing && existing.username !== user.username) {
          setError("Email already in use.");
          setLoading(false);
          return;
        }
      }
      // Firebase writes
      if (needsEmail) {
        await sset(`useremail:${normEmail}`, { username: user.username });
        await spatch(`user:${user.username}`, "email", normEmail);
      }
      if (needsPassword) {
        await spatch(`user:${user.username}`, "password", trimmedPw);
      }
      // Stage updated user and trigger success flash
      pendingUser.current = {
        ...user,
        ...(needsEmail && { email: normEmail }),
        ...(needsPassword && { password: trimmedPw }),
      };
      setSuccess(true);
    } catch {
      setError("Something went wrong, please try again.");
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.53)",
      zIndex: 2000, display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24,
    }}>
      <div style={{
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
              {loading ? "..." : "SAVE & CONTINUE"}
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

/* ── GROUP LOBBY ─────────────────────────────────── */
function GroupLobby({ user, onEnterGroup, onUpdateUser, onLogout, initialJoinCode=null, onAreBadTap }) {
  const [groups,setGroups]=useState([]);
  const [loading,setLoading]=useState(true);
  const [createName,setCreateName]=useState("");
  const [joinCode,setJoinCode]=useState(initialJoinCode||"");
  const [error,setError]=useState("");
  const [inviteGroup,setInviteGroup]=useState(null);
  const [inviteLoading,setInviteLoading]=useState(false);
  const [thumbs,setThumbs]=useState([]);
  const [badTapCount,setBadTapCount]=useState(0);
  const spawnThumb = (e) => {
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
    setBadTapCount(c=>{
      const next = c + 1;
      if (next >= 7) {
        onAreBadTap?.();
        return 0;
      }
      return next;
    });
  };
  const [profileOpen,setProfileOpen]=useState(false);
  const [accountOpen,setAccountOpen]=useState(false);
  const [pwCurrent,setPwCurrent]=useState("");
  const [pwNew,setPwNew]=useState("");
  const [pwConfirm,setPwConfirm]=useState("");
  const [pwError,setPwError]=useState("");
  const [pwSuccess,setPwSuccess]=useState(false);
  const [pwLoading,setPwLoading]=useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const profileRef=useRef(null);
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
    const fresh = await sget(`user:${user.username}`);
    if (!fresh||fresh.password!==pwCurrent){setPwError("Current password is incorrect.");setPwLoading(false);return;}
    await sset(`user:${user.username}`,{...fresh,password:pwNew});
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
      const existing = await sget(`useremail:${normEmail}`);
      if (existing && existing.username !== user.username) {
        setEmailError("Email already in use.");
        return;
      }
      // Write sequentially
      await sset(`useremail:${normEmail}`, { username: user.username });
      if (user.email) {
        const delOk = await sdel(`useremail:${user.email}`);
        if (!delOk) {
          // sdel failed after sset succeeded -- unrecoverable partial write
          setEmailError("Something went wrong. Please contact support.");
          return;
        }
      }
      const patchOk = await spatch(`user:${user.username}`, "email", normEmail);
      if (!patchOk) {
        setEmailError("Something went wrong. Please contact support.");
        return;
      }
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
  const [setupGWLoading,setSetupGWLoading]=useState(false);
  const [setupPickMode,setSetupPickMode]=useState("open");

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      await loadGroups();
      if (cancelled || !initialJoinCode) return;
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
          if (group.members.includes(user.username)) {
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
  },[]);

  useEffect(()=>{
    if (!setupMode) return;
    setSetupGWLoading(true);
    (async()=>{
      try {
        const globalDoc = await sget("fixtures:PL:2025");
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
          if (gw!==null&&gw>=1&&gw<=38) setSetupGW(String(gw));
        } else {
          const resp = await fetch("/api/fixtures?season=2025");
          if (!resp.ok) return;
          const data = await resp.json();
          const matches = data.matches||[];
          if (!matches.length) return;
          const upcoming = matches.filter(m=>m.status!=="FINISHED"&&m.utcDate&&new Date(m.utcDate)>=now);
          const gw = upcoming.length ? Math.min(...upcoming.map(m=>m.matchday)) : Math.max(...matches.map(m=>m.matchday));
          if (gw>=1&&gw<=38) setSetupGW(String(gw));
        }
      } catch{} finally {
        setSetupGWLoading(false);
      }
    })();
  },[setupMode]);

  const loadGroups = async () => {
    setLoading(true);
    const fresh = await sget(`user:${user.username}`);
    const ids = fresh?.groupIds||[];
    const gs = (await Promise.all(ids.map(id=>sget(`group:${id}`)))).filter(Boolean);
    setGroups(gs);setLoading(false);
  };

  const createGroup = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const id = Date.now().toString();
    const code = genCode();
    const isWC = setupCompetition === "WC";
    let newGroup;
    if (isWC) {
      newGroup = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:makeWCRounds(),currentGW:1,apiKey:"",season:2026,competition:"WC",hiddenGWs:[],scoreScope:"all",draw11Limit:setupLimit,mode:setupPickMode,memberOrder:[user.username],dibsSkips:{},hiddenFixtures:[],adminLog:[]};
      try {
        const globalDoc = await sget("fixtures:WC:2026");
        if (globalDoc&&(globalDoc.gameweeks||[]).length) {
          newGroup = mergeGlobalIntoGroup(globalDoc,newGroup);
        }
      } catch(e){ console.error("createGroup WC global seed failed",e); }
    } else {
      const startGW = Math.max(1,Math.min(38,parseInt(setupGW)||1));
      const startingGWs = Array.from({length:38-startGW+1},(_,i)=>({gw:startGW+i,season:2025,fixtures:makeFixturesFallback(startGW+i,2025)}));
      newGroup = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:startingGWs,currentGW:startGW,apiKey:"",season:2025,hiddenGWs:[],scoreScope:"all",draw11Limit:setupLimit,mode:setupPickMode,memberOrder:[user.username],dibsSkips:{},hiddenFixtures:[],adminLog:[]};
      try {
        const globalDoc = await sget("fixtures:PL:2025");
        if (globalDoc&&(globalDoc.gameweeks||[]).length) {
          newGroup = mergeGlobalIntoGroup(globalDoc,newGroup);
        }
      } catch(e){ console.error("createGroup global seed failed",e); }
    }
    await sset(`group:${id}`,newGroup);
    await sset(`groupcode:${code}`,id);
    const fresh = await sget(`user:${user.username}`);
    const updated = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
    await sset(`user:${user.username}`,updated);
    onUpdateUser(updated);setCreateName("");setSetupMode(false);setSetupGW("1");setSetupLimit("unlimited");setSetupPickMode("open");setSetupCompetition("PL");setCreating(false);
    onEnterGroup(newGroup);
  };

  const joinGroup = async (codeOverride=null) => {
    const code = (codeOverride ?? joinCode).trim().toUpperCase();
    if (code.length!==6){setError("Enter a 6-character code.");return;}
    setInviteLoading(true);
    try {
      const id = await sget(`groupcode:${code}`);
      if (!id){setError("Group not found.");return;}
      const group = await sget(`group:${id}`);
      if (!group){setError("Group not found.");return;}
      if (group.members.includes(user.username)){setError("You're already in this group.");setInviteGroup(null);return;}
      const currentOrder = group.memberOrder || group.members || [];
      const updated = {
        ...group,
        members:[...group.members,user.username],
        memberOrder: currentOrder.includes(user.username) ? currentOrder : [...currentOrder, user.username],
      };
      await sset(`group:${id}`,updated);
      const fresh = await sget(`user:${user.username}`);
      const updatedUser = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
      await sset(`user:${user.username}`,updatedUser);
      onUpdateUser(updatedUser);setJoinCode("");setError("");setInviteGroup(null);
      onEnterGroup(updated);
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",fontFamily:"'DM Mono',monospace",color:"var(--text)"}}>
      <style>{CSS}</style>
      <header style={{borderBottom:"1px solid var(--border)",padding:"0 24px",height:60}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}><span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:"var(--text-bright)"}}>POINTS</span><span onClick={spawnThumb} style={{color:"var(--text-dim)",fontSize:9,letterSpacing:3,fontFamily:"'DM Mono',monospace",fontWeight:400,cursor:"pointer",userSelect:"none"}}>are bad</span></div>
          {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}
          <div ref={profileRef} style={{position:"relative",display:"flex",alignItems:"center"}}>
            <button onClick={()=>setProfileOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,padding:0,borderRadius:4}}>
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
        </div>
      </header>
      {inviteGroup&&createPortal(
  <div onClick={()=>setInviteGroup(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:32,width:"100%",maxWidth:420}}>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:12}}>GROUP INVITE</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:10}}>{inviteGroup.name}</div>
      <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.7,marginBottom:20}}>You've been invited to join this group with code <span style={{color:"var(--text-bright)"}}>{inviteGroup.code}</span>.</div>
      <div style={{background:"var(--surface)",border:"1px solid var(--border3)",borderRadius:10,padding:"12px 14px",marginBottom:20,fontSize:11,color:"var(--text-mid)",lineHeight:1.8}}>
        <div>{inviteGroup.members?.length||0} member{inviteGroup.members?.length===1?"":"s"}</div>
        <div>{(inviteGroup.competition||"PL")==="WC"?"World Cup 2026":"Premier League"}</div>
        <div>{(inviteGroup.mode||"open").toUpperCase()} mode</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn variant="ghost" onClick={()=>setInviteGroup(null)} style={{flex:1,textAlign:"center"}}>Cancel</Btn>
        <Btn onClick={()=>joinGroup(inviteGroup.code)} disabled={inviteLoading} style={{flex:1,textAlign:"center"}}>{inviteLoading?"...":"Join Group"}</Btn>
      </div>
    </div>
  </div>,
  document.body
)}
      {accountOpen&&createPortal(
  <div onClick={()=>setAccountOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:32,width:"100%",maxWidth:400}}>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:20}}>ACCOUNT</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:"1px solid var(--border3)"}}>
          <span style={{color:"var(--text-dim)"}}>Username</span><span style={{color:"var(--text-mid)"}}>{user.username}</span>
        </div>
        <div style={{borderBottom:"1px solid var(--border3)",paddingBottom:8,marginBottom:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"6px 0"}}>
            <span style={{color:"var(--text-dim)"}}>Email</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"var(--text-mid)"}}>{user.email||"—"}</span>
              <button
                onClick={()=>{setEmailChanging(o=>!o);setEmailInput("");setEmailError("");setEmailSuccess(false);setEmailLoading(false);}}
                style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,
                  letterSpacing:1,fontFamily:"inherit",padding:0}}>
                {emailChanging?"CANCEL":user.email?"CHANGE →":"ADD →"}
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
                style={{padding:"8px 0",textAlign:"center",letterSpacing:2}}>
                {emailLoading?"...":"SAVE"}
              </Btn>
            </div>
          )}
        </div>
      </div>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>CHANGE PASSWORD</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Input value={pwCurrent} onChange={setPwCurrent} placeholder="Current password" type="password" />
        <Input value={pwNew} onChange={setPwNew} placeholder="New password" type="password" />
        <Input value={pwConfirm} onChange={setPwConfirm} placeholder="Confirm new password" type="password" onKeyDown={e=>e.key==="Enter"&&changePassword()} />
      </div>
      {pwError&&<div style={{color:"#ef4444",fontSize:12,marginTop:10}}>{pwError}</div>}
      {pwSuccess&&<div style={{color:"#22c55e",fontSize:12,marginTop:10}}>Password updated.</div>}
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <Btn onClick={changePassword} disabled={pwLoading||pwSuccess} style={{flex:1,padding:"10px 0",textAlign:"center",letterSpacing:2}}>{pwLoading?"...":"SAVE"}</Btn>
        <Btn variant="ghost" onClick={()=>setAccountOpen(false)} style={{flex:1,padding:"10px 0",textAlign:"center"}}>Cancel</Btn>
      </div>
    </div>
  </div>,
  document.body
)}
      <div style={{maxWidth:640,margin:"0 auto",padding:"40px 24px"}}>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:8}}>Your Groups</h1>
        <p style={{color:"var(--text-dim)",fontSize:11,letterSpacing:1,marginBottom:36}}>JOIN OR CREATE A GROUP TO START PREDICTING</p>
        {loading?<div style={{color:"var(--text-dim)",padding:"40px 0",textAlign:"center"}}>Loading...</div>:groups.length>0?(
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:36}}>
            {groups.map(g=>(
              <button key={g.id} onClick={()=>onEnterGroup(g)} style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:"16px 20px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"border-color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="var(--text-dim)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border2)"}>
                <div>
                  <div style={{fontSize:16,color:"var(--text-bright)",marginBottom:4}}>{g.name}</div>
                  <div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{(g.competition||"PL")==="WC"?"WC 2026 · ":""}{g.members.length} MEMBER{g.members.length!==1?"S":""} · {(()=>{const seas=g.season||2025;const next=(g.gameweeks||[]).filter(gw=>(gw.season||seas)===seas).sort((a,b)=>a.gw-b.gw).find(gw=>(gw.fixtures||[]).some(f=>!f.result&&f.status!=="FINISHED"&&f.status!=="IN_PLAY"&&f.status!=="PAUSED"&&f.status!=="POSTPONED"));const gwNum=next?.gw||g.currentGW;return gwLabel(g,gwNum);})()} · {(g.mode||"open").toUpperCase()}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {g.creatorUsername===user.username&&<span style={{fontSize:10,color:"#f59e0b",letterSpacing:2,background:"#f59e0b15",border:"1px solid #f59e0b30",borderRadius:4,padding:"2px 8px"}}>CREATOR</span>}
                  <span style={{color:"var(--text-dim)",fontSize:18}}>›</span>
                </div>
              </button>
            ))}
          </div>
        ):<div style={{color:"var(--text-dim)",fontSize:13,padding:"20px 0 36px"}}>No groups yet.</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
          <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:12,padding:20}}>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>CREATE GROUP</div>
            {!setupMode?(
              <>
                <Input value={createName} onChange={setCreateName} placeholder="Group name..." onKeyDown={e=>e.key==="Enter"&&createName.trim()&&setSetupMode(true)} />
                <Btn onClick={()=>setSetupMode(true)} disabled={!createName.trim()} style={{width:"100%",marginTop:10,padding:"9px 0",display:"block",textAlign:"center"}}>Next →</Btn>
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{fontSize:13,color:"var(--text-bright)",fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:2}}>{createName}</div>
                <div>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>COMPETITION</div>
                  <div style={{display:"flex",gap:5}}>
                    {[["PL","Premier League"],["WC","World Cup 2026"]].map(([val,label])=>(
                      <button key={val} onClick={()=>setSetupCompetition(val)} style={{background:setupCompetition===val?"var(--btn-bg)":"var(--card)",color:setupCompetition===val?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>
                    ))}
                  </div>
                </div>
                {setupCompetition === "PL" && (
                <div>
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>STARTING GW{setupGWLoading&&<span style={{color:"var(--text-dim3)",letterSpacing:0,marginLeft:6,textTransform:"none"}}>detecting...</span>}</div>
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
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>1-1 LIMIT PER WEEK</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[["unlimited","Unlimited"],["2","2"],["1","1"],["none","None"]].map(([val,label])=>(
                      <button key={val} onClick={()=>setSetupLimit(val)} style={{background:setupLimit===val?"var(--btn-bg)":"var(--card)",color:setupLimit===val?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <Btn variant="ghost" small onClick={()=>{setSetupMode(false);setSetupPickMode("open");setSetupCompetition("PL");}}>← Back</Btn>
                  <Btn onClick={createGroup} disabled={creating} style={{flex:1,textAlign:"center"}}>{creating?"...":"Create Group →"}</Btn>
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
const SECRET_THEME_KEY = "pab-secret-theme-unlocked";
const SECRET_THEME = "velvet";
const THEMES=["dark","light","excel","terminal","nord","pitch",SECRET_THEME];
const THEME_META=[
  {key:"dark",   label:"Dark",     swatches:["#080810","#0e0e1a","#e8e4d9"]},
  {key:"light",  label:"Light",    swatches:["#f4f1e8","#fff","#1a1814"]},
  {key:"excel",  label:"Excel",    swatches:["#ffffff","#f2f2f2","#1a1a1a"]},
  {key:"terminal",label:"Terminal",swatches:["#000000","#0a0a0a","#00cc44"]},
  {key:"nord",   label:"Nord",     swatches:["#2e3440","#3b4252","#eceff4"]},
  {key:"pitch",  label:"Pitch",    swatches:["#0d1f0d","#122012","#d4ecd4"]},
  {key:SECRET_THEME,label:"Velvet",  swatches:["#120816","#1d1024","#f7d6ea"],secret:true},
];

function isSecretThemeUnlocked() {
  try { return localStorage.getItem(SECRET_THEME_KEY) === "1"; } catch { return false; }
}

function getAvailableThemes() {
  return THEMES.filter(t => t !== SECRET_THEME || isSecretThemeUnlocked());
}

function getSecretThemeMeta() {
  return THEME_META.filter(t => t.key !== SECRET_THEME || isSecretThemeUnlocked());
}

function getPickFlavor(pred) {
  if (!/^\d+-\d+$/.test(pred || "")) return null;
  const [h, a] = pred.split("-").map(Number);
  const total = h + a;
  if (h === 0 && a === 0) return "respectfully cowardly";
  if (h === 1 && a === 1) return "licensed centrist behaviour";
  if (total >= 8) return "deeply cursed optimism";
  if (Math.abs(h - a) >= 4) return "an aggressive thesis";
  if (total >= 6) return "chaos-friendly";
  return null;
}

function getWeeklyWinnerFlavor(minPts, winnerCount, totalGoals) {
  if (winnerCount > 1) return "Shared honours.";
  if (minPts === 0) return "Perfect week.";
  if (minPts < 10) return "Locked in.";
  if (totalGoals >= 30) return "Chaotic week.";
  if (minPts >= 25) return "Rough week.";
  return null;
}

const TITLE_STYLES = {
  "Least Wrong": { text: "#f8e7a1", glow: "0 0 14px rgba(248,231,161,.28)" },
  "Bullseye Bandit": { text: "#b8ffcf", glow: "0 0 14px rgba(34,197,94,.26)" },
  "Draw Merchant": { text: "#ffd089", glow: "0 0 13px rgba(255,180,90,.24)" },
  "Chaos Goblin": { text: "#ffb1f2", glow: "0 0 16px rgba(217,70,239,.34)" },
  Metronome: { text: "#bfe8ff", glow: "0 0 13px rgba(56,189,248,.24)" },
  "Near Miss Specialist": { text: "#ddd6fe", glow: "0 0 13px rgba(139,92,246,.22)" },
  "Public Menace": { text: "#ffb3a8", glow: "0 0 12px rgba(239,68,68,.24)" },
};

function getTitleStyle(title) {
  return TITLE_STYLES[title] || { text: "var(--text-mid)", glow: "none" };
}

function TitleBadge({ title }) {
  if (!title) return <div style={{height:14, marginTop:4}} />;
  const style = getTitleStyle(title);
  return (
    <div style={{
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
          if (pts === 1 || pts === 2) nearMissCount++;
          const [rh, ra] = f.result.split("-").map(Number);
          const predResult = ph > pa ? 1 : ph < pa ? -1 : 0;
          const realResult = rh > ra ? 1 : rh < ra ? -1 : 0;
          winnerScored++;
          if (predResult === realResult) winnerHits++;
        }
      });
    });

    const gwCompletedTotals = (s.gwTotals || []).filter(gw => completedGWs.some(c => c.gw === gw.gw && (c.season || activeSeason) === (gw.season || activeSeason)));
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
    "Least Wrong": [...candidates].sort((a,b)=>(Number(a.avg)||999)-(Number(b.avg)||999) || b.perfects-a.perfects || b.scored-a.scored)[0]?.username,
    "Bullseye Bandit": [...candidates].sort((a,b)=>b.perfects-a.perfects || (b.scored?b.perfects/b.scored:0)-(a.scored?a.perfects/a.scored:0) || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    "Draw Merchant": [...candidates].sort((a,b)=>(b.drawPickRate??-1)-(a.drawPickRate??-1) || b.drawPickCount-a.drawPickCount || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    "Chaos Goblin": [...candidates].sort((a,b)=>(b.predictedGoalsAvg??-1)-(a.predictedGoalsAvg??-1) || b.nearMissCount-a.nearMissCount || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    Metronome: [...candidates].filter(p => p.gwVariance !== null).sort((a,b)=>(a.gwVariance??999)-(b.gwVariance??999) || (Number(a.avg)||999)-(Number(b.avg)||999) || b.scored-a.scored)[0]?.username,
    "Near Miss Specialist": [...candidates].sort((a,b)=>b.nearMissCount-a.nearMissCount || (b.scored?b.nearMissCount/b.scored:0)-(a.scored?a.nearMissCount/a.scored:0) || (Number(a.avg)||999)-(Number(b.avg)||999))[0]?.username,
    "Public Menace": [...candidates].sort((a,b)=>{
      const menaceA = menaceBoldNorm(a.predictedGoalsAvg ?? 0) * 0.4 + menaceBadNorm(Number(a.avg) || 0) * 0.35 + menaceVarianceNorm(a.gwVariance ?? 0) * 0.25;
      const menaceB = menaceBoldNorm(b.predictedGoalsAvg ?? 0) * 0.4 + menaceBadNorm(Number(b.avg) || 0) * 0.35 + menaceVarianceNorm(b.gwVariance ?? 0) * 0.25;
      return menaceB - menaceA;
    })[0]?.username,
  };

  const priority = [
    { title: "Least Wrong", user: leaders["Least Wrong"] },
    { title: "Bullseye Bandit", user: leaders["Bullseye Bandit"] },
    { title: "Draw Merchant", user: leaders["Draw Merchant"] },
    { title: "Chaos Goblin", user: leaders["Chaos Goblin"] },
    { title: "Metronome", user: leaders.Metronome },
    { title: "Near Miss Specialist", user: leaders["Near Miss Specialist"] },
    { title: "Public Menace", user: leaders["Public Menace"] },
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

export default function App() {
  const [user,setUser]=useState(null);
  const [group,setGroup]=useState(null);
  const [tab,setTab]=useState("League");
  const [boot,setBoot]=useState(false);
  const [showLanding,setShowLanding]=useState(()=>!getInviteCodeFromLocation());
  const [secretThemeUnlocked,setSecretThemeUnlocked]=useState(()=>isSecretThemeUnlocked());
  const [theme,setTheme]=useState(()=>{const t=localStorage.getItem("theme");return getAvailableThemes().includes(t)?t:"dark";});
  const [toast,setToast]=useState(null);
  const [bootError,setBootError]=useState(false);
  const toastTimer=useRef(null);
  const [resetToken]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get("reset")||null;
  });
  const [joinParam]=useState(()=>getInviteCodeFromLocation());
  const [resetDone,setResetDone]=useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
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
    if (theme === SECRET_THEME && !secretThemeUnlocked) setTheme("dark");
  },[theme,secretThemeUnlocked]);

  useEffect(()=>{
    document.documentElement.setAttribute("data-theme",theme);
    localStorage.setItem("theme",theme);
  },[theme]);

  const unlockSecretTheme = useCallback(()=>{
    if (secretThemeUnlocked) return false;
    try { localStorage.setItem(SECRET_THEME_KEY, "1"); } catch {}
    setSecretThemeUnlocked(true);
    setTheme(SECRET_THEME);
    showToast("Velvet theme unlocked.");
    return true;
  },[secretThemeUnlocked,showToast]);

  const runBoot=useCallback(async()=>{
    setBootError(false);
    setBoot(false);
    const saved=lget("session");
    if(saved?.username){
      const u=await sget(`user:${saved.username}`);
      if(!u){setBootError(true);setBoot(true);return;}
      setUser(u);
      setNeedsSetup(!u.email || u.password === "password123");
      if(saved.groupId){
        const g=await sget(`group:${saved.groupId}`);
        if(g&&g.members?.includes(u.username)){
          setGroup(g);
          if(saved.tab)setTab(saved.tab);
        }
      }
    }
    setBoot(true);
  },[]);

  useEffect(()=>{runBoot();},[]);

  const handleDemoLogin = async () => {
    const u = await sget(`user:${DEMO_SHARED_USERNAME}`);
    await handleLogin(u || { username: DEMO_SHARED_USERNAME, displayName: "Demo", password: "demo", email: "", groupIds: [] });
  };

  const handleLogin = async (u) => {
    let nextUser = u;
    let nextSession = { username: u.username };
    if (u.username === DEMO_SHARED_USERNAME) {
      const demoState = await ensureDemoExperience();
      if (demoState?.user) nextUser = demoState.user;
      if (demoState?.groupId) nextSession = { ...nextSession, groupId: demoState.groupId, tab: "League" };
    }
    lset("session", nextSession);
    setUser(nextUser);
    setNeedsSetup(false);
  };
  const handleLogout = async () => {ldel("session");setUser(null);setGroup(null);setShowLanding(true);};
  const handleEnterGroup = async (g) => {
    const fresh = await sget(`group:${g.id}`);
    setGroup(fresh||g);
    setTab("League");
    lset("session",{...lget("session"),groupId:g.id,tab:"League"});
  };
  const handleLeaveGroup = () => {
    setGroup(null);
    lset("session",{username:lget("session")?.username});
  };
  const handleSetTab = useCallback((t)=>{setTab(t);lset("session",{...lget("session"),tab:t});},[]);
  const refreshGroup = useCallback(async()=>{if(!group)return;const fresh=await sget(`group:${group.id}`);if(fresh)setGroup(fresh);},[group?.id]);
  const updateGroup = useCallback(async(updater)=>{
    if(!group)return false;
    const fresh=await sget(`group:${group.id}`);
    const next=typeof updater==="function"?updater(fresh):updater;
    const ok=await sset(`group:${group.id}`,next);
    if(ok)setGroup(next);
    else showToast("Save failed - check your connection.");
    return ok;
  },[group?.id,showToast]);
  const patchGroup=useCallback(async(path,value)=>{
    if(!group)return false;
    const ok=await spatch(`group:${group.id}`,path,value);
    if(ok)setGroup(g=>applyPath(g,path,value));
    else showToast("Save failed - check your connection.");
    return ok;
  },[group?.id,showToast]);

  const isAdmin=!!(user&&group&&group.admins?.includes(user.username));
  const isCreator=!!(user&&group&&group.creatorUsername===user.username);
  return (
    <>
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
        <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg style={{animation:"ballspin 1s linear infinite"}} width="32" height="32" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 8L15.8043 10.7639M12 8L8.1958 10.7639M12 8V5M15.8043 10.7639L14.3512 15.2361M15.8043 10.7639L18.5 9.5M14.3512 15.2361H9.64889M14.3512 15.2361L16 17.5M9.64889 15.2361L8.1958 10.7639M9.64889 15.2361L8 17.5M8.1958 10.7639L5.5 9.5M5.5 9.5L2.04938 13M5.5 9.5L4.5 5.38544M18.5 9.5L21.9506 13M18.5 9.5L19.5 5.38544M12 5L8.62434 2.58409M12 5L15.3757 2.58409M8 17.5L3.33782 17M8 17.5L10.5 21.8883M16 17.5L20.6622 17M16 17.5L13.5 21.8883M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
        </div>
      ):bootError?(
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
      ):resetToken&&!resetDone?(
        <ResetPasswordScreen token={resetToken} onDone={()=>{
          window.history.replaceState({},"","/");
          setResetDone(true);
        }}/>
      ):!user&&showLanding&&!joinParam?(
        <LandingPage onContinue={()=>setShowLanding(false)} onDemo={handleDemoLogin} onAreBadTap={unlockSecretTheme}/>
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
          }}
          successMsg={resetDone?"Password updated - please sign in.":null}
          joinCode={joinParam}
        />
      ):!group?(
        <GroupLobby user={user} onEnterGroup={handleEnterGroup} onUpdateUser={u=>setUser(u)} onLogout={handleLogout} initialJoinCode={joinParam} onAreBadTap={unlockSecretTheme}/>
      ):(
        <GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin}
          isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout}
          updateGroup={updateGroup} patchGroup={patchGroup} refreshGroup={refreshGroup}
          theme={theme} setTheme={setTheme} unlockSecretTheme={unlockSecretTheme}/>
      )}
    </>
  );
}

/* ── GAME SHELL ──────────────────────────────────── */
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,updateGroup,patchGroup,refreshGroup,theme,setTheme,unlockSecretTheme}) {
  useEffect(()=>{refreshGroup();},[tab]);
  const [thumbs,setThumbs]=useState([]);
  const [badTapCount,setBadTapCount]=useState(0);
  const [names,setNames]=useState(()=>{
    const demoMap=Object.fromEntries(DEMO_MEMBERS.map(m=>[m.username,m.displayName]));
    const init={};
    (group.members||[]).forEach(u=>{init[u]=demoMap[u]||(u[0].toUpperCase()+u.slice(1));});
    init[user.username]=user.displayName;
    return init;
  });
  const [profileOpen,setProfileOpen]=useState(false);
  const [accountOpen,setAccountOpen]=useState(false);
  const [pwCurrent,setPwCurrent]=useState("");
  const [pwNew,setPwNew]=useState("");
  const [pwConfirm,setPwConfirm]=useState("");
  const [pwError,setPwError]=useState("");
  const [pwSuccess,setPwSuccess]=useState(false);
  const [pwLoading,setPwLoading]=useState(false);
  const profileRef=useRef(null);
  useEffect(()=>{
    if(!profileOpen)return;
    const handler=(e)=>{if(profileRef.current&&!profileRef.current.contains(e.target))setProfileOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[profileOpen]);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{const e=await Promise.all((group.members||[]).map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||(u[0].toUpperCase()+u.slice(1))];}));if(!cancelled)setNames(Object.fromEntries(e));})();
    return()=>{cancelled=true;};
  },[group.members?.join(",")]);

  const spawnThumb = (e) => {
    e.stopPropagation();
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
    setBadTapCount(c=>{
      const next = c + 1;
      if (next >= 7) {
        unlockSecretTheme?.();
        return 0;
      }
      return next;
    });
  };
  const updateNickname = async (targetUsername, newName) => {
    const fresh = await sget(`user:${targetUsername}`);
    if (!fresh) return;
    await sset(`user:${targetUsername}`, {...fresh, displayName: newName.trim()});
    setNames(n => ({...n, [targetUsername]: newName.trim()}));
  };
  const changePassword = async () => {
    if (!pwCurrent||!pwNew||!pwConfirm){setPwError("Fill in all fields.");return;}
    if (pwNew.trim().length<6){setPwError("Password must be at least 6 characters.");return;}
    if (pwNew!==pwConfirm){setPwError("New passwords do not match.");return;}
    setPwLoading(true);setPwError("");
    const fresh = await sget(`user:${user.username}`);
    if (!fresh||fresh.password!==pwCurrent){setPwError("Current password is incorrect.");setPwLoading(false);return;}
    await sset(`user:${user.username}`,{...fresh,password:pwNew});
    setPwSuccess(true);setPwLoading(false);
    setTimeout(()=>{setAccountOpen(false);setPwCurrent("");setPwNew("");setPwConfirm("");setPwSuccess(false);},2000);
  };
  const stats = useMemo(()=>computeStats(group),[group]);
  const myRank = stats.findIndex(s => s.username === user.username) + 1;
  const activeSeason = group.season || 2025;
  const completedGWs = (group.gameweeks || [])
    .filter(g => (g.season || activeSeason) === activeSeason && g.fixtures.length > 0 && g.fixtures.every(f => f.result || f.status === "POSTPONED"));
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
  const isWCGroup = (group.competition || "PL") === "WC";
  const nav = isWCGroup ? [...NAV.slice(0,2), "Bracket", ...NAV.slice(2)] : NAV;
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'DM Mono',monospace"}}>
      <style>{CSS}</style>
      <header style={{borderBottom:"1px solid var(--border)",padding:"0 20px",position:"sticky",top:0,background:"var(--bg)",zIndex:50}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",height:60,gap:0}}>
          <button onClick={onLeave} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,flexShrink:0,borderRight:"1px solid var(--border)",marginRight:20,padding:"0 16px 0 0",height:"100%"}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:"var(--text-bright)"}}>POINTS</span>
            <span onClick={spawnThumb} style={{fontSize:9,color:"var(--text-dim)",letterSpacing:3,cursor:"pointer",userSelect:"none"}}>are bad</span>
          </button>
          {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}
          <div className="mob-hide" style={{flex:1,fontSize:12,color:"var(--text-dim3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{group.name}</div>
          <div className="mob-hide" style={{fontSize:10,color:"#22c55e",letterSpacing:1,marginRight:12,background:"#22c55e15",border:"1px solid #22c55e25",borderRadius:4,padding:"3px 8px",flexShrink:0,display:"flex",alignItems:"center",gap:4}}><Flash size={11} color="#22c55e"/> API LIVE</div>

          <nav className="mob-hide" style={{display:"flex",gap:0,flexShrink:0}}>
            {nav.map(t=>(
              <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"var(--text-bright)":"var(--text-dim)",fontSize:10,letterSpacing:2,padding:"22px 12px 20px",textTransform:"uppercase"}}>{t}</button>
            ))}
          </nav>
          {user.username===DEMO_SHARED_USERNAME ? (
            <button onClick={onLogout} style={{marginLeft:"auto",height:"100%",background:"none",border:"none",borderLeft:"1px solid var(--border)",paddingLeft:20,cursor:"pointer",color:"#8888cc",fontSize:11,letterSpacing:1.5,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,flexShrink:0}}><LogOut size={13} color="#8888cc"/>EXIT DEMO</button>
          ) : (
          <div ref={profileRef} style={{position:"relative",display:"flex",alignItems:"center",marginLeft:"auto",borderLeft:"1px solid var(--border)",paddingLeft:20,height:"100%"}}>
            <button onClick={()=>setProfileOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:7,borderRadius:4}}>
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
  <div onClick={()=>setAccountOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:32,width:"100%",maxWidth:400}}>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:20}}>ACCOUNT</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:"1px solid var(--border3)"}}>
          <span style={{color:"var(--text-dim)"}}>Username</span><span style={{color:"var(--text-mid)"}}>{user.username}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:"1px solid var(--border3)"}}>
          <span style={{color:"var(--text-dim)"}}>Email</span><span style={{color:"var(--text-mid)"}}>{user.email||"—"}</span>
        </div>
      </div>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>CHANGE PASSWORD</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Input value={pwCurrent} onChange={setPwCurrent} placeholder="Current password" type="password" />
        <Input value={pwNew} onChange={setPwNew} placeholder="New password" type="password" />
        <Input value={pwConfirm} onChange={setPwConfirm} placeholder="Confirm new password" type="password" onKeyDown={e=>e.key==="Enter"&&changePassword()} />
      </div>
      {pwError&&<div style={{color:"#ef4444",fontSize:12,marginTop:10}}>{pwError}</div>}
      {pwSuccess&&<div style={{color:"#22c55e",fontSize:12,marginTop:10}}>Password updated.</div>}
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <Btn onClick={changePassword} disabled={pwLoading||pwSuccess} style={{flex:1,padding:"10px 0",textAlign:"center",letterSpacing:2}}>{pwLoading?"...":"SAVE"}</Btn>
        <Btn variant="ghost" onClick={()=>setAccountOpen(false)} style={{flex:1,padding:"10px 0",textAlign:"center"}}>Cancel</Btn>
      </div>
    </div>
  </div>,
  document.body
)}
      <nav className="bot-nav">
        {nav.map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"var(--text-bright)":"var(--text-dim)",fontSize:9,letterSpacing:1.5,padding:"6px 6px 0",textTransform:"uppercase",flex:1}}>{t}</button>
        ))}
      </nav>
      <main style={{maxWidth:940,margin:"0 auto",padding:"32px 20px"}} className="fade pad-bot" key={tab}>
        {recapContent && (
          <div style={{background:"#8888cc12",border:"1px solid #8888cc25",borderRadius:8,padding:"10px 16px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div style={{fontSize:11,color:"#8888cc",letterSpacing:1,flex:1,minWidth:0}}>
              <span style={{opacity:0.6,marginRight:10}}>{gwLabel(group,recapContent.gwNum)} RECAP</span>
              {recapContent.winners.length > 0 && <span style={{marginRight:8}}>{recapContent.winners.map(w => names[w.username] || w.username).join(" & ")} won the week <span style={{opacity:0.7}}>({recapContent.minPts} pts)</span></span>}
              {recapContent.totalGoals > 0 && <span style={{opacity:0.7}}>· {recapContent.totalGoals} goals total</span>}
              {recapContent.flavor && <span style={{opacity:0.9}}> · {recapContent.flavor}</span>}
            </div>
            <button onClick={() => { lset(recapKey, true); setRecapDismissed(true); }}
              style={{background:"none",border:"none",color:"#8888cc",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px",opacity:0.6,flexShrink:0}}>×</button>
          </div>
        )}
        {tab==="League"&&<LeagueTab group={group} user={user} names={names}/>}
        {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} updateGroup={updateGroup} patchGroup={patchGroup} names={names} theme={theme}/>}
        {tab==="Bracket"&&<WCBracketTab group={group}/>}
        {tab==="Trends"&&<TrendsTab group={group} names={names}/>}
        {tab==="Members"&&<MembersTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} names={names} updateNickname={updateNickname}/>}
        {tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} onLeave={onLeave} theme={theme} setTheme={setTheme} names={names}/>}
      </main>
    </div>
  );
}

/* ── WC BRACKET ──────────────────────────────────── */
function WCBracketTab({ group }) {
  const mob = useMobile();
  const SLOT_H = mob ? 36 : 56;
  const CARD_H = mob ? 28 : 46;
  const COL_W  = mob ? 108 : 152;
  const CONN_W = mob ? 12 : 22;
  const TOTAL_H = 16 * SLOT_H;

  const getGWFixtures = (gwNum) =>
    (group.gameweeks || []).find(g => g.gw === gwNum)?.fixtures || [];

  const winnerSide = (f) => {
    if (!f?.result) return null;
    const [h, a] = f.result.split("-").map(Number);
    return h > a ? "home" : a > h ? "away" : null;
  };

  const gw8 = getGWFixtures(8);
  const finalMatch = gw8.find(f => f.stage === "FINAL") || gw8[0] || null;
  const thirdMatch = gw8.find(f => f.stage === "THIRD_PLACE") || (gw8.length > 1 ? gw8[1] : null);

  const MatchCard = ({ f, blockH }) => {
    const winner = winnerSide(f);
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
        display:"flex",
        flexDirection:"column",
      }}>
        {["home","away"].map(side => {
          const team = f?.[side] || null;
          const crest = f?.[`${side}Crest`] || null;
          const score = f?.result ? f.result.split("-")[side==="home"?0:1] : null;
          const wins = winner === side;
          const loses = winner && winner !== side;
          return (
            <div key={side} style={{
              flex:1,display:"flex",alignItems:"center",gap:mob?3:5,padding:mob?"0 4px":"0 7px",
              borderBottom:side==="home"?"1px solid var(--border3)":"none",
              opacity:loses?0.38:1,
              background:wins?"var(--card-hi)":"transparent",
            }}>
              <TeamBadge team={team||"?"} crest={crest} size={mob?11:16} />
              <span style={{fontSize:mob?9:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:wins?"var(--text-bright)":"var(--text-mid)",fontWeight:wins?700:400}}>{team||"TBD"}</span>
              {score!=null&&<span style={{fontSize:mob?9:11,fontWeight:700,color:"var(--text-bright)",fontFamily:"'DM Mono',monospace",minWidth:mob?10:14,textAlign:"right"}}>{score}</span>}
            </div>
          );
        })}
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
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1}}>Bracket</h1>
          <p style={{color:"var(--text-dim)",fontSize:11,letterSpacing:2,marginTop:4}}>WORLD CUP 2026 · KNOCKOUT STAGE</p>
        </div>
      </div>
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
                      <MatchCard f={displayFixtures[i]||null} blockH={blockH}/>
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
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,overflow:"hidden",display:"flex",flexDirection:"column",maxWidth:COL_W,height:CARD_H}}>
            {["home","away"].map(side=>{
              const team = thirdMatch[side]||null;
              const crest = thirdMatch[`${side}Crest`]||null;
              const score = thirdMatch.result ? thirdMatch.result.split("-")[side==="home"?0:1] : null;
              const winner = winnerSide(thirdMatch);
              const wins = winner===side;
              const loses = winner && winner!==side;
              return (
                <div key={side} style={{flex:1,display:"flex",alignItems:"center",gap:5,padding:"0 7px",borderBottom:side==="home"?"1px solid var(--border3)":"none",opacity:loses?0.38:1,background:wins?"var(--card-hi)":"transparent"}}>
                  <TeamBadge team={team||"?"} crest={crest} size={16}/>
                  <span style={{fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:wins?"var(--text-bright)":"var(--text-mid)",fontWeight:wins?700:400}}>{team||"TBD"}</span>
                  {score!=null&&<span style={{fontSize:11,fontWeight:700,color:"var(--text-bright)",fontFamily:"'DM Mono',monospace"}}>{score}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── LEAGUE ──────────────────────────────────────── */
function LeagueTab({group,user,names}) {
  const mob = useMobile();
  const stats = useMemo(()=>computeStats(group),[group]);
  const titles = useMemo(()=>computeGroupRelativeTitles(group, stats),[group, stats]);
  const totalResults = (group.gameweeks||[]).reduce((a,g)=>a+g.fixtures.filter(f=>f.result).length,0);
  return (
    <div>
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:32}}>
        <div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:mob?28:38,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1}}>Standings</h1>
          <p style={{color:"var(--text-dim)",fontSize:11,letterSpacing:2,marginTop:4}}>{totalResults} RESULTS COUNTED · LOWER IS BETTER</p>
        </div>
      </div>
      {stats.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"var(--text-dim)"}}>No members yet.</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {stats.map((p,i)=>{
            const title = titles[p.username];
            return (
            <div key={p.username} style={{display:"grid",gridTemplateColumns:mob?"40px 1fr 80px":"52px 1fr 80px 80px 90px",alignItems:"center",gap:mob?8:12,padding:mob?"12px 14px":"16px 20px",background:p.username===user.username?"var(--card-hi)":"var(--card)",borderRadius:10,border:`1px solid ${p.username===user.username?"var(--border2)":"var(--border3)"}`}}>
              <div style={{textAlign:"center"}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:i<3?(mob?18:22):(mob?13:16),fontWeight:900,color:i===0?"#fbbf24":i===1?"#9ca3af":i===2?"#b45309":"var(--text-dim)"}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:mob?8:12,minWidth:0}}>
                <Avatar name={names[p.username]||p.username} size={mob?28:34} color={PALETTE[(group.members||[]).indexOf(p.username)%PALETTE.length]}/>
                <div style={{display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0,flex:1,overflow:"visible",position:"relative",zIndex:1}}>
                  <div style={{fontSize:mob?12:14,color:p.username===user.username?"#8888cc":"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",lineHeight:1.2}}>{names[p.username]||p.username}{p.username===user.username&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:6}}>you</span>}</div>
                  <TitleBadge title={title} />
                </div>
              </div>
              {!mob&&<div style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>PERFECT</div><div style={{color:"#22c55e",fontWeight:700}}>{p.perfects}</div></div>}
              {!mob&&<div style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>AVG</div><div style={{color:"var(--text-mid)"}}>{p.avg}</div></div>}
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>PTS</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:mob?22:28,fontWeight:900,color:i===0?"#fbbf24":"var(--text-bright)",lineHeight:1}}>{p.total}</div></div>
            </div>
          )})}
        </div>
      )}
    </div>
  );
}

/* ── FIXTURES ────────────────────────────────────── */
function NextMatchCountdown({ group, myPreds = {} }) {
  const [now, setNow] = useState(new Date());
  const [expanded, setExpanded] = useState(false);
  const mob = useMobile();
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = (group.gameweeks || [])
    .flatMap(gw => gw.fixtures || [])
    .filter(f => f.date && !f.result && f.status !== "FINISHED" && f.status !== "IN_PLAY" && f.status !== "PAUSED" && new Date(f.date) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  if (!next) return null;

  const diff = new Date(next.date) - now;
  const hasPick = !!myPreds[next.id];
  const urgent = !hasPick && diff < 3 * 3600000;
  const warning = !hasPick && diff < 24 * 3600000;
  const label = warning ? "Picks due" : "Next kick-off";
  const deadpanLine = null;
  const borderColor = urgent ? "#ef444435" : warning ? "#f59e0b35" : "var(--border3)";
  const bgColor = urgent ? "#ef444408" : warning ? "#f59e0b08" : "var(--card)";
  const textColor = urgent ? "#ef4444" : warning ? "#f59e0b" : "var(--text-dim)";
  const timerColor = urgent ? "#ef4444" : warning ? "#f59e0b" : "var(--text-bright)";
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

  if (mob) return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 14px",marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
        <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
        {timerEl}
      </div>
      <div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>{deadpanLine}</div>
      <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--text-mid)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6,flex:1,minWidth:0}}>
          <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.home}</span>
          <TeamBadge team={next.home} crest={next.homeCrest} size={22} />
        </div>
        <span style={{color:"var(--text-dim)",flexShrink:0}}>vs</span>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:6,flex:1,minWidth:0}}>
          <TeamBadge team={next.away} crest={next.awayCrest} size={22} />
          <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.away}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 14px",marginBottom:18,display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase",lineHeight:1.3}}>{label}</div>
        <div style={{fontSize:9,color:"var(--text-dim3)",letterSpacing:1,textTransform:"uppercase",lineHeight:1.3,marginTop:4}}>{deadpanLine}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,minWidth:0,fontSize:13,color:"var(--text-mid)"}}>
        <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.home}</span>
        <TeamBadge team={next.home} crest={next.homeCrest} size={22} />
      </div>
      <div style={{textAlign:"center",fontSize:13,color:"var(--text-dim)"}}>vs</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8,minWidth:0,fontSize:13,color:"var(--text-mid)"}}>
        <TeamBadge team={next.away} crest={next.awayCrest} size={22} />
        <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{next.away}</span>
      </div>
      <div style={{gridColumn:"5/7"}}>{timerEl}</div>
    </div>
  );
}

function FixturesTab({group,user,isAdmin,updateGroup,patchGroup,names,theme}) {
  const mob = useMobile();
  const gwStripRef = useRef(null);
  const pickInputRefs = useRef({});
  const [resultDraft,setResultDraft]=useState({});
  const [predDraft,setPredDraft]=useState({});
  const [saving,setSaving]=useState({});
  const [fetching,setFetching]=useState(false);
  const [fetchMsg,setFetchMsg]=useState("");
  const [wizardQueue, setWizardQueue] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [deleteGWStep, setDeleteGWStep] = useState(0);
  const [removeGWStep, setRemoveGWStep] = useState(0);
  const [wizardPred, setWizardPred] = useState("");
  const wizardKey = `wizard-seen:${group.id}:${user.username}`;
  const activeSeason = group.season||2025;
  const isWC = (group.competition||"PL") === "WC";
  const [viewGW, setViewGW] = useState(()=>{
    const now = new Date();
    const seas = group.season||2025;
    const seasonGWs = (group.gameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
    for (const gwObj of seasonGWs) {
      if ((gwObj.fixtures||[]).some(f=>f.date&&!f.result&&f.status!=="FINISHED"&&f.status!=="IN_PLAY"&&f.status!=="PAUSED"&&new Date(f.date)>now)) return gwObj.gw;
    }
    const withResults = seasonGWs.filter(gwObj=>(gwObj.fixtures||[]).some(f=>f.result));
    if (withResults.length) return withResults[withResults.length-1].gw;
    return group.currentGW||1;
  });
  const currentGW = viewGW;
  const gwFixtures = (group.gameweeks||[]).find(g=>g.gw===currentGW&&(g.season||activeSeason)===activeSeason)?.fixtures||[];
  const picksLocked = !!(group.picksLocked?.[user.username]?.[activeSeason]?.[currentGW]);
  const allFixturesFinished = gwFixtures.length>0 && gwFixtures.every(f=>{
    const hiddenPostponed = (group.hiddenFixtures||[]).includes(f.id) && f.status === "POSTPONED";
    return !!f.result || hiddenPostponed;
  });
  const myPreds = group.predictions?.[user.username]||{};
  const hasApiKey = true; // Global API key always active
  const gwAdminLocked = !isAdmin && (group.hiddenGWs||[]).includes(currentGW);
  const dibsTurnFor = group.mode==="dibs"
    ? Object.fromEntries(gwFixtures.map(f=>[f.id, computeDibsTurn(group,f.id)]))
    : {};
  const unpickedUnlocked = gwAdminLocked ? [] : gwFixtures.filter(f=>{
    const hiddenPostponed = (group.hiddenFixtures||[]).includes(f.id) && f.status === "POSTPONED";
    const locked=hiddenPostponed||!!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||f.status==="POSTPONED"||(f.date&&new Date(f.date)<=new Date()));
    if (locked) return false;
    if (myPreds[f.id]) return false;
    if (group.mode==="dibs" && dibsTurnFor[f.id] !== user.username) return false;
    return true;
  });
  const canViewAllPicks = unpickedUnlocked.length===0;

  const savePred = async (fixtureId, val) => {
    const f = gwFixtures.find(fx => fx.id === fixtureId);
    const locked = !!(f?.result || f?.status==="FINISHED" || f?.status==="IN_PLAY" || f?.status==="PAUSED" || (f?.date && new Date(f.date) <= new Date()));
    if (locked) return;
    if (!/^\d+-\d+$/.test(val)) return;
    // Dibs mode checks
    if (group.mode === "dibs") {
      const turn = computeDibsTurn(group, fixtureId);
      if (turn !== user.username) return; // not your turn
      // block duplicate scoreline
      const taken = Object.entries(group.predictions || {})
        .filter(([u]) => u !== user.username)
        .some(([, picks]) => /^\d+-\d+$/.test(picks?.[fixtureId] || "") && picks[fixtureId] === val);
      if (taken) {
        alert(`"${val}" has already been claimed for this match. Pick a different scoreline.`);
        setPredDraft(d => ({...d, [fixtureId]: myPreds[fixtureId] || ""}));
        return;
      }
    }
    if (val === "1-1") {
      const limit = group.draw11Limit || "unlimited";
      if (limit !== "unlimited") {
        const max = limit === "none" ? 0 : parseInt(limit);
        const used = gwFixtures.filter(f => f.id !== fixtureId && myPreds[f.id] === "1-1").length;
        if (used >= max) {
          alert(max === 0
            ? "1-1 predictions are not allowed in this group."
            : `You can only make ${max} 1-1 prediction${max > 1 ? "s" : ""} per gameweek. Limit reached.`);
          setPredDraft(d => ({...d, [fixtureId]: myPreds[fixtureId] || ""}));
          return;
        }
      }
    }
    setSaving(s=>({...s,[fixtureId]:true}));
    await updateGroup(g => {
      if (g.mode === "dibs") {
        const freshTurn = computeDibsTurn(g, fixtureId);
        if (freshTurn !== user.username) return g;
        const takenFresh = Object.entries(g.predictions || {})
          .filter(([u]) => u !== user.username)
          .some(([, picks]) => picks?.[fixtureId] === val);
        if (takenFresh) return g;
      }
      const p = {...(g.predictions || {})};
      p[user.username] = {...(p[user.username] || {}), [fixtureId]: val};
      return {...g, predictions: p};
    });
    setPredDraft(d=>{const n={...d};delete n[fixtureId];return n;});
    setSaving(s=>{const n={...s};delete n[fixtureId];return n;});
  };

  const saveResult = async (fixtureId) => {
    const val = resultDraft[fixtureId];
    if (!val||!/^\d+-\d+$/.test(val)) return;
    await updateGroup(g=>{
      const fixture = (g.gameweeks||[]).flatMap(gw=>gw.fixtures).find(f=>f.id===fixtureId);
      const oldVal = fixture?.result||null;
      if (oldVal===val) return {...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:val}:f)}))};
      const entry={id:Date.now(),at:Date.now(),by:user.username,action:"result",fixture:fixture?`${fixture.home} vs ${fixture.away}`:fixtureId,gw:currentGW,old:oldVal,new:val};
      return {...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:val}:f)})),adminLog:[...(g.adminLog||[]),entry]};
    });
    setResultDraft(d=>{const n={...d};delete n[fixtureId];return n;});
  };

  const clearResult = async (fixtureId) => {
    await updateGroup(g=>{
      const fixture = (g.gameweeks||[]).flatMap(gw=>gw.fixtures).find(f=>f.id===fixtureId);
      const entry={id:Date.now(),at:Date.now(),by:user.username,action:"result-clear",fixture:fixture?`${fixture.home} vs ${fixture.away}`:fixtureId,gw:currentGW,old:fixture?.result||null,new:null};
      return {...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:null}:f)})),adminLog:[...(g.adminLog||[]),entry]};
    });
  };

  const toggleFixtureHidden = async (fixtureId) => {
    await updateGroup(g=>{
      const h = g.hiddenFixtures||[];
      return {...g, hiddenFixtures: h.includes(fixtureId) ? h.filter(id=>id!==fixtureId) : [...h, fixtureId]};
    });
  };

  const fetchFromAPI = async () => {
    const isWC = (group.competition||"PL") === "WC";
    const roundLabel = gwLabel(group, currentGW);
    setFetching(true); setFetchMsg(`Syncing ${roundLabel} from football-data.org...`);
    try {
      const seas = group.season||2025;
      const liveFixtures = gwFixtures.filter(f=>f.status==="IN_PLAY"||f.status==="PAUSED");
      if (liveFixtures.length>0) {
        setFetchMsg(`Fetching live scores for ${liveFixtures.length} match${liveFixtures.length>1?"es":""}...`);
        const liveMatches = await fetchLiveMatches();
        if (liveMatches.length>0) {
          const liveByApiId = Object.fromEntries(liveMatches.map(m=>[String(m.id),m]));
          const liveByTeams = Object.fromEntries(liveMatches.map(m=>[`${normName(m.homeTeam?.name||m.homeTeam?.shortName)}|${normName(m.awayTeam?.name||m.awayTeam?.shortName)}`,m]));
          await updateGroup(g=>{
            return {...g, gameweeks:g.gameweeks.map(gw=>{
              if(gw.gw!==currentGW||(gw.season||seas)!==seas) return gw;
              return {...gw, fixtures:gw.fixtures.map(f=>{
                const lm = (f.apiId&&liveByApiId[String(f.apiId)]) || liveByTeams[`${f.home}|${f.away}`];
                if(!lm) return f;
                const score = lm.score?.fullTime;
                const liveScore = score?.home!=null && score?.away!=null ? `${score.home}-${score.away}` : null;
                return {...f, status:lm.status, result:lm.status==="FINISHED"?liveScore:f.result, liveScore:lm.status==="FINISHED"?null:liveScore};
              })};
            })};
          });
        }
        setFetchMsg(`Syncing ${roundLabel} from football-data.org...`);
      }
      const comp = isWC ? "WC" : "PL";
      const fetchSeason = isWC ? 2026 : seas;
      const matches = await fetchMatchweek(group.apiKey, currentGW, fetchSeason, comp);
      if (!matches.length) { setFetchMsg("No matches found for this round."); setFetching(false); return; }
      const apiFixtures = parseMatchesToFixtures(matches, currentGW, comp);
      const globalKey = isWC ? `fixtures:WC:2026` : `fixtures:PL:${seas}`;
      const existingGlobal = await sget(globalKey)||{season:fetchSeason,updatedAt:0,gameweeks:[]};
      let updatedGlobal;
      if (isWC) {
        // WC: direct replacement, no regroupGlobalDoc
        const otherGWs = (existingGlobal.gameweeks||[]).filter(g=>g.gw!==currentGW);
        updatedGlobal = {...existingGlobal, updatedAt:Date.now(), gameweeks:[...otherGWs,{gw:currentGW,fixtures:apiFixtures}]};
      } else {
        updatedGlobal = regroupGlobalDoc(existingGlobal, currentGW, apiFixtures);
      }
      await sset(globalKey, updatedGlobal);
      await updateGroup(g => {
        const s = g.season || 2025;
        const gwObj = (g.gameweeks||[]).find(gw=>gw.gw===currentGW&&(gw.season||s)===s);
        const oldFixtures = gwObj?.fixtures||[];
        const allTBD = oldFixtures.length>0 && oldFixtures.every(f=>f.home==="TBD"&&f.away==="TBD");
        if (allTBD) {
          return {...g, gameweeks:g.gameweeks.map(gw=>gw.gw===currentGW&&(gw.season||s)===s?{...gw,fixtures:apiFixtures}:gw)};
        }
        const oldByApiId = {};
        const oldByTeams = {};
        oldFixtures.forEach(f=>{
          if(f.apiId) oldByApiId[String(f.apiId)]=f;
          oldByTeams[`${f.home}|${f.away}`]=f;
        });
        const matchedIds = new Set();
        const working = [...oldFixtures];
        const toAdd = [];
        apiFixtures.forEach(af=>{
          const existing = (af.apiId&&oldByApiId[String(af.apiId)]) || oldByTeams[`${af.home}|${af.away}`];
          if (existing) {
            matchedIds.add(existing.id);
            const idx = working.findIndex(f=>f.id===existing.id);
            if (idx>=0) working[idx]={...existing,result:af.result,status:af.status,date:af.date,apiId:af.apiId,home:af.home,away:af.away};
          } else {
            toAdd.push(af);
          }
        });
        const preds = g.predictions||{};
        const hasPick = id => Object.values(preds).some(up=>up[id]!==undefined);
        const gwHasPicks = oldFixtures.some(f=>hasPick(f.id));
        const finalFixtures = [...working.filter(f=>matchedIds.has(f.id)||hasPick(f.id)), ...(gwHasPicks?[]:toAdd)];
        return {...g, gameweeks:g.gameweeks.map(gw=>gw.gw===currentGW&&(gw.season||s)===s?{...gw,fixtures:finalFixtures}:gw)};
      });
      const finished = apiFixtures.filter(f=>f.result).length;
      await updateGroup(g=>{const entry={id:Date.now(),at:Date.now(),by:user.username,action:"api-sync",gw:currentGW,fixtures:apiFixtures.length,results:finished};return {...g,adminLog:[...(g.adminLog||[]),entry]};});
      setFetchMsg(`✓ Updated ${apiFixtures.length} fixtures${finished>0?`, ${finished} with results`:""}.`);
    } catch(e) { setFetchMsg(`Error: ${e.message}`); }
    setFetching(false);
    setTimeout(()=>setFetchMsg(""),6000);
  };

  const deleteGW = async () => {
    const seas0 = group.season || 2025;
    const gwToClear = currentGW;
    await updateGroup(g=>{
      const seas = g.season || seas0;
      const gwObj = (g.gameweeks||[]).find(gw=>gw.gw===gwToClear&&(gw.season||seas)===seas);
      const fixtureIds = new Set((gwObj?.fixtures||[]).map(f=>f.id));
      const isWC = (g.competition||"PL") === "WC";
      const prefix = isWC ? "wc-" : seas!==2025?`${seas}-`:"";
      const freshFixtures = isWC
        ? []  // WC: empty array (rounds have no fallback fixtures; sync will fill them)
        : Array.from({length:10},(_,i)=>({id:`${prefix}gw${gwToClear}-f${i}`,home:"TBD",away:"TBD",result:null,status:"SCHEDULED"}));
      const preds = {...(g.predictions||{})};
      Object.keys(preds).forEach(u=>{
        const up = {...preds[u]};
        fixtureIds.forEach(id=>{delete up[id];});
        preds[u] = up;
      });
      return {...g, gameweeks:g.gameweeks.map(gw=>gw.gw===gwToClear&&(gw.season||seas)===seas ? {...gw,fixtures:freshFixtures} : gw), predictions:preds};
    });
    setDeleteGWStep(0);
  };

  const removeGW = async () => {
    const seas0 = group.season || 2025;
    const gwToRemove = currentGW;
    await updateGroup(g=>{
      const seas = g.season || seas0;
      const gwObj = (g.gameweeks||[]).find(gw=>gw.gw===gwToRemove&&(gw.season||seas)===seas);
      const fixtureIds = new Set((gwObj?.fixtures||[]).map(f=>f.id));
      const preds = {...(g.predictions||{})};
      Object.keys(preds).forEach(u=>{
        const up = {...preds[u]};
        fixtureIds.forEach(id=>{delete up[id];});
        preds[u] = up;
      });
      const remaining = (g.gameweeks||[]).filter(gw=>!(gw.gw===gwToRemove&&(gw.season||seas)===seas));
      const newCurrentGW = remaining.filter(gw=>(gw.season||seas)===seas).sort((a,b)=>b.gw-a.gw)[0]?.gw || 1;
      return {...g, gameweeks:remaining, predictions:preds, currentGW:newCurrentGW};
    });
    setRemoveGWStep(0);
  };

  const setGW = (gw) => {setDeleteGWStep(0);setRemoveGWStep(0);setViewGW(gw);};

  useEffect(()=>{
    const seas = group.season||2025;
    const exists = (group.gameweeks||[]).some(g=>g.gw===viewGW&&(g.season||seas)===seas);
    if (!exists) setViewGW(group.currentGW||1);
  },[group.gameweeks]);

  useEffect(()=>{
    if (!gwStripRef.current) return;
    const seas = group.season||2025;
    const seasonGWs = (group.gameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
    const idx = seasonGWs.findIndex(g=>g.gw===viewGW);
    if (idx<0) return;
    const pos = idx*57 - gwStripRef.current.clientWidth/2 + 27;
    gwStripRef.current.scrollLeft = Math.max(0, pos);
  },[]);

  useEffect(()=>{
    if (lget(wizardKey)===currentGW) return;
    if (!isAdmin && (group.hiddenGWs||[]).includes(currentGW)) { setWizardQueue(null); return; }
    const activeSeason = group.season||2025;
    const now = new Date();
    let nearestUpcomingGW = null;
    let nearestDate = null;
    for (const gwObj of (group.gameweeks||[]).filter(g=>(g.season||activeSeason)===activeSeason)) {
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
  },[currentGW,group.id]);

  useEffect(()=>{
    const seas = group.season||2025;
    const isWC = (group.competition||"PL") === "WC";
    const globalKey = isWC ? `fixtures:WC:2026` : `fixtures:PL:${seas}`;
    const incompleteGWs=(group.gameweeks||[])
      .filter(gw=>(gw.season||seas)===seas&&(gw.fixtures||[]).some(f=>!f.result));
    if(!incompleteGWs.length) return;
    const targetGW=Math.max(...incompleteGWs.map(gw=>gw.gw));
    (async()=>{
      try {
        let globalDoc=await sget(globalKey)||{season:seas,updatedAt:0,gameweeks:[]};
        const now=Date.now();
        const existingGWNums=new Set((globalDoc.gameweeks||[]).map(g=>g.gw));
        const missingPast=Array.from({length:targetGW-1},(_,i)=>i+1).some(n=>!existingGWNums.has(n));
        if(isWC){
          // WC: direct replacement (no regroupGlobalDoc), separate cooldown keys
          const fullSyncKey=`fixtures-full-sync:WC:2026`;
          if(missingPast){
            const lastFull=lget(fullSyncKey);
            if(!lastFull||(now-lastFull)>86_400_000){
              const allMatches=await fetchMatchweek(group.apiKey,null,2026,"WC");
              if(!allMatches.length) return;
              lset(fullSyncKey,now);
              const byGW={};
              allMatches.forEach(m=>{const gw=m.matchday;if(!byGW[gw])byGW[gw]=[];byGW[gw].push(m);});
              let updated={...globalDoc};
              const otherGWs=(updated.gameweeks||[]).filter(g=>!byGW[g.gw]);
              const newGWs=Object.entries(byGW).map(([gw,ms])=>{
                const gwNum=Number(gw);
                return {gw:gwNum,fixtures:parseMatchesToFixtures(ms,gwNum,"WC")};
              });
              updated={...updated,updatedAt:now,gameweeks:[...otherGWs,...newGWs]};
              globalDoc=updated;
              await sset(globalKey,globalDoc);
            }
          } else {
            const cooldownKey=`gw-api-sync:WC:2026:${targetGW}`;
            const lastSync=lget(cooldownKey);
            if(!lastSync||(now-lastSync)>3_600_000){
              const matches=await fetchMatchweek(group.apiKey,targetGW,2026,"WC");
              if(!matches.length) return;
              const apiFixtures=parseMatchesToFixtures(matches,targetGW,"WC");
              lset(cooldownKey,now);
              const otherGWs=(globalDoc.gameweeks||[]).filter(g=>g.gw!==targetGW);
              globalDoc={...globalDoc,updatedAt:now,gameweeks:[...otherGWs,{gw:targetGW,fixtures:apiFixtures}]};
              await sset(globalKey,globalDoc);
            }
          }
        } else {
          // PL: unchanged path
          const fullSyncKey=`fixtures-full-sync:${seas}`;
          if(missingPast){
            const lastFull=lget(fullSyncKey);
            if(!lastFull||(now-lastFull)>86_400_000){
              const allMatches=await fetchMatchweek(group.apiKey,null,seas);
              if(!allMatches.length) return;
              lset(fullSyncKey,now);
              const byGW={};
              allMatches.forEach(m=>{const gw=m.matchday;if(!byGW[gw])byGW[gw]=[];byGW[gw].push(m);});
              let updated={...globalDoc};
              Object.entries(byGW).forEach(([gw,ms])=>{
                const gwNum=Number(gw);
                updated=regroupGlobalDoc(updated,gwNum,parseMatchesToFixtures(ms,gwNum));
              });
              globalDoc=updated;
              await sset(globalKey,globalDoc);
            }
          } else {
            const cooldownKey=`gw-api-sync:${seas}:${targetGW}`;
            const lastSync=lget(cooldownKey);
            if(!lastSync||(now-lastSync)>3_600_000){
              const matches=await fetchMatchweek(group.apiKey,targetGW,seas);
              if(!matches.length) return;
              const apiFixtures=parseMatchesToFixtures(matches,targetGW);
              lset(cooldownKey,now);
              globalDoc=regroupGlobalDoc(globalDoc,targetGW,apiFixtures);
              await sset(globalKey,globalDoc);
            }
          }
        }
        if(globalDoc.updatedAt<=(group.lastAutoSync||0)) return;
        await updateGroup(g=>mergeGlobalIntoGroup(globalDoc,g));
      } catch(_){}
    })();
  },[activeSeason,group.currentGW]);

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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:16,padding:"36px 32px",maxWidth:420,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:13,color:"var(--text-dim)",letterSpacing:2,marginBottom:24}}>{gwLabel(group,currentGW)} · {wizardQueue.length-wizardStep} MATCH{wizardQueue.length-wizardStep!==1?"ES":""} TO PICK</div>
            <div style={{display:"flex",justifyContent:"center",gap:12,alignItems:"center",marginBottom:24}}>
              <div style={{textAlign:"right",flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:"var(--text-bright)",letterSpacing:-0.5}}>{wizardFixture.home}</span>
                <TeamBadge team={wizardFixture.home} crest={wizardFixture.homeCrest} size={22}/>
              </div>
              <span style={{fontSize:12,color:"var(--text-dim)",letterSpacing:3,flexShrink:0}}>VS</span>
              <div style={{textAlign:"left",flex:1,display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8}}>
                <TeamBadge team={wizardFixture.away} crest={wizardFixture.awayCrest} size={22}/>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:"var(--text-bright)",letterSpacing:-0.5}}>{wizardFixture.away}</span>
              </div>
            </div>
            {wizardFixture.date&&<div style={{fontSize:13,color:"var(--text-dim)",marginBottom:20}}>{new Date(wizardFixture.date).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
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
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1}}>{(group.competition||"PL")==="WC" ? gwLabel(group,currentGW) : `Gameweek ${currentGW}`}</h1>
        <div className="gw-outer" style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <div className="gw-controls" style={{display:"flex",alignItems:"center",gap:3}}>
            <button onClick={()=>gwStripRef.current&&gwStripRef.current.scrollBy({left:-gwStripRef.current.clientWidth,behavior:"smooth"})} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim2)",cursor:"pointer",fontSize:13,padding:"4px 8px",lineHeight:1,flexShrink:0}}>‹</button>
            <div ref={gwStripRef} className="gw-strip" style={{display:"flex",gap:3,maxWidth:396,overflowX:"auto",flex:1}}>
              {(group.gameweeks||[]).filter(g=>(g.season||group.season||2025)===(group.season||2025)).sort((a,b)=>a.gw-b.gw).map(g=>{
                const adminHidden = !isAdmin && (group.hiddenGWs||[]).includes(g.gw);
                return (
                  <button key={g.gw} onClick={()=>setGW(g.gw)} style={{
                    background:currentGW===g.gw?"var(--btn-bg)":"var(--card)",
                    color:currentGW===g.gw?"var(--btn-text)":"var(--text-dim2)",
                    border:"1px solid var(--border)",
                    borderRadius:6,
                    padding:"5px 0",
                    fontSize:11,
                    cursor:"pointer",
                    fontFamily:"inherit",
                    letterSpacing:1,
                    flexShrink:0,
                    minWidth:54,
                    textAlign:"center",
                    opacity:adminHidden?0.4:1,
                  }}>
                    {adminHidden&&<Lock size={10} color="currentColor" style={{marginRight:3}}/>}{isWC?`R${g.gw}`:gwLabel(group,g.gw)}
                  </button>
                );
              })}
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
          {isAdmin&&<Btn variant={hasApiKey?"amber":"muted"} small onClick={fetchFromAPI} disabled={fetching} style={{display:"flex",alignItems:"center",gap:5}}>{fetching?"Fetching...":<><Sync size={12} color="currentColor"/>{hasApiKey?"Sync Fixtures":"Sync (needs API key)"}</>}</Btn>}
        </div>
      </div>

      {fetchMsg&&<div style={{background:fetchMsg.startsWith("✓")?"#22c55e12":"#ef444412",border:`1px solid ${fetchMsg.startsWith("✓")?"#22c55e35":"#ef444435"}`,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:fetchMsg.startsWith("✓")?"#22c55e":"#ef4444"}}>{fetchMsg}</div>}

      {isAdmin&&<div style={{background:"#f59e0b10",border:"1px solid #f59e0b25",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#f59e0b",letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
        <Flash size={12} color="#f59e0b" style={{flexShrink:0}}/> ADMIN · {hasApiKey?"Click 'Sync Fixtures' to auto-load matches and results.":"Add your football-data.org API key in the Group tab."}
      </div>}

      <NextMatchCountdown group={group} myPreds={myPreds} />

      {gwAdminLocked && (
        <div style={{background:"#ef444410",border:"1px solid #ef444430",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#ef4444",letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
          <Lock size={12} color="#ef4444"/> THIS GAMEWEEK IS LOCKED BY YOUR ADMIN
        </div>
      )}

      {!mob&&<div style={{display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,padding:"6px 14px",fontSize:10,color:"var(--text-dim)",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
        <div></div>
        <div style={{textAlign:"right"}}>Home</div>
        <div style={{textAlign:"center"}}>Result</div>
        <div>Away</div>
        <div style={{textAlign:"center"}}>Your Pick</div>
        <div style={{textAlign:"center"}}>Pts</div>
      </div>}

      {gwFixtures.length===0?<div style={{color:"var(--text-dim)",textAlign:"center",padding:60}}>No fixtures. {isAdmin&&"Create all 38 GWs in the Group tab, then sync from API."}</div>:gwFixtures.map(f=>{
        const myPred = predDraft[f.id]!==undefined?predDraft[f.id]:(myPreds[f.id]||"");
        const [draftHome, draftAway] = String(myPred).split("-");
        const pts = calcPts(myPreds[f.id],f.result);
        const effectivePts = pts!==null?pts:(f.result&&!myPreds[f.id]?MISSED_PICK_PTS:null);
        const hardLocked = gwAdminLocked || !!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||f.status==="POSTPONED"||(f.date&&new Date(f.date)<=new Date()));
        const locked = hardLocked || picksLocked;
        const lockReason = hardLocked?gwAdminLocked?"admin locked":f.status==="IN_PLAY"||f.status==="PAUSED"?"in play":f.status==="POSTPONED"?"postponed":f.result||f.status==="FINISHED"?"result set":"kicked off":picksLocked?"picks locked":null;
        const dateStr = f.date?new Date(f.date).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):null;
        const searchHref = `https://www.google.com/search?q=${encodeURIComponent(f.home+" vs "+f.away)}`;
        const isHidden = (group.hiddenFixtures||[]).includes(f.id);
        const isLive = f.status==="IN_PLAY"||f.status==="PAUSED";
        const scoreStr = f.result||f.liveScore;
        const scoreParts = scoreStr ? scoreStr.split("-") : null;
        const resultBlock = scoreParts?(
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",width:"100%"}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--text-bright)",textAlign:"right",letterSpacing:0}}>{scoreParts[0]}</span>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--text-bright)",padding:"0 3px"}}>{"–"}</span>
            <span style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--text-bright)",letterSpacing:0}}>{scoreParts[1]}</span>
              {f.status==="FINISHED"&&<span style={{fontSize:9,color:"#22c55e",letterSpacing:1,opacity:0.6}}>FT</span>}
              {isLive&&<span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,animation:"pulse 1.5s infinite"}}>LIVE</span>}
              {isAdmin&&!hasApiKey&&<button onClick={()=>clearResult(f.id)} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:10,padding:0}}>✕</button>}
            </span>
          </div>
        ):f.status==="POSTPONED"?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,opacity:0.8}}>POSTPONED</span>
            {isAdmin&&<button onClick={()=>toggleFixtureHidden(f.id)} title={isHidden?"Show in picks table":"Hide from picks table"} style={{background:"#f59e0b20",border:"1px solid #f59e0b40",borderRadius:4,cursor:"pointer",lineHeight:1,padding:"4px 6px",color:"#f59e0b",transition:"all 0.15s",display:"flex",alignItems:"center",opacity:isHidden?0.4:1}}>{isHidden?<EyeOff size={14} color="#f59e0b"/>:<Eye size={14} color="#f59e0b"/>}</button>}
          </div>
        ):isAdmin&&!hasApiKey?(
          <div style={{display:"flex",gap:4,justifyContent:"center"}}>
            <input placeholder="0-0" value={resultDraft[f.id]||""} onChange={e=>setResultDraft(d=>({...d,[f.id]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveResult(f.id)}
              style={{width:56,background:"var(--input-bg)",border:"1px solid var(--border2)",borderRadius:6,color:"#f59e0b",padding:"5px 6px",fontFamily:"inherit",fontSize:12,textAlign:"center",outline:"none"}}/>
            <button onClick={()=>saveResult(f.id)} style={{background:"#22c55e18",border:"1px solid #22c55e35",borderRadius:6,color:"#22c55e",cursor:"pointer",padding:"5px 7px",fontSize:11}}>✓</button>
          </div>
        ):isAdmin&&hasApiKey?(
          <span style={{color:"var(--text-dim)",fontSize:11}}>sync ↑</span>
        ):<span style={{color:"var(--text-dim)",fontSize:11}}>TBD</span>;
        const isMyDibsTurn = group.mode !== "dibs" || dibsTurnFor[f.id] === user.username;
        const waitingFor = group.mode === "dibs" && !locked && !isMyDibsTurn ? dibsTurnFor[f.id] : null;
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
              : (f.result||f.status==="IN_PLAY"||f.status==="PAUSED")
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
              style={{width:mob?30:26,background:"var(--input-bg)",borderRadius:6,textAlign:"center",border:`1px solid ${myPreds[f.id]?"#8888cc55":"var(--border2)"}`,color:"#8888cc",padding:"5px 0",fontFamily:"inherit",fontSize:mob?16:12,outline:"none"}}
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
              style={{width:mob?30:26,background:"var(--input-bg)",borderRadius:6,textAlign:"center",border:`1px solid ${myPreds[f.id]?"#8888cc55":"var(--border2)"}`,color:"#8888cc",padding:"5px 0",fontFamily:"inherit",fontSize:mob?16:12,outline:"none"}}
            />
          </div>
        );
        if (mob) return (
          <div key={f.id} style={{background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)",padding:"12px 14px",marginBottom:2,opacity:hardLocked?0.55:1,transition:"opacity 0.2s"}}>
            {dateStr&&<div style={{fontSize:10,color:"var(--text-dim)",marginBottom:7,letterSpacing:0.3}}>{dateStr}</div>}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                <TeamBadge team={f.home} crest={f.homeCrest} size={22} />
                <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</a>
              </div>
              <div style={{textAlign:"center",flexShrink:0,minWidth:60}}>{resultBlock}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,justifyContent:"flex-end"}}>
                <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</a>
                <TeamBadge team={f.away} crest={f.awayCrest} size={22} />
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                <span style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1,flexShrink:0}}>PICK</span>
                <div style={{minWidth:0}}>
                  {pickBlock}
                </div>
              </div>
              <BadgeScore score={effectivePts} missed={pts===null&&effectivePts!==null}/>
            </div>
          </div>
        );
        return (
          <div key={f.id} className="frow" style={{display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,padding:"13px 14px",background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)",alignItems:"center",marginBottom:2,opacity:hardLocked?0.55:1,transition:"opacity 0.2s"}}>
            <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:0.3,lineHeight:1.4}}>{dateStr||""}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:10}}>
              <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-mid)"}>{f.home}</a>
              <TeamBadge team={f.home} crest={f.homeCrest} size={22} />
            </div>
            <div style={{textAlign:"center"}}>{resultBlock}</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <TeamBadge team={f.away} crest={f.awayCrest} size={22} />
              <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-mid)"}>{f.away}</a>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}>{pickBlock}</div>
            <div style={{textAlign:"center"}}><BadgeScore score={effectivePts} missed={pts===null&&effectivePts!==null}/></div>
          </div>
        );
      })}
      {unpickedUnlocked.length===0&&!picksLocked&&!allFixturesFinished&&(group.members||[]).length>1&&(
        <div style={{marginTop:16,marginBottom:8}}>
          <Btn variant="success" style={{width:"100%"}} onClick={async()=>{
            await updateGroup(g=>{
              const pl=g.picksLocked||{};
              const ul=pl[user.username]||{};
              const sl=ul[activeSeason]||{};
              return {...g,picksLocked:{...pl,[user.username]:{...ul,[activeSeason]:{...sl,[currentGW]:true}}}};
            });
          }}>
            LOCK IN PICKS
          </Btn>
          <div style={{fontSize:11,color:"var(--text-dim)",textAlign:"center",marginTop:8}}>You won't be able to change your picks after locking.</div>
        </div>
      )}
      {(group.mode==="dibs"
        ? (group.members||[]).length>1
        : (picksLocked||allFixturesFinished)&&(group.members||[]).length>1&&canViewAllPicks
      )&&<AllPicksTable group={group} gwFixtures={gwFixtures.filter(f=>!(group.hiddenFixtures||[]).includes(f.id))} isAdmin={isAdmin} updateGroup={updateGroup} adminUser={user} names={names} viewedGW={currentGW} theme={theme} dibsTurnFor={dibsTurnFor}/>}
      {gwFixtures.some(f=>f.result)&&group.mode!=="dibs"&&(group.members||[]).length>1&&!canViewAllPicks&&(
        <div style={{marginTop:40,background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"36px",textAlign:"center"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><Lock size={28} color="var(--text-dim)"/></div>
          <div style={{fontSize:13,color:"var(--text-mid)",marginBottom:6}}>Submit your picks to unlock all picks</div>
          <div style={{fontSize:11,color:"var(--text-dim)"}}>{unpickedUnlocked.length} fixture{unpickedUnlocked.length!==1?"s":""} remaining</div>
        </div>
      )}
    </div>
  );
}

function AllPicksTable({group,gwFixtures,isAdmin,updateGroup,adminUser,names,viewedGW,theme,dibsTurnFor={}}) {
  const [editing,setEditing]=useState({}); // {`${username}:${fixtureId}`: draftValue}
  const [editConfirm,setEditConfirm]=useState(null); // {u,fid,val,oldVal}
  const members = group.members||[];
  const preds = group.predictions||{};
  const scored = gwFixtures.filter(f=>f.result);
  const weeklyTotals = members.map(u=>scored.reduce((sum,f)=>{const pts=calcPts(preds[u]?.[f.id],f.result);return sum+(pts!==null?pts:MISSED_PICK_PTS);},0));
  const hasAnyPicks = scored.some(f=>members.some(u=>preds[u]?.[f.id]));
  const sortedUnique = [...new Set(weeklyTotals)].sort((a,b)=>a-b);
  const weeklyColor = t=>{if(!hasAnyPicks)return "var(--text)";const r=sortedUnique.indexOf(t);return r===0?"#fbbf24":r===1?"#9ca3af":r===2?"#cd7f32":"var(--text)";};
  const weeklyGlow = t=>{if(!hasAnyPicks)return "none";const r=sortedUnique.indexOf(t);return r===0?"0 0 10px #fbbf2499,0 0 22px #fbbf2455":r===1?"0 0 7px #9ca3af66,0 0 14px #9ca3af33":r===2?"0 0 5px #cd7f3255,0 0 10px #cd7f3222":"none";};

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
    const fixture = gwFixtures.find(f=>f.id===fid);
    await updateGroup(g=>{
      const p={...(g.predictions||{})};p[u]={...(p[u]||{}),[fid]:val};
      const entry={id:Date.now(),at:Date.now(),by:adminUser.username,for:u,fixture:fixture?`${fixture.home} vs ${fixture.away}`:fid,gw:viewedGW??group.currentGW,old:oldVal,new:val};
      return {...g,predictions:p,adminLog:[...(g.adminLog||[]),entry]};
    });
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
        <div onClick={cancelConfirm} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.53)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:28,width:"100%",maxWidth:340}}>
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
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:4,letterSpacing:-0.5}}>All Picks This Week</h2>
      {isAdmin&&<div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1,marginBottom:14}}>ADMIN · click any pick to edit</div>}
      <div style={{overflowX:"auto"}} className={theme==="excel"?"excel-mode":""}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"1px solid var(--border)",background:theme==="excel"?"#1a1a1a":undefined}}>
            <th style={{padding:"8px 12px",textAlign:"left",color:theme==="excel"?"#fff":"var(--text-dim)",letterSpacing:2,fontWeight:400}}>FIXTURE</th>
            <th style={{padding:"8px 12px",textAlign:"center",color:theme==="excel"?"#fff":"var(--text-dim)",letterSpacing:2,fontWeight:400}}>RESULT</th>
            {members.map((u,ui)=>{
              const isWinner=hasAnyPicks&&scored.length>0&&weeklyTotals[ui]===sortedUnique[0];
              const excelBg=theme==="excel"?PALETTE[ui%PALETTE.length]:undefined;
              const isAwaiting = Object.values(dibsTurnFor).some(turn => turn === u);
              return <th key={u} colSpan={theme==="excel"?2:1} style={{padding:"8px 12px",textAlign:"center",background:excelBg,color:theme==="excel"?"#fff":isWinner?"#fbbf24":"var(--text-mid)",fontWeight:700,fontSize:theme==="excel"?13:undefined,textShadow:isWinner&&!excelBg?"0 0 10px #fbbf2488":"none"}}>{isAwaiting
                ? <span style={{animation:"pulse 1.2s ease-in-out infinite",display:"inline-block"}}>{names[u]||u}</span>
                : <>{isWinner&&!excelBg&&<Star size={13} color="#fbbf24" filled style={{marginRight:4,filter:"drop-shadow(0 0 4px #fbbf24aa)",flexShrink:0}}/>}{names[u]||u}</>
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
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</span>
                    <span style={{color:"var(--text-dim)",fontSize:10,letterSpacing:1,flexShrink:0}}>vs</span>
                    <TeamBadge team={f.away} crest={f.awayCrest} size={22} />
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</span>
                  </div>
                </td>
                <td style={{padding:"10px 12px",textAlign:"center",fontFamily:theme==="excel"?"Arial,sans-serif":"'Playfair Display',serif",fontSize:theme==="excel"?12:15,color:"var(--text-bright)",letterSpacing:theme==="excel"?0.5:2,whiteSpace:"nowrap"}}>{f.result?f.result:f.liveScore?<span style={{color:"#f59e0b"}}>{f.liveScore}</span>:f.status==="POSTPONED"?<span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,fontFamily:"'DM Mono',monospace"}}>PPD</span>:null}</td>
                {members.map(u=>{
                  const pred=preds[u]?.[f.id];
                  const pts=calcPts(pred,f.result);
                  const effectivePts=pts!==null?pts:(f.result&&!pred?MISSED_PICK_PTS:null);
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
                            : (f.result||f.status==="IN_PLAY"||f.status==="PAUSED")
                              ? <span style={{fontSize:18,fontWeight:700,color:"#ef4444"}}>×</span>
                              : <span style={{fontSize:13,fontWeight:600,color:"#999"}}>–</span>
                        )}
                      </td>,
                      <td key={`${u}-pts`} style={{padding:"5px 5px",textAlign:"center",borderLeft:"none",background:`linear-gradient(to right,#e0e0e0 0px,#e0e0e0 1px,${ptsBg==="transparent"?(rowBg||"#fff"):ptsBg} 1px)`,minWidth:20}}>
                        <span style={{fontSize:13,fontWeight:600,color:ptsColor}}>{effectivePts!==null?effectivePts:""}</span>
                      </td>
                    ];
                  }
                  const isCellAwaiting = dibsTurnFor[f.id] === u && !/^\d+-\d+$/.test(preds[u]?.[f.id] || "");
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
                          {pred
                            ? <span style={{color:"var(--text-dim3)",fontSize:11}}>{pred}</span>
                            : (f.result||f.status==="IN_PLAY"||f.status==="PAUSED")
                              ? <span style={{color:"#ef4444",fontWeight:700,fontSize:18}}>×</span>
                              : <span style={{color:"var(--text-dim3)",fontSize:11}}>–</span>}
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
              if(theme==="excel") return <td key={u} colSpan={2} style={{padding:"7px 8px",textAlign:"center",fontSize:13,fontWeight:700,color:weeklyColor(total)}}>{total}</td>;
              return <td key={u} style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:weeklyColor(total),textShadow:weeklyGlow(total)}}>{total}</td>;
            })}
          </tr></tfoot>}
        </table>
      </div>
    </div>
  );
}

/* ── TRENDS ──────────────────────────────────────── */
function TrendsTab({group,names}) {
  const mob = useMobile();
  const stats = useMemo(()=>computeStats(group),[group]);
  const members = group.members||[];
  const memberColor = u => PALETTE[members.indexOf(u)%PALETTE.length];
  const activeSeason = group.season || 2025;
  const scope = group.scoreScope || "all";
  const gws = (group.gameweeks||[]).filter(g => scope === "all" || (g.season||activeSeason) === activeSeason);
  const hasData = stats.some(p=>p.scored>0);
  const tt={background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:8,fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--text)"};
  const ds = stats.map(p=>({...p,dn:names[p.username]||p.username}));
  const completedGws = gws.filter(g=>g.fixtures.length>0&&g.fixtures.every(f=>f.result||f.status==="POSTPONED"));
  const gwLine=completedGws.map(g=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.find(e=>e.gw===g.gw&&e.season===(g.season||activeSeason))?.points??0;});return r;});
  const cumLine=completedGws.map((g,gi)=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.filter(e=>completedGws.slice(0,gi+1).some(cg=>cg.gw===e.gw&&(cg.season||activeSeason)===(e.season||activeSeason))).reduce((a,e)=>a+e.points,0);});return r;});
  const perfectsData=ds.map(p=>({name:p.dn,perfects:p.perfects}));
  const preds=group.predictions||{};
  const distData=[0,1,2,3,4,5].map(pts=>{const r={pts:pts===5?"5+":String(pts)};ds.forEach(p=>{let c=0;gws.forEach(g=>g.fixtures.forEach(f=>{if(!f.result)return;const pp=calcPts(preds[p.username]?.[f.id],f.result)??MISSED_PICK_PTS;if(pts===5?pp>=5:pp===pts)c++;}));r[p.dn]=c;});return r;});
  const CC=({title,sub,children})=>(<div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:mob?"14px 14px 12px":"20px 20px 18px",marginBottom:mob?12:18}}><div style={{marginBottom:mob?10:16}}><div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:"var(--text-dim3)",textTransform:"uppercase"}}>{title}</div>{sub&&<div style={{fontSize:mob?10:11,color:"var(--text-dim)",marginTop:3}}>{sub}</div>}</div>{children}</div>);
  const SH=({label})=>(<div style={{display:"flex",alignItems:"center",gap:10,margin:mob?"18px 0 10px":"32px 0 18px"}}><div style={{width:2,height:14,background:"#6366f1",borderRadius:2,flexShrink:0}}/><span style={{fontSize:9,fontWeight:700,letterSpacing:3,color:"#6366f1",textTransform:"uppercase"}}>{label}</span><div style={{flex:1,height:1,background:"var(--border)"}}/></div>);
  const gwTickInterval = mob ? "preserveStartEnd" : (gws.length > 30 ? Math.ceil(gws.length / 15) - 1 : 0);
  const gwTickProps = { fill:"var(--text-dim3)", fontSize:10 };
  const filteredGWs = gws;
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const inScopeFixtureIds = useMemo(() => {
    const ids = new Set();
    filteredGWs.forEach(g => (g.fixtures||[]).forEach(f => ids.add(f.id)));
    return ids;
  }, [filteredGWs]);
  const gwHeatmapData = useMemo(() => {
    const result = {};
    ds.forEach(p => {
      result[p.username] = {};
      completedGws.forEach(g => {
        const gwKey = `${g.gw}-${g.season||activeSeason}`;
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
  }, [ds, completedGws, preds, activeSeason]);
  const rankData = useMemo(() => {
    return completedGws.map((g, gi) => {
      const gwsUpTo = completedGws.slice(0, gi + 1);
      const cumulative = ds.map(p => {
        let pts = 0, perfs = 0;
        gwsUpTo.forEach(cg => {
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
  }, [completedGws, ds, preds, activeSeason]);
  const breakdownData = useMemo(() => {
    return ds.map(p => {
      let perfect = 0, close = 0, bad = 0, missed = 0;
      filteredGWs.forEach(g => (g.fixtures||[]).forEach(f => {
        if (!f.result || f.status === "POSTPONED") return;
        const pred = preds[p.username]?.[f.id];
        if (!pred) { missed++; return; }
        const fp = calcPts(pred, f.result) ?? 0;
        if (fp === 0) perfect++;
        else if (fp <= 2) close++;
        else bad++;
      }));
      return { name: p.dn, Perfect: perfect, Close: close, Bad: bad, Missed: missed };
    });
  }, [ds, filteredGWs, preds]);
  const radarData = useMemo(() => {
    const raw = ds.map(p => {
      let rawScored = 0, rawMissed = 0, rawPicked = 0, rawPerfects = 0, rawTotal = 0, boldTotal = 0;
      const gwPickedAvgs = []; // per-GW avg pts on picked fixtures only (misses excluded)
      completedGws.forEach(g => {
        let gwPickSum = 0, gwPickCount = 0;
        (g.fixtures||[]).forEach(f => {
          if (!f.result || f.status === "POSTPONED") return;
          rawScored++;
          const pred = preds[p.username]?.[f.id];
          if (!pred) { rawMissed++; return; }
          const fp = calcPts(pred, f.result) ?? 0;
          rawPicked++; rawTotal += fp; gwPickSum += fp; gwPickCount++;
          if (fp === 0) rawPerfects++;
          const [h, a] = pred.split("-").map(Number);
          if (!isNaN(h) && !isNaN(a)) boldTotal += h + a;
        });
        if (gwPickCount > 0) gwPickedAvgs.push(gwPickSum / gwPickCount);
      });
      const rawAvg = rawPicked > 0 ? rawTotal / rawPicked : 0;
      const boldness = rawPicked > 0 ? boldTotal / rawPicked : 0;
      const pavgMean = gwPickedAvgs.length > 0 ? gwPickedAvgs.reduce((a,b)=>a+b,0)/gwPickedAvgs.length : 0;
      const stddev = gwPickedAvgs.length > 1 ? Math.sqrt(gwPickedAvgs.reduce((s,v)=>s+(v-pavgMean)**2,0)/gwPickedAvgs.length) : 0;
      const perfectRate = rawScored > 0 ? rawPerfects / rawScored : 0;
      let winnerCorrect = 0;
      completedGws.forEach(g => {
        (g.fixtures||[]).forEach(f => {
          if (!f.result || f.status === "POSTPONED") return;
          const pred = preds[p.username]?.[f.id];
          if (!pred) return;
          const [ph, pa] = pred.split("-").map(Number);
          const [rh, ra] = f.result.split("-").map(Number);
          if (isNaN(ph)||isNaN(pa)||isNaN(rh)||isNaN(ra)) return;
          const pOut = ph > pa ? 1 : ph < pa ? -1 : 0;
          const rOut = rh > ra ? 1 : rh < ra ? -1 : 0;
          if (pOut === rOut) winnerCorrect++;
        });
      });
      const winnerRate = rawPicked > 0 ? winnerCorrect / rawPicked : 0;
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
  }, [ds, completedGws, preds, activeSeason]);
  const swingData = useMemo(() => {
    return completedGws.map(g => {
      const scores = ds.map(p => {
        let total = 0;
        (g.fixtures||[]).forEach(f => {
          if (!f.result || f.status === "POSTPONED") return;
          const pred = preds[p.username]?.[f.id];
          total += pred ? (calcPts(pred, f.result) ?? 0) : MISSED_PICK_PTS;
        });
        return { dn: p.dn, username: p.username, total };
      });
      const vals = scores.map(s => s.total);
      const entry = { name: `GW${g.gw}`, min: Math.min(...vals), max: Math.max(...vals), avg: +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) };
      scores.forEach(s => { entry[s.dn] = s.total; });
      return entry;
    });
  }, [completedGws, ds, preds]);
  const scoreGridData = useMemo(() => {
    const grid = {};
    for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) grid[`${h}-${a}`] = 0;
    const targets = selectedPlayer ? [selectedPlayer] : members;
    targets.forEach(username => {
      filteredGWs.forEach(g => (g.fixtures||[]).forEach(f => {
        if (!inScopeFixtureIds.has(f.id)) return;
        const pred = preds[username]?.[f.id];
        if (!pred) return;
        const [h, a] = pred.split("-").map(Number);
        if (!isNaN(h) && !isNaN(a) && h <= 5 && a <= 5) grid[`${h}-${a}`] = (grid[`${h}-${a}`] || 0) + 1;
      }));
    });
    return grid;
  }, [selectedPlayer, members, filteredGWs, preds, inScopeFixtureIds]);

  const resultGridData = useMemo(() => {
    const grid = {};
    for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) grid[`${h}-${a}`] = 0;
    completedGws.forEach(g => (g.fixtures||[]).forEach(f => {
      if (!f.result || f.status === "POSTPONED") return;
      const [h, a] = f.result.split("-").map(Number);
      if (!isNaN(h) && !isNaN(a) && h <= 5 && a <= 5) grid[`${h}-${a}`] = (grid[`${h}-${a}`] || 0) + 1;
    }));
    return grid;
  }, [completedGws]);

  const predStyleData = useMemo(() => {
    return ds.map(p => {
      let home = 0, draw = 0, away = 0;
      completedGws.forEach(g => (g.fixtures||[]).forEach(f => {
        if (!f.result || f.status === "POSTPONED") return;
        const pred = preds[p.username]?.[f.id];
        if (!pred) return;
        const [ph, pa] = pred.split("-").map(Number);
        if (isNaN(ph) || isNaN(pa)) return;
        if (ph > pa) home++;
        else if (ph < pa) away++;
        else draw++;
      }));
      const total = home + draw + away;
      return {
        name: p.dn,
        Home: total ? +((home/total)*100).toFixed(1) : 0,
        Draw: total ? +((draw/total)*100).toFixed(1) : 0,
        Away: total ? +((away/total)*100).toFixed(1) : 0,
      };
    });
  }, [ds, completedGws, preds]);

  const goalInflationData = useMemo(() => {
    return ds.map(p => {
      let predTotal = 0, actualTotal = 0, count = 0;
      completedGws.forEach(g => (g.fixtures||[]).forEach(f => {
        if (!f.result || f.status === "POSTPONED") return;
        const pred = preds[p.username]?.[f.id];
        if (!pred) return;
        const [ph, pa] = pred.split("-").map(Number);
        const [rh, ra] = f.result.split("-").map(Number);
        if (isNaN(ph)||isNaN(pa)||isNaN(rh)||isNaN(ra)) return;
        predTotal += ph + pa;
        actualTotal += rh + ra;
        count++;
      }));
      return { name: p.dn, value: count > 0 ? +((predTotal - actualTotal) / count).toFixed(2) : 0, color: memberColor(p.username) };
    }).sort((a, b) => a.value - b.value);
  }, [ds, completedGws, preds]);

  const boldnessAccuracyData = useMemo(() => {
    return ds.map(p => {
      let predGoals = 0, ptsTotal = 0, count = 0;
      completedGws.forEach(g => (g.fixtures||[]).forEach(f => {
        if (!f.result || f.status === "POSTPONED") return;
        const pred = preds[p.username]?.[f.id];
        if (!pred) return;
        const fp = calcPts(pred, f.result);
        if (fp === null) return;
        const [ph, pa] = pred.split("-").map(Number);
        if (isNaN(ph)||isNaN(pa)) return;
        predGoals += ph + pa;
        ptsTotal += fp;
        count++;
      }));
      return { name: p.dn, boldness: count > 0 ? +(predGoals/count).toFixed(2) : 0, accuracy: count > 0 ? +(ptsTotal/count).toFixed(2) : 0, color: memberColor(p.username) };
    });
  }, [ds, completedGws, preds]);

  if (!hasData) return <div style={{textAlign:"center",padding:"80px 0",color:"var(--text-dim)"}}><div style={{fontSize:40,marginBottom:14}}>📊</div><div style={{fontSize:11,letterSpacing:2}}>SYNC RESULTS TO SEE TRENDS</div></div>;
  return (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:mob?24:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:mob?16:28}}>Trends</h1>
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
                {[["PTS",p.total,color,"'Playfair Display',serif",17],["AVG",p.avg,"var(--text-mid)","inherit",13],["PERF",p.perfects,"#22c55e","inherit",13]].map(([l,v,c,ff,fs])=>(
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
      <CC title="Rankings Over Time" sub="Leaderboard position after each gameweek">
        <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:40),mob?160:200)}>
          <LineChart data={rankData} margin={{top:20,right:20,left:-10,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis reversed domain={[1,ds.length]} allowDecimals={false} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false} ticks={ds.map((_,i)=>i+1)}/>
            <Tooltip contentStyle={tt} formatter={(val,name,props)=>{const pts=props.payload[`${name}_pts`];return [`#${val} (${pts}pts)`,name];}}/>
            {ds.map(p=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={selectedPlayer===p.username?3:2} strokeOpacity={selectedPlayer&&selectedPlayer!==p.username?0.15:1} dot={{r:mob?3:4,fill:memberColor(p.username)}} activeDot={{r:6}}/>)}
          </LineChart>
        </ResponsiveContainer>
      </CC>
      <CC title="Cumulative Points Race" sub="Running total — lower is winning">
        <ResponsiveContainer width="100%" height={mob?160:200}>
          <LineChart data={cumLine} margin={{top:4,right:20,left:-22,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>
            {ds.filter(p=>!selectedPlayer||selectedPlayer===p.username).map(p=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2.5} dot={false}/>)}
          </LineChart>
        </ResponsiveContainer>
      </CC>

      <SH label="Gameweek Performance"/>
      <CC title="Points Per Gameweek">
        <ResponsiveContainer width="100%" height={mob?200:260}>
          <LineChart data={gwLine} margin={{top:4,right:20,left:-22,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10,color:"var(--text-mid)"}}/>
            {ds.filter(p=>!selectedPlayer||selectedPlayer===p.username).map(p=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2} dot={{r:mob?2:3}} activeDot={{r:5}}/>)}
          </LineChart>
        </ResponsiveContainer>
      </CC>
      <CC title="GW Spread" sub="Shaded area = full range, dashed = avg">
        <ResponsiveContainer width="100%" height={mob?170:220}>
          <ComposedChart data={swingData} margin={{top:4,right:20,left:-22,bottom:mob?0:12}}>
            <XAxis dataKey="name" tick={gwTickProps} axisLine={false} tickLine={false} interval={gwTickInterval} minTickGap={mob?8:14}/>
            <YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={tt}/>
            <Area type="monotone" dataKey="max" stroke="none" fill="var(--border)" fillOpacity={1} legendType="none"/>
            <Area type="monotone" dataKey="min" stroke="none" fill="var(--surface)" fillOpacity={1} legendType="none"/>
            <Line type="monotone" dataKey="avg" stroke="var(--text-mid)" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
            {selectedPlayer&&(()=>{const p=ds.find(x=>x.username===selectedPlayer);return p?<Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2} dot={{r:4,fill:memberColor(p.username)}}/>:null;})()}
          </ComposedChart>
        </ResponsiveContainer>
      </CC>

      {/* ── GW HEATMAP ──────────────────────────────── */}
      <CC title="GW Heatmap" sub="Points per gameweek — green = low (good), red = high (bad)">
        {(()=>{
          // build relative color scale from actual data
          const allPts = ds.flatMap(p => completedGws.map(g => {
            const cell = (gwHeatmapData[p.username]||{})[`${g.gw}-${g.season||activeSeason}`];
            if (!cell || cell === "postponed") return null;
            const nonPP = (g.fixtures||[]).filter(f=>f.result&&f.status!=="POSTPONED").length;
            if (cell.missed && cell.pts >= MISSED_PICK_PTS * nonPP) return null; // all-missed
            return cell.pts;
          }).filter(v=>v!==null));
          const heatMin = allPts.length ? Math.min(...allPts) : 0;
          const heatMax = allPts.length ? Math.max(...allPts) : 1;
          const heatColor = pts => {
            const t = heatMax === heatMin ? 0.5 : Math.max(0, Math.min(1, (pts - heatMin) / (heatMax - heatMin)));
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
                        if (!cell) return <rect key={`${ri}-${ci}`} x={labelW+ci*cellW+1} y={32+ri*rowH+1} width={cellW-2} height={rowH-2} rx={3} fill="var(--border)"/>;
                        if (cell === "postponed") return <rect key={`${ri}-${ci}`} x={labelW+ci*cellW+1} y={32+ri*rowH+1} width={cellW-2} height={rowH-2} rx={3} fill="var(--border)"/>;
                        const nonPP = (g.fixtures||[]).filter(f=>f.result&&f.status!=="POSTPONED").length;
                        const allMissed = cell.missed && cell.pts >= MISSED_PICK_PTS * nonPP;
                        const fill = allMissed ? "#1e1e30" : heatColor(cell.pts);
                        const textFill = allMissed ? "#555566" : (cell.pts/(heatMax||1) < 0.45 ? "#fff" : "#111");
                        return (
                          <g key={`${ri}-${ci}`}>
                            <rect x={labelW+ci*cellW+1} y={32+ri*rowH+1} width={cellW-2} height={rowH-2} rx={3} fill={fill}>
                              <title>{allMissed?"missed":String(cell.pts)}</title>
                            </rect>
                            {!allMissed && !mob && <text x={labelW+ci*cellW+cellW/2} y={32+ri*rowH+rowH/2} textAnchor="middle" dominantBaseline="middle" fill={textFill} fontSize={8} fontFamily="'DM Mono',monospace" fontWeight={600}>{cell.pts}</text>}
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
      <CC title="Points Breakdown" sub="How each player's picks land across outcome types">
        <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:40),mob?150:180)}>
          <BarChart data={breakdownData} layout="vertical" margin={{top:0,right:mob?8:18,left:mob?50:60,bottom:0}}>
            <XAxis type="number" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" width={mob?48:58} tick={{fill:"var(--text-mid)",fontSize:mob?9:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={tt}/>
            <Legend content={<BreakdownLegend/>}/>
            <Bar dataKey="Perfect" stackId="a" fill="#22c55e"/>
            <Bar dataKey="Close" stackId="a" fill="#f59e0b"/>
            <Bar dataKey="Bad" stackId="a" fill="#ef4444"/>
            <Bar dataKey="Missed" stackId="a" fill="#555566" radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </CC>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
        <CC title="Perfect Predictions"><ResponsiveContainer width="100%" height={180}><BarChart data={perfectsData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Bar dataKey="perfects" fill="#22c55e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></CC>
        <CC title="Points Distribution" sub="How often each score outcome occurs per player"><ResponsiveContainer width="100%" height={180}><BarChart data={distData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="pts" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map(p=><Bar key={p.username} dataKey={p.dn} fill={memberColor(p.username)} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer></CC>
      </div>

      <SH label="Playing Style"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:18}}>
        <CC title="Prediction Style" sub="How often each player backs home win / draw / away win">
          <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:44),mob?160:200)}>
            <BarChart data={predStyleData} layout="vertical" margin={{top:0,right:mob?8:40,left:mob?50:60,bottom:0}}>
              <XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" width={mob?48:58} tick={{fill:"var(--text-mid)",fontSize:mob?9:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>[`${v}%`,n]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="Home" stackId="a" fill="#6366f1"/>
              <Bar dataKey="Draw" stackId="a" fill="#f59e0b"/>
              <Bar dataKey="Away" stackId="a" fill="#22c55e" radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </CC>
        <CC title="Player Radar" sub="Normalized vs group average. Hover axis labels for definitions">
          <ResponsiveContainer width="100%" height={mob?220:260}>
            <RadarChart data={radarData.data} margin={{top:10,right:mob?20:30,bottom:10,left:mob?20:30}}>
              <PolarGrid stroke="var(--border)"/>
              <PolarAngleAxis dataKey="subject" tick={<RadarTick/>}/>
              <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/>
              <Tooltip content={<RadarTooltip rawMap={radarData.rawMap} tt={tt}/>}/>
              <Radar name="Group Avg" dataKey="Avg" stroke="#555577" fill="#555577" fillOpacity={0.2} strokeWidth={1.5} strokeDasharray="5 3"/>
              {ds.filter(p=>!selectedPlayer||selectedPlayer===p.username).map(p=>(
                <Radar key={p.username} name={p.dn} dataKey={p.dn} stroke={memberColor(p.username)} fill={memberColor(p.username)} fillOpacity={selectedPlayer?0.4:0.15} strokeWidth={selectedPlayer?2.5:1.5}/>
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </CC>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:18}}>
        <CC title="Goal Inflation" sub="Avg predicted total goals minus actual goals per pick">
          <ResponsiveContainer width="100%" height={Math.max(ds.length*(mob?32:44),mob?160:200)}>
            <BarChart data={goalInflationData} layout="vertical" margin={{top:0,right:mob?24:50,left:mob?50:60,bottom:0}}>
              <XAxis type="number" tickFormatter={v=>v>0?`+${v}`:String(v)} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" width={mob?48:58} tick={{fill:"var(--text-mid)",fontSize:mob?9:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tt} formatter={v=>[v>0?`+${v} goals/pick`:v===0?"on the dot":`${v} goals/pick`,"Goal diff"]}/>
              <ReferenceLine x={0} stroke="var(--text-dim3)" strokeDasharray="3 3"/>
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {goalInflationData.map((e,i)=><Cell key={i} fill={e.value>=0?"#f59e0b":"#6366f1"}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:10,fontSize:10,color:"var(--text-dim3)"}}>
            <span><span style={{color:"#f59e0b"}}>■</span> Over-predicts</span>
            <span><span style={{color:"#6366f1"}}>■</span> Under-predicts</span>
          </div>
        </CC>
        <CC title="Boldness vs Accuracy" sub="Do bolder scoreline predictions help or hurt?">
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
            <CC title={`Score Prediction Heatmap${selectedPlayer?`: ${ds.find(p=>p.username===selectedPlayer)?.dn||selectedPlayer}`:""}`}>
              {renderHeatmap(scoreGridData,"rgba(245,158,11,1)",selectedPlayer?"YOUR PICKS":"ALL PICKS")}
            </CC>
            <CC title="Actual Results Heatmap">
              {renderHeatmap(resultGridData,"rgba(99,102,241,1)","REAL RESULTS")}
            </CC>
          </div>
        );
      })()}

    </div>
  );
}

/* ── MEMBERS ─────────────────────────────────────── */
function MembersTab({group,user,isAdmin,isCreator,updateGroup,names,updateNickname}) {
  const members=group.members||[];
  const admins=group.admins||[];
  const stats = useMemo(()=>computeStats(group),[group]);
  const [editingNick,setEditingNick]=useState(null);
  const [nickDraft,setNickDraft]=useState("");
  const [logCount,setLogCount]=useState(20);
  const saveNick=async(username)=>{
    if(nickDraft.trim()&&nickDraft.trim()!==(names[username]||username)){
      const oldName=names[username]||username;
      await updateNickname(username,nickDraft.trim());
      await updateGroup(g=>{const entry={id:Date.now(),at:Date.now(),by:user.username,action:"rename",for:username,old:oldName,new:nickDraft.trim()};return {...g,adminLog:[...(g.adminLog||[]),entry]};});
    }
    setEditingNick(null);
  };
  const toggleAdmin=async(username)=>{await updateGroup(g=>{const a=g.admins||[];const isNowAdmin=!a.includes(username);const entry={id:Date.now(),at:Date.now(),by:user.username,action:isNowAdmin?"make-admin":"remove-admin",for:username};return {...g,admins:isNowAdmin?[...a,username]:a.filter(x=>x!==username),adminLog:[...(g.adminLog||[]),entry]};});};
  const kick=async(username)=>{
    if(username===group.creatorUsername)return;
    const entry={id:Date.now(),at:Date.now(),by:user.username,action:"kick",for:username};
    await updateGroup(g=>({...g,members:g.members.filter(m=>m!==username),admins:(g.admins||[]).filter(a=>a!==username),memberOrder:(g.memberOrder||g.members||[]).filter(m=>m!==username),adminLog:[...(g.adminLog||[]),entry]}));
    const fresh=await sget(`user:${username}`);
    if(fresh)await sset(`user:${username}`,{...fresh,groupIds:(fresh.groupIds||[]).filter(id=>id!==group.id)});
  };
  return (
    <div style={{maxWidth:560}}>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:8}}>Members</h1>
      <p style={{color:"var(--text-dim)",fontSize:11,letterSpacing:2,marginBottom:32}}>{members.length} PLAYER{members.length!==1?"S":""}</p>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {members.map(username=>{
          const mIsAdmin=admins.includes(username);
          const mIsCreator=username===group.creatorUsername;
          const isMe=username===user.username;
          return (
            <div key={username} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--card)",border:`1px solid ${isMe?"var(--border2)":"var(--border3)"}`,borderRadius:10,padding:"14px 18px"}}>
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
                      <span style={{fontSize:14,color:isMe?"#8888cc":"var(--text-mid)"}}>{names[username]||username}{isMe&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:8}}>you</span>}</span>
                      {isAdmin&&<button onClick={()=>{setEditingNick(username);setNickDraft(names[username]||username);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-dim3)",padding:"0 2px",lineHeight:1,display:"flex",alignItems:"center"}}><EditLine size={13} color="currentColor"/></button>}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    {mIsCreator&&<span style={{fontSize:9,color:"#f59e0b",letterSpacing:2,background:"#f59e0b15",border:"1px solid #f59e0b30",borderRadius:4,padding:"1px 6px"}}>CREATOR</span>}
                    {isAdmin&&mIsAdmin&&!mIsCreator&&<span style={{fontSize:9,color:"#60a5fa",letterSpacing:2,background:"#60a5fa15",border:"1px solid #60a5fa30",borderRadius:4,padding:"1px 6px"}}>ADMIN</span>}
                  </div>
                </div>
              </div>
              {isCreator&&!isMe&&(
                <div style={{display:"flex",gap:6}}>
                  {!mIsCreator&&<Btn variant={mIsAdmin?"ghost":"muted"} small onClick={()=>toggleAdmin(username)}>{mIsAdmin?"Remove Admin":"Make Admin"}</Btn>}
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
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:16,letterSpacing:-0.5}}>Admin Log</h2>
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

/* ── GROUP TAB ───────────────────────────────────── */
function GroupTab({group,user,isAdmin,isCreator,updateGroup,onLeave,theme,setTheme,names={}}) {
  const [newName,setNewName]=useState(group.name);
  const [nameSaved,setNameSaved]=useState(false);
  const [apiSaved,setApiSaved]=useState(false);
  const [season,setSeason]=useState(String(group.season||2025));
  const [copied,setCopied]=useState(false);
  const [limitSaved,setLimitSaved]=useState(false);
  const [newSeasonYear,setNewSeasonYear]=useState("");
  const [seasonMsg,setSeasonMsg]=useState("");
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

  const activeSeason=group.season||2025;
  const seasonStats = useMemo(()=>computeStats(group),[group]);
  const seasonComplete = useMemo(()=>{
    const scoped = (group.gameweeks||[]).filter(gw=>(gw.season||activeSeason)===activeSeason);
    return scoped.length > 0 && scoped.every(gw => (gw.fixtures||[]).every(f => f.result || f.status === "POSTPONED"));
  },[group.gameweeks,activeSeason]);
  const seasonWinner = seasonStats[0] || null;
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
    } catch(e){setReminderMsg("Failed to send.");}
    setReminderLoading(false);
    setTimeout(()=>setReminderMsg(""),4000);
  };
  const copyCode=()=>{navigator.clipboard?.writeText(group.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const [copiedLink,setCopiedLink]=useState(false);
  const copyLink=()=>{navigator.clipboard?.writeText(`https://pab.wtf/join/${group.code}`).catch(()=>{});setCopiedLink(true);setTimeout(()=>setCopiedLink(false),2000);};
  const save11Limit=async(val)=>{await updateGroup(g=>({...g,draw11Limit:val}));setLimitSaved(true);setTimeout(()=>setLimitSaved(false),2000);};
  const saveName=async()=>{if(!newName.trim())return;await updateGroup(g=>({...g,name:newName.trim()}));setNameSaved(true);setTimeout(()=>setNameSaved(false),2000);};
  const saveApiKey=async()=>{await updateGroup(g=>({...g,apiKey:(g.apiKey||"").trim(),season:parseInt(season)||2025}));setApiSaved(true);setTimeout(()=>setApiSaved(false),2000);};
  const saveScope=async(val)=>{await updateGroup(g=>({...g,scoreScope:val}));};
  const startNewSeason=async()=>{
    const yr=parseInt(newSeasonYear);
    if(!yr||yr<2020||yr>2060){setSeasonMsg("Enter a valid year.");setTimeout(()=>setSeasonMsg(""),3000);return;}
    const prevSeason=group.season||2025;
    await updateGroup(g=>{
      if ((g.gameweeks||[]).some(gw=>(gw.season||g.season||2025)===yr)) return g;
      const backfilled=(g.gameweeks||[]).map(gw=>gw.season?gw:{...gw,season:prevSeason});
      return {...g,gameweeks:[...backfilled,...makeAllGWs(yr)],season:yr,currentGW:1};
    });
    setNewSeasonYear("");
    setSeasonMsg(`Season ${yr} started!`);
    setTimeout(()=>setSeasonMsg(""),3000);
  };
  const backfillGWs = async () => {
    const seas = group.season || 2025;
    let added = 0;
    await updateGroup(g => {
      const existing = new Set((g.gameweeks||[]).filter(gw=>(gw.season||seas)===seas).map(gw=>gw.gw));
      const minExisting = existing.size > 0 ? Math.min(...existing) : 1;
      const missing = Array.from({length:38}, (_,i)=>i+1).filter(n=>!existing.has(n)&&n>=minExisting);
      if (!missing.length) { added = 0; return g; }
      added = missing.length;
      const newGWs = missing.map(n=>({gw:n, season:seas, fixtures:makeFixturesFallback(n, seas)}));
      return {...g, gameweeks:[...(g.gameweeks||[]),...newGWs].sort((a,b)=>(a.season||0)-(b.season||0)||a.gw-b.gw)};
    });
    setBackfillMsg(added > 0 ? `Added ${added} GW${added!==1?"s":""}.` : "All 38 GWs already exist.");
    setTimeout(()=>setBackfillMsg(""),3000);
  };
  const backfillAllGWs = async () => {
    const seas = group.season || 2025;
    let added = 0;
    await updateGroup(g => {
      const existing = new Set((g.gameweeks||[]).filter(gw=>(gw.season||seas)===seas).map(gw=>gw.gw));
      const missing = Array.from({length:38}, (_,i)=>i+1).filter(n=>!existing.has(n));
      if (!missing.length) { added = 0; return g; }
      added = missing.length;
      const newGWs = missing.map(n=>({gw:n, season:seas, fixtures:makeFixturesFallback(n, seas)}));
      return {...g, gameweeks:[...(g.gameweeks||[]),...newGWs].sort((a,b)=>(a.season||0)-(b.season||0)||a.gw-b.gw)};
    });
    setBackfillMsg(added > 0 ? `Added ${added} GW${added!==1?"s":""}.` : "All 38 GWs already exist.");
    setTimeout(()=>setBackfillMsg(""),3000);
  };
  const syncAllDates = async () => {
    setSyncingDates(true);
    setSyncDatesMsg("Fetching full season fixtures...");
    try {
      const matches = await fetchMatchweek(group.apiKey, null, group.season||2025);
      if (!matches.length) { setSyncDatesMsg("No matches returned."); setSyncingDates(false); return; }
      const dateByTeams = {};
      matches.forEach(m => {
        const home = normName(m.homeTeam?.name || m.homeTeam?.shortName);
        const away = normName(m.awayTeam?.name || m.awayTeam?.shortName);
        if (m.utcDate) dateByTeams[`${home}|${away}`] = new Date(m.utcDate).toISOString();
      });
      let updated = 0;
      await updateGroup(g => {
        updated = 0;
        const gws = (g.gameweeks||[]).map(gw => ({
          ...gw,
          fixtures: gw.fixtures.map(f => {
            if (f.date) return f;
            const d = dateByTeams[`${f.home}|${f.away}`];
            if (d) { updated++; return {...f, date: d}; }
            return f;
          })
        }));
        return {...g, gameweeks: gws};
      });
      setSyncDatesMsg(updated > 0 ? `✓ Filled in ${updated} missing date${updated!==1?"s":""}.` : "All dates already present.");
    } catch(e) { setSyncDatesMsg(`Error: ${e.message}`); }
    setSyncingDates(false);
    setTimeout(()=>setSyncDatesMsg(""),5000);
  };
  const issueSkip = async (playerId, fixtureId) => {
    const current = (group.dibsSkips || {})[fixtureId] || [];
    if (current.includes(playerId)) return;
    const fixture = (group.gameweeks||[]).flatMap(gw=>gw.fixtures).find(f=>f.id===fixtureId);
    await updateGroup(g => {
      const entry={id:Date.now(),at:Date.now(),by:user.username,action:"dibs-skip",for:playerId,fixture:fixture?`${fixture.home} vs ${fixture.away}`:fixtureId,gw:group.currentGW};
      return {...g,dibsSkips:{...(g.dibsSkips||{}),[fixtureId]:[...((g.dibsSkips||{})[fixtureId]||[]),playerId]},adminLog:[...(g.adminLog||[]),entry]};
    });
    setSkipModal(null);
    setSkipConfirm(false);
  };
  const leaveGroup=async()=>{
    if(isCreator)return;
    if(group.code===DEMO_GROUP_CODE||group.code===DEMO_WC_GROUP_CODE)return;
    const fresh=await sget(`user:${user.username}`);
    if(fresh)await sset(`user:${user.username}`,{...fresh,groupIds:(fresh.groupIds||[]).filter(id=>id!==group.id)});
    const ok=await updateGroup(g=>({...g,members:g.members.filter(m=>m!==user.username),admins:(g.admins||[]).filter(a=>a!==user.username)}));
    if(ok)onLeave();
  };
  const deleteGroup = async () => {
    if (group.code === DEMO_GROUP_CODE || group.code === DEMO_WC_GROUP_CODE) { setDeleteError("The demo group cannot be deleted."); return; }
    if (!deletePw) { setDeleteError("Enter your password."); return; }
    setDeleteLoading(true); setDeleteError("");
    const fresh = await sget(`user:${user.username}`);
    if (!fresh || fresh.password !== deletePw) {
      setDeleteError("Incorrect password.");
      setDeleteLoading(false);
      return;
    }
    await sdel(`group:${group.id}`);
    await sdel(`groupcode:${group.code}`);
    await Promise.all((group.members || []).map(async m => {
      const u = await sget(`user:${m}`);
      if (u) await sset(`user:${m}`, { ...u, groupIds: (u.groupIds || []).filter(id => id !== group.id) });
    }));
    onLeave();
  };

  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const now = Date.now();
      const id = String(now);
      const { backups: _omit, ...snapshot } = group;
      const ok = await sset(`backup:${group.id}:${id}`, { groupId: group.id, createdAt: now, createdBy: user.username, snapshot });
      if (!ok) throw new Error("Failed to write backup");
      await updateGroup(g => {
        const list = [{ id, createdAt: now, createdBy: user.username }, ...(g.backups||[])].slice(0, 5);
        return { ...g, backups: list };
      });
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
    await sset(`backup:${group.id}:${id}`, null);
    await updateGroup(g => ({ ...g, backups: (g.backups||[]).filter(b => b.id !== id) }));
    setRestoringId(null);
    setBackupBusy(false);
  };

  const restoreBackup = async (id) => {
    setBackupBusy(true);
    try {
      const bk = await sget(`backup:${group.id}:${id}`);
      if (!bk || !bk.snapshot) { setBackupMsg("Backup not found."); setBackupBusy(false); return; }
      await updateGroup(g => ({ ...bk.snapshot, backups: g.backups }));
      setRestoringId(null);
      setBackupMsg("✓ Restored");
      setTimeout(() => setBackupMsg(""), 3000);
    } catch(e) {
      setBackupMsg("Error: " + e.message);
      setTimeout(() => setBackupMsg(""), 4000);
    }
    setBackupBusy(false);
  };

  return (
    <div style={{maxWidth:520}}>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:32}}>Group</h1>

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

      <Section title="Appearance">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {getSecretThemeMeta().map(t=>(
            <button key={t.key} onClick={()=>setTheme(t.key)}
              style={{background:"var(--card)",border:`2px solid ${theme===t.key?"var(--btn-bg)":"var(--border)"}`,borderRadius:10,padding:"12px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,transition:"border-color 0.15s",fontFamily:"inherit"}}>
              <div style={{display:"flex",gap:4}}>
                {t.swatches.map((c,i)=><div key={i} style={{width:14,height:14,borderRadius:"50%",background:c,border:"1px solid #ffffff22"}}/>)}
              </div>
              <div style={{fontSize:10,color:theme===t.key?"var(--btn-bg)":"var(--text-dim)",letterSpacing:1.5,textTransform:"uppercase",fontWeight:theme===t.key?700:400}}>
                {t.label}{theme===t.key&&" ✓"}
              </div>
            </button>
          ))}
        </div>
        {isSecretThemeUnlocked() && <div style={{fontSize:11,color:"var(--text-dim)",marginTop:10}}>Secret theme unlocked. Tiny reward for aggressively agreeing that points are, in fact, bad.</div>}
      </Section>

      {isAdmin&&(group.competition||"PL")==="PL"&&(
        <Section title="Seasons">
          {(()=>{
            const activeSeason=group.season||2025;
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
                {isAdmin&&(
                  <div>
                    <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:8}}>Gameweeks</div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <Btn variant="muted" small onClick={backfillGWs}>Create future GWs</Btn>
                      <Btn variant="muted" small onClick={backfillAllGWs}>Create all GWs</Btn>
                      {backfillMsg&&<span style={{fontSize:11,color:"#22c55e"}}>{backfillMsg}</span>}
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:8}}>
                      <Btn variant="amber" small onClick={syncAllDates} disabled={syncingDates}>{syncingDates?"Syncing...":"Sync all dates"}</Btn>
                      {syncDatesMsg&&<span style={{fontSize:11,color:syncDatesMsg.startsWith("✓")?"#22c55e":"#ef4444"}}>{syncDatesMsg}</span>}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:8}}>Start a new season</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <Input value={newSeasonYear} onChange={setNewSeasonYear} placeholder="Year e.g. 2026" style={{width:150}} onKeyDown={e=>e.key==="Enter"&&startNewSeason()}/>
                    <Btn onClick={startNewSeason} disabled={!newSeasonYear.trim()} small>Start →</Btn>
                  </div>
                  {seasonMsg&&<div style={{fontSize:11,color:seasonMsg.includes("started")?"#22c55e":"#ef4444",marginTop:8}}>{seasonMsg}</div>}
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:8}}>Include in scores &amp; trends</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {[["all","All Seasons"],["current","Current Season Only"]].map(([val,label])=>{
                      const active=(group.scoreScope||"all")===val;
                      return <button key={val} onClick={()=>saveScope(val)} style={{background:active?"var(--btn-bg)":"var(--card)",color:active?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>;
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      )}

      {isAdmin&&(
        <Section title="Gameweek Visibility">
          <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:10,letterSpacing:0.3}}>Toggle which gameweeks players can submit picks for</div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {(group.gameweeks||[])
              .filter(g=>(g.season||group.season||2025)===(group.season||2025))
              .sort((a,b)=>a.gw-b.gw)
              .map(g=>{
                const hidden=(group.hiddenGWs||[]).includes(g.gw);
                return (
                  <button key={g.gw} onClick={()=>updateGroup(grp=>{
                    const h=grp.hiddenGWs||[];
                    const isHid=h.includes(g.gw);
                    return {...grp,hiddenGWs:isHid?h.filter(n=>n!==g.gw):[...h,g.gw]};
                  })} style={{
                    background:hidden?"var(--card)":"var(--btn-bg)",
                    color:hidden?"var(--text-dim2)":"var(--btn-text)",
                    border:"1px solid var(--border)",
                    borderRadius:6,
                    padding:"5px 0",
                    fontSize:11,
                    cursor:"pointer",
                    fontFamily:"inherit",
                    letterSpacing:1,
                    flexShrink:0,
                    minWidth:54,
                    textAlign:"center",
                    opacity:hidden?0.45:1,
                    transition:"all 0.15s",
                  }}>{gwLabel(group,g.gw)}</button>
                );
              })}
          </div>
        </Section>
      )}

      {isAdmin&&(
        <Section title="Prediction Limits">
          <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:10,letterSpacing:0.3}}>Max 1-1 predictions per gameweek</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["unlimited","Unlimited"],["2","2 / week"],["1","1 / week"],["none","None"]].map(([val,label])=>{
              const active=(group.draw11Limit||"unlimited")===val;
              return <button key={val} onClick={()=>save11Limit(val)} style={{background:active?"var(--btn-bg)":"var(--card)",color:active?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>;
            })}
          </div>
          {limitSaved&&<div style={{fontSize:11,color:"#22c55e",marginTop:8}}>Saved</div>}
        </Section>
      )}

      {isAdmin&&(
        <Section title="Backups">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <Btn variant="amber" small onClick={createBackup} disabled={backupBusy}>{backupBusy?"Saving...":"BACKUP NOW"}</Btn>
              {backupMsg&&<span style={{fontSize:11,color:backupMsg.startsWith("✓")?"#22c55e":"#ef4444"}}>{backupMsg}</span>}
            </div>
            {(group.backups||[]).length===0&&(
              <div style={{fontSize:11,color:"var(--text-dim)"}}>No backups yet.</div>
            )}
            {(group.backups||[]).map(bk=>{
              const dateStr=new Date(bk.createdAt).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
              const displayName=`${bk.createdBy[0].toUpperCase()}${bk.createdBy.slice(1)}`;
              const isRestoring=restoringId===bk.id;
              return (
                <div key={bk.id} style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:8,padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
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
        </Section>
      )}

      <Section title="Invite Code">
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:12,padding:"0 24px",height:80,display:"flex",alignItems:"center",fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:8,lineHeight:1}}>{group.code}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={copyCode} variant={copied?"success":"ghost"} small>{copied?"Copied!":"Copy Code"}</Btn>
              <Btn onClick={copyLink} variant={copiedLink?"success":"ghost"} small>{copiedLink?"Copied!":"Copy Link"}</Btn>
            </div>
            <div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:0.3}}>Share the link or code with friends to join.</div>
          </div>
        </div>
      </Section>

      <Section title="Live Data: football-data.org">
        <div style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"18px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e"}}/>
            <span style={{color:"#22c55e",fontSize:13,fontWeight:500,letterSpacing:0.5}}>API Connected Globally</span>
          </div>
          <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.9}}>
            Live Premier League data is active for all groups automatically.<br/>
            {isAdmin&&<><br/><span style={{color:"var(--text-dim)"}}>As an admin, go to </span><strong style={{color:"#f59e0b"}}>Fixtures → Sync Fixtures</strong><span style={{color:"var(--text-dim)"}}> to pull the latest matches and results at any time.</span></>}
          </div>
          {isAdmin&&(
            <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border3)"}}>
              <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>SEASON YEAR</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Input value={season} onChange={setSeason} placeholder="2025" style={{width:90}}/>
                <Btn onClick={saveApiKey} variant={apiSaved?"success":"default"} small>{apiSaved?"Saved! ✓":"Save"}</Btn>
              </div>
            </div>
          )}
        </div>
      </Section>

      {isCreator&&(
        <Section title="Group Name">
          <div style={{display:"flex",gap:8}}>
            <Input value={newName} onChange={setNewName} onKeyDown={e=>e.key==="Enter"&&saveName()}/>
            <Btn onClick={saveName} variant={nameSaved?"success":"default"}>{nameSaved?"Saved!":"Save"}</Btn>
          </div>
        </Section>
      )}

      <Section title="Info">
        <div style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:2.2}}>
          {[["Members",group.members?.length],["Gameweeks",(group.gameweeks||[]).filter(g=>(g.season||group.season||2025)===(group.season||2025)).length],["API Status","Active"],["Active Season",group.season||2025],["Score Scope",(group.scoreScope||"all")==="all"?"All Seasons":"Current Season"],["Your role",isCreator?"Creator":isAdmin?"Admin":"Member"]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",borderBottom:"1px solid var(--border3)",paddingBottom:4}}>
              <span style={{color:"var(--text-dim)"}}>{l}</span>
              <span style={{color:l==="API Status"?"#22c55e":l==="Your role"?(isCreator?"#f59e0b":isAdmin?"#60a5fa":"var(--text-dim2)"):"inherit"}}>{v}</span>
            </div>
          ))}
        </div>
      </Section>

      {seasonComplete && seasonWinner && (
        <Section title="Season Awards">
          <div style={{background:"linear-gradient(180deg, var(--card), var(--surface))",border:"1px solid var(--border3)",borderRadius:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:1.9}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:8}}>🏆 {names[seasonWinner.username]||seasonWinner.username}</div>
            <div style={{marginBottom:6}}>Official title: <span style={{color:"#fbbf24"}}>Least Wrong</span></div>
            <div style={{marginBottom:6}}>Finished on <span style={{color:"var(--text-bright)"}}>{seasonWinner.total} pts</span> with <span style={{color:"#22c55e"}}>{seasonWinner.perfects} perfect</span> pick{seasonWinner.perfects===1?"":"s"}.</div>
            <div style={{color:"var(--text-dim)"}}>A completely meaningless honour. Naturally everyone will care a lot.</div>
          </div>
        </Section>
      )}

      <Section title="Scoring Rules">
        <div style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:1.9}}>
          <div style={{color:"var(--text-mid)",marginBottom:8,fontFamily:"'Playfair Display',serif",fontSize:14}}>Keep your points low.</div>
          <div>Each goal your prediction is off = 1 point.</div>
          <div style={{marginTop:6}}><span style={{color:"var(--text-dim)"}}>Predict 1-1, actual 2-3 → 1+2 = </span><strong style={{color:"#ef4444"}}>3 pts ❌</strong></div>
          <div><span style={{color:"var(--text-dim)"}}>Predict 2-1, actual 2-1 → 0+0 = </span><strong style={{color:"#22c55e"}}>0 pts ⭐</strong></div>
        </div>
      </Section>

      {isAdmin&&(
        <Section title="Reminders">
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Btn variant="amber" onClick={sendReminders} disabled={reminderLoading}>{reminderLoading?"Sending...":"Send pick reminders"}</Btn>
            {reminderMsg&&<span style={{fontSize:12,color:"var(--text-mid)"}}>{reminderMsg}</span>}
          </div>
          <div style={{fontSize:11,color:"var(--text-dim2)",marginTop:8}}>Emails GW{reminderTargetGW} members who haven't submitted all picks yet.</div>
        </Section>
      )}
      {!isCreator&&<Btn variant="danger" onClick={leaveGroup}>Leave Group</Btn>}
      {isCreator&&<Btn variant="danger" onClick={()=>{setDeleteModalOpen(true);setDeletePw("");setDeleteError("");}}>Delete Group</Btn>}
      {skipModal&&createPortal(
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:28,maxWidth:400,width:"100%"}}>
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
                  <Btn variant="amber" onClick={()=>setSkipConfirm(true)}>Continue →</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:15,color:"#f59e0b",marginBottom:10,fontWeight:700}}>Are you sure?</div>
                <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20,lineHeight:1.6}}>
                  Skipping {names[skipModal.playerId]||skipModal.playerId} for {skipModal.home} vs {skipModal.away} is permanent.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn variant="ghost" onClick={()=>setSkipConfirm(false)}>← Back</Btn>
                  <Btn variant="danger" onClick={()=>issueSkip(skipModal.playerId,skipModal.fixtureId)}>Yes, Skip</Btn>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {deleteModalOpen&&createPortal(
        <div onClick={()=>setDeleteModalOpen(false)} style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid #ef444440",borderRadius:14,padding:32,width:"100%",maxWidth:400}}>
            <div style={{fontSize:10,color:"#ef4444",letterSpacing:3,marginBottom:12}}>DELETE GROUP</div>
            <div style={{fontSize:13,color:"var(--text)",marginBottom:6}}>This permanently deletes <strong>{group.name}</strong> and all its data.</div>
            <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20}}>Enter your password to confirm.</div>
            <Input value={deletePw} onChange={setDeletePw} placeholder="Your password" type="password" onKeyDown={e=>e.key==="Enter"&&deleteGroup()} />
            {deleteError&&<div style={{color:"#ef4444",fontSize:12,marginTop:10}}>{deleteError}</div>}
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <Btn variant="danger" onClick={deleteGroup} disabled={deleteLoading} style={{flex:1,textAlign:"center"}}>
                {deleteLoading?"...":"Delete permanently"}
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
