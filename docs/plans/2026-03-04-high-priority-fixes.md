# High Priority Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix four high-priority correctness and reliability issues: prediction race condition, silent save failures, boot hang on network error, and stale lock check in savePred.

**Architecture:** Add a Firestore atomic PATCH endpoint to eliminate the read-modify-write race on predictions. Add a toast system in App for surfacing save failures. Refactor the boot effect into a retryable function. Add a lock guard at the top of savePred.

**Tech Stack:** React 18, Vite, Vercel serverless functions, firebase-admin Firestore, no test framework (project has no tests - verify manually via browser).

---

> **Note on testing:** This project has no test suite. Each task includes manual verification steps. Run `npm run dev` once at the start and keep the dev server running throughout.

---

### Task 1: Add PATCH handler to api/db.js

**Files:**
- Modify: `api/db.js:46-48`

**Step 1: Add the PATCH block**

In `api/db.js`, insert the following block between the closing `}` of the POST handler (line 45) and the final `return res.status(405)` line (line 47):

```js
  if (req.method === "PATCH") {
    const { key, path, value } = req.body || {};
    if (!validKey(key)) return res.status(400).json({ error: "Invalid key" });
    if (!path || typeof path !== "string" || !/^[\w.-]+$/.test(path)) {
      return res.status(400).json({ error: "Invalid path" });
    }
    try {
      await db.collection("data").doc(key.replace(/[/\\]/g, "_")).update({ [path]: value });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("db PATCH error", key, path, e);
      return res.status(500).json({ error: "Patch failed" });
    }
  }
```

**Step 2: Verify**

The final `api/db.js` should have GET, POST, PATCH handlers in that order, then the 405 fallback.

**Step 3: Commit**

```bash
git add api/db.js
git commit -m "Add atomic PATCH endpoint to db proxy"
```

---

### Task 2: Add spatch and applyPath helpers to App.jsx

**Files:**
- Modify: `src/App.jsx:25` (after the closing `}` of `sset`)

**Step 1: Add spatch after sset (after line 25)**

Insert after the closing brace of `sset`:

```js
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
  return { ...obj, [parts[0]]: applyPath(obj[parts[0]] || {}, parts.slice(1).join("."), value) };
}
```

**Step 2: Verify**

`spatch` and `applyPath` are defined at module level, between `sset` and the `lget`/`lset`/`ldel` helpers. The file should still compile (`npm run dev` shows no errors in terminal).

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Add spatch and applyPath helpers"
```

---

### Task 3: Add toast state and showToast to App, fix updateGroup

**Files:**
- Modify: `src/App.jsx` - App function (lines 389-444)

**Step 1: Add toast state and showToast**

Inside `App()`, after the existing state declarations (after line 394 `const [dark,setDark]...`), add:

```js
  const [toast,setToast]=useState(null);
  const [bootError,setBootError]=useState(false);
  const toastTimer=useRef(null);
  const showToast=useCallback((msg)=>{
    setToast(msg);
    if(toastTimer.current)clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),4000);
  },[]);
```

**Step 2: Update updateGroup to return ok and call showToast on failure**

Replace the existing `updateGroup` (line 435):

```js
  const updateGroup = useCallback(async(updater)=>{
    if(!group)return false;
    const fresh=await sget(`group:${group.id}`);
    const next=typeof updater==="function"?updater(fresh):updater;
    const ok=await sset(`group:${group.id}`,next);
    if(ok)setGroup(next);
    else showToast("Save failed - check your connection.");
    return ok;
  },[group?.id,showToast]);
```

**Step 3: Add patchGroup after updateGroup**

Insert after the new `updateGroup`:

```js
  const patchGroup=useCallback(async(path,value)=>{
    if(!group)return false;
    const ok=await spatch(`group:${group.id}`,path,value);
    if(ok)setGroup(g=>applyPath(g,path,value));
    else showToast("Save failed - check your connection.");
    return ok;
  },[group?.id,showToast]);
```

**Step 4: Verify**

`npm run dev` compiles cleanly. No console errors on load.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Add toast system, fix updateGroup to surface failures, add patchGroup"
```

---

### Task 4: Refactor boot logic for retry, add boot error UI

**Files:**
- Modify: `src/App.jsx` - App function and its render (lines 401-443)

**Step 1: Extract boot logic into runBoot**

Replace the existing boot `useEffect` (lines 401-419) with:

```js
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
```

**Step 2: Restructure the App return**

Replace the existing early returns and final return (lines 437-443) with a single return using a fragment:

```jsx
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
        bootError?(
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
        ):(
          <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",
            justifyContent:"center",color:"var(--text-dim)",fontFamily:"monospace",fontSize:12}}>
            loading...
          </div>
        )
      ):!user?(
        <AuthScreen onLogin={handleLogin}/>
      ):!group?(
        <GroupLobby user={user} onEnterGroup={handleEnterGroup} onUpdateUser={u=>setUser(u)}/>
      ):(
        <GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin}
          isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout}
          updateGroup={updateGroup} patchGroup={patchGroup} refreshGroup={refreshGroup}
          dark={dark} toggleDark={()=>setDark(d=>!d)}/>
      )}
    </>
  );
```

**Step 3: Verify**

- `npm run dev` compiles cleanly
- App loads normally
- Disconnect network in DevTools (Network tab > Offline), reload page - should show "Connection failed." with RETRY and "clear session" buttons
- Reconnect network, click RETRY - app should load normally

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Add boot retry with error state and clear session fallback"
```

---

### Task 5: Thread patchGroup through GameUI to FixturesTab, update savePred

**Files:**
- Modify: `src/App.jsx` - GameUI signature (line 447), FixturesTab call (line 551), FixturesTab signature (line 638), savePred (lines 674-693)

**Step 1: Add patchGroup to GameUI signature**

Change line 447 from:
```js
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,updateGroup,refreshGroup,dark,toggleDark}) {
```
to:
```js
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,updateGroup,patchGroup,refreshGroup,dark,toggleDark}) {
```

**Step 2: Pass patchGroup to FixturesTab**

Change line 551 from:
```jsx
        {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} updateGroup={updateGroup} names={names}/>}
```
to:
```jsx
        {tab==="Fixtures"&&<FixturesTab group={group} user={user} isAdmin={isAdmin} updateGroup={updateGroup} patchGroup={patchGroup} names={names}/>}
```

**Step 3: Add patchGroup to FixturesTab signature**

Change line 638 from:
```js
function FixturesTab({group,user,isAdmin,updateGroup,names}) {
```
to:
```js
function FixturesTab({group,user,isAdmin,updateGroup,patchGroup,names}) {
```

**Step 4: Replace savePred with lock guard and atomic patch**

Replace the entire `savePred` function (lines 674-693) with:

```js
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
```

**Step 5: Verify**

- `npm run dev` compiles cleanly
- Open the app, go to Fixtures tab, enter a prediction score and press Enter - it saves (check Firestore or observe the pick appears in AllPicksTable)
- Disconnect network in DevTools, try to save a prediction - after a moment the red toast "Save failed - check your connection." appears at the bottom center and fades after 4 seconds
- Reconnect network, save works again

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Use atomic patch for predictions, add lock guard to savePred"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] Normal load: app loads, predictions save, no console errors
- [ ] Offline boot: "Connection failed." with RETRY and "clear session" buttons shown
- [ ] RETRY works: clicking retry re-runs boot and loads the app when network is back
- [ ] Clear session: clicking "clear session" wipes localStorage and refreshes to login screen
- [ ] Failed save toast: with network offline in a loaded session, saving a prediction shows the red toast
- [ ] Toast auto-dismisses after 4 seconds
- [ ] Lock guard: a fixture that is locked (result set, or status IN_PLAY/FINISHED/PAUSED, or date passed) cannot have a prediction saved even if the input is somehow focused
- [ ] Concurrent saves: open two browser tabs as different users, both enter predictions for the same GW simultaneously - both picks should appear in AllPicksTable (no overwrite)
