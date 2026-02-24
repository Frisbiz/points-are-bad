import { useState, useEffect, useCallback } from "react";
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

function makeFixturesFallback(gw) {
  const CLUBS = ["Arsenal","Aston Villa","Bournemouth","Brentford","Brighton","Chelsea","Crystal Palace","Everton","Fulham","Ipswich","Leicester","Liverpool","Man City","Man Utd","Newcastle","Nott'm Forest","Southampton","Spurs","West Ham","Wolves"];
  const seed = gw * 9301 + 49297;
  const rng = (n) => { let s = seed+n; s=((s>>16)^s)*0x45d9f3b; s=((s>>16)^s)*0x45d9f3b; return ((s>>16)^s)>>>0; };
  const arr = [...CLUBS];
  for (let i = arr.length-1; i > 0; i--) { const j = rng(i)%(i+1); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return Array.from({length:10}, (_,i) => ({ id:`gw${gw}-f${i}`, home:arr[i*2], away:arr[i*2+1], result:null, status:"SCHEDULED" }));
}

const Avatar = ({ name, size = 36 }) => {
  const ini = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const hue = [...(name||"")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  return <div style={{width:size,height:size,borderRadius:"50%",background:`hsl(${hue},55%,32%)`,color:`hsl(${hue},75%,80%)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.38,flexShrink:0,fontFamily:"'DM Mono',monospace",letterSpacing:-1,userSelect:"none"}}>{ini}</div>;
};

const BadgeScore = ({ score }) => {
  if (score===null||score===undefined) return <span style={{color:"#444",fontSize:13}}>—</span>;
  const c = score===0?"#22c55e":score<=2?"#f59e0b":"#ef4444";
  return <span style={{background:c+"20",color:c,border:`1px solid ${c}40`,borderRadius:6,padding:"2px 9px",fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{score}</span>;
};

const Btn = ({children,onClick,variant="default",disabled,small,style:extra={}}) => {
  const base = {fontFamily:"'DM Mono',monospace",cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:8,fontWeight:500,letterSpacing:0.5,transition:"all 0.15s",opacity:disabled?0.4:1,padding:small?"6px 14px":"10px 22px",fontSize:small?12:13};
  const V = {
    default:{background:"#fff",color:"#000"},
    ghost:{background:"transparent",border:"1px solid #2a2a3a",color:"#888"},
    danger:{background:"#2a0f0f",border:"1px solid #4a1f1f",color:"#ef4444"},
    success:{background:"#0f2a15",border:"1px solid #1f4a25",color:"#22c55e"},
    muted:{background:"#1a1a26",border:"1px solid #2a2a3a",color:"#666"},
    amber:{background:"#2a1f00",border:"1px solid #4a3800",color:"#f59e0b"},
  };
  return <button onClick={disabled?undefined:onClick} style={{...base,...V[variant],...extra}}>{children}</button>;
};

const Input = ({value,onChange,placeholder,type="text",onKeyDown,style:extra={},autoFocus}) => (
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus}
    style={{background:"#0d0d18",border:"1px solid #2a2a3a",borderRadius:8,color:"#e8e4d9",padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:13,outline:"none",width:"100%",...extra}} />
);

const Section = ({title,children}) => (
  <div style={{marginBottom:32}}>
    <div style={{fontSize:10,color:"#444",letterSpacing:3,textTransform:"uppercase",marginBottom:14,borderBottom:"1px solid #1a1a26",paddingBottom:8}}>{title}</div>
    {children}
  </div>
);

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#222;border-radius:2px;}
  @keyframes fadein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  .fade{animation:fadein 0.25s ease forwards;}
  .frow:hover{background:#10101c!important;}
  .nb{background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;transition:all 0.18s;}
  .nb:hover{color:#ccc!important;}
  .nb.active{color:#fff!important;border-bottom-color:#e8e4d9!important;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
`;

function computeStats(group) {
  const preds = group.predictions||{};
  return (group.members||[]).map(username => {
    let total=0, scored=0, perfects=0;
    const gwTotals = (group.gameweeks||[]).map(g => {
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
    <div style={{minHeight:"100vh",background:"#080810",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",padding:24}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:52,fontWeight:900,color:"#fff",letterSpacing:-3,lineHeight:1}}>POINTS</div>
          <div style={{fontSize:10,color:"#2a2a3a",letterSpacing:7,marginTop:10}}>ARE BAD</div>
        </div>
        <div style={{background:"#0e0e1a",border:"1px solid #1e1e2e",borderRadius:14,padding:32}}>
          <div style={{display:"flex",background:"#080810",borderRadius:8,padding:3,marginBottom:28,gap:3}}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,background:mode===m?"#fff":"transparent",color:mode===m?"#000":"#444",border:"none",borderRadius:6,padding:"8px 0",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
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
        <div style={{textAlign:"center",marginTop:20,color:"#1e1e2e",fontSize:11,letterSpacing:1}}>Premier League Prediction Game</div>
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
    const group = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:[{gw:1,fixtures:makeFixturesFallback(1)}],currentGW:1,apiKey:"",season:2025};
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
    <div style={{minHeight:"100vh",background:"#080810",fontFamily:"'DM Mono',monospace",color:"#e8e4d9"}}>
      <style>{CSS}</style>
      <header style={{borderBottom:"1px solid #1a1a26",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:20,color:"#fff"}}>POINTS <span style={{color:"#2a2a3a",fontSize:10,letterSpacing:3,fontFamily:"'DM Mono',monospace",fontWeight:400}}>are bad</span></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar name={user.displayName} size={28}/><span style={{fontSize:12,color:"#444"}}>{user.displayName}</span></div>
      </header>
      <div style={{maxWidth:640,margin:"0 auto",padding:"40px 24px"}}>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:8}}>Your Groups</h1>
        <p style={{color:"#2a2a3a",fontSize:11,letterSpacing:1,marginBottom:36}}>JOIN OR CREATE A GROUP TO START PREDICTING</p>
        {loading?<div style={{color:"#2a2a3a",padding:"40px 0",textAlign:"center"}}>Loading...</div>:groups.length>0?(
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:36}}>
            {groups.map(g=>(
              <button key={g.id} onClick={()=>onEnterGroup(g)} style={{background:"#0e0e1a",border:"1px solid #1e1e2e",borderRadius:10,padding:"16px 20px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"border-color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#3a3a5a"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1e1e2e"}>
                <div>
                  <div style={{fontSize:16,color:"#fff",marginBottom:4}}>{g.name}</div>
                  <div style={{fontSize:11,color:"#2a2a3a",letterSpacing:1}}>{g.members.length} MEMBER{g.members.length!==1?"S":""} · GW{g.currentGW} · {"⚡ API"}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {g.creatorUsername===user.username&&<span style={{fontSize:10,color:"#f59e0b",letterSpacing:2,background:"#f59e0b15",border:"1px solid #f59e0b30",borderRadius:4,padding:"2px 8px"}}>CREATOR</span>}
                  <span style={{color:"#2a2a3a",fontSize:18}}>›</span>
                </div>
              </button>
            ))}
          </div>
        ):<div style={{color:"#2a2a3a",fontSize:13,padding:"20px 0 36px"}}>No groups yet.</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:"#0e0e1a",border:"1px solid #1e1e2e",borderRadius:12,padding:20}}>
            <div style={{fontSize:10,color:"#444",letterSpacing:3,marginBottom:14}}>CREATE GROUP</div>
            <Input value={createName} onChange={setCreateName} placeholder="Group name..." onKeyDown={e=>e.key==="Enter"&&createGroup()} />
            <Btn onClick={createGroup} disabled={creating||!createName.trim()} style={{width:"100%",marginTop:10,padding:"9px 0",display:"block",textAlign:"center"}}>{creating?"...":"Create →"}</Btn>
          </div>
          <div style={{background:"#0e0e1a",border:"1px solid #1e1e2e",borderRadius:12,padding:20}}>
            <div style={{fontSize:10,color:"#444",letterSpacing:3,marginBottom:14}}>JOIN WITH CODE</div>
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

  useEffect(()=>{
    (async()=>{
      const saved = lget("session");
      if (saved?.username){const u=await sget(`user:${saved.username}`);if(u)setUser(u);}
      setBoot(true);
    })();
  },[]);

  const handleLogin = async (u) => {lset("session",{username:u.username});setUser(u);};
  const handleLogout = async () => {ldel("session");setUser(null);setGroup(null);};
  const handleEnterGroup = async (g) => {const fresh=await sget(`group:${g.id}`);setGroup(fresh||g);setTab("League");};
  const handleLeaveGroup = () => setGroup(null);
  const refreshGroup = useCallback(async()=>{if(!group)return;const fresh=await sget(`group:${group.id}`);if(fresh)setGroup(fresh);},[group?.id]);
  const updateGroup = useCallback(async(updater)=>{if(!group)return;const fresh=await sget(`group:${group.id}`);const next=typeof updater==="function"?updater(fresh):updater;await sset(`group:${group.id}`,next);setGroup(next);},[group?.id]);

  if (!boot) return <div style={{minHeight:"100vh",background:"#080810",display:"flex",alignItems:"center",justifyContent:"center",color:"#1a1a26",fontFamily:"monospace",fontSize:12}}>loading...</div>;
  if (!user) return <AuthScreen onLogin={handleLogin} />;
  if (!group) return <GroupLobby user={user} onEnterGroup={handleEnterGroup} onUpdateUser={u=>setUser(u)} />;

  const isAdmin = group.admins?.includes(user.username);
  const isCreator = group.creatorUsername===user.username;
  return <GameUI user={user} group={group} tab={tab} setTab={setTab} isAdmin={isAdmin} isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout} updateGroup={updateGroup} refreshGroup={refreshGroup} />;
}

/* ── GAME SHELL ──────────────────────────────────── */
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,updateGroup,refreshGroup}) {
  useEffect(()=>{refreshGroup();},[tab]);
  const gwFixtures = group.gameweeks?.find(g=>g.gw===group.currentGW)?.fixtures||[];
  return (
    <div style={{minHeight:"100vh",background:"#080810",color:"#e8e4d9",fontFamily:"'DM Mono',monospace"}}>
      <style>{CSS}</style>
      <header style={{borderBottom:"1px solid #1a1a26",padding:"0 20px",position:"sticky",top:0,background:"#080810",zIndex:50}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",height:60,gap:0}}>
          <button onClick={onLeave} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,flexShrink:0,borderRight:"1px solid #1a1a26",marginRight:20,padding:"0 16px 0 0",height:"100%"}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:"#fff"}}>POINTS</span>
            <span style={{fontSize:9,color:"#2a2a3a",letterSpacing:3}}>are bad</span>
          </button>
          <div style={{flex:1,fontSize:12,color:"#333",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{group.name}</div>
          {true&&<div style={{fontSize:10,color:"#22c55e",letterSpacing:1,marginRight:12,background:"#22c55e15",border:"1px solid #22c55e25",borderRadius:4,padding:"3px 8px",flexShrink:0}}>⚡ LIVE API</div>}          <nav style={{display:"flex",gap:0,flexShrink:0}}>
            {NAV.map(t=>(
              <button key={t} onClick={()=>setTab(t)} className={`nb${tab===t?" active":""}`} style={{color:tab===t?"#fff":"#2a2a3a",fontSize:10,letterSpacing:2,padding:"22px 12px 20px",textTransform:"uppercase"}}>{t}</button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:20,borderLeft:"1px solid #1a1a26",paddingLeft:20,height:"100%"}}>
            <Avatar name={user.displayName} size={26}/>
            <button onClick={onLogout} style={{background:"none",border:"none",color:"#2a2a3a",cursor:"pointer",fontSize:10,letterSpacing:1,fontFamily:"inherit"}}>OUT</button>
          </div>
        </div>
      </header>
      <main style={{maxWidth:940,margin:"0 auto",padding:"32px 20px"}} className="fade" key={tab}>
        {tab==="League"&&<LeagueTab group={group} user={user}/>}
        {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} updateGroup={updateGroup} gwFixtures={gwFixtures}/>}
        {tab==="Trends"&&<TrendsTab group={group}/>}
        {tab==="Members"&&<MembersTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup}/>}
        {tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} onLeave={onLeave}/>}
      </main>
    </div>
  );
}

/* ── LEAGUE ──────────────────────────────────────── */
function LeagueTab({group,user}) {
  const stats = computeStats(group);
  const [names,setNames]=useState({});
  useEffect(()=>{
    (async()=>{const e=await Promise.all((group.members||[]).map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||u];}));setNames(Object.fromEntries(e));})();
  },[group.members?.join(",")]);
  const totalResults = (group.gameweeks||[]).reduce((a,g)=>a+g.fixtures.filter(f=>f.result).length,0);
  return (
    <div>
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:32}}>
        <div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:38,fontWeight:900,color:"#fff",letterSpacing:-1}}>Standings</h1>
          <p style={{color:"#2a2a3a",fontSize:11,letterSpacing:2,marginTop:4}}>{totalResults} RESULTS COUNTED · LOWER IS BETTER</p>
        </div>
      </div>
      {stats.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"#2a2a3a"}}>No members yet.</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {stats.map((p,i)=>(
            <div key={p.username} style={{display:"grid",gridTemplateColumns:"52px 1fr 80px 80px 90px",alignItems:"center",gap:12,padding:"16px 20px",background:p.username===user.username?"#0f0f1d":"#0c0c18",borderRadius:10,border:`1px solid ${p.username===user.username?"#2a2a4a":"#12121e"}`}}>
              <div style={{textAlign:"center"}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:i<3?22:16,fontWeight:900,color:i===0?"#fbbf24":i===1?"#9ca3af":i===2?"#b45309":"#2a2a3a"}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Avatar name={names[p.username]||p.username} size={34}/>
                <div style={{fontSize:14,color:p.username===user.username?"#9090e0":"#aaa"}}>{names[p.username]||p.username}{p.username===user.username&&<span style={{fontSize:10,color:"#2a2a3a",marginLeft:8}}>you</span>}</div>
              </div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#2a2a3a",letterSpacing:2,marginBottom:3}}>PERFECT</div><div style={{color:"#22c55e",fontWeight:700}}>{p.perfects}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#2a2a3a",letterSpacing:2,marginBottom:3}}>AVG</div><div style={{color:"#555"}}>{p.avg}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#2a2a3a",letterSpacing:2,marginBottom:3}}>TOTAL PTS</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:900,color:i===0?"#fbbf24":"#fff",lineHeight:1}}>{p.total}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── FIXTURES ────────────────────────────────────── */
function FixturesTab({group,user,isAdmin,updateGroup,gwFixtures}) {
  const [resultDraft,setResultDraft]=useState({});
  const [predDraft,setPredDraft]=useState({});
  const [saving,setSaving]=useState({});
  const [fetching,setFetching]=useState(false);
  const [fetchMsg,setFetchMsg]=useState("");
  const currentGW = group.currentGW||1;
  const myPreds = group.predictions?.[user.username]||{};
  const hasApiKey = true; // Global API key always active

  const savePred = async (fixtureId, val) => {
    if (!/^\d+-\d+$/.test(val)) return;
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
    // Global API key always available
    setFetching(true);setFetchMsg("Syncing GW" + currentGW + " from football-data.org...");
    try {
      const matches = await fetchMatchweek(group.apiKey,currentGW,group.season||2025);
      if (!matches.length){setFetchMsg("No matches found for this gameweek.");setFetching(false);return;}
      const newFixtures = parseMatchesToFixtures(matches,currentGW);
      await updateGroup(g=>({...g,gameweeks:g.gameweeks.map(gw=>gw.gw===currentGW?{...gw,fixtures:newFixtures}:gw)}));
      const finished = newFixtures.filter(f=>f.result).length;
      setFetchMsg(`✓ Updated ${newFixtures.length} fixtures${finished>0?`, ${finished} with results`:""}.`);
    } catch(e){setFetchMsg(`Error: ${e.message}`);}
    setFetching(false);
    setTimeout(()=>setFetchMsg(""),6000);
  };

  const addGW = async () => {
    const next = (group.gameweeks?.length||0)+1;
    await updateGroup(g=>({...g,gameweeks:[...(g.gameweeks||[]),{gw:next,fixtures:makeFixturesFallback(next)}],currentGW:next}));
  };

  const setGW = async (gw) => {await updateGroup(g=>({...g,currentGW:gw}));};

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:"#fff",letterSpacing:-1}}>Gameweek {currentGW}</h1>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:3}}>
            {(group.gameweeks||[]).map(g=>(
              <button key={g.gw} onClick={()=>setGW(g.gw)} style={{background:currentGW===g.gw?"#fff":"#111",color:currentGW===g.gw?"#000":"#444",border:"1px solid #2a2a3a",borderRadius:6,padding:"5px 11px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>GW{g.gw}</button>
            ))}
          </div>
          {isAdmin&&<Btn variant="muted" small onClick={addGW}>+ GW</Btn>}
          {isAdmin&&<Btn variant={hasApiKey?"amber":"muted"} small onClick={fetchFromAPI} disabled={fetching}>{fetching?"Fetching...":hasApiKey?"⚡ Sync Fixtures":"⚡ Sync (needs API key)"}</Btn>}
        </div>
      </div>

      {fetchMsg&&<div style={{background:fetchMsg.startsWith("✓")?"#0f2a15":"#2a0f0f",border:`1px solid ${fetchMsg.startsWith("✓")?"#1f4a25":"#4a1f1f"}`,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:fetchMsg.startsWith("✓")?"#22c55e":"#ef4444"}}>{fetchMsg}</div>}

      {isAdmin&&<div style={{background:"#1a1500",border:"1px solid #3a3000",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#f59e0b",letterSpacing:1}}>
        ⚡ ADMIN · {hasApiKey?"Click 'Sync Fixtures' to auto-load matches and results.":"Add your football-data.org API key in the Group tab."}
      </div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 130px 1fr 105px 70px",gap:10,padding:"6px 14px",fontSize:10,color:"#2a2a3a",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
        <div style={{textAlign:"right"}}>Home</div>
        <div style={{textAlign:"center"}}>Result</div>
        <div>Away</div>
        <div style={{textAlign:"center"}}>Your Pick</div>
        <div style={{textAlign:"center"}}>Pts</div>
      </div>

      {gwFixtures.length===0?<div style={{color:"#2a2a3a",textAlign:"center",padding:60}}>No fixtures. {isAdmin&&"Use '+ GW' or sync from API."}</div>:gwFixtures.map(f=>{
        const myPred = predDraft[f.id]!==undefined?predDraft[f.id]:(myPreds[f.id]||"");
        const pts = calcPts(myPreds[f.id],f.result);
        const dateStr = f.date?new Date(f.date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):null;
        return (
          <div key={f.id} className="frow" style={{display:"grid",gridTemplateColumns:"1fr 130px 1fr 105px 70px",gap:10,padding:"13px 14px",background:"#0c0c18",borderRadius:8,border:"1px solid #10101e",alignItems:"center",marginBottom:2}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:10}}>
              {dateStr&&<span style={{fontSize:10,color:"#252535",letterSpacing:0.3}}>{dateStr}</span>}
              <span style={{fontSize:13,color:"#aaa"}}>{f.home}</span>
              <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[f.home]||"#333",flexShrink:0}}/>
            </div>
            <div style={{textAlign:"center"}}>
              {f.result?(
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#fff",letterSpacing:3}}>{f.result}</span>
                  {f.status==="FINISHED"&&<span style={{fontSize:9,color:"#22c55e",letterSpacing:1,opacity:0.6}}>FT</span>}
                  {(f.status==="IN_PLAY"||f.status==="PAUSED")&&<span style={{fontSize:9,color:"#f59e0b",letterSpacing:1,animation:"pulse 1.5s infinite"}}>LIVE</span>}
                  {isAdmin&&!hasApiKey&&<button onClick={()=>clearResult(f.id)} style={{background:"none",border:"none",color:"#2a2a3a",cursor:"pointer",fontSize:10}}>✕</button>}
                </div>
              ):isAdmin&&!hasApiKey?(
                <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                  <input placeholder="0-0" value={resultDraft[f.id]||""} onChange={e=>setResultDraft(d=>({...d,[f.id]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveResult(f.id)}
                    style={{width:56,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:6,color:"#f59e0b",padding:"5px 6px",fontFamily:"inherit",fontSize:12,textAlign:"center",outline:"none"}}/>
                  <button onClick={()=>saveResult(f.id)} style={{background:"#1a2a1a",border:"1px solid #2a4a2a",borderRadius:6,color:"#4ade80",cursor:"pointer",padding:"5px 7px",fontSize:11}}>✓</button>
                </div>
              ):isAdmin&&hasApiKey?(
                <span style={{color:"#2a2a3a",fontSize:11}}>sync ↑</span>
              ):<span style={{color:"#2a2a3a",fontSize:11}}>TBD</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:CLUB_COLORS[f.away]||"#333",flexShrink:0}}/>
              <span style={{fontSize:13,color:"#aaa"}}>{f.away}</span>
            </div>
            <div style={{textAlign:"center"}}>
              <input value={myPred} placeholder="1-1"
                onChange={e=>setPredDraft(d=>({...d,[f.id]:e.target.value}))}
                onBlur={e=>savePred(f.id,e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&savePred(f.id,e.target.value)}
                style={{width:66,background:"#0a0a14",borderRadius:6,textAlign:"center",border:`1px solid ${myPreds[f.id]?"#3a3a6a":"#1a1a2a"}`,color:"#8888cc",padding:"5px 6px",fontFamily:"inherit",fontSize:12,outline:"none"}}/>
              {saving[f.id]&&<span style={{fontSize:10,color:"#333",marginLeft:4}}>…</span>}
            </div>
            <div style={{textAlign:"center"}}><BadgeScore score={pts}/></div>
          </div>
        );
      })}
      {gwFixtures.some(f=>f.result)&&(group.members||[]).length>1&&<AllPicksTable group={group} gwFixtures={gwFixtures}/>}
    </div>
  );
}

function AllPicksTable({group,gwFixtures}) {
  const [names,setNames]=useState({});
  const members = group.members||[];
  const preds = group.predictions||{};
  useEffect(()=>{(async()=>{const e=await Promise.all(members.map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||u];}));setNames(Object.fromEntries(e));})();},[members.join(",")]);
  const scored = gwFixtures.filter(f=>f.result);
  return (
    <div style={{marginTop:40}}>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#fff",marginBottom:16,letterSpacing:-0.5}}>All Picks This Week</h2>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"1px solid #1a1a26"}}>
            <th style={{padding:"8px 12px",textAlign:"left",color:"#2a2a3a",letterSpacing:2,fontWeight:400}}>FIXTURE</th>
            <th style={{padding:"8px 12px",textAlign:"center",color:"#2a2a3a",letterSpacing:2,fontWeight:400}}>RESULT</th>
            {members.map(u=><th key={u} style={{padding:"8px 12px",textAlign:"center",color:"#555",fontWeight:400}}>{names[u]||u}</th>)}
          </tr></thead>
          <tbody>
            {scored.map(f=>(
              <tr key={f.id} style={{borderBottom:"1px solid #0e0e18"}}>
                <td style={{padding:"10px 12px",color:"#555"}}>{f.home} vs {f.away}</td>
                <td style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:15,color:"#fff",letterSpacing:2}}>{f.result}</td>
                {members.map(u=>{const pred=preds[u]?.[f.id];const pts=calcPts(pred,f.result);return (
                  <td key={u} style={{padding:"10px 12px",textAlign:"center"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{color:"#333",fontSize:11}}>{pred||"–"}</span><BadgeScore score={pts}/></div></td>
                );})}
              </tr>
            ))}
          </tbody>
          {scored.length>0&&<tfoot><tr style={{borderTop:"2px solid #1a1a26"}}>
            <td style={{padding:"10px 12px",color:"#2a2a3a",letterSpacing:2,fontSize:10}}>TOTAL</td>
            <td/>
            {members.map(u=>{
              const total=scored.reduce((sum,f)=>{const pts=calcPts(preds[u]?.[f.id],f.result);return sum+(pts??0);},0);
              return <td key={u} style={{padding:"10px 12px",textAlign:"center",fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:"#e8e4d9"}}>{total}</td>;
            })}
          </tr></tfoot>}
        </table>
      </div>
    </div>
  );
}

/* ── TRENDS ──────────────────────────────────────── */
function TrendsTab({group}) {
  const [names,setNames]=useState({});
  const stats = computeStats(group);
  const members = group.members||[];
  const gws = group.gameweeks||[];
  useEffect(()=>{(async()=>{const e=await Promise.all(members.map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||u];}));setNames(Object.fromEntries(e));})();},[members.join(",")]);
  const hasData = stats.some(p=>p.scored>0);
  const tt={background:"#0d0d18",border:"1px solid #2a2a3a",borderRadius:8,fontSize:11,fontFamily:"'DM Mono',monospace",color:"#ccc"};
  const ds = stats.map(p=>({...p,dn:names[p.username]||p.username}));
  const gwLine=gws.map(g=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.find(e=>e.gw===g.gw)?.points??0;});return r;});
  const cumLine=gws.map((g,gi)=>{const r={name:`GW${g.gw}`};ds.forEach(p=>{r[p.dn]=p.gwTotals.slice(0,gi+1).reduce((a,e)=>a+e.points,0);});return r;});
  const perfectsData=ds.map(p=>({name:p.dn,perfects:p.perfects}));
  const preds=group.predictions||{};
  const distData=[0,1,2,3,4,5].map(pts=>{const r={pts:pts===5?"5+":String(pts)};ds.forEach(p=>{let c=0;gws.forEach(g=>g.fixtures.forEach(f=>{if(!f.result)return;const pp=calcPts(preds[p.username]?.[f.id],f.result);if(pp===null)return;if(pts===5?pp>=5:pp===pts)c++;}));r[p.dn]=c;});return r;});
  const CC=({title,children})=><div style={{background:"#0e0e1a",border:"1px solid #1a1a26",borderRadius:12,padding:"22px 18px",marginBottom:18}}><h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"#888",marginBottom:18}}>{title}</h3>{children}</div>;
  if (!hasData) return <div style={{textAlign:"center",padding:"80px 0",color:"#2a2a3a"}}><div style={{fontSize:40,marginBottom:14}}>📊</div><div style={{fontSize:11,letterSpacing:2}}>SYNC RESULTS TO SEE TRENDS</div></div>;
  return (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:28}}>Trends</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:20}}>
        {ds.map((p,i)=>(
          <div key={p.username} style={{background:"#0e0e1a",border:"1px solid #1a1a26",borderRadius:10,padding:"16px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><Avatar name={p.dn} size={26}/><span style={{fontSize:12,color:"#888",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.dn}</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["TOTAL",p.total,PALETTE[i%PALETTE.length]],["AVG",p.avg,"#666"],["PERFECT",p.perfects,"#22c55e"],["PLAYED",p.scored,"#333"]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:9,color:"#2a2a3a",letterSpacing:2,marginBottom:2}}>{l}</div><div style={{fontSize:l==="TOTAL"?20:16,fontWeight:700,color:c,fontFamily:l==="TOTAL"?"'Playfair Display',serif":"inherit"}}>{v}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CC title="Points Per Gameweek"><ResponsiveContainer width="100%" height={200}><LineChart data={gwLine} margin={{top:4,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10,color:"#555"}}/>{ds.map((p,i)=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={PALETTE[i%PALETTE.length]} strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>)}</LineChart></ResponsiveContainer></CC>
      <CC title="Cumulative Points Race (lower = winning)"><ResponsiveContainer width="100%" height={200}><LineChart data={cumLine} margin={{top:4,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map((p,i)=><Line key={p.username} type="monotone" dataKey={p.dn} stroke={PALETTE[i%PALETTE.length]} strokeWidth={2.5} dot={false}/>)}</LineChart></ResponsiveContainer></CC>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        <CC title="Perfect Predictions"><ResponsiveContainer width="100%" height={180}><BarChart data={perfectsData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="name" tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Bar dataKey="perfects" fill="#22c55e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></CC>
        <CC title="Points Distribution"><ResponsiveContainer width="100%" height={180}><BarChart data={distData} margin={{top:0,right:8,left:-22,bottom:0}}><XAxis dataKey="pts" tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#333",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontSize:10}}/>{ds.map((p,i)=><Bar key={p.username} dataKey={p.dn} fill={PALETTE[i%PALETTE.length]} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer></CC>
      </div>
    </div>
  );
}

/* ── MEMBERS ─────────────────────────────────────── */
function MembersTab({group,user,isAdmin,isCreator,updateGroup}) {
  const [names,setNames]=useState({});
  const members=group.members||[];
  const admins=group.admins||[];
  useEffect(()=>{(async()=>{const e=await Promise.all(members.map(async u=>{const d=await sget(`user:${u}`);return [u,d?.displayName||u];}));setNames(Object.fromEntries(e));})();},[members.join(",")]);
  const toggleAdmin=async(username)=>{await updateGroup(g=>{const a=g.admins||[];return {...g,admins:a.includes(username)?a.filter(x=>x!==username):[...a,username]};});};
  const kick=async(username)=>{
    if(username===group.creatorUsername)return;
    await updateGroup(g=>({...g,members:g.members.filter(m=>m!==username),admins:(g.admins||[]).filter(a=>a!==username)}));
    const fresh=await sget(`user:${username}`);
    if(fresh)await sset(`user:${username}`,{...fresh,groupIds:(fresh.groupIds||[]).filter(id=>id!==group.id)});
  };
  return (
    <div style={{maxWidth:560}}>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:8}}>Members</h1>
      <p style={{color:"#2a2a3a",fontSize:11,letterSpacing:2,marginBottom:32}}>{members.length} PLAYER{members.length!==1?"S":""}</p>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {members.map(username=>{
          const mIsAdmin=admins.includes(username);
          const mIsCreator=username===group.creatorUsername;
          const isMe=username===user.username;
          return (
            <div key={username} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0c0c18",border:`1px solid ${isMe?"#2a2a4a":"#10101e"}`,borderRadius:10,padding:"14px 18px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Avatar name={names[username]||username}/>
                <div>
                  <div style={{fontSize:14,color:isMe?"#9090d0":"#aaa"}}>{names[username]||username}{isMe&&<span style={{fontSize:10,color:"#2a2a3a",marginLeft:8}}>you</span>}</div>
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

  const copyCode=()=>{navigator.clipboard?.writeText(group.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const saveName=async()=>{if(!newName.trim())return;await updateGroup(g=>({...g,name:newName.trim()}));setNameSaved(true);setTimeout(()=>setNameSaved(false),2000);};
  const saveApiKey=async()=>{await updateGroup(g=>({...g,apiKey:apiKey.trim(),season:parseInt(season)||2025}));setApiSaved(true);setTimeout(()=>setApiSaved(false),2000);};
  const leaveGroup=async()=>{
    if(isCreator)return;
    const fresh=await sget(`user:${user.username}`);
    if(fresh)await sset(`user:${user.username}`,{...fresh,groupIds:(fresh.groupIds||[]).filter(id=>id!==group.id)});
    await updateGroup(g=>({...g,members:g.members.filter(m=>m!==user.username),admins:(g.admins||[]).filter(a=>a!==user.username)}));
    onLeave();
  };

  return (
    <div style={{maxWidth:520}}>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:32}}>Group</h1>

      <Section title="Invite Code">
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:12,padding:"14px 24px",fontFamily:"'Playfair Display',serif",fontSize:44,fontWeight:900,color:"#fff",letterSpacing:10}}>{group.code}</div>
          <div>
            <Btn onClick={copyCode} variant={copied?"success":"ghost"}>{copied?"Copied!":"Copy Code"}</Btn>
            <div style={{fontSize:11,color:"#2a2a3a",marginTop:8,letterSpacing:0.3}}>Share with friends to join.</div>
          </div>
        </div>
      </Section>

      <Section title="⚡ Live Data — football-data.org">
        <div style={{background:"#0a120a",border:"1px solid #1a2a1a",borderRadius:10,padding:"18px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e"}}/>
            <span style={{color:"#4ade80",fontSize:13,fontWeight:500,letterSpacing:0.5}}>API Connected Globally</span>
          </div>
          <div style={{fontSize:12,color:"#4a7a4a",lineHeight:1.9}}>
            Live Premier League data is active for all groups automatically.<br/>
            {isAdmin&&<><br/><span style={{color:"#888"}}>As an admin, go to </span><strong style={{color:"#f59e0b"}}>Fixtures → ⚡ Sync Fixtures</strong><span style={{color:"#888"}}> to pull the latest matches and results at any time.</span></>}
          </div>
          {isAdmin&&(
            <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #1a2a1a"}}>
              <div style={{fontSize:10,color:"#444",letterSpacing:2,marginBottom:8}}>SEASON YEAR</div>
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
        <div style={{background:"#0c0c18",border:"1px solid #12121e",borderRadius:10,padding:"16px 20px",fontSize:12,color:"#555",lineHeight:2.2}}>
          {[["Members",group.members?.length],["Gameweeks",group.gameweeks?.length],["API Status","⚡ Active"],["Season",group.season||2025],["Your role",isCreator?"Creator":isAdmin?"Admin":"Member"]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",borderBottom:"1px solid #0e0e18",paddingBottom:4}}>
              <span style={{color:"#2a2a3a"}}>{l}</span>
              <span style={{color:l==="API Status"?"#22c55e":l==="Your role"?(isCreator?"#f59e0b":isAdmin?"#60a5fa":"#555"):"inherit"}}>{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Scoring Rules">
        <div style={{background:"#0c0c18",border:"1px solid #12121e",borderRadius:10,padding:"16px 20px",fontSize:12,color:"#555",lineHeight:1.9}}>
          <div style={{color:"#888",marginBottom:8,fontFamily:"'Playfair Display',serif",fontSize:14}}>Keep your points low.</div>
          <div>Each goal your prediction is off = 1 point.</div>
          <div style={{marginTop:6}}><span style={{color:"#2a2a3a"}}>Predict 1-1, actual 2-3 → 1+2 = </span><strong style={{color:"#ef4444"}}>3 pts ❌</strong></div>
          <div><span style={{color:"#2a2a3a"}}>Predict 2-1, actual 2-1 → 0+0 = </span><strong style={{color:"#22c55e"}}>0 pts ⭐</strong></div>
        </div>
      </Section>

      {!isCreator&&<Btn variant="danger" onClick={leaveGroup}>Leave Group</Btn>}
    </div>
  );
}
