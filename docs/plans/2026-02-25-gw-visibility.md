# GW Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admins can toggle individual gameweeks locked/visible; non-admins see locked GWs dimmed and read-only.

**Architecture:** Store `hiddenGWs: number[]` on the group doc. Derive `gwAdminLocked` in `FixturesTab` to gate prediction inputs and the wizard. Render toggle buttons in `GroupTab`. GW strip dims locked GWs for non-admins.

**Tech Stack:** React, Firebase Firestore, all in `src/App.jsx`. No test framework.

---

### Task 1: Add `hiddenGWs` to new group creation

**Files:**
- Modify: `src/App.jsx:320`

**Step 1: Add the field**

Find the `createGroup` function (~line 315). The line that builds the `group` object currently ends with `season:2025}`. Add `hiddenGWs:[]` to it:

```js
const group = {
  id, name:createName.trim(), code, creatorUsername:user.username,
  members:[user.username], admins:[user.username],
  gameweeks:makeAllGWs(2025), currentGW:1, apiKey:"", season:2025, hiddenGWs:[]
};
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "Add hiddenGWs field to new group creation"
```

---

### Task 2: Derive `gwAdminLocked` in FixturesTab

**Files:**
- Modify: `src/App.jsx` (~line 598, inside `FixturesTab`)

**Step 1: Add derived value**

After the `const hasApiKey = true;` line (~line 598), add:

```js
const gwAdminLocked = !isAdmin && (group.hiddenGWs||[]).includes(currentGW);
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "Derive gwAdminLocked in FixturesTab"
```

---

### Task 3: Skip wizard for admin-locked GWs

**Files:**
- Modify: `src/App.jsx` (~line 715, wizard `useEffect`)

**Step 1: Add early return**

Inside the wizard `useEffect`, directly after the `if (lget(wizardKey)===currentGW) return;` line, add:

```js
if (!isAdmin && (group.hiddenGWs||[]).includes(currentGW)) { setWizardQueue(null); return; }
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "Skip prediction wizard for admin-locked GWs"
```

---

### Task 4: Show locked banner and enforce read-only in FixturesTab

**Files:**
- Modify: `src/App.jsx` (~line 840 for banner, ~line 854 for fixture lock)

**Step 1: Add the locked banner**

After the `<NextMatchCountdown group={group} />` line (~line 840), add:

```jsx
{gwAdminLocked && (
  <div style={{background:"#ef444410",border:"1px solid #ef444430",borderRadius:8,padding:"10px 16px",marginBottom:18,fontSize:11,color:"#ef4444",letterSpacing:1}}>
    🔒 THIS GAMEWEEK IS LOCKED BY YOUR ADMIN
  </div>
)}
```

**Step 2: Lock fixture inputs**

In the fixture map (~line 854), the `locked` const currently reads:

```js
const locked = !!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=new Date()));
```

Prepend `gwAdminLocked ||`:

```js
const locked = gwAdminLocked || !!(f.result||f.status==="FINISHED"||f.status==="IN_PLAY"||f.status==="PAUSED"||(f.date&&new Date(f.date)<=new Date()));
```

**Step 3: Verify manually**

- Admin toggles a GW hidden in Group tab (Task 5 not yet built — skip for now)
- Or temporarily hardcode `const gwAdminLocked = true;` to test banner + read-only inputs appear correctly
- Then revert the hardcode

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Show locked banner and read-only fixtures for admin-locked GWs"
```

---

### Task 5: Dim locked GWs in the GW strip for non-admins

**Files:**
- Modify: `src/App.jsx` (~line 813-814, GW strip render)

**Step 1: Update the GW strip buttons**

The current GW strip map (~line 813) renders one `<button>` per GW. Replace the entire `.map(g=>(...))` callback with a version that dims locked GWs for non-admins:

```jsx
.map(g=>{
  const adminHidden = !isAdmin && (group.hiddenGWs||[]).includes(g.gw);
  return (
    <button key={g.gw} onClick={()=>setGW(g.gw)} style={{
      background: currentGW===g.gw ? "var(--btn-bg)" : "var(--card)",
      color: currentGW===g.gw ? "var(--btn-text)" : "var(--text-dim2)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 0",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: 1,
      flexShrink: 0,
      minWidth: 54,
      textAlign: "center",
      opacity: adminHidden ? 0.4 : 1,
    }}>
      {adminHidden ? "🔒" : ""}GW{g.gw}
    </button>
  );
})
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "Dim admin-locked GWs in GW strip for non-admins"
```

---

### Task 6: Add Gameweek Visibility section in GroupTab

**Files:**
- Modify: `src/App.jsx` (~line 1259, after Seasons section, before Prediction Limits)

**Step 1: Add the section**

Find the line `{isAdmin&&(` that opens the "Prediction Limits" section (~line 1259). Insert a new admin-only section directly before it:

```jsx
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
```

Note: `updateGroup` is available as a prop in `GroupTab` — check the component signature to confirm it's passed in. If not, pass it through from `GameUI`.

**Step 2: Verify `updateGroup` is in GroupTab props**

Search for `function GroupTab(` to confirm its prop list. If `updateGroup` is missing, add it to the destructured props and to the call site in `GameUI` (~line 504).

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Add Gameweek Visibility toggle section for admins in Group tab"
```

---

### Task 7: End-to-end smoke test

Open the app and verify:

1. **Admin in Group tab** — Gameweek Visibility section shows all active-season GWs as lit buttons. Click one — it dims. Click again — it re-lights.
2. **Non-admin in Fixtures tab** — Locked GW buttons in the strip show at 40% opacity with a 🔒 prefix. Clicking one navigates to it.
3. **Non-admin on a locked GW** — Red banner appears. All prediction inputs are replaced with read-only dashes/text. Wizard does not appear.
4. **Admin on a locked GW** — No banner, full edit access, no visual change in strip.
5. **New group created** — `hiddenGWs` field exists as `[]` in Firestore.
