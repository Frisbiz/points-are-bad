# Account Setup Modal — Design Spec
**Date:** 2026-04-01
**Status:** Approved

---

## Problem

Some users were created without an email address and/or with the default password `password123`. These users cannot use the "Forgot Password" flow and have effectively insecure accounts. They need to be prompted to fix this before they can use the app.

---

## Trigger Condition

After every login event — both fresh sign-in and session restore via `runBoot` — evaluate:

```
needsSetup = !user.email || user.password === "password123"
```

If `needsSetup` is true, render `AccountSetupModal` as a blocking overlay. Nothing else is accessible until the modal is dismissed via successful save.

---

## Component: `AccountSetupModal`

### Props
```ts
{
  user: UserObject,
  onDone: (updatedUser: UserObject) => void
}
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
- Section label: `ADD YOUR EMAIL` (10px dim label)
- Brief note: "Add an email address so you can reset your password if you ever get locked out."
- Single `<Input type="email" placeholder="Email address" />`

**Case 2: Default password only (`user.email && user.password === "password123"`)**
- Section label: `SET A NEW PASSWORD`
- Brief note: "Your account is using the default password. Please set a secure one."
- `<Input type="password" placeholder="New password" />`
- `<Input type="password" placeholder="Confirm new password" />`

**Case 3: Both conditions**
- Show email section first, then password section below with a subtle divider between them
- Single save button covers both

### Save flow

1. **Client-side validation** (in order):
   - If email field shown: must be non-empty, must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - If password fields shown: new password must be ≥ 6 chars; new password must equal confirm password
2. **Firebase uniqueness check** (if email shown):
   - `sget("useremail:" + email.toLowerCase())` — if exists and belongs to a different user, show "Email already in use."
3. **Firebase writes** (parallel where possible):
   - If email: `sset("useremail:" + email, { username })` + `spatch("user:" + username, "email", email)`
   - If password: `spatch("user:" + username, "password", newPassword)`
4. **State update:** call `onDone(updatedUser)` with the merged user object — parent updates `user` state
5. **Dismiss:** modal unmounts

### Error handling
- Inline red error (`#ef4444`, 12px) below the relevant field group, consistent with existing patterns
- Loading state on button: shows `"..."` while saving
- On partial Firebase failure: show "Something went wrong, please try again." and allow retry

### Save button
```
[ SAVE & CONTINUE ]   ← full-width, Btn component, letterSpacing: 2
```
Disabled while loading or after success (brief success flash: "All set!" in green before dismiss).

---

## Account Modal upgrade: Email management

The existing `accountOpen` modal (in `GroupsScreen`) gets a new **"EMAIL"** section above the existing "CHANGE PASSWORD" section:

- **If user has no email:** Show an "Add email" input + Save button (same validation/write logic as above). Label: `ADD EMAIL`.
- **If user has an email:** Show current email as read-only text, plus a toggle to reveal a "Change email" input. Label: `EMAIL`. Changing email: validate new email, check uniqueness (excluding current user's own email), write `useremail:newEmail → {username}`, delete old `useremail:oldEmail` key, patch `user.email`.

This ensures email management is always accessible, not just on first login.

---

## Data writes summary

| Action | Firebase operation |
|---|---|
| Add email | `sset("useremail:{email}", {username})` + `spatch("user:{u}", "email", email)` |
| Change email | `sset("useremail:{newEmail}", {username})` + `sdel("useremail:{oldEmail}")` + `spatch("user:{u}", "email", newEmail)` |
| Change password | `spatch("user:{u}", "password", newPassword)` |

Note: `spatch` is used for field-level updates to avoid overwriting other user fields. For email add/change, both the `useremail:` lookup key and the `user:` document must be kept in sync.

---

## Files to change

- `src/App.jsx` — single file containing all components
  - Add `AccountSetupModal` component (new, ~120 lines)
  - Add email section to existing `accountOpen` modal inside `GroupsScreen`
  - Trigger `AccountSetupModal` in `App` component after login/boot: render it when `user && needsSetup` before rendering `GroupsScreen` or `GroupView`

---

## Out of scope

- Forcing users to verify their email (no email verification flow exists)
- Username changes
- Deleting an account
