# Open vs Dibs Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a season mode setting to groups — Open (free-pick, current behaviour) or Dibs (sequential turn-based, no duplicate scorelines per fixture) — chosen at group creation and locked for the season.

**Architecture:** Store `mode` and `memberOrder` on the group document; store admin skips in `group.dibsSkips[fixtureId]`. Turn order is always computed client-side from fixture season index + existing picks + skips — never stored as a separate pointer. UI shows AllPicksTable always in Dibs mode with pulsing "awaiting" indicators per player per fixture.

**Tech Stack:** React 18, inline JSX styles, Firebase/Firestore via `sget`/`sset`/`spatch`/`updateGroup`/`patchGroup` helpers in `src/App.jsx`.

---

## Key file

**Everything lives in `src/App.jsx`** (~2000+ lines). There are no other component files. Reference line numbers in the plan but always read surrounding context before editing — line numbers shift as you add code.

Grep landmarks to orient yourself:
- `function GroupLobby(` — group creation/join UI
- `const createGroup = async` — creates the group object and saves to Firestore
- `function FixturesTab(` — per-fixture pick UI
- `const savePred = async` (inside FixturesTab) — saves a prediction
- `function AllPicksTable(` — full group picks table
- `function GroupTab(` — group settings UI
- `const CSS =` — all styles as a template literal

---

## Task 1: Add pure helper functions `getFixtureSeasonIndex` and `computeDibsTurn`

**Files:**
- Modify: `src/App.jsx` — add two functions after `calcPts` (near line 223)

**Step 1: Add both helpers immediately after `calcPts`**

Find the line `function calcPts(pred, result) {` and add the following two functions directly after the closing `}` of `calcPts`:

```js
function getFixtureSeasonIndex(group, fixtureId) {
  const season = group.season || 2025;
  const gws = (group.gameweeks || [])
    .filter(gw => (gw.season || season) === season)
    .sort((a, b) => a.gw - b.gw);
  let idx = 0;
  for (const gw of gws) {
    for (const f of (gw.fixtures || [])) {
      if (f.id === fixtureId) return idx;
      idx++;
    }
  }
  return 0;
}

function computeDibsTurn(group, fixtureId) {
  const memberOrder = group.memberOrder || group.members || [];
  const n = memberOrder.length;
  if (n === 0) return null;
  const seasonIdx = getFixtureSeasonIndex(group, fixtureId);
  const skips = (group.dibsSkips || {})[fixtureId] || [];
  const preds = group.predictions || {};
  const rotStart = seasonIdx % n;
  const queue = [];
  for (let i = 0; i < n; i++) {
    const member = memberOrder[(rotStart + i) % n];
    if (!skips.includes(member)) queue.push(member);
  }
  for (const member of queue) {
    if (preds[member]?.[fixtureId] === undefined) return member;
  }
  return null; // everyone has picked
}
```

**Step 2: Verify**

Open the browser console and paste:
```js
// rough smoke-test (no real group needed, just shape check)
console.log(typeof computeDibsTurn); // should not throw ReferenceError after hot-reload
```

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add getFixtureSeasonIndex and computeDibsTurn helpers"
```

---

## Task 2: Add mode to group state + add mode picker step to setup UI

**Files:**
- Modify: `src/App.jsx` — inside `GroupLobby`

**Step 1: Add `setupPickMode` state**

Find these lines inside `GroupLobby`:
```js
const [setupGWLoading,setSetupGWLoading]=useState(false);
```

Add one line directly after:
```js
const [setupPickMode,setSetupPickMode]=useState("open");
```

**Step 2: Add mode picker UI in the setup step**

Find the `setupMode` JSX block. It contains a `1-1 LIMIT PER WEEK` section. Add the mode picker section directly before the `1-1 LIMIT PER WEEK` section:

```jsx
<div>
  <div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:2,marginBottom:8}}>SEASON MODE</div>
  <div style={{display:"flex",flexDirection:"column",gap:6}}>
    {[
      ["open","Open","Everyone picks freely each gameweek."],
      ["dibs","Dibs","Take turns claiming scorelines — no duplicates per match."],
    ].map(([val,label,desc])=>(
      <button key={val} onClick={()=>setSetupPickMode(val)}
        style={{background:setupPickMode===val?"var(--btn-bg)":"var(--card)",color:setupPickMode===val?"var(--btn-text)":"var(--text-dim2)",border:`1px solid ${setupPickMode===val?"var(--btn-bg)":"var(--border)"}`,borderRadius:6,padding:"8px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,textAlign:"left",transition:"all 0.15s"}}>
        <span style={{fontWeight:700,letterSpacing:2}}>{label.toUpperCase()}</span>
        <span style={{display:"block",fontSize:10,opacity:0.7,marginTop:2,letterSpacing:0}}>{desc}</span>
      </button>
    ))}
  </div>
</div>
```

**Step 3: Pass mode and memberOrder into `createGroup`**

Find `const createGroup = async () => {` and find the line that builds `newGroup`. It looks like:

```js
let newGroup = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],...};
```

Add `mode:setupPickMode,memberOrder:[user.username],dibsSkips:{}` to the object:

```js
let newGroup = {id,name:createName.trim(),code,creatorUsername:user.username,members:[user.username],admins:[user.username],gameweeks:startingGWs,currentGW:startGW,apiKey:"",season:2025,hiddenGWs:[],scoreScope:"all",draw11Limit:setupLimit,mode:setupPickMode,memberOrder:[user.username],dibsSkips:{},adminLog:[]};
```

**Step 4: Reset setupPickMode on cancel**

Find the `← Back` button that calls `setSetupMode(false)` and add `setSetupPickMode("open")` to it:
```jsx
<Btn variant="ghost" small onClick={()=>{setSetupMode(false);setSetupPickMode("open");}}>← Back</Btn>
```

Also reset in the `onEnterGroup` call at the bottom of `createGroup` (the `setSetupMode(false)` line):
```js
onUpdateUser(updated);setCreateName("");setSetupMode(false);setSetupGW("1");setSetupLimit("unlimited");setSetupPickMode("open");setCreating(false);
```

**Step 5: Verify in browser**

1. Create a new group — confirm the mode picker appears between group name and GW setup
2. Select Dibs, create group
3. In browser console: `JSON.parse(localStorage.getItem("session"))` — get the group ID, then check the group has `mode: "dibs"` and `memberOrder: ["yourusername"]` via the network tab or a quick `sget("group:<id>")` call

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Open/Dibs mode picker to group creation"
```

---

## Task 3: Append to memberOrder when a player joins

**Files:**
- Modify: `src/App.jsx` — inside `joinGroup`

**Step 1: Find `joinGroup`**

Find `const joinGroup = async () => {`. Find the line that builds `updated`:
```js
const updated = {...group,members:[...group.members,user.username]};
```

Change it to also append to `memberOrder`:
```js
const currentOrder = group.memberOrder || group.members || [];
const updated = {
  ...group,
  members:[...group.members,user.username],
  memberOrder: currentOrder.includes(user.username) ? currentOrder : [...currentOrder, user.username],
};
```

**Step 2: Verify**

Log in as a second user and join a Dibs group. Check in Firestore (via sget in console) that `memberOrder` now has both usernames.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: append to memberOrder when joining a Dibs group"
```

---

## Task 4: Block picks in Dibs mode in `savePred` (FixturesTab)

**Files:**
- Modify: `src/App.jsx` — `savePred` inside `FixturesTab`

**Step 1: Add turn and duplicate checks at the top of `savePred`**

Find `const savePred = async (fixtureId, val) => {` inside `FixturesTab`. After the `if (locked) return;` line, add:

```js
// Dibs mode checks
if (group.mode === "dibs") {
  const turn = computeDibsTurn(group, fixtureId);
  if (turn !== user.username) return; // not your turn
  // block duplicate scoreline
  const taken = Object.entries(group.predictions || {})
    .filter(([u]) => u !== user.username)
    .some(([, picks]) => picks?.[fixtureId] === val);
  if (taken) {
    alert(`"${val}" has already been claimed for this match. Pick a different scoreline.`);
    setPredDraft(d => ({...d, [fixtureId]: myPreds[fixtureId] || ""}));
    return;
  }
}
```

**Step 2: Verify**

With two browser sessions (two users), in a Dibs group:
- Confirm user B cannot type and save a pick when it's user A's turn
- Confirm user A can pick, then user B can pick, then A cannot pick the same scoreline B just picked

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: block out-of-turn picks and duplicate scorelines in Dibs mode"
```

---

## Task 5: Show "waiting for X" in fixture rows when it's not your turn (Dibs mode)

**Files:**
- Modify: `src/App.jsx` — fixture row rendering inside `FixturesTab`

**Step 1: Compute `dibsTurnFor` map above the fixture rows**

Find the line `{gwFixtures.length===0?...gwFixtures.map(f=>{` and add this line directly before it:

```js
const dibsTurnFor = group.mode==="dibs"
  ? Object.fromEntries(gwFixtures.map(f=>[f.id, computeDibsTurn(group,f.id)]))
  : {};
```

**Step 2: Modify the `pickBlock` logic to show waiting state**

Find the `const pickBlock = locked?(...):(...)` block inside the `.map(f=>{`. Replace the unlocked branch so that in Dibs mode and not-your-turn, a waiting label shows instead of the input:

```js
const isMyDibsTurn = group.mode !== "dibs" || dibsTurnFor[f.id] === user.username;
const waitingFor = group.mode === "dibs" && !locked && !isMyDibsTurn ? dibsTurnFor[f.id] : null;

const pickBlock = locked ? (
  <span style={{color:myPreds[f.id]?"#8888cc":"var(--text-dim)",fontSize:12}}>{myPreds[f.id]||"–"}</span>
) : waitingFor ? (
  <span style={{color:"var(--text-dim2)",fontSize:11,fontStyle:"italic"}}>
    waiting for {names[waitingFor]||waitingFor}
  </span>
) : (
  <>
    <input value={myPred} placeholder="1-1"
      onChange={e=>setPredDraft(d=>({...d,[f.id]:e.target.value}))}
      onBlur={e=>savePred(f.id,e.target.value)}
      onKeyDown={e=>e.key==="Enter"&&savePred(f.id,e.target.value)}
      style={{width:mob?58:66,background:"var(--input-bg)",borderRadius:6,textAlign:"center",border:`1px solid ${myPreds[f.id]?"#8888cc55":"var(--border2)"}`,color:"#8888cc",padding:"5px 6px",fontFamily:"inherit",fontSize:mob?16:12,outline:"none"}}/>
    {saving[f.id]&&<span style={{fontSize:10,color:"var(--text-dim3)",marginLeft:4}}>…</span>}
  </>
);
```

**Step 3: Verify**

In a Dibs group with two users, user B should see "waiting for [A]" for each fixture on user A's turn.

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: show 'waiting for X' in Dibs mode fixture rows"
```

---

## Task 6: Always show AllPicksTable in Dibs mode + add awaiting indicators

**Files:**
- Modify: `src/App.jsx` — bottom of `FixturesTab` render + `AllPicksTable`

**Step 1: Make AllPicksTable always visible in Dibs mode**

Find this line (around line 1561):
```jsx
{(picksLocked||allFixturesFinished)&&(group.members||[]).length>1&&canViewAllPicks&&<AllPicksTable group={group} gwFixtures={gwFixtures} isAdmin={isAdmin} updateGroup={updateGroup} adminUser={user} names={names} viewedGW={currentGW} theme={theme}/>}
```

Replace with:
```jsx
{(group.mode==="dibs"
  ? (group.members||[]).length>1
  : (picksLocked||allFixturesFinished)&&(group.members||[]).length>1&&canViewAllPicks
)&&<AllPicksTable group={group} gwFixtures={gwFixtures} isAdmin={isAdmin} updateGroup={updateGroup} adminUser={user} names={names} viewedGW={currentGW} theme={theme}/>}
```

**Step 2: Hide the "Submit your picks to unlock all picks" locked notice in Dibs mode**

Find the block starting:
```jsx
{gwFixtures.some(f=>f.result)&&(group.members||[]).length>1&&!canViewAllPicks&&(
```

Add `&&group.mode!=="dibs"` to the condition:
```jsx
{gwFixtures.some(f=>f.result)&&group.mode!=="dibs"&&(group.members||[]).length>1&&!canViewAllPicks&&(
```

**Step 3: Add `dibsTurnFor` prop to AllPicksTable**

In the `<AllPicksTable .../>` JSX, pass a new prop:
```jsx
dibsTurnFor={group.mode==="dibs" ? Object.fromEntries(gwFixtures.map(f=>[f.id,computeDibsTurn(group,f.id)])) : {}}
```

**Step 4: Accept `dibsTurnFor` in `AllPicksTable` signature**

Find:
```js
function AllPicksTable({group,gwFixtures,isAdmin,updateGroup,adminUser,names,viewedGW,theme}) {
```

Change to:
```js
function AllPicksTable({group,gwFixtures,isAdmin,updateGroup,adminUser,names,viewedGW,theme,dibsTurnFor={}}) {
```

**Step 5: Add pulsing name styles in table header**

In the `AllPicksTable` header row, find where member names are rendered:
```jsx
{members.map((u,ui)=>{
  const isWinner=...
  ...
  return <th key={u} ...>{...}{names[u]||u}</th>;
})}
```

Add an `isAwaiting` check — a player is awaiting if it's their turn on at least one open fixture:
```jsx
const isAwaiting = Object.values(dibsTurnFor).some(turn => turn === u);
```

Wrap the member name with a pulsing span when awaiting:
```jsx
{isAwaiting
  ? <span style={{animation:"pulse 1.2s ease-in-out infinite"}}>{names[u]||u}</span>
  : <>{isWinner&&!excelBg&&<span style={{marginRight:5,fontSize:14,textShadow:"0 0 8px #fbbf24cc"}}>★</span>}{names[u]||u}</>
}
```

**Step 6: Add awaiting cell indicator in AllPicksTable body**

In the body cells, find where each `pred` cell is rendered (the non-excel branch returning a `<td>`):
```jsx
return (
  <td key={u} style={{padding:"10px 12px",textAlign:"center"}}>
    ...
  </td>
);
```

Compute `isCellAwaiting`:
```jsx
const isCellAwaiting = dibsTurnFor[f.id] === u && !preds[u]?.[f.id];
```

Add a pulsing border to the awaiting cell:
```jsx
<td key={u} style={{
  padding:"10px 12px",
  textAlign:"center",
  outline: isCellAwaiting ? "1px solid #8888cc55" : "none",
  background: isCellAwaiting ? "#8888cc08" : "transparent",
  animation: isCellAwaiting ? "pulse 1.5s ease-in-out infinite" : "none",
}}>
```

**Step 7: Verify**

- In Dibs mode, AllPicksTable should always be visible (not gated behind canViewAllPicks)
- Players with open turns should have their name pulsing
- Their awaiting cells should subtly pulse
- In Open mode, nothing should have changed

**Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: always show AllPicksTable in Dibs mode with awaiting indicators"
```

---

## Task 7: Skip controls in GroupTab (admin only, Dibs mode)

**Files:**
- Modify: `src/App.jsx` — `GroupTab`

**Step 1: Add skip modal state**

Find the state declarations at the top of `GroupTab`:
```js
const [deleteModalOpen, setDeleteModalOpen] = useState(false);
```

Add skip modal state directly before it:
```js
const [skipModal, setSkipModal] = useState(null); // {playerId, fixtureId, home, away}
const [skipConfirm, setSkipConfirm] = useState(false);
```

**Step 2: Add skip handler**

Find `const leaveGroup=async()=>{` and add the skip handler before it:

```js
const issueSkip = async (playerId, fixtureId) => {
  const current = (group.dibsSkips || {})[fixtureId] || [];
  if (current.includes(playerId)) return;
  await updateGroup(g => ({
    ...g,
    dibsSkips: {
      ...(g.dibsSkips || {}),
      [fixtureId]: [...((g.dibsSkips || {})[fixtureId] || []), playerId],
    },
  }));
  setSkipModal(null);
  setSkipConfirm(false);
};
```

**Step 3: Add the Dibs section to GroupTab JSX**

In the GroupTab render, find the first `<Section title="...">` block. Add a new section before all existing sections that only renders for Dibs mode admins:

```jsx
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
    <Section title="Dibs — Pick Order">
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
              const waiting = memberOrder.filter(u=>!skips.includes(u)&&!(group.predictions||{})[u]?.[f.id]);
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
```

**Step 4: Add skip confirmation modal**

Find the delete-group modal at the bottom of the GroupTab render (look for `deleteModalOpen&&createPortal`). Add the skip confirmation modal directly before it:

```jsx
{skipModal&&createPortal(
  <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:28,maxWidth:400,width:"100%"}}>
      {!skipConfirm ? (
        <>
          <div style={{fontSize:15,color:"var(--text-bright)",marginBottom:10,fontWeight:700}}>
            Skip {names[skipModal.playerId]||skipModal.playerId} for {skipModal.home} vs {skipModal.away}?
          </div>
          <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:20,lineHeight:1.6}}>
            This will move {names[skipModal.playerId]||skipModal.playerId}'s turn to the end of the queue for this fixture and unblock the next player. This cannot be undone.
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
```

**Step 5: Pass `names` to GroupTab if not already passed**

Find where `GroupTab` is rendered in `GameUI`. It should already receive `names` — if not, add it:

```jsx
<GroupTab group={group} user={user} isAdmin={isAdmin} isCreator={isCreator} updateGroup={updateGroup} onLeave={handleLeave} theme={theme} setTheme={setTheme} names={names} />
```

If `GroupTab` doesn't accept `names` in its signature, add it:
```js
function GroupTab({group,user,isAdmin,isCreator,updateGroup,onLeave,theme,setTheme,names={}}) {
```

**Step 6: Verify**

- In a Dibs group as admin, open Group tab — should see "DIBS — PICK ORDER" section with member list and skip buttons for open fixtures
- Click Skip — first confirmation appears
- Click Continue — second confirmation appears
- Click Yes, Skip — skip is saved and the queue advances
- Skip controls do NOT appear in Group tab for Open mode groups

**Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Dibs skip controls with double confirmation in Group settings"
```

---

## Task 8: Show mode badge on group list in GroupLobby

**Files:**
- Modify: `src/App.jsx` — group list in `GroupLobby`

**Step 1: Add mode badge in group list item**

Find this line in the group list:
```jsx
<div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{g.members.length} MEMBER{g.members.length!==1?"S":""} · GW{g.currentGW} · {"⚡ API"}</div>
```

Add mode display:
```jsx
<div style={{fontSize:11,color:"var(--text-dim)",letterSpacing:1}}>{g.members.length} MEMBER{g.members.length!==1?"S":""} · GW{g.currentGW} · {"⚡ API"} · {(g.mode||"open").toUpperCase()}</div>
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: show mode (OPEN/DIBS) in group list"
```

---

## Final verification checklist

- [ ] Creating group shows mode picker, defaults to Open
- [ ] Open mode groups behave exactly as before
- [ ] In Dibs group: only player whose turn it is can pick for each fixture
- [ ] In Dibs group: picking a scoreline already claimed by another player is blocked with alert
- [ ] In Dibs group: "waiting for X" shows in fixture rows when not your turn
- [ ] In Dibs group: AllPicksTable always visible (not gated)
- [ ] In Dibs group: awaiting players' names pulse in AllPicksTable header
- [ ] In Dibs group: awaiting cells have subtle pulsing border
- [ ] In Dibs group as admin: Group tab shows pick order + skip buttons
- [ ] Skip requires two confirmations and explains consequences
- [ ] Skip buttons only in Group tab, never on the picks table
- [ ] Joining a Dibs group appends the new member to memberOrder
- [ ] Mode badge shows in group list
