import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
async function sget(key) {
  try {
    const res = await fetch("/api/db?key=" + encodeURIComponent(key));
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
// Global API key — works for all groups automatically
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

async function fetchMatchweek(apiKey, matchday, season = 2025) {
  const url = matchday != null
    ? `/api/fixtures?matchday=${matchday}&season=${season}`
    : `/api/fixtures?season=${season}`;
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

function parseMatchesToFixtures(matches, matchday) {
  return matches.map((m, i) => {
    const home = normName(m.homeTeam?.name || m.homeTeam?.shortName);
    const away = normName(m.awayTeam?.name || m.awayTeam?.shortName);
    const status = m.status;
    let result = null;
    if (status === "FINISHED" && m.score?.fullTime) {
      const { home: h, away: a } = m.score.fullTime;
      if (h !== null && a !== null) result = `${h}-${a}`;
    }
    const date = m.utcDate ? new Date(m.utcDate) : null;
    return { id: `gw${matchday}-f${m.id || i}`, apiId: m.id, home, away, result, status, date: date ? date.toISOString() : null };
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

function calcPts(pred, result) {
  if (!pred || !result) return null;
  const [ph, pa] = pred.split("-").map(Number);
  const [rh, ra] = result.split("-").map(Number);
  if (isNaN(ph)||isNaN(pa)||isNaN(rh)||isNaN(ra)) return null;
  return Math.abs(ph - rh) + Math.abs(pa - ra);
}

function genCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
const PALETTE = ["#60a5fa","#f472b6","#4ade80","#fb923c","#a78bfa","#facc15","#34d399","#f87171"];
const CLUB_COLORS = {
  "Arsenal":"#EF0107","Aston Villa":"#95BFE5","Bournemouth":"#DA291C","Brentford":"#E30613",
  "Brighton":"#0057B8","Chelsea":"#034694","Crystal Palace":"#1B458F","Everton":"#003399",
  "Fulham":"#CC0000","Ipswich":"#0044A9","Leicester":"#003090","Liverpool":"#C8102E",
  "Man City":"#6CABDD","Man Utd":"#DA291C","Newcastle":"#241F20","Nott'm Forest":"#DD0000",
  "Southampton":"#D71920","Spurs":"#132257","West Ham":"#7A263A","Wolves":"#FDB913"
};

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

const Avatar = ({ name, size = 36, color }) => {
  const ini = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const hue = [...(name||"")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  const bg = color ? `${color}28` : `hsl(${hue},55%,32%)`;
  const fg = color ? color : `hsl(${hue},75%,80%)`;
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.38,flexShrink:0,fontFamily:"'DM Mono',monospace",letterSpacing:-1,userSelect:"none"}}>{ini}</div>;
};

const BadgeScore = ({ score }) => {
  if (score===null||score===undefined) return <span style={{color:"var(--text-dim2)",fontSize:13}}>—</span>;
  const c = score===0?"#22c55e":score<=2?"#f59e0b":"#ef4444";
  return <span style={{background:c+"20",color:c,border:`1px solid ${c}40`,borderRadius:6,padding:"2px 9px",fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{score}</span>;
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
  html,body{background:var(--bg);}
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:var(--scrollbar);border-radius:2px;}
  @keyframes fadein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  .fade{animation:fadein 0.25s ease forwards;}
  .frow:hover{background:var(--card-hover)!important;}
  .nb{background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;transition:all 0.18s;}
  .nb:hover{color:var(--text-mid)!important;}
  .nb.active{color:var(--text-bright)!important;border-bottom-color:var(--text)!important;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
  @keyframes thumbdown{0%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(-70px) scale(1.5);}}
  .thumbdown{position:fixed;pointer-events:none;font-size:26px;animation:thumbdown 0.8s ease-out forwards;z-index:9999;}
  .bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;border-top:1px solid var(--border);background:var(--bg);z-index:100;justify-content:space-around;align-items:flex-start;height:calc(54px + env(safe-area-inset-bottom));}
  .bot-nav .nb{height:54px;border-top:none!important;}
  .bot-nav .nb.active{border-bottom-color:var(--text)!important;}
  @media(max-width:620px){.mob-hide{display:none!important;}.bot-nav{display:flex!important;}.pad-bot{padding-bottom:calc(70px + env(safe-area-inset-bottom))!important;}input{font-size:16px!important;}.gw-outer{width:100%!important;}.gw-controls{width:100%!important;}.gw-controls .gw-strip{flex:1!important;max-width:none!important;}}
  .gw-strip{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}.gw-strip::-webkit-scrollbar{display:none;}
  .excel-mode table,.excel-mode table *{font-family:Arial,Calibri,sans-serif!important;}
  .excel-mode table td,.excel-mode table th{border:1px solid var(--border)!important;border-radius:0!important;padding:5px 8px!important;}
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
      });
      return {gw:g.gw, season:g.season||activeSeason, points:gwPts};
    });
    return {username, total, scored, perfects, avg:scored>0?(total/scored).toFixed(2):"–", gwTotals};
  }).sort((a,b)=>a.total-b.total);
}

/* ── AUTH ─────────────────────────────────────────── */
function AuthScreen({ onLogin, successMsg }) {
  const [mode,setMode]=useState("login");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
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
          {forgotMode ? (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{fontSize:12,color:"var(--text-dim)",letterSpacing:1}}>Enter your email and we'll send a reset link.</div>
              <Input value={forgotEmail} onChange={setForgotEmail} placeholder="Email" type="email" autoFocus onKeyDown={e=>e.key==="Enter"&&sendReset()} />
              {forgotMsg&&<div style={{fontSize:12,color:"#22c55e"}}>{forgotMsg}</div>}
              <Btn onClick={sendReset} disabled={forgotLoading||!forgotEmail.trim()} style={{width:"100%",padding:"12px 0",display:"block",textAlign:"center",letterSpacing:2}}>
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
        <div style={{textAlign:"center",marginTop:20,color:"var(--border2)",fontSize:11,letterSpacing:1}}>Premier League Prediction Game</div>
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

/* ── GROUP LOBBY ─────────────────────────────────── */
function GroupLobby({ user, onEnterGroup, onUpdateUser }) {
  const [groups,setGroups]=useState([]);
  const [loading,setLoading]=useState(true);
  const [createName,setCreateName]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [error,setError]=useState("");
  const [thumbs,setThumbs]=useState([]);
  const spawnThumb = (e) => {
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
  };
  const [creating,setCreating]=useState(false);
  const [setupMode,setSetupMode]=useState(false);
  const [setupGW,setSetupGW]=useState("1");
  const [setupLimit,setSetupLimit]=useState("unlimited");
  const [setupGWLoading,setSetupGWLoading]=useState(false);

  useEffect(()=>{loadGroups();},[]);

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
    const startGW = Math.max(1,Math.min(38,parseInt(setupGW)||1));
    const startingGWs = Array.from({length:38-startGW+1},(_,i)=>({gw:startGW+i,season:2025,fixtures:makeFixturesFallback(startGW+i,2025)}));
    let newGroup = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:startingGWs,currentGW:startGW,apiKey:"",season:2025,hiddenGWs:[],scoreScope:"all",draw11Limit:setupLimit,adminLog:[]};
    try {
      const globalDoc = await sget("fixtures:PL:2025");
      if (globalDoc&&(globalDoc.gameweeks||[]).length) {
        newGroup = mergeGlobalIntoGroup(globalDoc,newGroup);
      }
    } catch(e){ console.error("createGroup global seed failed",e); }
    await sset(`group:${id}`,newGroup);
    await sset(`groupcode:${code}`,id);
    const fresh = await sget(`user:${user.username}`);
    const updated = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
    await sset(`user:${user.username}`,updated);
    onUpdateUser(updated);setCreateName("");setSetupMode(false);setSetupGW("1");setSetupLimit("unlimited");setCreating(false);
    onEnterGroup(newGroup);
  };

  const joinGroup = async () => {
    const code = joinCode.trim();
    if (code.length!==4){setError("Enter a 4-digit code.");return;}
    const id = await sget(`groupcode:${code}`);
    if (!id){setError("Group not found.");return;}
    const group = await sget(`group:${id}`);
    if (!group){setError("Group not found.");return;}
    if (group.members.includes(user.username)){setError("Already in this group!");return;}
    const updated = {...group,members:[...group.members,user.username]};
    await sset(`group:${id}`,updated);
    const fresh = await sget(`user:${user.username}`);
    const updatedUser = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
    await sset(`user:${user.username}`,updatedUser);
    onUpdateUser(updatedUser);setJoinCode("");setError("");
    onEnterGroup(updated);
  };

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",fontFamily:"'DM Mono',monospace",color:"var(--text)"}}>
      <style>{CSS}</style>
      <header style={{borderBottom:"1px solid var(--border)",padding:"0 24px",height:60}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:"var(--text-bright)"}}>POINTS</span><span onClick={spawnThumb} style={{color:"var(--text-dim)",fontSize:9,letterSpacing:3,fontFamily:"'DM Mono',monospace",fontWeight:400,cursor:"pointer",userSelect:"none"}}>are bad</span></div>
          {thumbs.map(th=><div key={th.id} className="thumbdown" style={{left:th.x-13,top:th.y-10}}>👎</div>)}
          <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar name={user.displayName} size={28}/><span style={{fontSize:12,color:"var(--text-dim2)"}}>{user.displayName}</span></div>
        </div>
      </header>
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
                  <div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{g.members.length} MEMBER{g.members.length!==1?"S":""} · GW{g.currentGW} · {"⚡ API"}</div>
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
                  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>STARTING GW{setupGWLoading&&<span style={{color:"var(--text-dim3)",letterSpacing:0,marginLeft:6,textTransform:"none"}}>detecting...</span>}</div>
                  <Input value={setupGW} onChange={setSetupGW} placeholder="1" style={{width:80}} />
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
                  <Btn variant="ghost" small onClick={()=>setSetupMode(false)}>← Back</Btn>
                  <Btn onClick={createGroup} disabled={creating} style={{flex:1,textAlign:"center"}}>{creating?"...":"Create Group →"}</Btn>
                </div>
              </div>
            )}
          </div>
          <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:12,padding:20}}>
            <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:14}}>JOIN WITH CODE</div>
            <Input value={joinCode} onChange={v=>{setJoinCode(v.replace(/\D/g,"").slice(0,4));setError("");}} placeholder="4-digit code" onKeyDown={e=>e.key==="Enter"&&joinGroup()} />
            <Btn onClick={joinGroup} disabled={joinCode.length!==4} style={{width:"100%",marginTop:10,padding:"9px 0",display:"block",textAlign:"center"}}>Join →</Btn>
          </div>
        </div>
        {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:12}}>{error}</div>}
      </div>
    </div>
  );
}

/* ── MAIN APP ────────────────────────────────────── */
const NAV = ["League","Fixtures","Trends","Members","Group"];
const THEMES=["dark","light","excel","terminal","nord","pitch"];
const THEME_META=[
  {key:"dark",   label:"Dark",     swatches:["#080810","#0e0e1a","#e8e4d9"]},
  {key:"light",  label:"Light",    swatches:["#f4f1e8","#fff","#1a1814"]},
  {key:"excel",  label:"Excel",    swatches:["#ffffff","#f2f2f2","#1a1a1a"]},
  {key:"terminal",label:"Terminal",swatches:["#000000","#0a0a0a","#00cc44"]},
  {key:"nord",   label:"Nord",     swatches:["#2e3440","#3b4252","#eceff4"]},
  {key:"pitch",  label:"Pitch",    swatches:["#0d1f0d","#122012","#d4ecd4"]},
];

export default function App() {
  const [user,setUser]=useState(null);
  const [group,setGroup]=useState(null);
  const [tab,setTab]=useState("League");
  const [boot,setBoot]=useState(false);
  const [theme,setTheme]=useState(()=>{const t=localStorage.getItem("theme");return THEMES.includes(t)?t:"dark";});
  const [toast,setToast]=useState(null);
  const [bootError,setBootError]=useState(false);
  const toastTimer=useRef(null);
  const [resetToken]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get("reset")||null;
  });
  const [resetDone,setResetDone]=useState(false);
  const showToast=useCallback((msg)=>{
    setToast(msg);
    if(toastTimer.current)clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),4000);
  },[]);

  useEffect(()=>{
    document.documentElement.setAttribute("data-theme",theme);
    localStorage.setItem("theme",theme);
  },[theme]);

  const runBoot=useCallback(async()=>{
    setBootError(false);
    setBoot(false);
    const saved=lget("session");
    if(saved?.username){
      const u=await sget(`user:${saved.username}`);
      if(!u){setBootError(true);setBoot(true);return;}
      setUser(u);
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

  const handleLogin = async (u) => {lset("session",{username:u.username});setUser(u);};
  const handleLogout = async () => {ldel("session");setUser(null);setGroup(null);};
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
      {!boot?(
        <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",
          justifyContent:"center",color:"var(--text-dim)",fontFamily:"monospace",fontSize:12}}>
          loading...
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
      ):!user?(
        <AuthScreen onLogin={handleLogin} successMsg={resetDone?"Password updated - please sign in.":null}/>
      ):!group?(
        <GroupLobby user={user} onEnterGroup={handleEnterGroup} onUpdateUser={u=>setUser(u)}/>
      ):(
        <GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin}
          isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout}
          updateGroup={updateGroup} patchGroup={patchGroup} refreshGroup={refreshGroup}
          theme={theme} setTheme={setTheme}/>
      )}
    </>
  );
}

/* ── GAME SHELL ──────────────────────────────────── */
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,updateGroup,patchGroup,refreshGroup,theme,setTheme}) {
  useEffect(()=>{refreshGroup();},[tab]);
  const [thumbs,setThumbs]=useState([]);
  const [names,setNames]=useState(()=>{const init={};(group.members||[]).forEach(u=>{init[u]=u[0].toUpperCase()+u.slice(1);});init[user.username]=user.displayName;return init;});
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
    (async()=>{const e=await Promise.all((group.members||[]).map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||(u[0].toUpperCase()+u.slice(1))];}));setNames(Object.fromEntries(e));})();
  },[group.members?.join(",")]);
  const spawnThumb = (e) => {
    e.stopPropagation();
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
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
  const stats = computeStats(group);
  const myRank = stats.findIndex(s => s.username === user.username) + 1;
  const activeSeason = group.season || 2025;
  const completedGWs = (group.gameweeks || [])
    .filter(g => (g.season || activeSeason) === activeSeason && g.fixtures.length > 0 && g.fixtures.every(f => f.result));
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
    recapContent = { gwNum, winners, minPts, totalGoals };
  }
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
          <div className="mob-hide" style={{fontSize:10,color:"#22c55e",letterSpacing:1,marginRight:12,background:"#22c55e15",border:"1px solid #22c55e25",borderRadius:4,padding:"3px 8px",flexShrink:0}}>⚡ LIVE API</div>

          <nav className="mob-hide" style={{display:"flex",gap:0,flexShrink:0}}>
            {NAV.map(t=>(
              <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"var(--text-bright)":"var(--text-dim)",fontSize:10,letterSpacing:2,padding:"22px 12px 20px",textTransform:"uppercase"}}>{t}</button>
            ))}
          </nav>
          <div ref={profileRef} style={{position:"relative",display:"flex",alignItems:"center",marginLeft:20,borderLeft:"1px solid var(--border)",paddingLeft:20,height:"100%"}}>
            <button onClick={()=>setProfileOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:7,borderRadius:4}}>
              <Avatar name={user.displayName} size={26}/>
              {myRank > 0 && (
                <span style={{fontSize:11,color:"var(--text-dim2)",fontFamily:"'DM Mono',monospace",letterSpacing:0.5,lineHeight:1}}>
                  {myRank===1?"🥇":myRank===2?"🥈":myRank===3?"🥉":`#${myRank}`}
                </span>
              )}
            </button>
            {profileOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:6,zIndex:100,minWidth:100,boxShadow:"0 4px 16px #00000030"}}>
                <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:1,padding:"4px 8px 6px",borderBottom:"1px solid var(--border)",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{user.displayName}</div>
                <button onClick={()=>{setProfileOpen(false);setPwError("");setPwSuccess(false);setAccountOpen(true);}} style={{width:"100%",background:"none",border:"none",borderRadius:6,color:"var(--text-mid)",cursor:"pointer",fontSize:11,letterSpacing:1.5,padding:"6px 8px",fontFamily:"inherit",textAlign:"left",display:"block",marginBottom:2}}>ACCOUNT</button>
                <button onClick={()=>{setProfileOpen(false);onLogout();}} style={{width:"100%",background:"none",border:"none",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:11,letterSpacing:1.5,padding:"6px 8px",fontFamily:"inherit",textAlign:"left",display:"block"}}>LOG OUT</button>
              </div>
            )}
          </div>
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
        {NAV.map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"var(--text-bright)":"var(--text-dim)",fontSize:9,letterSpacing:1.5,padding:"6px 6px 0",textTransform:"uppercase",flex:1}}>{t}</button>
        ))}
      </nav>
      <main style={{maxWidth:940,margin:"0 auto",padding:"32px 20px"}} className="fade pad-bot" key={tab}>
        {recapContent && (
          <div style={{background:"#8888cc12",border:"1px solid #8888cc25",borderRadius:8,padding:"10px 16px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div style={{fontSize:11,color:"#8888cc",letterSpacing:1,flex:1,minWidth:0}}>
              <span style={{opacity:0.6,marginRight:10}}>GW{recapContent.gwNum} RECAP</span>
              {recapContent.winners.length > 0 && <span style={{marginRight:8}}>{recapContent.winners.map(w => names[w.username] || w.username).join(" & ")} won the week <span style={{opacity:0.7}}>({recapContent.minPts} pts)</span></span>}
              {recapContent.totalGoals > 0 && <span style={{opacity:0.7}}>· {recapContent.totalGoals} goals total</span>}
            </div>
            <button onClick={() => { lset(recapKey, true); setRecapDismissed(true); }}
              style={{background:"none",border:"none",color:"#8888cc",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px",opacity:0.6,flexShrink:0}}>×</button>
          </div>
        )}
        {tab==="League"&&<LeagueTab group={group} user={user} names={names}/>}
        {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} updateGroup={updateGroup} patchGroup={patchGroup} names={names} theme={theme}/>}
        {tab==="Trends"&&<TrendsTab group={group} names={names}/>}
        {tab==="Members"&&<MembersTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} names={names} updateNickname={updateNickname}/>}
        {tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} onLeave={onLeave} theme={theme} setTheme={setTheme}/>}
      </main>
    </div>
  );
}

/* ── LEAGUE ──────────────────────────────────────── */
function LeagueTab({group,user,names}) {
  const mob = useMobile();
  const stats = computeStats(group);
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
          {stats.map((p,i)=>(
            <div key={p.username} style={{display:"grid",gridTemplateColumns:mob?"40px 1fr 80px":"52px 1fr 80px 80px 90px",alignItems:"center",gap:mob?8:12,padding:mob?"12px 14px":"16px 20px",background:p.username===user.username?"var(--card-hi)":"var(--card)",borderRadius:10,border:`1px solid ${p.username===user.username?"var(--border2)":"var(--border3)"}`}}>
              <div style={{textAlign:"center"}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:i<3?(mob?18:22):(mob?13:16),fontWeight:900,color:i===0?"#fbbf24":i===1?"#9ca3af":i===2?"#b45309":"var(--text-dim)"}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:mob?8:12,minWidth:0}}>
                <Avatar name={names[p.username]||p.username} size={mob?28:34} color={PALETTE[(group.members||[]).indexOf(p.username)%PALETTE.length]}/>
                <div style={{fontSize:mob?12:14,color:p.username===user.username?"#8888cc":"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names[p.username]||p.username}{p.username===user.username&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:6}}>you</span>}</div>
              </div>
              {!mob&&<div style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>PERFECT</div><div style={{color:"#22c55e",fontWeight:700}}>{p.perfects}</div></div>}
              {!mob&&<div style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>AVG</div><div style={{color:"var(--text-mid)"}}>{p.avg}</div></div>}
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,marginBottom:3}}>PTS</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:mob?22:28,fontWeight:900,color:i===0?"#fbbf24":"var(--text-bright)",lineHeight:1}}>{p.total}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── FIXTURES ────────────────────────────────────── */
function NextMatchCountdown({ group, unpickedCount = 0 }) {
  const [now, setNow] = useState(new Date());
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
  const urgent = unpickedCount > 0 && diff < 3 * 3600000;
  const warning = unpickedCount > 0 && diff < 24 * 3600000;
  const label = warning ? "Picks due" : "Next kick-off";
  const borderColor = urgent ? "#ef444435" : warning ? "#f59e0b35" : "var(--border3)";
  const bgColor = urgent ? "#ef444408" : warning ? "#f59e0b08" : "var(--card)";
  const textColor = urgent ? "#ef4444" : warning ? "#f59e0b" : "var(--text-dim)";
  const timerColor = urgent ? "#ef4444" : warning ? "#f59e0b" : "var(--text-bright)";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");

  return (
    <div style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:8,padding:"12px 18px",marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:10,color:textColor,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:13,color:"var(--text-mid)"}}>{next.home} <span style={{color:"var(--text-dim)"}}>vs</span> {next.away}</div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:16,color:timerColor,letterSpacing:3,animation:urgent?"pulse 1s ease-in-out infinite":undefined}}>
        {days > 0 && <span style={{color:"var(--text-mid)"}}>{days}d </span>}
        {pad(hours)}:{pad(mins)}:{pad(secs)}
      </div>
    </div>
  );
}

function FixturesTab({group,user,isAdmin,updateGroup,patchGroup,names,theme}) {
  const mob = useMobile();
  const gwStripRef = useRef(null);
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
  const picksLockedKey = `picks-locked:${group.id}:${user.username}:${activeSeason}:gw${currentGW}`;
  const [picksLocked, setPicksLocked] = useState(false);
  useEffect(()=>{setPicksLocked(!!lget(picksLockedKey));},[currentGW]);
  const allFixturesFinished = gwFixtures.length>0 && gwFixtures.every(f=>!!f.result);
  const myPreds = group.predictions?.[user.username]||{};
  const hasApiKey = true; // Global API key always active
  const gwAdminLocked = !isAdmin && (group.hiddenGWs||[]).includes(currentGW);
  const unpickedUnlocked = gwAdminLocked ? [] : gwFixtures.filter(f=>{
    const locked=!!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=new Date()));
    return !locked&&!myPreds[f.id];
  });
  const canViewAllPicks = unpickedUnlocked.length===0;

  const savePred = async (fixtureId, val) => {
    const f = gwFixtures.find(fx => fx.id === fixtureId);
    const locked = !!(f?.result || f?.status==="FINISHED" || f?.status==="IN_PLAY" || f?.status==="PAUSED" || (f?.date && new Date(f.date) <= new Date()));
    if (locked) return;
    if (!/^\d+-\d+$/.test(val)) return;
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
    await patchGroup(`predictions.${user.username}.${fixtureId}`, val);
    setSaving(s=>{const n={...s};delete n[fixtureId];return n;});
  };

  const saveResult = async (fixtureId) => {
    const val = resultDraft[fixtureId];
    if (!val||!/^\d+-\d+$/.test(val)) return;
    await updateGroup(g=>({...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:val}:f)}))}));
    setResultDraft(d=>{const n={...d};delete n[fixtureId];return n;});
  };

  const clearResult = async (fixtureId) => {
    await updateGroup(g=>({...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:null}:f)}))}));
  };

  const fetchFromAPI = async () => {
    setFetching(true); setFetchMsg("Syncing GW" + currentGW + " from football-data.org...");
    try {
      const seas = group.season||2025;
      const matches = await fetchMatchweek(group.apiKey, currentGW, seas);
      if (!matches.length) { setFetchMsg("No matches found for this gameweek."); setFetching(false); return; }
      const apiFixtures = parseMatchesToFixtures(matches, currentGW);
      const globalKey = `fixtures:PL:${seas}`;
      const existingGlobal = await sget(globalKey)||{season:seas,updatedAt:0,gameweeks:[]};
      const updatedGlobal = regroupGlobalDoc(existingGlobal, currentGW, apiFixtures);
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
      const prefix = seas!==2025?`${seas}-`:"";
      const freshFixtures = Array.from({length:10},(_,i)=>({id:`${prefix}gw${gwToClear}-f${i}`,home:"TBD",away:"TBD",result:null,status:"SCHEDULED"}));
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
    const globalKey = `fixtures:PL:${seas}`;
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
            <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:3,marginBottom:24}}>GW{currentGW} · {wizardQueue.length-wizardStep} MATCH{wizardQueue.length-wizardStep!==1?"ES":""} TO PICK</div>
            <div style={{display:"flex",justifyContent:"center",gap:12,alignItems:"center",marginBottom:24}}>
              <div style={{textAlign:"right",flex:1}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:"var(--text-bright)",letterSpacing:-0.5}}>{wizardFixture.home}</span>
                <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[wizardFixture.home]||"var(--text-dim)",display:"inline-block",marginLeft:6,verticalAlign:"middle"}}/>
              </div>
              <span style={{fontSize:11,color:"var(--text-dim)",letterSpacing:3,flexShrink:0}}>VS</span>
              <div style={{textAlign:"left",flex:1}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[wizardFixture.away]||"var(--text-dim)",display:"inline-block",marginRight:6,verticalAlign:"middle"}}/>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:"var(--text-bright)",letterSpacing:-0.5}}>{wizardFixture.away}</span>
              </div>
            </div>
            {wizardFixture.date&&<div style={{fontSize:11,color:"var(--text-dim)",marginBottom:20}}>{new Date(wizardFixture.date).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
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
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1}}>Gameweek {currentGW}</h1>
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
                    {adminHidden?"🔒":""}GW{g.gw}
                  </button>
                );
              })}
            </div>
            <button onClick={()=>gwStripRef.current&&gwStripRef.current.scrollBy({left:gwStripRef.current.clientWidth,behavior:"smooth"})} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim2)",cursor:"pointer",fontSize:13,padding:"4px 8px",lineHeight:1,flexShrink:0}}>›</button>
          </div>
          {isAdmin&&deleteGWStep===0&&removeGWStep===0&&<Btn variant="danger" small onClick={()=>setDeleteGWStep(1)}>Clear GW</Btn>}
          {isAdmin&&deleteGWStep===1&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Clear GW{currentGW}?</span>
            <Btn variant="danger" small onClick={()=>setDeleteGWStep(2)}>Confirm</Btn>
            <Btn variant="muted" small onClick={()=>setDeleteGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&deleteGWStep===2&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Really clear GW{currentGW}? All picks lost.</span>
            <Btn variant="danger" small onClick={deleteGW}>Yes, clear</Btn>
            <Btn variant="muted" small onClick={()=>setDeleteGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&removeGWStep===0&&deleteGWStep===0&&<Btn variant="danger" small onClick={()=>setRemoveGWStep(1)}>Delete GW</Btn>}
          {isAdmin&&removeGWStep===1&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Delete GW{currentGW}?</span>
            <Btn variant="danger" small onClick={()=>setRemoveGWStep(2)}>Confirm</Btn>
            <Btn variant="muted" small onClick={()=>setRemoveGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&removeGWStep===2&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Permanently remove GW{currentGW}?</span>
            <Btn variant="danger" small onClick={removeGW}>Yes, delete</Btn>
            <Btn variant="muted" small onClick={()=>setRemoveGWStep(0)}>Cancel</Btn>
          </div>}
          {isAdmin&&<Btn variant={hasApiKey?"amber":"muted"} small onClick={fetchFromAPI} disabled={fetching}>{fetching?"Fetching...":hasApiKey?"⚡ Sync Fixtures":"⚡ Sync (needs API key)"}</Btn>}
        </div>
      </div>

      {fetchMsg&&<div style={{background:fetchMsg.startsWith("✓")?"#22c55e12":"#ef444412",border:`1px solid ${fetchMsg.startsWith("✓")?"#22c55e35":"#ef444435"}`,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:fetchMsg.startsWith("✓")?"#22c55e":"#ef4444"}}>{fetchMsg}</div>}

      {isAdmin&&<div style={{background:"#f59e0b10",border:"1px solid #f59e0b25",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#f59e0b",letterSpacing:1}}>
        ⚡ ADMIN · {hasApiKey?"Click 'Sync Fixtures' to auto-load matches and results.":"Add your football-data.org API key in the Group tab."}
      </div>}

      <NextMatchCountdown group={group} unpickedCount={unpickedUnlocked.length} />

      {gwAdminLocked && (
        <div style={{background:"#ef444410",border:"1px solid #ef444430",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#ef4444",letterSpacing:1}}>
          🔒 THIS GAMEWEEK IS LOCKED BY YOUR ADMIN
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
        const pts = calcPts(myPreds[f.id],f.result);
        const locked = gwAdminLocked || picksLocked || !!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=new Date()));
        const dateStr = f.date?new Date(f.date).toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):null;
        const searchHref = `https://www.google.com/search?q=${encodeURIComponent(f.home+" vs "+f.away)}`;
        const resultBlock = f.result?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--text-bright)",letterSpacing:3}}>{f.result}</span>
            {f.status==="FINISHED"&&<span style={{fontSize:9,color:"#22c55e",letterSpacing:1,opacity:0.6}}>FT</span>}
            {(f.status==="IN_PLAY"||f.status==="PAUSED")&&<span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,animation:"pulse 1.5s infinite"}}>LIVE</span>}
            {isAdmin&&!hasApiKey&&<button onClick={()=>clearResult(f.id)} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:10}}>✕</button>}
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
        const pickBlock = locked?(
          <span style={{color:myPreds[f.id]?"#8888cc":"var(--text-dim)",fontSize:12}}>{myPreds[f.id]||"–"}</span>
        ):(
          <>
            <input value={myPred} placeholder="1-1"
              onChange={e=>setPredDraft(d=>({...d,[f.id]:e.target.value}))}
              onBlur={e=>savePred(f.id,e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&savePred(f.id,e.target.value)}
              style={{width:mob?58:66,background:"var(--input-bg)",borderRadius:6,textAlign:"center",border:`1px solid ${myPreds[f.id]?"#8888cc55":"var(--border2)"}`,color:"#8888cc",padding:"5px 6px",fontFamily:"inherit",fontSize:mob?16:12,outline:"none"}}/>
            {saving[f.id]&&<span style={{fontSize:10,color:"var(--text-dim3)",marginLeft:4}}>…</span>}
          </>
        );
        if (mob) return (
          <div key={f.id} style={{background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)",padding:"12px 14px",marginBottom:2,opacity:locked?0.55:1,transition:"opacity 0.2s"}}>
            {dateStr&&<div style={{fontSize:10,color:"var(--text-dim)",marginBottom:7,letterSpacing:0.3}}>{dateStr}</div>}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:CLUB_COLORS[f.home]||"var(--text-dim)",flexShrink:0}}/>
                <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</a>
              </div>
              <div style={{textAlign:"center",flexShrink:0,minWidth:60}}>{resultBlock}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,justifyContent:"flex-end"}}>
                <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</a>
                <div style={{width:7,height:7,borderRadius:"50%",background:CLUB_COLORS[f.away]||"var(--text-dim)",flexShrink:0}}/>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1}}>PICK</span>
                {pickBlock}
              </div>
              <BadgeScore score={pts}/>
            </div>
          </div>
        );
        return (
          <div key={f.id} className="frow" style={{display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,padding:"13px 14px",background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)",alignItems:"center",marginBottom:2,opacity:locked?0.55:1,transition:"opacity 0.2s"}}>
            <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:0.3,lineHeight:1.4}}>{dateStr||""}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:10}}>
              <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-mid)"}>{f.home}</a>
              <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[f.home]||"var(--text-dim)",flexShrink:0}}/>
            </div>
            <div style={{textAlign:"center"}}>{resultBlock}</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[f.away]||"var(--text-dim)",flexShrink:0}}/>
              <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-mid)"}>{f.away}</a>
            </div>
            <div style={{textAlign:"center"}}>{pickBlock}</div>
            <div style={{textAlign:"center"}}><BadgeScore score={pts}/></div>
          </div>
        );
      })}
      {unpickedUnlocked.length===0&&!picksLocked&&!allFixturesFinished&&(group.members||[]).length>1&&(
        <div style={{marginTop:16,marginBottom:8}}>
          <Btn variant="success" style={{width:"100%"}} onClick={()=>{lset(picksLockedKey,true);setPicksLocked(true);}}>
            LOCK IN PICKS
          </Btn>
          <div style={{fontSize:11,color:"var(--text-dim)",textAlign:"center",marginTop:8}}>You won't be able to change your picks after locking.</div>
        </div>
      )}
      {(picksLocked||allFixturesFinished)&&(group.members||[]).length>1&&canViewAllPicks&&<AllPicksTable group={group} gwFixtures={gwFixtures} isAdmin={isAdmin} updateGroup={updateGroup} adminUser={user} names={names} viewedGW={currentGW} theme={theme}/>}
      {gwFixtures.some(f=>f.result)&&(group.members||[]).length>1&&!canViewAllPicks&&(
        <div style={{marginTop:40,background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"36px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:12}}>🔒</div>
          <div style={{fontSize:13,color:"var(--text-mid)",marginBottom:6}}>Submit your picks to unlock all picks</div>
          <div style={{fontSize:11,color:"var(--text-dim)"}}>{unpickedUnlocked.length} fixture{unpickedUnlocked.length!==1?"s":""} remaining</div>
        </div>
      )}
    </div>
  );
}

function AllPicksTable({group,gwFixtures,isAdmin,updateGroup,adminUser,names,viewedGW,theme}) {
  const [editing,setEditing]=useState({}); // {`${username}:${fixtureId}`: draftValue}
  const members = group.members||[];
  const preds = group.predictions||{};
  const scored = gwFixtures.filter(f=>f.result);
  const weeklyTotals = members.map(u=>scored.reduce((sum,f)=>{const pts=calcPts(preds[u]?.[f.id],f.result);return sum+(pts??0);},0));
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
      const fixture = gwFixtures.find(f=>f.id===fid);
      await updateGroup(g=>{
        const p={...(g.predictions||{})};p[u]={...(p[u]||{}),[fid]:val};
        const entry={id:Date.now(),at:Date.now(),by:adminUser.username,for:u,fixture:fixture?`${fixture.home} vs ${fixture.away}`:fid,gw:viewedGW??group.currentGW,old:oldVal,new:val};
        return {...g,predictions:p,adminLog:[...(g.adminLog||[]),entry]};
      });
    }
    setEditing(e=>{const n={...e};delete n[editKey(u,fid)];return n;});
  };

  return (
    <div style={{marginTop:40}}>
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
              return <th key={u} colSpan={theme==="excel"?2:1} style={{padding:"8px 12px",textAlign:"center",background:excelBg,color:theme==="excel"?"#fff":isWinner?"#fbbf24":"var(--text-mid)",fontWeight:700,fontSize:theme==="excel"?13:undefined,textShadow:isWinner&&!excelBg?"0 0 10px #fbbf2488":"none"}}>{isWinner&&!excelBg&&<span style={{marginRight:5,fontSize:14,textShadow:"0 0 8px #fbbf24cc"}}>★</span>}{names[u]||u}</th>;
            })}
          </tr></thead>
          <tbody>
            {gwFixtures.map((f,fi)=>{
              const rowBg=theme==="excel"?(fi%2===0?"#ffffff":"#f5f5f5"):undefined;
              return (
              <tr key={f.id} style={{borderBottom:"1px solid var(--border3)",background:rowBg}}>
                <td style={{padding:theme==="excel"?"6px 8px":"10px 12px",color:"var(--text-mid)",fontSize:theme==="excel"?13:undefined,fontWeight:theme==="excel"?600:undefined}}>{f.home} vs {f.away}</td>
                <td style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:15,color:"var(--text-bright)",letterSpacing:2}}>{f.result}</td>
                {members.map(u=>{
                  const pred=preds[u]?.[f.id];
                  const pts=calcPts(pred,f.result);
                  const key=editKey(u,f.id);
                  const isEditingCell=editing[key]!==undefined;
                  if(theme==="excel"){
                    const ptsBg=pts===null?"transparent":pts===0?"#d4edda":pts<=3?"transparent":pts===4?"#fef3c7":"#fee2e2";
                    const ptsColor=pts===null?"#999":pts===0?"#16a34a":pts<=3?"#666":pts===4?"#ca8a04":"#dc2626";
                    return [
                      <td key={`${u}-pick`} style={{padding:"5px 6px",textAlign:"center",borderRight:"1px solid #d0d0d0",background:rowBg,cursor:isAdmin?"pointer":"default"}} onClick={()=>isAdmin&&startEdit(u,f.id)}>
                        {isAdmin&&isEditingCell?(
                          <input autoFocus value={editing[key]}
                            onChange={e=>setEditing(ev=>({...ev,[key]:e.target.value}))}
                            onBlur={()=>savePred(u,f.id)}
                            onKeyDown={e=>{if(e.key==="Enter")savePred(u,f.id);if(e.key==="Escape")setEditing(ev=>{const n={...ev};delete n[key];return n;});}}
                            style={{width:40,background:"#fff",border:"1px solid #8888cc",borderRadius:3,color:"#333",padding:"2px 4px",fontFamily:"inherit",fontSize:13,textAlign:"center",outline:"none"}}/>
                        ):(
                          <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{pred||"–"}</span>
                        )}
                      </td>,
                      <td key={`${u}-pts`} style={{padding:"5px 5px",textAlign:"center",background:ptsBg,minWidth:20}}>
                        <span style={{fontSize:13,fontWeight:600,color:ptsColor}}>{pts!==null?pts:""}</span>
                      </td>
                    ];
                  }
                  return (
                    <td key={u} style={{padding:"10px 12px",textAlign:"center"}}>
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
                          <span style={{color:"var(--text-dim3)",fontSize:11}}>{pred||"–"}</span>
                          <BadgeScore score={pts}/>
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
  const stats = computeStats(group);
  const members = group.members||[];
  const memberColor = u => PALETTE[members.indexOf(u)%PALETTE.length];
  const activeSeason = group.season || 2025;
  const scope = group.scoreScope || "all";
  const gws = (group.gameweeks||[]).filter(g => scope === "all" || (g.season||activeSeason) === activeSeason);
  const hasData = stats.some(p=>p.scored>0);
  const tt={background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:8,fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--text)"};
  const ds = stats.map(p=>({...p,dn:names[p.username]||p.username}));
  const completedGws = gws.filter(g=>g.fixtures.length>0&&g.fixtures.every(f=>f.result));
  const gwLine=completedGws.map(g=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.find(e=>e.gw===g.gw&&e.season===(g.season||activeSeason))?.points??0;});return r;});
  const cumLine=completedGws.map((g,gi)=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.filter(e=>completedGws.slice(0,gi+1).some(cg=>cg.gw===e.gw&&(cg.season||activeSeason)===(e.season||activeSeason))).reduce((a,e)=>a+e.points,0);});return r;});
  const perfectsData=ds.map(p=>({name:p.dn,perfects:p.perfects}));
  const preds=group.predictions||{};
  const distData=[0,1,2,3,4,5].map(pts=>{const r={pts:pts===5?"5+":String(pts)};ds.forEach(p=>{let c=0;gws.forEach(g=>g.fixtures.forEach(f=>{if(!f.result)return;const pp=calcPts(preds[p.username]?.[f.id],f.result);if(pp===null)return;if(pts===5?pp>=5:pp===pts)c++;}));r[p.dn]=c;});return r;});
  const CC=({title,children})=><div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"22px 18px",marginBottom:18}}><h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"var(--text-mid)",marginBottom:18}}>{title}</h3>{children}</div>;
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  if (!hasData) return <div style={{textAlign:"center",padding:"80px 0",color:"var(--text-dim)"}}><div style={{fontSize:40,marginBottom:14}}>📊</div><div style={{fontSize:11,letterSpacing:2}}>SYNC RESULTS TO SEE TRENDS</div></div>;
  return (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:28}}>Trends</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:20}}>
        {ds.map((p)=>(
          <div
            key={p.username}
            onClick={() => setSelectedPlayer(prev => prev === p.username ? null : p.username)}
            style={{
              background:"var(--surface)",
              border:`1px solid ${selectedPlayer===p.username ? memberColor(p.username) : "var(--border)"}`,
              borderRadius:10,
              padding:"16px 18px",
              cursor:"pointer",
              opacity: selectedPlayer && selectedPlayer!==p.username ? 0.4 : 1,
              transition:"opacity 0.15s,border-color 0.15s"
            }}
          >
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><Avatar name={p.dn} size={26} color={memberColor(p.username)}/><span style={{fontSize:12,color:"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.dn}</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["TOTAL",p.total,memberColor(p.username)],["AVG",p.avg,"var(--text-mid)"],["PERFECT",p.perfects,"#22c55e"],["PLAYED",p.scored,"var(--text-dim3)"]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:2,marginBottom:2}}>{l}</div><div style={{fontSize:l==="TOTAL"?20:16,fontWeight:700,color:c,fontFamily:l==="TOTAL"?"'Playfair Display',serif":"inherit"}}>{v}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CC title="Points Per Gameweek"><ResponsiveContainer width="100%" height={200}><LineChart data={gwLine} margin={{top:4,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10,color:"var(--text-mid)"}}/>{ds.filter(p => !selectedPlayer || selectedPlayer===p.username).map((p)=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>)}</LineChart></ResponsiveContainer></CC>
      <CC title="Cumulative Points Race (lower = winning)"><ResponsiveContainer width="100%" height={200}><LineChart data={cumLine} margin={{top:4,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.filter(p => !selectedPlayer || selectedPlayer===p.username).map((p)=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2.5} dot={false}/>)}</LineChart></ResponsiveContainer></CC>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
        <CC title="Perfect Predictions"><ResponsiveContainer width="100%" height={180}><BarChart data={perfectsData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Bar dataKey="perfects" fill="#22c55e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></CC>
        <CC title="Points Distribution"><ResponsiveContainer width="100%" height={180}><BarChart data={distData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="pts" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map((p)=><Bar key={p.username} dataKey={p.dn} fill={memberColor(p.username)} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer></CC>
      </div>
    </div>
  );
}

/* ── MEMBERS ─────────────────────────────────────── */
function MembersTab({group,user,isAdmin,isCreator,updateGroup,names,updateNickname}) {
  const members=group.members||[];
  const admins=group.admins||[];
  const [editingNick,setEditingNick]=useState(null);
  const [nickDraft,setNickDraft]=useState("");
  const saveNick=async(username)=>{
    if(nickDraft.trim())await updateNickname(username,nickDraft.trim());
    setEditingNick(null);
  };
  const toggleAdmin=async(username)=>{await updateGroup(g=>{const a=g.admins||[];return {...g,admins:a.includes(username)?a.filter(x=>x!==username):[...a,username]};});};
  const kick=async(username)=>{
    if(username===group.creatorUsername)return;
    const entry={id:Date.now(),at:Date.now(),by:user.username,action:"kick",for:username};
    await updateGroup(g=>({...g,members:g.members.filter(m=>m!==username),admins:(g.admins||[]).filter(a=>a!==username),adminLog:[...(g.adminLog||[]),entry]}));
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
                      {isAdmin&&<button onClick={()=>{setEditingNick(username);setNickDraft(names[username]||username);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-dim3)",fontSize:11,padding:"0 2px",fontFamily:"inherit",lineHeight:1}}>✎</button>}
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
        const log=[...(group.adminLog||[])].reverse().slice(0,50);
        if(!log.length) return null;
        return (
          <div style={{marginTop:40}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:16,letterSpacing:-0.5}}>Admin Edit Log</h2>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {log.map(e=>(
                <div key={e.id} style={{background:"var(--card)",border:`1px solid ${e.action==="kick"?"#ef444430":"var(--border3)"}`,borderRadius:8,padding:"10px 16px",fontSize:11,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    {e.action==="kick"?(
                      <>
                        <span style={{color:"#ef4444"}}>KICK</span>
                        <span style={{color:"#8888cc"}}>{names[e.for]||e.for}</span>
                        <span style={{color:"var(--text-dim)"}}>removed by {names[e.by]||e.by}</span>
                      </>
                    ):(
                      <>
                        <span style={{color:"#f59e0b"}}>GW{e.gw}</span>
                        <span style={{color:"var(--text-mid)"}}>{e.fixture}</span>
                        <span style={{color:"var(--text-dim)"}}>·</span>
                        <span style={{color:"#8888cc"}}>{names[e.for]||e.for}</span>
                        <span style={{color:"var(--text-dim3)"}}>{e.old||"–"}</span>
                        <span style={{color:"var(--text-dim)"}}>→</span>
                        <span style={{color:"#4ade80"}}>{e.new}</span>
                        <span style={{color:"var(--text-dim)"}}>by {names[e.by]||e.by}</span>
                      </>
                    )}
                  </div>
                  <span style={{color:"var(--text-dim)",fontSize:10}}>{new Date(e.at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── GROUP TAB ───────────────────────────────────── */
function GroupTab({group,user,isAdmin,isCreator,updateGroup,onLeave,theme,setTheme}) {
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const copyCode=()=>{navigator.clipboard?.writeText(group.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
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
  const leaveGroup=async()=>{
    if(isCreator)return;
    const fresh=await sget(`user:${user.username}`);
    if(fresh)await sset(`user:${user.username}`,{...fresh,groupIds:(fresh.groupIds||[]).filter(id=>id!==group.id)});
    const ok=await updateGroup(g=>({...g,members:g.members.filter(m=>m!==user.username),admins:(g.admins||[]).filter(a=>a!==user.username)}));
    if(ok)onLeave();
  };
  const deleteGroup = async () => {
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

      <Section title="Appearance">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {THEME_META.map(t=>(
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
      </Section>

      {isAdmin&&(
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
                  }}>GW{g.gw}</button>
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
          <div style={{background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:12,padding:"0 24px",height:80,display:"flex",alignItems:"center",fontFamily:"'Playfair Display',serif",fontSize:44,fontWeight:900,color:"var(--text-bright)",letterSpacing:10,lineHeight:1}}>{group.code}</div>
          <div>
            <Btn onClick={copyCode} variant={copied?"success":"ghost"}>{copied?"Copied!":"Copy Code"}</Btn>
            <div style={{fontSize:11,color:"var(--text-dim)",marginTop:8,letterSpacing:0.3}}>Share with friends to join.</div>
          </div>
        </div>
      </Section>

      <Section title="⚡ Live Data: football-data.org">
        <div style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"18px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e"}}/>
            <span style={{color:"#22c55e",fontSize:13,fontWeight:500,letterSpacing:0.5}}>API Connected Globally</span>
          </div>
          <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.9}}>
            Live Premier League data is active for all groups automatically.<br/>
            {isAdmin&&<><br/><span style={{color:"var(--text-dim)"}}>As an admin, go to </span><strong style={{color:"#f59e0b"}}>Fixtures → ⚡ Sync Fixtures</strong><span style={{color:"var(--text-dim)"}}> to pull the latest matches and results at any time.</span></>}
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
          {[["Members",group.members?.length],["Gameweeks",(group.gameweeks||[]).filter(g=>(g.season||group.season||2025)===(group.season||2025)).length],["API Status","⚡ Active"],["Active Season",group.season||2025],["Score Scope",(group.scoreScope||"all")==="all"?"All Seasons":"Current Season"],["Your role",isCreator?"Creator":isAdmin?"Admin":"Member"]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",borderBottom:"1px solid var(--border3)",paddingBottom:4}}>
              <span style={{color:"var(--text-dim)"}}>{l}</span>
              <span style={{color:l==="API Status"?"#22c55e":l==="Your role"?(isCreator?"#f59e0b":isAdmin?"#60a5fa":"var(--text-dim2)"):"inherit"}}>{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Scoring Rules">
        <div style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:10,padding:"16px 20px",fontSize:12,color:"var(--text-mid)",lineHeight:1.9}}>
          <div style={{color:"var(--text-mid)",marginBottom:8,fontFamily:"'Playfair Display',serif",fontSize:14}}>Keep your points low.</div>
          <div>Each goal your prediction is off = 1 point.</div>
          <div style={{marginTop:6}}><span style={{color:"var(--text-dim)"}}>Predict 1-1, actual 2-3 → 1+2 = </span><strong style={{color:"#ef4444"}}>3 pts ❌</strong></div>
          <div><span style={{color:"var(--text-dim)"}}>Predict 2-1, actual 2-1 → 0+0 = </span><strong style={{color:"#22c55e"}}>0 pts ⭐</strong></div>
        </div>
      </Section>

      {!isCreator&&<Btn variant="danger" onClick={leaveGroup}>Leave Group</Btn>}
      {isCreator&&<Btn variant="danger" onClick={()=>{setDeleteModalOpen(true);setDeletePw("");setDeleteError("");}}>Delete Group</Btn>}
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
