# Fixture Date Re-grouping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fixtures displaced by PL rescheduling automatically move to the GW corresponding to when they are actually played, with no duplicates, and auto-sync fetches just the latest incomplete GW once per hour.

**Architecture:** Add a `regroupGlobalDoc` helper that detects orphaned fixtures (>14 days before their GW's median date) and moves them to the GW with the closest median date already in the global doc. Update `mergeGlobalIntoGroup` to remove cross-GW duplicates. Update `fetchFromAPI` and the auto-sync useEffect to use the new helpers.

**Tech Stack:** React (useEffect), existing `sget`/`sset`/`lget`/`lset` helpers, `parseMatchesToFixtures`, `fetchMatchweek` — all in `src/App.jsx`. No new files.

---

### Task 1: Add `regroupGlobalDoc` helper

**Files:**
- Modify: `src/App.jsx` — insert after `mergeGlobalIntoGroup` (after line 146)

**Context:** `mergeGlobalIntoGroup` ends at line 146. Insert the new function immediately after it, before `calcPts`.

**Step 1: Insert the function**

```js
function regroupGlobalDoc(globalDoc, gwNum, newFixtures) {
  const otherGWs = (globalDoc.gameweeks||[]).filter(g=>g.gw!==gwNum);

  // Compute median date of incoming fixtures
  const dates = newFixtures
    .filter(f=>f.date)
    .map(f=>new Date(f.date).getTime())
    .sort((a,b)=>a-b);

  // Not enough dated fixtures to determine median — skip re-grouping
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
```

**Step 2: Lint**

```bash
cd "C:\Users\default.LAPTOP-UHMD4JK9\points-are-bad" && npm run lint
```

No new errors expected.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Add regroupGlobalDoc helper for date-based fixture reassignment"
```

---

### Task 2: Update `mergeGlobalIntoGroup` with cross-GW deduplication

**Files:**
- Modify: `src/App.jsx` — `mergeGlobalIntoGroup` function (lines 113-146)

**Context:** The current function returns `{...g, gameweeks:updatedGameweeks, lastAutoSync:Date.now()}`. We need to add a deduplication pass before the return that removes fixtures from group GWs when the global doc has those fixtures under a different GW.

**Step 1: Replace the final return line**

Find:
```js
  return {...g,gameweeks:updatedGameweeks,lastAutoSync:Date.now()};
}
```

Replace with:
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
      return hasPick(f.id); // keep if has picks, remove otherwise
    });
    return {...gwObj,fixtures:filtered};
  });

  return {...g,gameweeks:deduped,lastAutoSync:Date.now()};
}
```

**Step 2: Lint**

```bash
npm run lint
```

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Deduplicate cross-GW fixtures in mergeGlobalIntoGroup"
```

---

### Task 3: Update `fetchFromAPI` to use `regroupGlobalDoc`

**Files:**
- Modify: `src/App.jsx` — `fetchFromAPI` function (lines ~1069-1119)

**Context:** `fetchFromAPI` currently manually replaces the global doc GW entry at lines 1076-1080. Replace those 5 lines with a call to `regroupGlobalDoc`.

**Step 1: Find and replace the global doc update block**

Find this block inside `fetchFromAPI` (after `const apiFixtures = parseMatchesToFixtures(...)`):

```js
      const globalKey = `fixtures:PL:${seas}`;
      const existingGlobal = await sget(globalKey);
      const globalGWs = (existingGlobal?.gameweeks||[]).filter(g=>g.gw!==currentGW);
      globalGWs.push({gw:currentGW,fixtures:apiFixtures});
      await sset(globalKey,{season:seas,updatedAt:Date.now(),gameweeks:globalGWs});
```

Replace with:

```js
      const globalKey = `fixtures:PL:${seas}`;
      const existingGlobal = await sget(globalKey)||{season:seas,updatedAt:0,gameweeks:[]};
      const updatedGlobal = regroupGlobalDoc(existingGlobal, currentGW, apiFixtures);
      await sset(globalKey, updatedGlobal);
```

**Step 2: Lint**

```bash
npm run lint
```

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Use regroupGlobalDoc in manual sync to apply date re-grouping"
```

---

### Task 4: Rewrite auto-sync useEffect

**Files:**
- Modify: `src/App.jsx` — auto-sync useEffect (lines 1203-1223)

**Context:** The current useEffect fetches ALL season fixtures when the global doc is >24h old. Replace it entirely with per-GW logic: find the highest GW with incomplete fixtures, apply a 1-hour localStorage cooldown per GW, fetch just that GW, update the global doc via `regroupGlobalDoc`, then merge.

**Step 1: Replace the entire auto-sync useEffect**

Find:
```js
  useEffect(()=>{
    const seas = group.season||2025;
    const globalKey = `fixtures:PL:${seas}`;
    (async()=>{
      try {
        let globalDoc = await sget(globalKey);
        const now = Date.now();
        if (!globalDoc || !globalDoc.updatedAt || (now-globalDoc.updatedAt)>86_400_000) {
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

Replace with:

```js
  useEffect(()=>{
    const seas = group.season||2025;
    const globalKey = `fixtures:PL:${seas}`;
    // Find highest GW with at least one incomplete fixture
    const incompleteGWs=(group.gameweeks||[])
      .filter(gw=>(gw.season||seas)===seas&&(gw.fixtures||[]).some(f=>!f.result));
    if(!incompleteGWs.length) return;
    const targetGW=Math.max(...incompleteGWs.map(gw=>gw.gw));
    const cooldownKey=`gw-api-sync:${seas}:${targetGW}`;
    (async()=>{
      try {
        let globalDoc=await sget(globalKey)||{season:seas,updatedAt:0,gameweeks:[]};
        const now=Date.now();
        const lastSync=lget(cooldownKey);
        if(!lastSync||(now-lastSync)>3_600_000){
          const matches=await fetchMatchweek(group.apiKey,targetGW,seas);
          if(!matches.length) return;
          const apiFixtures=parseMatchesToFixtures(matches,targetGW);
          lset(cooldownKey,now);
          globalDoc=regroupGlobalDoc(globalDoc,targetGW,apiFixtures);
          await sset(globalKey,globalDoc);
        }
        if(globalDoc.updatedAt<=(group.lastAutoSync||0)) return;
        await updateGroup(g=>mergeGlobalIntoGroup(globalDoc,g));
      } catch(_){}
    })();
  },[activeSeason,group.currentGW]);
```

**Step 2: Lint**

```bash
npm run lint
```

**Step 3: Verify manually**

```bash
npm run dev
```

- Open FixturesTab on a GW with some completed and some upcoming fixtures
- Check browser console — no errors
- Wait for auto-sync to run silently in background (check Network tab for `/api/fixtures?matchday=...`)
- Check that no duplicate fixtures appear in any GW

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Rewrite auto-sync to fetch latest incomplete GW hourly via global doc"
```
