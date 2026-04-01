# Account Setup Modal — Design Spec
**Date:** 2026-04-01
**Status:** Approved

---

## Problem

Some users were created without an email address and/or with the default password `password123`. These users cannot use the "Forgot Password" flow and have effectively insecure accounts. They need to be prompted to fix this before they can use the app.

Note: This app stores passwords in plaintext (visible in the login check `user.password !== password`). The default password check is therefore a simple string equality: `user.password === "password123"`.

---

## Trigger Condition

Evaluated once — after fresh sign-in (in `handleLogin`) and after session restore (in `runBoot`). Store as a `useState` boolean in `App`:

```js
const [needsSetup, setNeedsSetup] = useState(false);
// Set to true in handleLogin / runBoot when:
//   !user.email || user.password === "password123"
```

Do **not** derive `needsSetup` from `user` on every render — this would cause the modal to flicker or reappear mid-transition. The flag is set once on login/boot and cleared only by calling `setNeedsSetup(false)` inside the `onDone` handler.

If `needsSetup` is true, render `AccountSetupModal`. Nothing else is accessible until the modal is dismissed.

---

## Component: `AccountSetupModal`

### Props
```ts
{
  user: UserObject,
  onDone: (updatedUser: UserObject) => void
}
```

`onDone` receives the updated user constructed by spreading the current `user` and overwriting the changed fields locally (do **not** re-fetch from Firebase):
```js
onDone({ ...user, ...(emailChanged && { email: normEmail }), ...(passwordChanged && { password: newPassword }) })
```

In `App`, the `onDone` handler must call both `setUser` and `setNeedsSetup`. Wrap it in `useCallback` to ensure a stable reference (required for the dismiss `useEffect` in the modal):
```js
const handleSetupDone = useCallback((updatedUser) => {
  setUser(updatedUser);
  setNeedsSetup(false);
}, []); // setUser and setNeedsSetup are stable setState setters
```

### Visual design
- Portal-rendered (`createPortal` into `document.body`)
- Full-screen dark backdrop (`rgba(0,0,0,0.53)`) — **not** click-dismissible
- Centered card: `var(--card)` background, `1px solid var(--border)` border, `border-radius: 14px`, `padding: 32px`, `max-width: 400px`
- DM Mono font throughout, consistent with the rest of the app
- No close button (X)

### Header
```
COMPLETE YOUR ACCOUNT        ← 10px, letterSpacing: 3, var(--text-dim2)
Before you continue, please secure your account.   ← 12px, var(--text-dim), marginBottom: 24
```

### Conditional fields

**Case 1: Missing email only (`!user.email && user.password !== "password123"`)**
- Section label: `ADD YOUR EMAIL` (10px, letterSpacing: 3, `var(--text-dim2)`)
- Brief note: "Add an email address so you can reset your password if you ever get locked out."
- Single `<Input type="email" placeholder="Email address" />`

**Case 2: Default password only (`user.email && user.password === "password123"`)**
- Section label: `SET A NEW PASSWORD`
- Brief note: "Your account is using the default password. Please set a secure one."
- `<Input type="password" placeholder="New password" />`
- `<Input type="password" placeholder="Confirm new password" />`

**Case 3: Both conditions**
- Show email section first, then password section below with a subtle `1px solid var(--border3)` divider and `16px` vertical gap between them
- Single save button covers both

### Save flow

The entire save handler should be wrapped in a top-level try/catch. Any unhandled exception shows "Something went wrong, please try again." and re-enables the button.

1. **Client-side validation** (in order):
   - If email field shown: must be non-empty, must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - If password fields shown: new password must be ≥ 6 chars; new password must equal confirm password
2. **Firebase uniqueness check** (if email shown):
   - Normalise: `const normEmail = email.trim().toLowerCase()`
   - `sget(\`useremail:${normEmail}\`)` — if result exists and `result.username !== user.username`, show "Email already in use."
   - Note: if `result.username === user.username` (same user retrying after a partial write failure), the check passes correctly and the retry proceeds safely.
   - Note: no server-side transaction exists; a race condition where two users claim the same email simultaneously is an accepted limitation given the low volume of users.
3. **Firebase writes** — run sequentially for the email path to minimise the inconsistency window from partial failure; password write can be parallelised with the email writes if both are needed:
   - If email: first `sset(\`useremail:${normEmail}\`, { username })`, then `spatch(\`user:${user.username}\`, "email", normEmail)`
   - If password: `spatch(\`user:${user.username}\`, "password", newPassword)`
   - All email values written to Firebase must be `.trim().toLowerCase()` — apply consistently at every write site.
   - On any write failure (caught by the top-level try/catch): show "Something went wrong, please try again." and re-enable the button. Partial writes (e.g. `useremail:` key written but `user.email` patch failed) are not rolled back — accepted limitation. A retry will safely overwrite the `useremail:` key because the uniqueness check allows the same user to reclaim their own email.
4. **Success state and dismiss:** `pendingUser` is stored in a `useRef` (not local variable) to avoid stale closure issues in the dismiss `useEffect`:
   ```js
   // Top-level in the component (alongside useState hooks):
   const pendingUser = useRef(null);

   // At the end of the save handler, after all writes succeed:
   pendingUser.current = { ...user, ...(emailChanged && { email: normEmail }), ...(passwordChanged && { password: newPassword }) };
   setSuccess(true); // triggers the useEffect below

   // Also top-level in the component:
   useEffect(() => {
     if (!success) return;
     const t = setTimeout(() => onDone(pendingUser.current), 1500);
     return () => clearTimeout(t); // cleanup on unmount
   }, [success, onDone]); // onDone is stable via useCallback in App
   ```
   `onDone` is called exactly once, after the 1500ms delay.

### Success state UX (during the 1500ms window)
When `success` is true:
- Replace the form fields and error message with a single centred line: `"All set!"` in green (`#22c55e`, 14px)
- The `SAVE & CONTINUE` button remains visible but disabled
- The backdrop and card remain — the user cannot interact with anything else

### Error handling
- Inline red error (`#ef4444`, 12px) rendered below the form, consistent with existing patterns
- Loading state on button: shows `"..."` while saving; re-enabled on failure
- Generic catch: "Something went wrong, please try again."

### Save button
```
[ SAVE & CONTINUE ]   ← full-width, Btn component, letterSpacing: 2
```
Disabled while `loading` is true or while `success` is true.

---

## Account Modal upgrade: Email management

The existing `accountOpen` modal lives inside the `GroupLobby` component. It already receives `onUpdateUser` as a prop (wired in `App` as `u => setUser(u)`). Add a new **EMAIL** section inserted above the existing "CHANGE PASSWORD" section.

### If user has no email
- Label: `ADD EMAIL` (10px, letterSpacing: 3, `var(--text-dim2)`)
- Single `<Input type="email" placeholder="Email address" />`
- `[ SAVE ]` button (same full-width layout as the existing password Save button)
- Same validation + write logic as `AccountSetupModal` email path (including the top-level try/catch)
- On success: call `onUpdateUser({ ...user, email: newEmailNorm })` and clear the input

### If user has an email
- Label: `EMAIL` (same style)
- Current email shown as read-only text (`var(--text-mid)`, 12px)
- Below it: small text button labelled `CHANGE →` (`font-size: 11px`, `color: var(--text-dim2)`, no border/background, `cursor: pointer`). Clicking it toggles an inline change-email form open/closed.
- When open: `<Input type="email" placeholder="New email address" />` + `[ SAVE ]` button appear below the current email text; toggle button label changes to `CANCEL`.
- Saving:
  1. Normalise: `const newEmailNorm = newEmail.trim().toLowerCase()`
  2. If `newEmailNorm === user.email.toLowerCase()`: treat as no-op — close the toggle form without any Firebase writes or state updates.
  3. Otherwise: validate format, check uniqueness (`sget(\`useremail:${newEmailNorm}\`)` — if exists and `result.username !== user.username`, show "Email already in use."). Wrap entire save in try/catch.
  4. Write sequentially:
     - `sset(\`useremail:${newEmailNorm}\`, { username })`
     - `sdel(\`useremail:${user.email}\`)`
     - `spatch(\`user:${user.username}\`, "email", newEmailNorm)`
  5. **Partial failure on the change-email path is an unrecoverable edge case.** If `sset` succeeds but `sdel` or `spatch` subsequently fails, the data is inconsistent in a way that cannot be safely retried (re-running `sdel` on an already-deleted key would fail). In this case: do **not** call `onUpdateUser`. Show "Something went wrong. Please contact support." and leave the toggle form open. This scenario is extremely unlikely given the sequential write pattern and low user volume.
  6. On full success: call `onUpdateUser({ ...user, email: newEmailNorm })` and close the toggle form.

---

## Data writes summary

All email strings must be `.trim().toLowerCase()` at every write site (use template literals in actual code).

| Action | Firebase operations |
|---|---|
| Add email | `sset("useremail:EMAIL", {username})` + `spatch("user:U", "email", email)` |
| Change email | `sset("useremail:NEW", {username})` + `sdel("useremail:OLD")` + `spatch("user:U", "email", newEmail)` |
| Change password | `spatch("user:U", "password", newPassword)` |

`spatch` is used for field-level updates to avoid overwriting other user fields.

---

## Files to change

- `src/App.jsx` — single file containing all components
  - Add `AccountSetupModal` component (~150 lines) near the top of the component section
  - Add `needsSetup` state and `handleSetupDone` (wrapped in `useCallback`) to the `App` component; render `<AccountSetupModal>` when `user && needsSetup`, passing `user` and `onDone={handleSetupDone}`
  - Add email section to the `accountOpen` modal inside `GroupLobby`

---

## Out of scope

- Server-side email uniqueness enforcement / Firestore transactions
- Email verification / confirmation flow
- Username changes
- Account deletion
