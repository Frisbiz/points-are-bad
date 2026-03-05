# Global Fixtures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A shared `fixtures:PL:{season}` Firestore document acts as a canonical fixture cache; manual sync writes to it, all groups silently merge from it on mount, and new groups are seeded from it.

**Architecture:** One Firestore doc per season (`fixtures:PL:2025`) holds all synced GWs. Manual admin sync writes the fetched GW to the global before updating the group. A mount-time useEffect in `FixturesTab` reads the global and merges any updates into the group (no API call). Group creation seeds from global instead of `makeAllGWs` fallback. A shared `mergeGlobalIntoGroup(globalDoc, group)` helper contains the merge logic used everywhere.

**Tech Stack:** React (useState, useEffect), existing `sget`/`sset`/`updateGroup` helpers, `api/db.js` serverless function, Firestore.

---

### Task 1: Allow `fixtures:` key prefix in api/db.js

**Files:**
- Modify: `api/db.js` line 16

**Context:** All Firestore reads/writes go through `api/db.js`. Line 16 has:
```js
const ALLOWED_PREFIXES = ["user:", "group:", "groupcode:", "reset:", "useremail:", "backup:"];
```
The global document key is `fixtures:PL:2025` — without the prefix it gets a 400.

**Step 1: Add the prefix**

Change line 16 to:
```js
const ALLOWED_PREFIXES = ["user:", "group:", "groupcode:", "reset:", "useremail:", "backup:", "fixtures:"];
```

**Step 2: Build to verify**

```bash
npm run build
```
Expected: `✓ built in ~3s`

**Step 3: Commit**

```bash
git add api/db.js
git commit -m "Allow fixtures: key prefix in db proxy"
```

---

### Task 2: Add mergeGlobalIntoGroup helper in App.jsx

**Files:**
- Modify: `src/App.jsx` — add after `parseMatchesToFixtures` function (around line 103)

**Context:**

`parseMatchesToFixtures` is defined at line 91. `normName` is at line 74. The merge helper goes right after `parseMatchesToFixtures` at the module level so it is available to both `FixturesTab` and `GroupLobby`.

The merge logic per GW:
- If the group's existing fixtures for that GW are all TBD → replace wholesale with global fixtures
- Otherwise: match each global fixture against group fixtures by `apiId` or `home|away`
  - Matched: update `result`, `status`, `date`, `apiId`, `home`, `away` on the group fixture — keep the group fixture's `id` (prediction keys stay intact)
  - New (no match): append only if the GW has no picks yet (prevents disrupting active GWs)
- Fixtures in the group not in global are left untouched (admin custom fixtures)
- Sets `lastAutoSync = Date.now()` on the returned group

**Step 1: Add the helper after parseMatchesToFixtures**

Find the closing brace of `parseMatchesToFixtures` (the line reading `}` after the `return matches.map(...)` block, around line 103). Insert after it:

```js
function mergeGlobalIntoGroup(globalDoc, g) {
  const seas = g.season||2025;
  const globalGWMap = {};
  (globalDoc.gameweeks||[]).forEach(gwObj=>{globalGWMap[gwObj.gw]=gwObj.fixtures;});
  const preds = g.predictions||{};
  const hasPick = id=>Object.values(preds).some(up=>up[id]!==undefined);
  const updatedGameweeks = (g.gameweeks||[]).map(gwObj=>{
    if ((gwObj.season||seas)!==seas) return gwObj;
    const globalFixtures = globalGWMap[gwObj.gw];
    if (!globalFixtures||!globalFixtures.length) return gwObj;
    const oldFixtures = gwObj.fixtures||[];
    const allTBD = oldFixtures.length>0&&oldFixtures.every(f=>f.home==="TBD"&&f.away==="TBD");
    if (allTBD) return {...gwObj,fixtures:globalFixtures};
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
    const gwHasPicks=oldFixtures.some(f=>hasPick(f.id));
    return {...gwObj,fixtures:[...working,...(gwHasPicks?[]:toAdd)]};
  });
  return {...g,gameweeks:updatedGameweeks,lastAutoSync:Date.now()};
}
```

**Step 2: Build to verify**

```bash
npm run build
```
Expected: `✓ built in ~3s`

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Add mergeGlobalIntoGroup helper"
```

---

### Task 3: Manual sync writes to global doc before updating group

**Files:**
- Modify: `src/App.jsx` — `fetchFromAPI` function inside `FixturesTab` (starts around line 1006)

**Context:**

`fetchFromAPI` currently:
1. Fetches matches from API
2. Parses into `apiFixtures`
3. Calls `updateGroup` to merge into the group

We add step 2.5: write the fetched GW into the global doc.

The global doc shape:
```js
{ season: 2025, updatedAt: Date.now(), gameweeks: [{gw: N, fixtures: [...]}, ...] }
```

We read the current global, replace/add the entry for `currentGW`, write it back. This is done **before** the `updateGroup` call so other groups see it immediately.

**Step 1: Add global write inside fetchFromAPI**

Find `fetchFromAPI`. It starts with:
```js
const fetchFromAPI = async () => {
  setFetching(true); setFetchMsg("Syncing GW" + currentGW + " from football-data.org...");
  try {
    const matches = await fetchMatchweek(group.apiKey, currentGW, group.season||2025);
    if (!matches.length) { setFetchMsg("No matches found for this gameweek."); setFetching(false); return; }
    const apiFixtures = parseMatchesToFixtures(matches, currentGW);
    await updateGroup(g => {
```

Change to:
```js
const fetchFromAPI = async () => {
  setFetching(true); setFetchMsg("Syncing GW" + currentGW + " from football-data.org...");
  try {
    const seas = group.season||2025;
    const matches = await fetchMatchweek(group.apiKey, currentGW, seas);
    if (!matches.length) { setFetchMsg("No matches found for this gameweek."); setFetching(false); return; }
    const apiFixtures = parseMatchesToFixtures(matches, currentGW);
    const globalKey = `fixtures:PL:${seas}`;
    const existingGlobal = await sget(globalKey)||{season:seas,gameweeks:[]};
    const globalGWs = (existingGlobal.gameweeks||[]).filter(g=>g.gw!==currentGW);
    globalGWs.push({gw:currentGW,fixtures:apiFixtures});
    await sset(globalKey,{season:seas,updatedAt:Date.now(),gameweeks:globalGWs});
    await updateGroup(g => {
```

Note: the rest of `fetchFromAPI` (the `updateGroup` callback body and everything after) stays **exactly** as it is today. Only the opening of the try block changes.

Also remove the hardcoded `const seas = group.season||2025;` if it appears later inside the `updateGroup` callback — it was already declared above now. Check that the `updateGroup` callback uses `g.season||2025` (a local `const s`) not the outer `seas` — if so, no conflict.

**Step 2: Build to verify**

```bash
npm run build
```
Expected: `✓ built in ~3s`

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Write synced GW to global fixture doc on manual sync"
```

---

### Task 4: Replace auto-sync useEffect with global-merge effect

**Files:**
- Modify: `src/App.jsx` — the auto-sync `useEffect` in `FixturesTab` (around line 1134)

**Context:**

The current auto-sync useEffect (lines 1134–1181):
```js
useEffect(()=>{
  if (currentGW !== (group.currentGW||1)) return;
  const now = Date.now();
  if (group.lastAutoSync && (now - group.lastAutoSync) < 86_400_000) return;
  const seas = group.season||2025;
  (async()=>{
    try {
      const matches = await fetchMatchweek(group.apiKey, currentGW, seas);
      ...
    } catch(_){}
  })();
},[currentGW,activeSeason]);
```

Replace the entire useEffect with the new one below. The new effect:
1. Reads `fixtures:PL:{season}`
2. If global is missing or stale (>24h) AND the group has an API key: fetches all season matches from API, builds and writes the global doc
3. If `global.updatedAt > group.lastAutoSync`: merges global into group via `mergeGlobalIntoGroup`
4. Fully silent — no UI state touched, errors swallowed

**Step 1: Replace the useEffect**

Find the useEffect that starts with:
```js
useEffect(()=>{
  if (currentGW !== (group.currentGW||1)) return;
  const now = Date.now();
  if (group.lastAutoSync && (now - group.lastAutoSync) < 86_400_000) return;
```

Replace the entire useEffect (up to and including its closing `},[currentGW,activeSeason]);`) with:

```js
useEffect(()=>{
  const seas = group.season||2025;
  const globalKey = `fixtures:PL:${seas}`;
  (async()=>{
    try {
      let globalDoc = await sget(globalKey);
      const now = Date.now();
      if (!globalDoc || !globalDoc.updatedAt || (now-globalDoc.updatedAt)>86_400_000) {
        if (!group.apiKey) return;
        const allMatches = await fetchMatchweek(group.apiKey, null, seas);
        if (!allMatches.length) return;
        const byGW = {};
        allMatches.forEach(m=>{const gw=m.matchday;if(!byGW[gw])byGW[gw]=[];byGW[gw].push(m);});
        const gameweeks = Object.entries(byGW).map(([gw,ms])=>({gw:Number(gw),fixtures:parseMatchesToFixtures(ms,Number(gw))}));
        globalDoc = {season:seas,updatedAt:now,gameweeks};
        await sset(globalKey,globalDoc);
      }
      if (!globalDoc || globalDoc.updatedAt<=(group.lastAutoSync||0)) return;
      await updateGroup(g=>mergeGlobalIntoGroup(globalDoc,g));
    } catch(_){}
  })();
},[activeSeason]);
```

Note: dependency is `[activeSeason]` only — runs once per season on mount, not on every GW navigation.

**Step 2: Build to verify**

```bash
npm run build
```
Expected: `✓ built in ~3s`

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Replace auto-sync with global-merge effect"
```

---

### Task 5: GroupLobby — read global for GW detection

**Files:**
- Modify: `src/App.jsx` — `GroupLobby`'s `setupMode` useEffect (around line 425)

**Context:**

Currently this effect hits `/api/fixtures?season=2025` directly every time the setup panel opens. Replace it to read from the global doc first; fall back to direct API only if global is absent.

The current useEffect:
```js
useEffect(()=>{
  if (!setupMode) return;
  setSetupGWLoading(true);
  (async()=>{
    try {
      const resp = await fetch("/api/fixtures?season=2025");
      if (!resp.ok) return;
      const data = await resp.json();
      const matches = data.matches||[];
      if (!matches.length) return;
      const now = new Date();
      const upcoming = matches.filter(m=>m.status!=="FINISHED"&&new Date(m.utcDate)>=now);
      const gw = upcoming.length ? Math.min(...upcoming.map(m=>m.matchday)) : Math.max(...matches.map(m=>m.matchday));
      if (gw>=1&&gw<=38) setSetupGW(String(gw));
    } catch{}
    setSetupGWLoading(false);
  })();
},[setupMode]);
```

Replace entirely with:

```js
useEffect(()=>{
  if (!setupMode) return;
  setSetupGWLoading(true);
  (async()=>{
    try {
      const globalDoc = await sget("fixtures:PL:2025");
      const now = new Date();
      if (globalDoc && (globalDoc.gameweeks||[]).length) {
        const allFixtures = globalDoc.gameweeks.flatMap(gwObj=>
          (gwObj.fixtures||[]).map(f=>({...f,matchday:gwObj.gw}))
        );
        const upcoming = allFixtures.filter(f=>f.status!=="FINISHED"&&f.date&&new Date(f.date)>=now);
        const gw = upcoming.length ? Math.min(...upcoming.map(f=>f.matchday)) : Math.max(...allFixtures.map(f=>f.matchday));
        if (gw>=1&&gw<=38) setSetupGW(String(gw));
      } else {
        const resp = await fetch("/api/fixtures?season=2025");
        if (!resp.ok) return;
        const data = await resp.json();
        const matches = data.matches||[];
        if (!matches.length) return;
        const upcoming = matches.filter(m=>m.status!=="FINISHED"&&new Date(m.utcDate)>=now);
        const gw = upcoming.length ? Math.min(...upcoming.map(m=>m.matchday)) : Math.max(...matches.map(m=>m.matchday));
        if (gw>=1&&gw<=38) setSetupGW(String(gw));
      }
    } catch{}
    setSetupGWLoading(false);
  })();
},[setupMode]);
```

**Step 2: Build to verify**

```bash
npm run build
```
Expected: `✓ built in ~3s`

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Read global fixture doc for GW detection in group setup"
```

---

### Task 6: Seed new groups from global doc on creation

**Files:**
- Modify: `src/App.jsx` — `createGroup` function in `GroupLobby` (around line 452)

**Context:**

Currently `createGroup` builds the group with `makeAllGWs(2025)` (38 GWs of TBD fixtures). We add a step: read the global doc and call `mergeGlobalIntoGroup` so the new group immediately has real fixtures wherever the global has them.

The current `createGroup`:
```js
const createGroup = async () => {
  if (!createName.trim()) return;
  setCreating(true);
  const id = Date.now().toString();
  const code = genCode();
  const startGW = Math.max(1,Math.min(38,parseInt(setupGW)||1));
  const group = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:makeAllGWs(2025),currentGW:startGW,apiKey:"",season:2025,hiddenGWs:[],scoreScope:"all",draw11Limit:setupLimit,adminLog:[]};
  await sset(`group:${id}`,group);
  await sset(`groupcode:${code}`,id);
  const fresh = await sget(`user:${user.username}`);
  const updated = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
  await sset(`user:${user.username}`,updated);
  onUpdateUser(updated);setCreateName("");setSetupMode(false);setSetupGW("1");setSetupLimit("unlimited");setCreating(false);
  onEnterGroup(group);
};
```

Replace with:

```js
const createGroup = async () => {
  if (!createName.trim()) return;
  setCreating(true);
  const id = Date.now().toString();
  const code = genCode();
  const startGW = Math.max(1,Math.min(38,parseInt(setupGW)||1));
  let newGroup = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:makeAllGWs(2025),currentGW:startGW,apiKey:"",season:2025,hiddenGWs:[],scoreScope:"all",draw11Limit:setupLimit,adminLog:[]};
  try {
    const globalDoc = await sget("fixtures:PL:2025");
    if (globalDoc&&(globalDoc.gameweeks||[]).length) {
      newGroup = mergeGlobalIntoGroup(globalDoc,newGroup);
      newGroup.lastAutoSync = globalDoc.updatedAt||Date.now();
    }
  } catch{}
  await sset(`group:${id}`,newGroup);
  await sset(`groupcode:${code}`,id);
  const fresh = await sget(`user:${user.username}`);
  const updated = {...fresh,groupIds:[...(fresh.groupIds||[]),id]};
  await sset(`user:${user.username}`,updated);
  onUpdateUser(updated);setCreateName("");setSetupMode(false);setSetupGW("1");setSetupLimit("unlimited");setCreating(false);
  onEnterGroup(newGroup);
};
```

**Step 2: Build to verify**

```bash
npm run build
```
Expected: `✓ built in ~3s`

**Step 3: Final lint + build**

```bash
npm run lint
npm run build
```
Both should pass cleanly.

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Seed new groups from global fixture doc"
```
