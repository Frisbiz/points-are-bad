# World Cup Cache Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unchanged World Cup seed normalization from refreshing the cache timestamp and blocking finished-round fixture updates.

**Architecture:** Keep the existing cache and refresh flow intact. Make the fixture-side seed formatter return no patch when both the displayed seed and original seed are already normalized, allowing the existing global formatter's reference-identity change detection to remain accurate.

**Tech Stack:** Node.js ES modules, `node:test`, Firebase Admin, Vercel.

## Global Constraints

- Do not change fixture IDs, predictions, results, bracket mappings, or refresh intervals.
- Use authoritative Yahoo results to repair production only after the fix is deployed.
- Push only the focused fix, tests, and supporting design/plan documents to `main`.

---

### Task 1: Make World Cup seed formatting idempotent

**Files:**
- Modify: `api/_wcBracket.js:899-907`
- Test: `tests/wcBracket.test.mjs`

**Interfaces:**
- Consumes: `formatWorldCupGlobalDocSeedPlaceholders(globalDoc)`.
- Produces: unchanged object identity and `{ changed: false }` for already-normalized seed metadata.

- [ ] **Step 1: Write the failing regression test**

```js
test("already formatted World Cup seed metadata is idempotent", () => {
  const globalDoc = {
    gameweeks: [{
      gw: 4,
      fixtures: [{
        id: "wc-gw4-fsoccer-g-13532373",
        home: "Spain",
        away: "2J",
        awayOriginalSeed: "2J",
      }],
    }],
  };

  const formatted = formatWorldCupGlobalDocSeedPlaceholders(globalDoc);

  assert.equal(formatted.changed, false);
  assert.equal(formatted.globalDoc, globalDoc);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="already formatted World Cup seed metadata is idempotent" tests/wcBracket.test.mjs`

Expected: FAIL because `formatted.changed` is currently `true`.

- [ ] **Step 3: Implement the minimal idempotency check**

In `formatFixtureSideSeedPlaceholder`, return `null` when `fixture[side]` already equals the desired display value and `fixture[side + "OriginalSeed"]` already equals the normalized source string. Otherwise return the existing patch.

- [ ] **Step 4: Verify focused and full test suites**

Run: `node --test --test-name-pattern="already formatted World Cup seed metadata is idempotent" tests/wcBracket.test.mjs`

Expected: PASS.

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Verify production build**

Run: `npm run build`

Expected: Vite build exits successfully.

- [ ] **Step 6: Commit and push**

```powershell
git add -- api/_wcBracket.js tests/wcBracket.test.mjs docs/superpowers/plans/2026-07-12-world-cup-cache-idempotency.md
git commit -m "fix: unblock world cup knockout refresh"
git push origin main
```

- [ ] **Step 7: Repair and verify production cache**

Deploy the pushed `main` build, force-refresh World Cup round 6 through the production fixture sync, and read the shared cache back. Confirm four finished quarter-finals and projected semifinals `France vs Spain` and `England vs Argentina`.
