import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadBootstrapData } from "../api/_bootstrap.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../api/security.js", import.meta.url), "utf8");

test("bootstrap includes public site preferences for a signed-out visitor", async () => {
  const reads = [];
  const result = await loadBootstrapData({
    token: null,
    getSession: async () => null,
    getValue: async key => {
      reads.push(key);
      return key === "site:preferences" ? { defaultTheme: "index", landingTheme: "index" } : null;
    },
    safeUser: user => user,
    normalizeGroup: group => group,
  });

  assert.deepEqual(result, {
    user: null,
    groups: [],
    sitePreferences: { defaultTheme: "index", landingTheme: "index" },
  });
  assert.deepEqual(reads, ["site:preferences"]);
});

test("bootstrap returns only normalized groups belonging to the signed-in user", async () => {
  const values = new Map([
    ["site:preferences", null],
    ["user:faris", { username: "faris", passwordHash: "secret", groupIds: ["friends", "stale", "missing"] }],
    ["group:friends", { id: "friends", members: ["faris", "aamer"] }],
    ["group:stale", { id: "stale", members: ["someone-else"] }],
    ["group:missing", null],
  ]);

  const result = await loadBootstrapData({
    token: "session-token",
    getSession: async token => token === "session-token" ? { username: "faris" } : null,
    getValue: async key => values.get(key) ?? null,
    safeUser: user => {
      const { passwordHash, ...safe } = user;
      return safe;
    },
    normalizeGroup: group => ({ ...group, normalized: true }),
  });

  assert.equal(result.user.passwordHash, undefined);
  assert.deepEqual(result.groups, [{ id: "friends", members: ["faris", "aamer"], normalized: true }]);
  assert.deepEqual(result.sitePreferences, { defaultTheme: "dark", landingTheme: null });
});

test("bootstrap prepares every group for the signed-in viewer", async () => {
  const viewers = [];
  const result = await loadBootstrapData({
    token: "session-token",
    getSession: async () => ({ username: "faris" }),
    getValue: async key => ({
      "site:preferences": null,
      "user:faris": { username: "faris", groupIds: ["friends"] },
      "group:friends": { id: "friends", members: ["faris", "sam"], predictions: { sam: { one: "4-0" } } },
    })[key] ?? null,
    safeUser: user => user,
    normalizeGroup: group => ({ ...group, normalized: true }),
    prepareGroupForViewer: (group, viewer) => {
      viewers.push(viewer);
      return { ...group, predictions: { [viewer]: group.predictions?.[viewer] || {} } };
    },
  });

  assert.deepEqual(viewers, ["faris"]);
  assert.deepEqual(result.groups[0].predictions, { faris: {} });
  assert.equal(result.groups[0].normalized, true);
});

test("the security API exposes one GET bootstrap action", () => {
  assert.match(securitySource, /action === 'bootstrap' && req\.method === 'GET'/);
  assert.match(securitySource, /loadBootstrapData/);
});

test("initial app boot uses the bundled endpoint without reloading each group", () => {
  const start = appSource.indexOf("const runBoot=useCallback");
  const end = appSource.indexOf("useEffect(()=>{runBoot();},[]);", start);
  const bootBlock = appSource.slice(start, end);

  assert.match(bootBlock, /fetchBootstrap\(\)/);
  assert.doesNotMatch(bootBlock, /auth-session/);
  assert.doesNotMatch(bootBlock, /sget\(`group:/);
  assert.doesNotMatch(bootBlock, /await fetchGroupNames/);
});

test("the dashboard trusts the groups supplied by app boot, including an empty list", () => {
  const start = appSource.indexOf("function GroupLobby");
  const end = appSource.indexOf("function ", start + 20);
  const lobbyBlock = appSource.slice(start, end);

  assert.doesNotMatch(lobbyBlock, /await loadGroups/);
  assert.doesNotMatch(lobbyBlock, /const loadGroups/);
});

test("member-name enrichment paints fallback names before its network request", () => {
  const start = appSource.indexOf("const fetchGroupNames = useCallback");
  const end = appSource.indexOf("const handleSetupDone", start);
  const namesBlock = appSource.slice(start, end);

  assert.ok(namesBlock.indexOf("setNames(init)") < namesBlock.indexOf("await fetch"));
});
