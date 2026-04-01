# Account Setup Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block users with no email or default password from accessing the app until they secure their account, and add email management to the account modal.

**Architecture:** A new `AccountSetupModal` component is rendered as a portal overlay in `App` when `user && needsSetup`. `needsSetup` is a `useState` boolean set once on login/boot and cleared only via `onDone`. A parallel upgrade adds an EMAIL section to the existing `accountOpen` modal inside `GroupLobby`.

**Tech Stack:** React 19, Firebase Firestore (via `sget`/`sset`/`spatch`/`sdel` helpers), Vite. No test framework — verify manually in the browser with `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-04-01-account-setup-modal-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/App.jsx` | All changes — new `AccountSetupModal` component + trigger logic in `App` + email section in `GroupLobby`'s account modal |

Everything lives in `src/App.jsx`. Follow the existing code style: inline styles, no className, DM Mono font, CSS vars, existing `<Btn>` and `<Input>` components.

---

## Task 1: Add `AccountSetupModal` component

**File:** `src/App.jsx` — insert new component just before `function GroupLobby` (around line 789)

- [ ] **Step 1: Add the component**

Insert the following immediately before `/* ── GROUP LOBBY */`:

```jsx
/* ── ACCOUNT SETUP MODAL ─────────────────────────────── */
function AccountSetupModal({ user, onDone }) {
  const needsEmail = !user.email;
  const needsPassword = user.password === "password123";

  const [emailVal, setEmailVal] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const pendingUser = useRef(null);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => onDone(pendingUser.current), 1500);
    return () => clearTimeout(t);
  }, [success, onDone]);

  const handle = async () => {
    setError("");
    // Client-side validation
    if (needsEmail) {
      if (!emailVal.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
    }
    if (needsPassword) {
      if (pwNew.trim().length < 6) { setError("Password must be at least 6 characters."); return; }
      if (pwNew !== pwConfirm) { setError("Passwords do not match."); return; }
    }
    setLoading(true);
    try {
      const normEmail = emailVal.trim().toLowerCase();
      // Email uniqueness check
      if (needsEmail) {
        const existing = await sget(`useremail:${normEmail}`);
        if (existing && existing.username !== user.username) {
          setError("Email already in use.");
          setLoading(false);
          return;
        }
      }
      // Firebase writes
      if (needsEmail) {
        await sset(`useremail:${normEmail}`, { username: user.username });
        await spatch(`user:${user.username}`, "email", normEmail);
      }
      if (needsPassword) {
        await spatch(`user:${user.username}`, "password", pwNew);
      }
      // Stage updated user and trigger success flash
      pendingUser.current = {
        ...user,
        ...(needsEmail && { email: normEmail }),
        ...(needsPassword && { password: pwNew }),
      };
      setSuccess(true);
    } catch {
      setError("Something went wrong, please try again.");
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.53)",
      zIndex: 2000, display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 14, padding: 32, width: "100%", maxWidth: 400,
        fontFamily: "'DM Mono',monospace",
      }}>
        <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, marginBottom: 8 }}>
          COMPLETE YOUR ACCOUNT
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 24 }}>
          Before you continue, please secure your account.
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "24px 0", fontSize: 14, color: "#22c55e" }}>
            All set!
          </div>
        ) : (
          <>
            {needsEmail && (
              <div style={{ marginBottom: needsPassword ? 16 : 0 }}>
                <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, marginBottom: 6 }}>
                  ADD YOUR EMAIL
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>
                  Add an email address so you can reset your password if you ever get locked out.
                </div>
                <Input value={emailVal} onChange={setEmailVal} placeholder="Email address" type="email" />
              </div>
            )}

            {needsEmail && needsPassword && (
              <div style={{ borderTop: "1px solid var(--border3)", margin: "16px 0" }} />
            )}

            {needsPassword && (
              <div>
                <div style={{ fontSize: 10, color: "var(--text-dim2)", letterSpacing: 3, marginBottom: 6 }}>
                  SET A NEW PASSWORD
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>
                  Your account is using the default password. Please set a secure one.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Input value={pwNew} onChange={setPwNew} placeholder="New password" type="password" />
                  <Input value={pwConfirm} onChange={setPwConfirm} placeholder="Confirm new password" type="password"
                    onKeyDown={e => e.key === "Enter" && handle()} />
                </div>
              </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 12 }}>{error}</div>}
            <Btn onClick={handle} disabled={loading} style={{ width: "100%", marginTop: 20, padding: "12px 0", display: "block", textAlign: "center", letterSpacing: 2 }}>
              {loading ? "..." : "SAVE & CONTINUE"}
            </Btn>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build` (or check `npm run dev` starts without errors)
Expected: no errors about `AccountSetupModal`

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add AccountSetupModal component"
```

---

## Task 2: Wire the modal into `App` — trigger on login and boot

**File:** `src/App.jsx` — modify the `App` component (around line 1121)

- [ ] **Step 1: Add `needsSetup` state and `handleSetupDone` to `App`**

After the existing `const [resetDone,setResetDone]=useState(false);` line (around line 1139), add:

```js
const [needsSetup, setNeedsSetup] = useState(false);
const handleSetupDone = useCallback((updatedUser) => {
  setUser(updatedUser);
  setNeedsSetup(false);
}, []);
```

- [ ] **Step 2: Update `handleLogin` to set `needsSetup`**

Change line 1172 from:
```js
const handleLogin = async (u) => {lset("session",{username:u.username});setUser(u);};
```
To:
```js
const handleLogin = async (u) => {
  lset("session", {username: u.username});
  setUser(u);
  setNeedsSetup(!u.email || u.password === "password123");
};
```

- [ ] **Step 3: Update `runBoot` to set `needsSetup`**

Inside `runBoot`, after `setUser(u);` (around line 1158), add:
```js
setNeedsSetup(!u.email || u.password === "password123");
```

The relevant section currently reads:
```js
const u=await sget(`user:${saved.username}`);
if(!u){setBootError(true);setBoot(true);return;}
setUser(u);
if(saved.groupId){
```
It should become:
```js
const u=await sget(`user:${saved.username}`);
if(!u){setBootError(true);setBoot(true);return;}
setUser(u);
setNeedsSetup(!u.email || u.password === "password123");
if(saved.groupId){
```

- [ ] **Step 4: Render `AccountSetupModal` in the JSX**

In the `App` return, directly after the `{toast&&(...)}` block (around line 1207) and before the `{!boot?(` chain, add:

```jsx
{user && needsSetup && (
  <AccountSetupModal user={user} onDone={handleSetupDone} />
)}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 6: Manual smoke test — modal appears**

Run `npm run dev`. Sign in as a user who has no email or has `password123`. Confirm:
- The modal appears immediately after login
- The rest of the app (groups list) is not accessible behind it
- The backdrop is not clickable
- No close button is visible

- [ ] **Step 7: Manual smoke test — email-only case**

For a user with `user.email = null` and `user.password !== "password123"`:
- Only the `ADD YOUR EMAIL` section appears (no password fields)
- Submitting a valid unique email saves and shows "All set!" for ~1.5s, then dismisses
- After dismissal, `user.email` is set in state (visible in Account modal)
- The `useremail:` lookup key exists in Firebase

- [ ] **Step 8: Manual smoke test — password-only case**

For a user with an email but `user.password === "password123"`:
- Only the `SET A NEW PASSWORD` section appears (no email field)
- Submitting a valid new password saves and dismisses
- After dismissal, signing out and back in with the new password works

- [ ] **Step 9: Manual smoke test — both conditions**

For a user with no email and `password123`:
- Both sections appear with a divider
- All fields save in one click

- [ ] **Step 10: Manual smoke test — validation**

- Submit empty email → "Please enter a valid email address."
- Submit duplicate email → "Email already in use."
- Submit password < 6 chars → "Password must be at least 6 characters."
- Submit mismatched passwords → "Passwords do not match."

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "feat: trigger AccountSetupModal on login and boot for incomplete accounts"
```

---

## Task 3: Add email management to the `GroupLobby` account modal

**File:** `src/App.jsx` — modify the `accountOpen` modal inside `GroupLobby` (around line 949)

The modal currently starts with:
```jsx
<div style={{fontSize:10,color:"var(--text-dim2)",letterSpacing:3,marginBottom:20}}>ACCOUNT</div>
<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
  <div style={{display:"flex",justifyContent:"space-between",...}}>
    <span style={{color:"var(--text-dim)"}}>Username</span><span ...>{user.username}</span>
  </div>
  <div style={{display:"flex",justifyContent:"space-between",...}}>
    <span style={{color:"var(--text-dim)"}}>Email</span><span ...>{user.email||"—"}</span>
  </div>
</div>
<div style={{fontSize:10,...}}>CHANGE PASSWORD</div>
```

- [ ] **Step 1: Add local state for email editing to `GroupLobby`**

`GroupLobby` (which used to be called `GroupsScreen` internally) already has state for the account modal at around line 800. Find the block with `const [pwCurrent...` and add after it:

```js
const [emailInput, setEmailInput] = useState("");
const [emailChanging, setEmailChanging] = useState(false);
const [emailLoading, setEmailLoading] = useState(false);
const [emailError, setEmailError] = useState("");
const [emailSuccess, setEmailSuccess] = useState(false);
```

- [ ] **Step 2: Add `saveEmail` handler to `GroupLobby`**

Below the `changePassword` function (around line 830), add:

```js
const saveEmail = async () => {
  const normEmail = emailInput.trim().toLowerCase();
  setEmailError("");
  if (!normEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
    setEmailError("Please enter a valid email address.");
    return;
  }
  // No-op: same as current email
  if (user.email && normEmail === user.email.toLowerCase()) {
    setEmailChanging(false);
    setEmailInput("");
    return;
  }
  setEmailLoading(true);
  try {
    const existing = await sget(`useremail:${normEmail}`);
    if (existing && existing.username !== user.username) {
      setEmailError("Email already in use.");
      setEmailLoading(false);
      return;
    }
    // Write sequentially
    await sset(`useremail:${normEmail}`, { username: user.username });
    if (user.email) {
      const delOk = await sdel(`useremail:${user.email}`);
      if (!delOk) {
        // sdel failed after sset succeeded — unrecoverable partial write
        setEmailError("Something went wrong. Please contact support.");
        setEmailLoading(false);
        return;
      }
    }
    await spatch(`user:${user.username}`, "email", normEmail);
    onUpdateUser({ ...user, email: normEmail });
    setEmailSuccess(true);
    setTimeout(() => {
      setEmailSuccess(false);
      setEmailChanging(false);
      setEmailInput("");
    }, 1500);
  } catch {
    setEmailError("Something went wrong, please try again.");
  }
  setEmailLoading(false);
};
```

- [ ] **Step 3: Replace the static email row with the interactive email section**

Find this block in the `accountOpen` modal JSX (the static email row):
```jsx
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:"1px solid var(--border3)"}}>
  <span style={{color:"var(--text-dim)"}}>Email</span><span style={{color:"var(--text-mid)"}}>{user.email||"—"}</span>
</div>
```

Replace it with:
```jsx
<div style={{borderBottom:"1px solid var(--border3)",paddingBottom:8,marginBottom:0}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"6px 0"}}>
    <span style={{color:"var(--text-dim)"}}>Email</span>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{color:"var(--text-mid)"}}>{user.email||"—"}</span>
      <button
        onClick={()=>{setEmailChanging(o=>!o);setEmailInput("");setEmailError("");setEmailSuccess(false);}}
        style={{background:"none",border:"none",color:"var(--text-dim2)",cursor:"pointer",fontSize:11,
          letterSpacing:1,fontFamily:"inherit",padding:0}}>
        {emailChanging?"CANCEL":user.email?"CHANGE →":"ADD →"}
      </button>
    </div>
  </div>
  {emailChanging&&(
    <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
      <Input value={emailInput} onChange={setEmailInput} placeholder="Email address" type="email"
        onKeyDown={e=>e.key==="Enter"&&saveEmail()} autoFocus />
      {emailError&&<div style={{color:"#ef4444",fontSize:12}}>{emailError}</div>}
      {emailSuccess&&<div style={{color:"#22c55e",fontSize:12}}>Email updated.</div>}
      <Btn onClick={saveEmail} disabled={emailLoading||emailSuccess}
        style={{padding:"8px 0",textAlign:"center",letterSpacing:2}}>
        {emailLoading?"...":"SAVE"}
      </Btn>
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 5: Manual smoke test — add email from account modal**

For a user with no email (who has already passed the setup modal or whose account was manually given a non-default password):
- Open Account modal from the top-right profile menu
- Email row shows `—` with `ADD →` button
- Click `ADD →` — input appears
- Submit valid email — shows "Email updated." briefly, then input closes
- Email row now shows the new address
- Signing out and using "Forgot Password" with that email works

- [ ] **Step 6: Manual smoke test — change email**

For a user with an existing email:
- Email row shows current email with `CHANGE →` button
- Click `CHANGE →` — input appears, button becomes `CANCEL`
- Submit same email → form closes silently (no-op)
- Submit new valid email → "Email updated.", old `useremail:` key removed, new key created
- Submit duplicate email (one belonging to another user) → "Email already in use."
- Click `CANCEL` → form closes without changes

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add email management section to account modal"
```

---

## Task 4: Final end-to-end verification

- [ ] **Step 1: Full flow for `aamer` account**

Sign in as `aamer` (who now has `aamerasifsheik@gmail.com` set and presumably still has `password123`).
- Setup modal appears showing only `SET A NEW PASSWORD` (email is already set)
- Set a new password and save
- Modal dismisses, app loads normally
- Signing out and back in with the new password works
- Signing out and trying the old password `password123` fails with "Invalid credentials."

- [ ] **Step 2: Session restore works**

After setup is complete, refresh the page.
- App boots, session restored, setup modal does NOT appear (needsSetup is false because email and non-default password are now in Firebase)

- [ ] **Step 3: New registration flow unaffected**

Register a brand new account (with email and a non-default password).
- Setup modal does NOT appear — the new user goes straight to the groups screen

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Clean build, no warnings or errors

- [ ] **Step 5: Final commit**

```bash
git add src/App.jsx
git commit -m "feat: account setup complete - modal, trigger logic, and email management"
```
