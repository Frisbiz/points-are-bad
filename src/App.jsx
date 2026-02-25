import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── FIREBASE CONFIG ────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ─── FIRESTORE HELPERS ───────────────────────────────────────────────────────
let db = null;

async function getDB() {
  if (db) return db;
  const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
  const { getFirestore, doc, getDoc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  db._doc = doc;
  db._getDoc = getDoc;
  db._setDoc = setDoc;
  db._deleteDoc = deleteDoc;
  return db;
}

async function sget(key) {
  try {
    const db = await getDB();
    const ref = db._doc(db, "data", key.replace(/[/\\]/g, "_"));
    const snap = await db._getDoc(ref);
    return snap.exists() ? snap.data().value : null;
  } catch(e) { console.error("sget error", key, e); return null; }
}

async function sset(key, val) {
  try {
    const db = await getDB();
    const ref = db._doc(db, "data", key.replace(/[/\\]/g, "_"));
    await db._setDoc(ref, { value: val, updatedAt: Date.now() });
  } catch(e) { console.error("sset error", key, e); }
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
  "Brentford FC": "Brentford", "Brighton & Hove Albion FC": "Brighton", "Chelsea FC": "Chelsea",
  "Crystal Palace FC": "Crystal Palace", "Everton FC": "Everton", "Fulham FC": "Fulham",
  "Ipswich Town FC": "Ipswich", "Leicester City FC": "Leicester", "Liverpool FC": "Liverpool",
  "Manchester City FC": "Man City", "Manchester United FC": "Man Utd", "Newcastle United FC": "Newcastle",
  "Nottingham Forest FC": "Nott'm Forest", "Southampton FC": "Southampton",
  "Tottenham Hotspur FC": "Spurs", "West Ham United FC": "West Ham",
  "Wolverhampton Wanderers FC": "Wolves",
};

function normName(n) { return TEAM_NAME_MAP[n] || n?.replace(/ FC$/, "").replace(/ AFC$/, "") || n; }

async function fetchMatchweek(apiKey, matchday, season = 2025) {
  const url = `/api/fixtures?matchday=${matchday}&season=${season}`;
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
  :root{--bg:#080810;--surface:#0e0e1a;--card:#0c0c18;--card-hi:#0f0f1d;--card-hover:#10101c;--input-bg:#0a0a14;--border:#1a1a26;--border2:#1e1e2e;--border3:#10101e;--text:#e8e4d9;--text-dim:#555566;--text-dim2:#666;--text-dim3:#555;--text-mid:#999;--text-bright:#fff;--text-inv:#000;--scrollbar:#222;--btn-bg:#fff;--btn-text:#000;}
  [data-theme="light"]{--bg:#f4f1e8;--surface:#fff;--card:#eeeae0;--card-hi:#e8e5db;--card-hover:#e5e2d8;--input-bg:#fff;--border:#dddad0;--border2:#e0ddd4;--border3:#e4e1d8;--text:#1a1814;--text-dim:#888;--text-dim2:#666;--text-dim3:#777;--text-mid:#444;--text-bright:#0f0d0a;--text-inv:#f4f1e8;--scrollbar:#ccc;--btn-bg:#111;--btn-text:#f4f1e8;}
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
  .bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;border-top:1px solid var(--border);background:var(--bg);z-index:100;justify-content:space-around;align-items:stretch;height:54px;}
  @media(max-width:620px){.mob-hide{display:none!important;}.bot-nav{display:flex!important;}.pad-bot{padding-bottom:70px!important;}}
  .gw-strip{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}.gw-strip::-webkit-scrollbar{display:none;}
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
      return {gw:g.gw, points:gwPts};
    });
    return {username, total, scored, perfects, avg:scored>0?(total/scored).toFixed(2):"–", gwTotals};
  }).sort((a,b)=>a.total-b.total);
}

/* ── AUTH ─────────────────────────────────────────── */
function AuthScreen({ onLogin }) {
  const [mode,setMode]=useState("login");
  const [username,setUsername]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [thumbs,setThumbs]=useState([]);
  const spawnThumb = (e) => {
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width/2 + (Math.random()-0.5)*20;
    const y = r.top;
    setThumbs(t=>[...t,{id,x,y}]);
    setTimeout(()=>setThumbs(t=>t.filter(th=>th.id!==id)),850);
  };

  const handle = async () => {
    if (!username.trim()||!password.trim()){setError("Fill in all fields.");return;}
    setLoading(true);setError("");
    if (mode==="register") {
      if (!displayName.trim()){setError("Display name required.");setLoading(false);return;}
      const ex = await sget(`user:${username.toLowerCase()}`);
      if (ex){setError("Username taken.");setLoading(false);return;}
      const user = {username:username.toLowerCase(),displayName:displayName.trim(),password,groupIds:[]};
      await sset(`user:${username.toLowerCase()}`,user);
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
          <div style={{display:"flex",background:"var(--bg)",borderRadius:8,padding:3,marginBottom:28,gap:3}}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,background:mode===m?"var(--btn-bg)":"transparent",color:mode===m?"var(--btn-text)":"var(--text-dim2)",border:"none",borderRadius:6,padding:"8px 0",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
                {m==="login"?"Sign In":"Register"}
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {mode==="register"&&<Input value={displayName} onChange={setDisplayName} placeholder="Display name" autoFocus />}
            <Input value={username} onChange={v=>setUsername(v.toLowerCase())} placeholder="Username" autoFocus={mode==="login"} onKeyDown={e=>e.key==="Enter"&&handle()} />
            <Input value={password} onChange={setPassword} placeholder="Password" type="password" onKeyDown={e=>e.key==="Enter"&&handle()} />
          </div>
          {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:12}}>{error}</div>}
          <Btn onClick={handle} disabled={loading} style={{width:"100%",marginTop:20,padding:"12px 0",display:"block",textAlign:"center",letterSpacing:2}}>
            {loading?"...":mode==="login"?"SIGN IN":"CREATE ACCOUNT"}
          </Btn>
        </div>
        <div style={{textAlign:"center",marginTop:20,color:"var(--border2)",fontSize:11,letterSpacing:1}}>Premier League Prediction Game</div>
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
  const [creating,setCreating]=useState(false);

  useEffect(()=>{loadGroups();},[]);

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
    const group = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:makeAllGWs(2025),currentGW:1,apiKey:"",season:2025,hiddenGWs:[]};
    await sset(`group:${id}`,group);
    await sset(`groupcode:${code}`,id);
    const fresh = await sget(`user:${user.username}`);
    const updated = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
    await sset(`user:${user.username}`,updated);
    onUpdateUser(updated);setCreateName("");setCreating(false);
    onEnterGroup(group);
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
      <header style={{borderBottom:"1px solid var(--border)",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:20,color:"var(--text-bright)"}}>POINTS <span style={{color:"var(--text-dim)",fontSize:10,letterSpacing:3,fontFamily:"'DM Mono',monospace",fontWeight:400}}>are bad</span></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar name={user.displayName} size={28}/><span style={{fontSize:12,color:"var(--text-dim2)"}}>{user.displayName}</span></div>
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
            <Input value={createName} onChange={setCreateName} placeholder="Group name..." onKeyDown={e=>e.key==="Enter"&&createGroup()} />
            <Btn onClick={createGroup} disabled={creating||!createName.trim()} style={{width:"100%",marginTop:10,padding:"9px 0",display:"block",textAlign:"center"}}>{creating?"...":"Create →"}</Btn>
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

export default function App() {
  const [user,setUser]=useState(null);
  const [group,setGroup]=useState(null);
  const [tab,setTab]=useState("League");
  const [boot,setBoot]=useState(false);
  const [dark,setDark]=useState(()=>localStorage.getItem("theme")!=="light");

  useEffect(()=>{
    document.documentElement.setAttribute("data-theme",dark?"dark":"light");
    localStorage.setItem("theme",dark?"dark":"light");
  },[dark]);

  useEffect(()=>{
    (async()=>{
      const saved = lget("session");
      if (saved?.username) {
        const u = await sget(`user:${saved.username}`);
        if (u) {
          setUser(u);
          if (saved.groupId) {
            const g = await sget(`group:${saved.groupId}`);
            if (g && g.members?.includes(u.username)) {
              setGroup(g);
              if (saved.tab) setTab(saved.tab);
            }
          }
        }
      }
      setBoot(true);
    })();
  },[]);

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
  const updateGroup = useCallback(async(updater)=>{if(!group)return;const fresh=await sget(`group:${group.id}`);const next=typeof updater==="function"?updater(fresh):updater;await sset(`group:${group.id}`,next);setGroup(next);},[group?.id]);

  if (!boot) return <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-dim)",fontFamily:"monospace",fontSize:12}}>loading...</div>;
  if (!user) return <AuthScreen onLogin={handleLogin} />;
  if (!group) return <GroupLobby user={user} onEnterGroup={handleEnterGroup} onUpdateUser={u=>setUser(u)} />;

  const isAdmin = group.admins?.includes(user.username);
  const isCreator = group.creatorUsername===user.username;
  return <GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin} isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout} updateGroup={updateGroup} refreshGroup={refreshGroup} dark={dark} toggleDark={()=>setDark(d=>!d)} />;
}

/* ── GAME SHELL ──────────────────────────────────── */
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,updateGroup,refreshGroup,dark,toggleDark}) {
  useEffect(()=>{refreshGroup();},[tab]);
  const [thumbs,setThumbs]=useState([]);
  const [names,setNames]=useState({});
  useEffect(()=>{
    (async()=>{const e=await Promise.all((group.members||[]).map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||u];}));setNames(Object.fromEntries(e));})();
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
          {true&&<div className="mob-hide" style={{fontSize:10,color:"#22c55e",letterSpacing:1,marginRight:12,background:"#22c55e15",border:"1px solid #22c55e25",borderRadius:4,padding:"3px 8px",flexShrink:0}}>⚡ LIVE API</div>}
          <button onClick={toggleDark} style={{background:"none",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim2)",cursor:"pointer",fontSize:13,padding:"3px 8px",fontFamily:"inherit",marginRight:10,flexShrink:0,lineHeight:1}}>{dark?"☀":"☾"}</button>
          <nav className="mob-hide" style={{display:"flex",gap:0,flexShrink:0}}>
            {NAV.map(t=>(
              <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"var(--text-bright)":"var(--text-dim)",fontSize:10,letterSpacing:2,padding:"22px 12px 20px",textTransform:"uppercase"}}>{t}</button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:20,borderLeft:"1px solid var(--border)",paddingLeft:20,height:"100%"}}>
            <Avatar name={user.displayName} size={26}/>
            <button onClick={onLogout} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:10,letterSpacing:1,fontFamily:"inherit"}}>OUT</button>
          </div>
        </div>
      </header>
      <nav className="bot-nav">
        {NAV.map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"var(--text-bright)":"var(--text-dim)",fontSize:9,letterSpacing:1.5,padding:"0 6px",textTransform:"uppercase",flex:1}}>{t}</button>
        ))}
      </nav>
      <main style={{maxWidth:940,margin:"0 auto",padding:"32px 20px"}} className="fade pad-bot" key={tab}>
        {tab==="League"&&<LeagueTab group={group} user={user} names={names}/>}
        {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} updateGroup={updateGroup} names={names}/>}
        {tab==="Trends"&&<TrendsTab group={group} names={names}/>}
        {tab==="Members"&&<MembersTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} names={names}/>}
        {tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} onLeave={onLeave}/>}
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
            <div key={p.username} style={{display:"grid",gridTemplateColumns:mob?"40px 1fr 80px":"52px 1fr 80px 80px 90px",alignItems:"center",gap:mob?8:12,padding:mob?"12px 14px":"16px 20px",background:p.username===user.username?"var(--card-hi)":"var(--card)",borderRadius:10,border:`1px solid ${p.username===user.username?"#2a2a4a":"var(--border3)"}`}}>
              <div style={{textAlign:"center"}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:i<3?(mob?18:22):(mob?13:16),fontWeight:900,color:i===0?"#fbbf24":i===1?"#9ca3af":i===2?"#b45309":"var(--text-dim)"}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:mob?8:12,minWidth:0}}>
                <Avatar name={names[p.username]||p.username} size={mob?28:34} color={PALETTE[(group.members||[]).indexOf(p.username)%PALETTE.length]}/>
                <div style={{fontSize:mob?12:14,color:p.username===user.username?"#9090e0":"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names[p.username]||p.username}{p.username===user.username&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:6}}>you</span>}</div>
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
function NextMatchCountdown({ group }) {
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
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");

  return (
    <div style={{background:"var(--card)",border:"1px solid var(--border3)",borderRadius:8,padding:"12px 18px",marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:2,textTransform:"uppercase"}}>Next match</div>
      <div style={{fontSize:13,color:"var(--text-mid)"}}>{next.home} <span style={{color:"var(--text-dim)"}}>vs</span> {next.away}</div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:16,color:"var(--text-bright)",letterSpacing:3}}>
        {days > 0 && <span style={{color:"var(--text-mid)"}}>{days}d </span>}
        {pad(hours)}:{pad(mins)}:{pad(secs)}
      </div>
    </div>
  );
}

function FixturesTab({group,user,isAdmin,updateGroup,names}) {
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
  const [wizardPred, setWizardPred] = useState("");
  const wizardKey = `wizard-seen:${group.id}:${user.username}`;
  const [viewGW, setViewGW] = useState(()=>{
    const seas = group.season||2025;
    const seasonGWs = (group.gameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
    const preds = group.predictions?.[user.username]||{};
    const now = new Date();
    const next = seasonGWs.find(gwObj=>gwObj.fixtures.some(f=>{
      const locked=!!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=now));
      return !locked&&!preds[f.id];
    }));
    return next ? next.gw : (group.currentGW||1);
  });
  const activeSeason = group.season||2025;
  const currentGW = viewGW;
  const gwFixtures = (group.gameweeks||[]).find(g=>g.gw===currentGW&&(g.season||activeSeason)===activeSeason)?.fixtures||[];
  const myPreds = group.predictions?.[user.username]||{};
  const hasApiKey = true; // Global API key always active
  const gwAdminLocked = !isAdmin && (group.hiddenGWs||[]).includes(currentGW);
  const unpickedUnlocked = gwAdminLocked ? [] : gwFixtures.filter(f=>{
    const locked=!!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=new Date()));
    return !locked&&!myPreds[f.id];
  });
  const canViewAllPicks = unpickedUnlocked.length===0;

  const savePred = async (fixtureId, val) => {
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
    await updateGroup(g=>{const p={...(g.predictions||{})};p[user.username]={...(p[user.username]||{}),[fixtureId]:val};return {...g,predictions:p};});
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
      const matches = await fetchMatchweek(group.apiKey, currentGW, group.season||2025);
      if (!matches.length) { setFetchMsg("No matches found for this gameweek."); setFetching(false); return; }
      const apiFixtures = parseMatchesToFixtures(matches, currentGW);
      await updateGroup(g => {
        const seas = g.season || 2025;
        const gwObj = (g.gameweeks||[]).find(gw=>gw.gw===currentGW&&(gw.season||seas)===seas);
        const oldFixtures = gwObj?.fixtures||[];
        const allTBD = oldFixtures.length>0 && oldFixtures.every(f=>f.home==="TBD"&&f.away==="TBD");
        if (allTBD) {
          return {...g, gameweeks:g.gameweeks.map(gw=>gw.gw===currentGW&&(gw.season||seas)===seas?{...gw,fixtures:apiFixtures}:gw)};
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
        return {...g, gameweeks:g.gameweeks.map(gw=>gw.gw===currentGW&&(gw.season||seas)===seas?{...gw,fixtures:finalFixtures}:gw)};
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

  const setGW = (gw) => {setDeleteGWStep(0);setViewGW(gw);};

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
                <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[wizardFixture.home]||"#555",display:"inline-block",marginLeft:6,verticalAlign:"middle"}}/>
              </div>
              <span style={{fontSize:11,color:"var(--text-dim)",letterSpacing:3,flexShrink:0}}>VS</span>
              <div style={{textAlign:"left",flex:1}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[wizardFixture.away]||"#555",display:"inline-block",marginRight:6,verticalAlign:"middle"}}/>
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
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <button onClick={()=>gwStripRef.current&&gwStripRef.current.scrollBy({left:-gwStripRef.current.clientWidth,behavior:"smooth"})} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim2)",cursor:"pointer",fontSize:13,padding:"4px 8px",lineHeight:1,flexShrink:0}}>‹</button>
            <div ref={gwStripRef} className="gw-strip" style={{display:"flex",gap:3,maxWidth:396,overflowX:"auto"}}>
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
          {isAdmin&&deleteGWStep===0&&<Btn variant="danger" small onClick={()=>setDeleteGWStep(1)}>Clear GW</Btn>}
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
          {isAdmin&&<Btn variant={hasApiKey?"amber":"muted"} small onClick={fetchFromAPI} disabled={fetching}>{fetching?"Fetching...":hasApiKey?"⚡ Sync Fixtures":"⚡ Sync (needs API key)"}</Btn>}
        </div>
      </div>

      {fetchMsg&&<div style={{background:fetchMsg.startsWith("✓")?"#22c55e12":"#ef444412",border:`1px solid ${fetchMsg.startsWith("✓")?"#22c55e35":"#ef444435"}`,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:fetchMsg.startsWith("✓")?"#22c55e":"#ef4444"}}>{fetchMsg}</div>}

      {isAdmin&&<div style={{background:"#f59e0b10",border:"1px solid #f59e0b25",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#f59e0b",letterSpacing:1}}>
        ⚡ ADMIN · {hasApiKey?"Click 'Sync Fixtures' to auto-load matches and results.":"Add your football-data.org API key in the Group tab."}
      </div>}

      <NextMatchCountdown group={group} />

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
        const locked = gwAdminLocked || !!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=new Date()));
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
          <div key={f.id} style={{background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)",padding:"12px 14px",marginBottom:2}}>
            {dateStr&&<div style={{fontSize:10,color:"var(--text-dim)",marginBottom:7,letterSpacing:0.3}}>{dateStr}</div>}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:CLUB_COLORS[f.home]||"#333",flexShrink:0}}/>
                <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</a>
              </div>
              <div style={{textAlign:"center",flexShrink:0,minWidth:60}}>{resultBlock}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,justifyContent:"flex-end"}}>
                <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</a>
                <div style={{width:7,height:7,borderRadius:"50%",background:CLUB_COLORS[f.away]||"#333",flexShrink:0}}/>
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
          <div key={f.id} className="frow" style={{display:"grid",gridTemplateColumns:"72px 1fr 130px 1fr 105px 70px",gap:10,padding:"13px 14px",background:"var(--card)",borderRadius:8,border:"1px solid var(--border3)",alignItems:"center",marginBottom:2}}>
            <div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:0.3,lineHeight:1.4}}>{dateStr||""}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:10}}>
              <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-mid)"}>{f.home}</a>
              <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[f.home]||"#333",flexShrink:0}}/>
            </div>
            <div style={{textAlign:"center"}}>{resultBlock}</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[f.away]||"#333",flexShrink:0}}/>
              <a href={searchHref} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--text-mid)",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-mid)"}>{f.away}</a>
            </div>
            <div style={{textAlign:"center"}}>{pickBlock}</div>
            <div style={{textAlign:"center"}}><BadgeScore score={pts}/></div>
          </div>
        );
      })}
      {gwFixtures.some(f=>f.result)&&(group.members||[]).length>1&&canViewAllPicks&&<AllPicksTable group={group} gwFixtures={gwFixtures} isAdmin={isAdmin} updateGroup={updateGroup} adminUser={user} names={names}/>}
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

function AllPicksTable({group,gwFixtures,isAdmin,updateGroup,adminUser,names}) {
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
        const entry={id:Date.now(),at:Date.now(),by:adminUser.username,for:u,fixture:fixture?`${fixture.home} vs ${fixture.away}`:fid,gw:group.currentGW,old:oldVal,new:val};
        return {...g,predictions:p,adminLog:[...(g.adminLog||[]),entry]};
      });
    }
    setEditing(e=>{const n={...e};delete n[editKey(u,fid)];return n;});
  };

  return (
    <div style={{marginTop:40}}>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"var(--text-bright)",marginBottom:4,letterSpacing:-0.5}}>All Picks This Week</h2>
      {isAdmin&&<div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1,marginBottom:14}}>ADMIN — click any pick to edit</div>}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"1px solid var(--border)"}}>
            <th style={{padding:"8px 12px",textAlign:"left",color:"var(--text-dim)",letterSpacing:2,fontWeight:400}}>FIXTURE</th>
            <th style={{padding:"8px 12px",textAlign:"center",color:"var(--text-dim)",letterSpacing:2,fontWeight:400}}>RESULT</th>
            {members.map((u,ui)=>{const isWinner=hasAnyPicks&&scored.length>0&&weeklyTotals[ui]===sortedUnique[0];return <th key={u} style={{padding:"8px 12px",textAlign:"center",color:isWinner?"#fbbf24":"var(--text-mid)",fontWeight:isWinner?700:400,textShadow:isWinner?"0 0 10px #fbbf2488":"none"}}>{isWinner&&<span style={{marginRight:5,fontSize:14,textShadow:"0 0 8px #fbbf24cc"}}>★</span>}{names[u]||u}</th>;})}
          </tr></thead>
          <tbody>
            {scored.map(f=>(
              <tr key={f.id} style={{borderBottom:"1px solid var(--border3)"}}>
                <td style={{padding:"10px 12px",color:"var(--text-mid)"}}>{f.home} vs {f.away}</td>
                <td style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:15,color:"var(--text-bright)",letterSpacing:2}}>{f.result}</td>
                {members.map(u=>{
                  const pred=preds[u]?.[f.id];
                  const pts=calcPts(pred,f.result);
                  const key=editKey(u,f.id);
                  const isEditingCell=editing[key]!==undefined;
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
            ))}
          </tbody>
          {scored.length>0&&<tfoot><tr style={{borderTop:"2px solid var(--border)"}}>
            <td style={{padding:"10px 12px",color:"var(--text-dim)",letterSpacing:2,fontSize:10}}>TOTAL</td>
            <td/>
            {members.map((u,ui)=>{
              const total=weeklyTotals[ui];
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
  const gwLine=completedGws.map(g=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.find(e=>e.gw===g.gw)?.points??0;});return r;});
  const cumLine=completedGws.map((g,gi)=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.filter(e=>completedGws.slice(0,gi+1).some(cg=>cg.gw===e.gw)).reduce((a,e)=>a+e.points,0);});return r;});
  const perfectsData=ds.map(p=>({name:p.dn,perfects:p.perfects}));
  const preds=group.predictions||{};
  const distData=[0,1,2,3,4,5].map(pts=>{const r={pts:pts===5?"5+":String(pts)};ds.forEach(p=>{let c=0;gws.forEach(g=>g.fixtures.forEach(f=>{if(!f.result)return;const pp=calcPts(preds[p.username]?.[f.id],f.result);if(pp===null)return;if(pts===5?pp>=5:pp===pts)c++;}));r[p.dn]=c;});return r;});
  const CC=({title,children})=><div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"22px 18px",marginBottom:18}}><h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"var(--text-mid)",marginBottom:18}}>{title}</h3>{children}</div>;
  if (!hasData) return <div style={{textAlign:"center",padding:"80px 0",color:"var(--text-dim)"}}><div style={{fontSize:40,marginBottom:14}}>📊</div><div style={{fontSize:11,letterSpacing:2}}>SYNC RESULTS TO SEE TRENDS</div></div>;
  return (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:28}}>Trends</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:20}}>
        {ds.map((p)=>(
          <div key={p.username} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><Avatar name={p.dn} size={26} color={memberColor(p.username)}/><span style={{fontSize:12,color:"var(--text-mid)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.dn}</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["TOTAL",p.total,memberColor(p.username)],["AVG",p.avg,"var(--text-mid)"],["PERFECT",p.perfects,"#22c55e"],["PLAYED",p.scored,"var(--text-dim3)"]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:2,marginBottom:2}}>{l}</div><div style={{fontSize:l==="TOTAL"?20:16,fontWeight:700,color:c,fontFamily:l==="TOTAL"?"'Playfair Display',serif":"inherit"}}>{v}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CC title="Points Per Gameweek"><ResponsiveContainer width="100%" height={200}><LineChart data={gwLine} margin={{top:4,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10,color:"var(--text-mid)"}}/>{ds.map((p)=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>)}</LineChart></ResponsiveContainer></CC>
      <CC title="Cumulative Points Race (lower = winning)"><ResponsiveContainer width="100%" height={200}><LineChart data={cumLine} margin={{top:4,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map((p)=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={memberColor(p.username)} strokeWidth={2.5} dot={false}/>)}</LineChart></ResponsiveContainer></CC>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
        <CC title="Perfect Predictions"><ResponsiveContainer width="100%" height={180}><BarChart data={perfectsData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Bar dataKey="perfects" fill="#22c55e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></CC>
        <CC title="Points Distribution"><ResponsiveContainer width="100%" height={180}><BarChart data={distData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="pts" tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--text-dim3)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map((p)=><Bar key={p.username} dataKey={p.dn} fill={memberColor(p.username)} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer></CC>
      </div>
    </div>
  );
}

/* ── MEMBERS ─────────────────────────────────────── */
function MembersTab({group,user,isAdmin,isCreator,updateGroup,names}) {
  const members=group.members||[];
  const admins=group.admins||[];
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
            <div key={username} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--card)",border:`1px solid ${isMe?"#2a2a4a":"var(--border3)"}`,borderRadius:10,padding:"14px 18px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Avatar name={names[username]||username} color={PALETTE[members.indexOf(username)%PALETTE.length]}/>
                <div>
                  <div style={{fontSize:14,color:isMe?"#9090d0":"var(--text-mid)"}}>{names[username]||username}{isMe&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:8}}>you</span>}</div>
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
                <div key={e.id} style={{background:"var(--card)",border:`1px solid ${e.action==="kick"?"#2a1010":"var(--border3)"}`,borderRadius:8,padding:"10px 16px",fontSize:11,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
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
function GroupTab({group,user,isAdmin,isCreator,updateGroup,onLeave}) {
  const [newName,setNewName]=useState(group.name);
  const [nameSaved,setNameSaved]=useState(false);
  const [apiKey,setApiKey]=useState(group.apiKey||"");
  const [apiSaved,setApiSaved]=useState(false);
  const [season,setSeason]=useState(String(group.season||2025));
  const [copied,setCopied]=useState(false);
  const [limitSaved,setLimitSaved]=useState(false);
  const [newSeasonYear,setNewSeasonYear]=useState("");
  const [seasonMsg,setSeasonMsg]=useState("");
  const [backfillMsg, setBackfillMsg] = useState("");

  const copyCode=()=>{navigator.clipboard?.writeText(group.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const save11Limit=async(val)=>{await updateGroup(g=>({...g,draw11Limit:val}));setLimitSaved(true);setTimeout(()=>setLimitSaved(false),2000);};
  const saveName=async()=>{if(!newName.trim())return;await updateGroup(g=>({...g,name:newName.trim()}));setNameSaved(true);setTimeout(()=>setNameSaved(false),2000);};
  const saveApiKey=async()=>{await updateGroup(g=>({...g,apiKey:apiKey.trim(),season:parseInt(season)||2025}));setApiSaved(true);setTimeout(()=>setApiSaved(false),2000);};
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
  const leaveGroup=async()=>{
    if(isCreator)return;
    const fresh=await sget(`user:${user.username}`);
    if(fresh)await sset(`user:${user.username}`,{...fresh,groupIds:(fresh.groupIds||[]).filter(id=>id!==group.id)});
    await updateGroup(g=>({...g,members:g.members.filter(m=>m!==user.username),admins:(g.admins||[]).filter(a=>a!==user.username)}));
    onLeave();
  };

  return (
    <div style={{maxWidth:520}}>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1,marginBottom:32}}>Group</h1>

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
              <span style={{color:l==="API Status"?"#22c55e":l==="Your role"?(isCreator?"#f59e0b":isAdmin?"#60a5fa":"#555"):"inherit"}}>{v}</span>
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
    </div>
  );
}
