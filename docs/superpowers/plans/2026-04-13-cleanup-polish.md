# Cleanup & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bugs, polish UX, clean up code quality, redesign Group tab, and improve GW selector across the Points Are Bad prediction app.

**Architecture:** All changes stay within the single-file `src/App.jsx` architecture. New shared utilities (callAPI, useHorizontalScroll, THEMES, Spinner, TabErrorBoundary) are added as top-level declarations in the same file. Group tab is reorganized into an accordion layout. No data model or API changes.

**Tech Stack:** React 19, Vite, Vercel serverless functions, Recharts, griddy-icons

**Spec:** `docs/superpowers/specs/2026-04-13-cleanup-polish-design.md`

---

### Task 1: Fix group join not refreshing lobby list

**Files:**
- Modify: `src/App.jsx` (lines 2280-2285 - `handleEnterGroup`, line 2115 - `groups` state)

- [ ] **Step 1: Update handleEnterGroup to append group to groups state**

In `src/App.jsx`, find the `handleEnterGroup` function (around line 2280):

```js
const handleEnterGroup = async (g) => {
  const fresh = await sget(`group:${g.id}`);
  setGroup(fresh||g);
  setTab("League");
  lset("session",{...lget("session"),groupId:g.id,tab:"League"});
};
```

Replace with:

```js
const handleEnterGroup = async (g) => {
  const fresh = await sget(`group:${g.id}`);
  const resolved = fresh || g;
  setGroup(resolved);
  setGroups(prev => prev.some(x => x.id === resolved.id) ? prev : [...prev, resolved]);
  setTab("League");
  lset("session",{...lget("session"),groupId:resolved.id,tab:"League"});
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Fix group join not refreshing lobby list"
```

---

### Task 2: Fix missing onUpdateUser prop in GroupTab

**Files:**
- Modify: `src/App.jsx` (line 2366 - GameUI signature, line 2577 - GroupTab render, line 4354 - GroupTab signature, lines 2354-2358 - GameUI render in App)

- [ ] **Step 1: Add onUpdateUser to GameUI signature**

Find the GameUI function signature (line 2366):

```js
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,refreshGroup,theme,setTheme,setGroup,unlockSecretTheme,sitePrefs=null,setSitePrefs=()=>{},onOpenWhatsNew=()=>{}}) {
```

Add `onUpdateUser` to the destructured props:

```js
function GameUI({user,group,tab,setTab,isAdmin,isCreator,onLeave,onLogout,onUpdateUser,refreshGroup,theme,setTheme,setGroup,unlockSecretTheme,sitePrefs=null,setSitePrefs=()=>{},onOpenWhatsNew=()=>{}}) {
```

- [ ] **Step 2: Pass onUpdateUser to GroupTab**

Find where GroupTab is rendered in GameUI (line 2577):

```js
{tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} onLeave={onLeave} theme={theme} setTheme={setTheme} names={names} sitePrefs={sitePrefs} setSitePrefs={setSitePrefs} onOpenWhatsNew={onOpenWhatsNew} setGroup={setGroup}/>}
```

Add `onUpdateUser`:

```js
{tab==="Group"&&<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} onLeave={onLeave} onUpdateUser={onUpdateUser} theme={theme} setTheme={setTheme} names={names} sitePrefs={sitePrefs} setSitePrefs={setSitePrefs} onOpenWhatsNew={onOpenWhatsNew} setGroup={setGroup}/>}
```

- [ ] **Step 3: Add onUpdateUser to GroupTab signature**

Find GroupTab's function signature (line 4354):

```js
function GroupTab({group,user,isAdmin,isCreator,onLeave,theme,setTheme,names={},sitePrefs=null,setSitePrefs=()=>{},onOpenWhatsNew=()=>{},setGroup}) {
```

Add `onUpdateUser`:

```js
function GroupTab({group,user,isAdmin,isCreator,onLeave,onUpdateUser,theme,setTheme,names={},sitePrefs=null,setSitePrefs=()=>{},onOpenWhatsNew=()=>{},setGroup}) {
```

- [ ] **Step 4: Pass onUpdateUser from App to GameUI**

Find where App renders GameUI (lines 2354-2358):

```js
<GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin}
  isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout}
  refreshGroup={refreshGroup} theme={theme} setTheme={setTheme} setGroup={setGroup}
  unlockSecretTheme={unlockSecretTheme} sitePrefs={sitePrefs} setSitePrefs={setSitePrefs}
  onOpenWhatsNew={() => setWhatsNewOpen(true)}/>
```

Add `onUpdateUser={u=>setUser(u)}`:

```js
<GameUI user={user} group={group} tab={tab} setTab={handleSetTab} isAdmin={isAdmin}
  isCreator={isCreator} onLeave={handleLeaveGroup} onLogout={handleLogout}
  onUpdateUser={u=>setUser(u)} refreshGroup={refreshGroup} theme={theme} setTheme={setTheme} setGroup={setGroup}
  unlockSecretTheme={unlockSecretTheme} sitePrefs={sitePrefs} setSitePrefs={setSitePrefs}
  onOpenWhatsNew={() => setWhatsNewOpen(true)}/>
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Fix missing onUpdateUser prop in GroupTab leave flow"
```

---

### Task 3: Fix GW selector default position logic

**Files:**
- Modify: `src/App.jsx` (lines 2881-2891 - viewGW initializer)

- [ ] **Step 1: Replace viewGW initializer**

Find the current initializer (line 2881):

```js
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
```

Replace with:

```js
const [viewGW, setViewGW] = useState(()=>{
  const seas = group.season||2025;
  const seasonGWs = (group.gameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
  // Find lowest GW with at least one non-postponed fixture missing a result
  const activeGW = seasonGWs.find(gwObj =>
    (gwObj.fixtures||[]).some(f => !f.result && f.status !== "FINISHED" && f.status !== "POSTPONED")
  );
  if (activeGW) return activeGW.gw;
  // All complete: show last GW with results
  const withResults = seasonGWs.filter(gwObj=>(gwObj.fixtures||[]).some(f=>f.result));
  if (withResults.length) return withResults[withResults.length-1].gw;
  return group.currentGW||1;
});
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Fix GW selector to land on current active gameweek"
```

---

### Task 4: Extract callAPI shared helper

**Files:**
- Modify: `src/App.jsx` (add helper near top after sget/sset/sdel/spatch, then replace ~43 fetch calls)

- [ ] **Step 1: Add callAPI function after spatch (line ~52)**

Insert after the `spatch` function (after line 52):

```js
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
  } catch (e) {
    return { ok: false, error: 'Network error. Please try again.', data: {} };
  }
}
```

- [ ] **Step 2: Replace all fetch('/api/security') calls in AuthScreen**

Find in AuthScreen's `handle` function (register branch, line ~891):
```js
const res = await fetch('/api/security', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'auth-register', username: uname, password, email: email.trim().toLowerCase() }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || !data.user){setError(data.error||"Registration failed - please try again.");setLoading(false);return;}
onLogin(data.user);
```

Replace with:
```js
const { ok, data } = await callAPI('auth-register', { username: uname, password, email: email.trim().toLowerCase() });
if (!ok || !data.user){setError(data.error||"Registration failed - please try again.");setLoading(false);return;}
onLogin(data.user);
```

Do the same for the login branch (line ~900):
```js
const { ok, data } = await callAPI('auth-login', { username: username.toLowerCase(), password });
if (!ok || !data.user){setError(data.error||"Invalid credentials.");setLoading(false);return;}
onLogin(data.user);
```

- [ ] **Step 3: Replace all fetch('/api/security') calls in AccountSetupModal**

Find both calls in AccountSetupModal's `handle` (lines ~1074 and ~1083). Replace each with:
```js
const { ok, data } = await callAPI('account-change-email', { email: normEmail });
if (!ok) { setError(data.error || "Failed to save email."); setLoading(false); return; }
```
and:
```js
const { ok, data } = await callAPI('account-change-password', { currentPassword: user.password || "password123", newPassword: trimmedPw });
if (!ok) { setError(data.error || "Failed to save password."); setLoading(false); return; }
```

- [ ] **Step 4: Replace all fetch('/api/security') calls in GameUI**

Replace the `changePassword` function and any other GameUI fetch calls with `callAPI`.

- [ ] **Step 5: Replace all fetch('/api/security') calls in GroupLobby**

Replace `createGroup`, `joinGroup`, and any other GroupLobby fetch calls with `callAPI`.

- [ ] **Step 6: Replace all fetch('/api/security') calls in FixturesTab**

Replace `savePred`, `saveResult`, sync-fixtures, delete-gw, remove-gw, lock-picks, edit-pick, and all other FixturesTab fetch calls with `callAPI`.

- [ ] **Step 7: Replace all fetch('/api/security') calls in MembersTab**

Replace rename-member, toggle-admin, kick-member calls with `callAPI`.

- [ ] **Step 8: Replace all fetch('/api/security') calls in GroupTab**

Replace save-11-limit, save-name, save-api-settings, save-scope, start-new-season, backfill-gws, backfill-all-gws, sync-all-dates, dibs-skip, leave-group, delete-group, create-backup, restore-backup, delete-backup, send-reminders calls with `callAPI`.

- [ ] **Step 9: Verify no raw fetch('/api/security') calls remain**

Search the file for `fetch('/api/security'` or `fetch("/api/security"`. The only remaining instances should be in the `callAPI` function itself.

- [ ] **Step 10: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "Extract callAPI shared helper, replace 43 raw fetch calls"
```

---

### Task 5: Extract THEMES constant and useHorizontalScroll hook

**Files:**
- Modify: `src/App.jsx` (add THEMES after PALETTE, add useHorizontalScroll after useMobile, replace 2 wheel-scroll bindings)

- [ ] **Step 1: Add THEMES constant after PALETTE (line ~227)**

Insert after the `PALETTE` line:

```js
const THEMES = [
  { id: "dark", label: "Dark", group: "core", swatches: ["#080810","#1a1a26","#e8e4d9"] },
  { id: "light", label: "Light", group: "core", swatches: ["#f4f1e8","#dddad0","#1a1814"] },
  { id: "nord", label: "Nord", group: "core", swatches: ["#2e3440","#434c5e","#eceff4"] },
  { id: "clarity", label: "Clarity", group: "secret", swatches: ["#111","#666","#fff"] },
  { id: "index", label: "Index", group: "core", swatches: ["#f6f6f7","#e0e0e0","#121417"] },
  { id: "pitch", label: "Pitch", group: "fun", swatches: ["#0d1f0d","#1a3a1a","#d4ecd4"] },
  { id: "terminal", label: "Terminal", group: "fun", swatches: ["#000000","#1a3a1a","#00cc44"] },
  { id: "excel", label: "Excel", group: "fun", swatches: ["#ffffff","#107c41","#1a1a1a"] },
  { id: "velvet", label: "Velvet", group: "secret", swatches: ["#120816","#3a2344","#f7d6ea"] },
  { id: "spotify", label: "Spotify", group: "fun", swatches: ["#121212","#1ed760","#ffffff"] },
];
```

- [ ] **Step 2: Add useHorizontalScroll hook after useMobile (line ~404)**

Insert after the `useMobile` hook:

```js
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
```

- [ ] **Step 3: Replace wheel-scroll bindings in account modal and GroupLobby modal**

Find the two instances of `ref={node=>{if(node&&!node._wheelBound){node._wheelBound=true;node.addEventListener("wheel",...` (lines ~1684 and ~2513).

In each component that uses them, add at the top:
```js
const hScrollRef = useHorizontalScroll();
```

Then replace the inline ref with:
```js
ref={hScrollRef}
```

- [ ] **Step 4: Update theme pickers to use THEMES constant**

Find `getSecretThemeMeta` usages and update theme picker `.map()` calls to use `THEMES.filter(t => ...)` instead of the current inline array spread with `getSecretThemeMeta`. The filter logic should be:
- Always show `group: "core"` themes
- Show `group: "fun"` themes
- Show `group: "secret"` themes only if `isSecretThemeUnlockedForUser(user)` is true, OR if the theme is currently active (e.g., user has clarity active)

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Extract THEMES constant and useHorizontalScroll hook"
```

---

### Task 6: GW selector visual polish (status dots + active indicator + fade edges)

**Files:**
- Modify: `src/App.jsx` (lines 3179-3207 - GW strip rendering, line 406+ - CSS constant)

- [ ] **Step 1: Add computeGWStatus helper before FixturesTab**

Insert before the FixturesTab function:

```js
function computeGWStatus(gwObj, hiddenGWs = [], isAdmin = false) {
  const locked = !isAdmin && hiddenGWs.includes(gwObj.gw);
  if (locked) return "locked";
  const fixtures = (gwObj.fixtures || []).filter(f => f.status !== "POSTPONED");
  if (fixtures.length === 0) return "empty";
  const withResult = fixtures.filter(f => f.result || f.status === "FINISHED");
  if (withResult.length === fixtures.length) return "complete";
  if (withResult.length > 0) return "active";
  return "future";
}
```

- [ ] **Step 2: Compute activeGW number inside FixturesTab**

Add after the `viewGW` state declaration (line ~2892):

```js
const activeGW = useMemo(() => {
  const seas = group.season || 2025;
  const seasonGWs = (group.gameweeks || []).filter(g => (g.season || seas) === seas).sort((a, b) => a.gw - b.gw);
  const found = seasonGWs.find(gwObj =>
    (gwObj.fixtures || []).some(f => !f.result && f.status !== "FINISHED" && f.status !== "POSTPONED")
  );
  return found?.gw || null;
}, [group.gameweeks, group.season]);
```

- [ ] **Step 3: Update GW button rendering to include status dot**

Find the button rendering inside the `.map` (lines 3186-3202). Replace the button with:

```js
return (
  <button key={g.gw} onClick={()=>setGW(g.gw)} style={{
    background:currentGW===g.gw?"var(--btn-bg)":"var(--card)",
    color:currentGW===g.gw?"var(--btn-text)":"var(--text-dim2)",
    border:g.gw===activeGW&&currentGW!==g.gw?"1.5px solid var(--text-dim)":"1px solid var(--border)",
    borderRadius:isIndex?999:6,
    padding:isIndex?"7px 12px":"5px 0",
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
      const status = computeGWStatus(g, group.hiddenGWs, isAdmin);
      const dotColor = status==="complete"?"#22c55e":status==="active"?"#f59e0b":status==="locked"?"#ef4444":null;
      return dotColor ? <span style={{width:5,height:5,borderRadius:"50%",background:dotColor,flexShrink:0}}/> : <span style={{width:5,height:5}}/>;
    })()}
  </button>
);
```

- [ ] **Step 4: Add fade gradient edges to GW strip**

Find the GW strip container div (line ~3182). Wrap it with a relative-positioned container that has fade overlays:

Replace:
```js
<div ref={gwStripRef} className="gw-strip" style={{display:"flex",gap:3,maxWidth:396,overflowX:"auto",flex:1}}>
```

With:
```js
<div style={{position:"relative",flex:1,maxWidth:396}}>
  <div ref={gwStripRef} className="gw-strip" style={{display:"flex",gap:3,overflowX:"auto"}}>
```

And after the closing `</div>` of the strip (after the `.map` and before the right arrow button), add:
```js
  </div>
  <div style={{position:"absolute",left:0,top:0,bottom:0,width:20,background:"linear-gradient(to right, var(--bg), transparent)",pointerEvents:"none",zIndex:1}}/>
  <div style={{position:"absolute",right:0,top:0,bottom:0,width:20,background:"linear-gradient(to left, var(--bg), transparent)",pointerEvents:"none",zIndex:1}}/>
</div>
```

- [ ] **Step 5: Add horizontal wheel scroll to GW strip**

In FixturesTab, add at the top:
```js
const hScrollRef = useHorizontalScroll();
```

Then combine refs on the gwStripRef div. Replace `ref={gwStripRef}` with a callback ref:
```js
ref={node => { gwStripRef.current = node; if (node && !node._wheelBound) { node._wheelBound = true; node.addEventListener("wheel", e => { e.preventDefault(); node.scrollLeft += e.deltaY; }, { passive: false }); } }}
```

- [ ] **Step 6: Update scroll-on-mount effect to use activeGW**

Find the scroll effect (line 3054):

```js
useEffect(()=>{
  if (!gwStripRef.current) return;
  const seas = group.season||2025;
  const seasonGWs = (group.gameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
  const idx = seasonGWs.findIndex(g=>g.gw===viewGW);
  if (idx<0) return;
  const pos = idx*57 - gwStripRef.current.clientWidth/2 + 27;
  gwStripRef.current.scrollLeft = Math.max(0, pos);
},[]);
```

Replace with:

```js
useEffect(()=>{
  if (!gwStripRef.current) return;
  const seas = group.season||2025;
  const seasonGWs = (group.gameweeks||[]).filter(g=>(g.season||seas)===seas).sort((a,b)=>a.gw-b.gw);
  const targetGW = activeGW || viewGW;
  const idx = seasonGWs.findIndex(g=>g.gw===targetGW);
  if (idx<0) return;
  const pos = idx*57 - gwStripRef.current.clientWidth/2 + 27;
  gwStripRef.current.scrollLeft = Math.max(0, pos);
},[]);
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "Add GW status dots, active indicator, fade edges, and wheel scroll"
```

---

### Task 7: Add TabErrorBoundary and Spinner components

**Files:**
- Modify: `src/App.jsx` (add components near other UI primitives, wrap tabs in GameUI)

- [ ] **Step 1: Add TabErrorBoundary class component after the Section component (line ~394)**

```js
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
```

Note: Add `import React from "react";` if not already imported (check line 1 - it imports from "react" via destructuring, so add `React` to the import or use `import React, { useState, ... }` pattern).

- [ ] **Step 2: Add Spinner component after Btn (line ~382)**

```js
const Spinner = ({ size = 4 }) => (
  <span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
    {[0,1,2].map(i => <span key={i} style={{width:size,height:size,borderRadius:"50%",background:"currentColor",animation:`pulse 1.2s ease-in-out infinite`,animationDelay:`${0.2*i}s`}}/>)}
  </span>
);
```

- [ ] **Step 3: Wrap tab rendering in GameUI with TabErrorBoundary**

Find the tab rendering section in GameUI (around lines 2559-2579). Each tab render should be wrapped. Example:

Before:
```js
{tab==="League"&&<LeagueTab .../>}
{tab==="Fixtures"&&<FixturesTab .../>}
```

After:
```js
<TabErrorBoundary key={tab} tabName={tab}>
  {tab==="League"&&<LeagueTab .../>}
  {tab==="Fixtures"&&<FixturesTab .../>}
  {tab==="Trends"&&<TrendsTab .../>}
  {tab==="Members"&&<MembersTab .../>}
  {tab==="Group"&&<GroupTab .../>}
</TabErrorBoundary>
```

The `key={tab}` ensures the boundary resets when switching tabs.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Add TabErrorBoundary and Spinner components"
```

---

### Task 8: Replace loading text with Spinner component

**Files:**
- Modify: `src/App.jsx` (search for `"..."` used as loading indicators throughout)

- [ ] **Step 1: Find and replace loading "..." patterns**

Search the file for button text that shows `"..."` when loading. These follow the pattern:
```js
{loading?"...":"BUTTON TEXT"}
```

Replace each with:
```js
{loading?<Spinner/>:"BUTTON TEXT"}
```

Key locations to update:
- AuthScreen sign in/register button (line ~957)
- AuthScreen forgot password button (line ~934)
- AccountSetupModal save button (line ~1161)
- GroupLobby create/join buttons
- GroupTab various save buttons
- FixturesTab sync button
- Account modal password save button

Do NOT replace `"..."` strings that are used as actual content (not loading indicators).

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Replace loading text with Spinner component"
```

---

### Task 9: Group tab accordion redesign

**Files:**
- Modify: `src/App.jsx` (lines 4354-4948 - entire GroupTab component)

- [ ] **Step 1: Add Accordion helper component before GroupTab**

Insert before the GroupTab function:

```js
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
                <span style={{fontSize:11,color:"var(--text-dim2)",transition:"transform 0.2s",transform:isOpen?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
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
```

- [ ] **Step 2: Add accordion state to GroupTab**

At the top of GroupTab (after existing state declarations), add:

```js
const [openSection, setOpenSection] = useState("info");
```

- [ ] **Step 3: Restructure GroupTab return to use Accordion**

Replace the current GroupTab return statement (the long JSX with multiple `<Section>` blocks) with an accordion-based layout. The sections array should be:

```js
const sections = [
  {
    id: "info",
    title: "Group Info",
    summary: group.name,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Invite code + copy button */}
        {/* Share link + copy button */}
        {/* Group name editing (admin only) */}
        {/* Info: members count, season, version */}
      </div>
    ),
  },
  {
    id: "rules",
    title: "Rules",
    summary: `Draw: ${group.draw11Limit||"unlimited"} · Scope: ${group.scoreScope||"all"}`,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Prediction limits (1-1 draw rule) */}
        {/* Score scope toggle */}
        {/* Scoring rules explanation */}
      </div>
    ),
  },
  {
    id: "gameweeks",
    title: "Gameweeks",
    admin: true,
    hidden: !isAdmin,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* GW visibility toggles */}
        {/* Create future GWs / Create all GWs buttons */}
        {/* Sync all dates button */}
        {/* Fixture sync info */}
      </div>
    ),
  },
  {
    id: "seasons",
    title: "Seasons",
    admin: true,
    hidden: !isAdmin || (group.competition||"PL")!=="PL",
    summary: `Season ${activeSeason}`,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Active season display */}
        {/* Start new season input + button */}
        {/* Season history list */}
      </div>
    ),
  },
  {
    id: "backups",
    title: "Backups",
    admin: true,
    hidden: !isAdmin,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Create backup button */}
        {/* Backup list with restore/delete */}
      </div>
    ),
  },
  ...(isAdmin ? [{
    id: "reminders",
    title: "Reminders",
    admin: true,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Send reminder button */}
        {/* Reminder message */}
      </div>
    ),
  }] : []),
  {
    id: "danger",
    title: "Danger Zone",
    danger: true,
    content: (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Leave group button (non-creator) */}
        {/* Delete group button (creator only) */}
      </div>
    ),
  },
];
```

Move the existing JSX content from each `<Section>` block into the corresponding `content` property. The underlying logic (save functions, state) stays unchanged.

The return becomes:
```js
return (
  <div className="fade" style={{padding:mob?16:0}}>
    {/* Season awards banner if applicable */}
    {seasonComplete && seasonWinner && (
      <div style={{...awardsBannerStyles}}>...</div>
    )}
    <Accordion sections={sections} openId={openSection} setOpenId={setOpenSection} />
    {/* Delete group modal (createPortal) stays outside accordion */}
    {deleteModalOpen && createPortal(..., document.body)}
    {/* Skip modal stays outside accordion */}
    {skipModal && createPortal(..., document.body)}
  </div>
);
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Manual verification checklist**

Run `npm run dev` and verify:
- Non-admin user sees: Group Info (expanded), Rules, Danger Zone
- Admin user sees all sections
- Clicking a section header opens it and closes the previous
- All save buttons still work (name, limits, scope, etc.)
- Invite code copy works
- Delete group flow works
- Leave group flow works

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Redesign Group tab with accordion sections"
```

---

### Task 10: Account modal polish

**Files:**
- Modify: `src/App.jsx` (lines ~2498-2545 - account modal in GameUI)

- [ ] **Step 1: Restructure account modal with clear sections**

Find the account modal render in GameUI. Reorganize the content into three distinct sections with dividers:

**Section 1: Profile** (username, email - read only)
```js
<div style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,marginBottom:12,fontWeight:600}}>PROFILE</div>
<div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:24}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"10px 0",borderBottom:"1px solid var(--border3)"}}>
    <span style={{color:"var(--text-dim)"}}>Username</span>
    <span style={{color:"var(--text-bright)",fontWeight:500}}>{user.username}</span>
  </div>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"10px 0",borderBottom:"1px solid var(--border3)"}}>
    <span style={{color:"var(--text-dim)"}}>Email</span>
    <span style={{color:"var(--text-bright)",fontWeight:500}}>{user.email||"--"}</span>
  </div>
</div>
```

**Section 2: Appearance** (theme picker, collapsed by default)
```js
<div style={{marginBottom:24}}>
  <button onClick={()=>setThemePickerOpen(p=>!p)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
    <span style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,fontWeight:600}}>APPEARANCE</span>
    <span style={{fontSize:11,color:"var(--text-dim2)",transition:"transform 0.2s",transform:themePickerOpen?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
  </button>
  {themePickerOpen && (
    <div style={{marginTop:12}}>
      {/* existing theme picker content */}
    </div>
  )}
</div>
```

Add `const [themePickerOpen, setThemePickerOpen] = useState(false);` to the GameUI state.

**Section 3: Security** (change password)
```js
<div style={{borderTop:"1px solid var(--border3)",paddingTop:18}}>
  <div style={{fontSize:11,color:"var(--text-dim2)",letterSpacing:2,marginBottom:14,fontWeight:600}}>SECURITY</div>
  {/* existing password fields */}
</div>
```

- [ ] **Step 2: Add max-height and scroll to modal for mobile**

Update the modal inner div style to include:
```js
maxHeight:"85vh",overflowY:"auto"
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Polish account modal with sectioned layout"
```

---

### Task 11: Mobile polish pass

**Files:**
- Modify: `src/App.jsx` (bottom nav, modals, fixture cards)

- [ ] **Step 1: Enforce 48px minimum tap targets on bottom nav**

Find the bottom nav buttons (line ~2546). Update the `.bot-nav .nb` height in the CSS constant from `54px` to ensure the full button area is at least 48px tall. The current value of `54px` is fine for the overall bar, but verify each button's clickable area.

In the CSS constant (line ~440), find:
```css
.bot-nav .nb{height:54px;border:none!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;padding:5px 2px 0!important;transition:color 0.15s!important;}
```

Update to include min-height and better padding:
```css
.bot-nav .nb{height:54px;min-height:48px;border:none!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;padding:4px 2px!important;transition:color 0.15s!important;}
```

- [ ] **Step 2: Add overflow safety to all modals**

Search for all `createPortal` usages. For each modal's inner content div, ensure it has:
```js
maxHeight:"85vh",overflowY:"auto"
```

Key modals to update:
- Account modal (already done in Task 10)
- WhatsNewModal inner div
- Prediction wizard overlay
- Delete group confirmation
- Sync fixtures confirmation
- Skip confirmation modal
- AllPicksTable edit-pick modal

- [ ] **Step 3: Ensure GW strip buttons have 44px minimum width on mobile**

In the GW button style (modified in Task 6), the `minWidth` is currently `54` for non-index themes. This is fine. Verify it renders well on a 375px viewport.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Mobile polish: tap targets, modal scroll, spacing"
```

---

### Task 12: Final cleanup and build verification

**Files:**
- Modify: `src/App.jsx` (dead code removal)

- [ ] **Step 1: Remove any unused state variables**

Search for state variables that are declared but never read. Common candidates:
- `apiSaved` in GroupTab (check if still used after accordion refactor)
- Any variables from the old flat layout that are no longer referenced

- [ ] **Step 2: Remove the old getSecretThemeMeta function if fully replaced by THEMES**

If Task 5 fully replaced `getSecretThemeMeta` with THEMES-based filtering, remove the old function.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Fix any lint errors.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors or warnings.

- [ ] **Step 5: Final commit**

```bash
git add src/App.jsx
git commit -m "Final cleanup: remove dead code, fix lint"
```
