# World Cup Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a World Cup 2026 competition mode — users create a standalone WC group, get proper round labels (Matchday 1 / R32 / QF etc.), national team crests, and ET-aware scoring, while all existing PL groups remain completely unaffected.

**Architecture:** A `competition` field on the group document (`"PL"` default, `"WC"` for World Cup) drives every WC-specific code path. All changes are purely additive — no existing functions are removed or renamed, only extended with defaults that preserve current behaviour. The global fixture cache uses `fixtures:WC:2026` as the key, keeping WC data fully separate from PL.

**Tech Stack:** React (JSX), Vercel serverless functions (`api/`), football-data.org v4 API, Firebase Firestore via proxy

---

## Files to Change

| File | What changes |
|------|-------------|
| `api/fixtures.js` | Accept `competition` query param, default `"PL"` |
| `src/App.jsx` | All other changes (see tasks below) |

There are **no tests** in this project. Verification steps describe manual checks instead.

---

### Task 1: API proxy — accept `competition` param

**Files:**
- Modify: `api/fixtures.js`

- [ ] **Step 1: Update the proxy**

Replace the entire file content with:

```js
export default async function handler(req, res) {
  const { matchday, season, live, competition } = req.query;
  const comp = competition || "PL";
  let url = live === "true"
    ? `https://api.football-data.org/v4/competitions/PL/matches?status=LIVE`
    : `https://api.football-data.org/v4/competitions/${comp}/matches?season=${season}`;
  if (!live && matchday) url += `&matchday=${matchday}`;

  const response = await fetch(url, {
    headers: { "X-Auth-Token": process.env.VITE_FD_API_KEY }
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: `API error ${response.status}` });
  }

  const data = await response.json();
  res.status(200).json(data);
}
```

Note: the live endpoint stays hardcoded to PL — no WC live polling needed.

- [ ] **Step 2: Commit**

```bash
git add api/fixtures.js
git commit -m "feat: add competition param to fixtures proxy"
```

---

### Task 2: Core WC helpers — `makeWCRounds`, `stageLabel`, `gwLabel`

**Files:**
- Modify: `src/App.jsx` (near line 476, after `makeAllGWs`)

- [ ] **Step 1: Add helpers after `makeAllGWs`**

Find this line (around line 477-478):
```js
function makeAllGWs(season) {
  return Array.from({length:38}, (_,i) => ({gw:i+1, season, fixtures:makeFixturesFallback(i+1, season)}));
}
```

Add immediately after it:

```js
function makeWCRounds() {
  return Array.from({length:8}, (_,i) => ({gw:i+1, season:2026, fixtures:[]}));
}

function stageLabel(stage, matchday) {
  const map = {
    GROUP_STAGE: `Matchday ${matchday}`,
    LAST_32: "R32",
    ROUND_OF_16: "R16",
    QUARTER_FINAL: "QF",
    SEMI_FINAL: "SF",
    THIRD_PLACE: "3rd Place",
    FINAL: "Final",
  };
  return map[stage] || `Round ${matchday}`;
}

function gwLabel(group, gwNum) {
  if ((group.competition || "PL") === "PL") return `GW${gwNum}`;
  const gwObj = (group.gameweeks || []).find(g => g.gw === gwNum);
  const stage = (gwObj?.fixtures || []).find(f => f.stage)?.stage;
  return stageLabel(stage, gwNum);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add makeWCRounds, stageLabel, gwLabel helpers"
```

---

### Task 3: `fetchMatchweek` and `parseMatchesToFixtures` — WC support

**Files:**
- Modify: `src/App.jsx` (lines 87-124)

- [ ] **Step 1: Update `fetchMatchweek` to accept `competition` param**

Find (line 87):
```js
async function fetchMatchweek(apiKey, matchday, season = 2025) {
  const url = matchday != null
    ? `/api/fixtures?matchday=${matchday}&season=${season}`
    : `/api/fixtures?season=${season}`;
```

Replace with:
```js
async function fetchMatchweek(apiKey, matchday, season = 2025, competition = "PL") {
  const url = matchday != null
    ? `/api/fixtures?matchday=${matchday}&season=${season}&competition=${competition}`
    : `/api/fixtures?season=${season}&competition=${competition}`;
```

No other changes to the function body. All existing call sites pass no fourth arg and get `"PL"` by default.

- [ ] **Step 2: Update `parseMatchesToFixtures` to accept `competition` param**

Find (line 109):
```js
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
    const scoreObj = m.score?.fullTime;
    const liveScore = (status==="IN_PLAY"||status==="PAUSED") && scoreObj?.home!=null && scoreObj?.away!=null ? `${scoreObj.home}-${scoreObj.away}` : null;
    return { id: `gw${matchday}-f${m.id || i}`, apiId: m.id, home, away, result, status, date: date ? date.toISOString() : null, liveScore };
  });
}
```

Replace with:
```js
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
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: extend fetchMatchweek and parseMatchesToFixtures for WC"
```

---

### Task 4: `mergeGlobalIntoGroup` — skip cross-GW dedup for WC

**Files:**
- Modify: `src/App.jsx` (around line 158-175)

- [ ] **Step 1: Add WC guard before the dedup pass**

Find this block (around line 158):
```js
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
```

Replace with:
```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: skip cross-GW dedup in mergeGlobalIntoGroup for WC groups"
```

---

### Task 5: `TeamBadge` — add optional `crest` prop

**Files:**
- Modify: `src/App.jsx` (line 458)

- [ ] **Step 1: Update `TeamBadge`**

Find (line 458):
```js
function TeamBadge({ team, size = 22, style = {} }) {
  const badge = TEAM_BADGES[team];
  const fallbackColor = CLUB_COLORS[team] || "var(--text-dim)";
  if (!badge) {
    return <div style={{width:size,height:size,borderRadius:"50%",background:fallbackColor,flexShrink:0,...style}} />;
  }
  return <img src={badge} alt={team} style={{width:size,height:size,objectFit:"contain",flexShrink:0,...style}} />;
}
```

Replace with:
```js
function TeamBadge({ team, crest, size = 22, style = {} }) {
  const src = crest || TEAM_BADGES[team];
  const fallbackColor = CLUB_COLORS[team] || "var(--text-dim)";
  if (!src) {
    return <div style={{width:size,height:size,borderRadius:"50%",background:fallbackColor,flexShrink:0,...style}} />;
  }
  return <img src={src} alt={team} style={{width:size,height:size,objectFit:"contain",flexShrink:0,...style}} />;
}
```

- [ ] **Step 2: Update `TeamBadge` call sites to pass crest for WC fixtures**

The `TeamBadge` component is used in `FixturesTab` and `AllPicksTable`. Search for all `<TeamBadge` usages — they receive a `team` prop from fixture data. For WC fixtures the crest is stored on `f.homeCrest` / `f.awayCrest`.

Find all instances that look like:
```jsx
<TeamBadge team={f.home} ...
```
and:
```jsx
<TeamBadge team={f.away} ...
```

For each one, add the corresponding `crest` prop:
```jsx
<TeamBadge team={f.home} crest={f.homeCrest} ...
<TeamBadge team={f.away} crest={f.awayCrest} ...
```

There are also `TeamBadge` usages in `AllPicksTable` that receive fixture data — apply the same pattern there.

Run this search to find all call sites before editing:
```bash
grep -n "TeamBadge" src/App.jsx
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add crest prop to TeamBadge for national team logos"
```

---

### Task 6: Group creation — competition picker + WC create flow

**Files:**
- Modify: `src/App.jsx` (GroupLobby component, around lines 1198-1270)

- [ ] **Step 1: Add `setupCompetition` state**

Find the block of state declarations near line 1198:
```js
const [creating,setCreating]=useState(false);
const [setupMode,setSetupMode]=useState(false);
const [setupGW,setSetupGW]=useState("1");
const [setupLimit,setSetupLimit]=useState("unlimited");
const [setupGWLoading,setSetupGWLoading]=useState(false);
const [setupPickMode,setSetupPickMode]=useState("open");
```

Add one line:
```js
const [creating,setCreating]=useState(false);
const [setupMode,setSetupMode]=useState(false);
const [setupCompetition,setSetupCompetition]=useState("PL");
const [setupGW,setSetupGW]=useState("1");
const [setupLimit,setSetupLimit]=useState("unlimited");
const [setupGWLoading,setSetupGWLoading]=useState(false);
const [setupPickMode,setSetupPickMode]=useState("open");
```

- [ ] **Step 2: Update `createGroup` to support WC**

Find the `createGroup` function (line 1249). Replace it with:

```js
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
```

- [ ] **Step 3: Add competition picker to the setup UI**

In the setup form (around line 1395-1430), find the `setupMode` true branch. It starts with:
```jsx
):(
  <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{fontSize:13,color:"var(--text-bright)",fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:2}}>{createName}</div>
    <div>
      <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>STARTING GW{...}</div>
```

Add a competition picker as the first item inside that flex column, before the STARTING GW section:

```jsx
<div>
  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>COMPETITION</div>
  <div style={{display:"flex",gap:5}}>
    {[["PL","Premier League"],["WC","World Cup 2026"]].map(([val,label])=>(
      <button key={val} onClick={()=>setSetupCompetition(val)} style={{background:setupCompetition===val?"var(--btn-bg)":"var(--card)",color:setupCompetition===val?"var(--btn-text)":"var(--text-dim2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,transition:"all 0.15s"}}>{label}</button>
    ))}
  </div>
</div>
```

Then wrap the STARTING GW section to only show for PL:
```jsx
{setupCompetition === "PL" && (
  <div>
    <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>STARTING GW{setupGWLoading&&<span style={{color:"var(--text-dim3)",letterSpacing:0,marginLeft:6,textTransform:"none"}}>detecting...</span>}</div>
    <Input value={setupGW} onChange={setSetupGW} placeholder="1" style={{width:80}} />
  </div>
)}
```

- [ ] **Step 4: Also reset `setupCompetition` in the Back button handler**

Find:
```jsx
<Btn variant="ghost" small onClick={()=>{setSetupMode(false);setSetupPickMode("open");}}>← Back</Btn>
```

Replace with:
```jsx
<Btn variant="ghost" small onClick={()=>{setSetupMode(false);setSetupPickMode("open");setSetupCompetition("PL");}}>← Back</Btn>
```

- [ ] **Step 5: Update GroupLobby group card to show competition and use `gwLabel`**

Find (line 1377):
```jsx
<div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{g.members.length} MEMBER{g.members.length!==1?"S":""} · GW{(()=>{const seas=g.season||2025;const next=(g.gameweeks||[]).filter(gw=>(gw.season||seas)===seas).sort((a,b)=>a.gw-b.gw).find(gw=>(gw.fixtures||[]).some(f=>!f.result&&f.status!=="FINISHED"&&f.status!=="IN_PLAY"&&f.status!=="PAUSED"&&f.status!=="POSTPONED"));return next?.gw||g.currentGW;})()} · {(g.mode||"open").toUpperCase()}</div>
```

Replace with:
```jsx
<div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{(g.competition||"PL")==="WC"?"WC 2026":""}{(g.competition||"PL")==="WC"?" · ":""}{g.members.length} MEMBER{g.members.length!==1?"S":""} · {(()=>{const seas=g.season||2025;const next=(g.gameweeks||[]).filter(gw=>(gw.season||seas)===seas).sort((a,b)=>a.gw-b.gw).find(gw=>(gw.fixtures||[]).some(f=>!f.result&&f.status!=="FINISHED"&&f.status!=="IN_PLAY"&&f.status!=="PAUSED"&&f.status!=="POSTPONED"));const gwNum=next?.gw||g.currentGW;return gwLabel(g,gwNum);})()} · {(g.mode||"open").toUpperCase()}</div>
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add competition picker to group creation, WC create flow"
```

---

### Task 7: Auto-sync effect — add WC path

**Files:**
- Modify: `src/App.jsx` (around line 2238-2284)

- [ ] **Step 1: Update the auto-sync useEffect**

Find the entire auto-sync effect (line 2238-2284):
```js
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
```

Replace with:
```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add WC path to auto-sync effect"
```

---

### Task 8: `fetchFromAPI` — WC support for Sync Fixtures button

**Files:**
- Modify: `src/App.jsx` (around line 2082)

- [ ] **Step 1: Update `fetchFromAPI`**

Find these two lines inside `fetchFromAPI` (around 2083 and 2108-2114):
```js
setFetching(true); setFetchMsg("Syncing GW" + currentGW + " from football-data.org...");
```
and:
```js
const matches = await fetchMatchweek(group.apiKey, currentGW, seas);
if (!matches.length) { setFetchMsg("No matches found for this gameweek."); setFetching(false); return; }
const apiFixtures = parseMatchesToFixtures(matches, currentGW);
const globalKey = `fixtures:PL:${seas}`;
const existingGlobal = await sget(globalKey)||{season:seas,updatedAt:0,gameweeks:[]};
const updatedGlobal = regroupGlobalDoc(existingGlobal, currentGW, apiFixtures);
await sset(globalKey, updatedGlobal);
```

Replace those specific lines with (preserve everything else in the function):

For the status message line at the top of `fetchFromAPI`:
```js
const isWC = (group.competition||"PL") === "WC";
const roundLabel = gwLabel(group, currentGW);
setFetching(true); setFetchMsg(`Syncing ${roundLabel} from football-data.org...`);
```

For the fetch + global doc update block:
```js
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
```

Also update the `setFetchMsg` at line 2106 (the second status message):
```js
setFetchMsg(`Syncing ${roundLabel} from football-data.org...`);
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: update fetchFromAPI for WC competition and round labels"
```

---

### Task 9: `deleteGW` — WC placeholder ID prefix

**Files:**
- Modify: `src/App.jsx` (line 2163)

- [ ] **Step 1: Update `deleteGW` to use `wc-` prefix for WC groups**

Find (line 2163):
```js
const prefix = seas!==2025?`${seas}-`:"";
const freshFixtures = Array.from({length:10},(_,i)=>({id:`${prefix}gw${gwToClear}-f${i}`,home:"TBD",away:"TBD",result:null,status:"SCHEDULED"}));
```

Replace with:
```js
const isWC = (g.competition||"PL") === "WC";
const prefix = isWC ? "wc-" : seas!==2025?`${seas}-`:"";
const freshFixtures = isWC
  ? []  // WC: empty array (rounds have no fallback fixtures; sync will fill them)
  : Array.from({length:10},(_,i)=>({id:`${prefix}gw${gwToClear}-f${i}`,home:"TBD",away:"TBD",result:null,status:"SCHEDULED"}));
```

Note: for WC, clearing a round replaces its fixtures with an empty array rather than TBD placeholders, since WC rounds have no predetermined fixture count.

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: fix deleteGW placeholder for WC groups"
```

---

### Task 10: UI text — GW strip, heading, recap banner

**Files:**
- Modify: `src/App.jsx` (FixturesTab and GameUI)

- [ ] **Step 1: Update prediction wizard header**

Find (line ~2304):
```jsx
<div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:3,marginBottom:24}}>GW{currentGW} · {wizardQueue.length-wizardStep} MATCH{wizardQueue.length-wizardStep!==1?"ES":""} TO PICK</div>
```

Replace with:
```jsx
<div style={{fontSize:10,color:"var(--text-dim)",letterSpacing:3,marginBottom:24}}>{gwLabel(group,currentGW)} · {wizardQueue.length-wizardStep} MATCH{wizardQueue.length-wizardStep!==1?"ES":""} TO PICK</div>
```

Note: `gwLabel` is available here because the wizard is rendered inside `FixturesTab` which receives `group` as a prop.

- [ ] **Step 2: Update GW strip button labels**

Find (line 2364):
```jsx
{adminHidden&&<Lock size={10} color="currentColor" style={{marginRight:3}}/>}GW{g.gw}
```

Replace with:
```jsx
{adminHidden&&<Lock size={10} color="currentColor" style={{marginRight:3}}/>}{gwLabel(group,g.gw)}
```

- [ ] **Step 2: Update ALL GW confirmation text strings (4 occurrences)**

There are 4 hardcoded GW references in the Clear/Delete confirmation UI. Update each one:

Find (line ~2373):
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Clear GW{currentGW}?</span>
```
Replace with:
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Clear {gwLabel(group,currentGW)}?</span>
```

Find (line ~2378):
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Really clear GW{currentGW}? All picks lost.</span>
```
Replace with:
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Really clear {gwLabel(group,currentGW)}? All picks lost.</span>
```

Find the `removeGWStep===1` block (line ~2383-2387) — search for text containing `Delete GW`:
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Delete GW{currentGW}?</span>
```
Replace with:
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Delete {gwLabel(group,currentGW)}?</span>
```

Find the `removeGWStep===2` block (line ~2389):
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Permanently remove GW{currentGW}?</span>
```
Replace with:
```jsx
<span style={{fontSize:11,color:"#ef4444",letterSpacing:1}}>Permanently remove {gwLabel(group,currentGW)}?</span>
```

Run this to confirm you got them all before moving on:
```bash
grep -n "GW{currentGW}" src/App.jsx
```
Expected: only non-confirmation occurrences remain (they will be handled in subsequent steps).

- [ ] **Step 3: Update FixturesTab `<h1>` heading**

Find (line 2341):
```jsx
<h1 style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1}}>Gameweek {currentGW}</h1>
```

Replace with:
```jsx
<h1 style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:900,color:"var(--text-bright)",letterSpacing:-1}}>{(group.competition||"PL")==="WC" ? gwLabel(group,currentGW) : `Gameweek ${currentGW}`}</h1>
```

- [ ] **Step 4: Update the GW recap banner in `GameUI`**

Find (line 1816):
```jsx
<span style={{opacity:0.6,marginRight:10}}>GW{recapContent.gwNum} RECAP</span>
```

Replace with:
```jsx
<span style={{opacity:0.6,marginRight:10}}>{gwLabel(group,recapContent.gwNum)} RECAP</span>
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: use gwLabel for round labels throughout UI"
```

---

### Task 11: GroupTab — hide PL-only admin buttons for WC groups

**Files:**
- Modify: `src/App.jsx` (GroupTab, around lines 3767-3788)

- [ ] **Step 1: Wrap PL-only season management in a competition guard**

Find the seasons section in `GroupTab` (around line 3767-3800). The block containing these buttons:
- `Create future GWs`
- `Create all GWs`
- `Sync all dates`
- `Start a new season`

The outer structure is:
```jsx
{isAdmin&&(
  <div>
    <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:8}}>Gameweeks</div>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <Btn variant="muted" small onClick={backfillGWs}>Create future GWs</Btn>
      <Btn variant="muted" small onClick={backfillAllGWs}>Create all GWs</Btn>
      ...
    </div>
    <div ...>
      <Btn variant="amber" small onClick={syncAllDates} ...>Sync all dates</Btn>
      ...
    </div>
  </div>
)}
...
<div>
  <div style={{fontSize:11,color:"var(--text-mid)",marginBottom:8}}>Start a new season</div>
  ...
</div>
```

Wrap the entire Gameweeks + Sync all dates block and the "Start a new season" block with:
```jsx
{(group.competition||"PL") === "PL" && (
  // ... existing content for Create future GWs, Create all GWs, Sync all dates, Start a new season
)}
```

- [ ] **Step 2: Verify the "Gameweek Visibility" section still works for WC**

The Gameweek Visibility toggles in `GroupTab` (around line 3805) use `gwLabel`-style button labels. Update those buttons to show round labels for WC:

Find (around line 3828-3830):
```jsx
}}>GW{g.gw}
```
Replace with:
```jsx
}}>{gwLabel(group,g.gw)}
```

Also find the nearby text in that section:
```jsx
<div style={{fontSize:11,color:"var(--text-mid)",marginBottom:10,letterSpacing:0.3}}>Toggle which gameweeks players can submit picks for</div>
```
For WC groups this still makes sense, so no text change needed there.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: hide PL-only admin buttons for WC groups, update visibility labels"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify PL group unchanged**

1. Log in and open any existing PL group
2. Confirm GW strip still shows "GW1", "GW2" etc.
3. Confirm the FixturesTab heading reads "Gameweek N"
4. Confirm GroupTab still shows Create future GWs, Sync all dates, etc.
5. Confirm team badges render as before

- [ ] **Step 3: Verify WC group creation**

1. Go to GroupLobby → Create Group
2. Enter a name → Next
3. Confirm "COMPETITION" picker appears with "Premier League" / "World Cup 2026"
4. Select World Cup 2026
5. Confirm "STARTING GW" input disappears
6. Create the group
7. Confirm you land in the group with no fixtures (empty rounds)

- [ ] **Step 4: Verify WC round navigation**

1. In the WC group, confirm the GW strip shows "Round 1" through "Round 8" (before sync)
2. Check FixturesTab heading reads "Round 1" (not "Gameweek 1")

- [ ] **Step 5: Verify WC GroupTab**

1. Open Group tab in the WC group
2. Confirm "Create future GWs", "Create all GWs", "Sync all dates", "Start a new season" are all hidden
3. Confirm API key field and Sync Fixtures button are visible

- [ ] **Step 6: Verify WC sync (requires API key)**

1. Add an API key in the Group tab
2. Click "Sync Fixtures"
3. Confirm fixtures load with national team names
4. Confirm team crests appear (national team badges, not coloured circles)
5. Confirm GW strip buttons now show "Matchday 1", "Matchday 2", etc. for group stage rounds

- [ ] **Step 7: Build check**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 8: Final commit**

```bash
git add src/App.jsx api/fixtures.js
git commit -m "feat: World Cup 2026 mode"
```
