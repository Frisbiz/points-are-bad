import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordLinkStore } from "../api/_discordLinks.js";
import { createDiscordFirestore } from "./helpers/discordFirestore.mjs";

const id = "123456789012345678";
function harness(seed = {}) {
  const { db, values } = createDiscordFirestore({ "user:aamer": { username: "aamer", email: "private@example.com" }, ...seed });
  let time = 1000;
  const store = createDiscordLinkStore({ db, docKey: key => key.replace(/[/\\]/g, "_"), now: () => time });
  return { store, values, setTime: t => { time = t; } };
}

test("first connection enables reminders and preserves user fields", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id, profile: { username: "aamer", displayName: "Aamer", avatarHash: null } });
  assert.equal(h.values.get("user:aamer").email, "private@example.com");
  assert.equal(h.values.get("user:aamer").discordUserId, id);
  assert.equal(h.values.get(`discordlink:${id}`).remindersEnabled, true);
  assert.deepEqual(h.values.get("discord-links-index"), [id]);
  assert.deepEqual(await h.store.status("aamer"), { linked: true, remindersEnabled: true, profile: { username: "aamer", displayName: "Aamer", avatarHash: null } });
});

test("reauthorizing preserves disabled reminders and original link time", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id });
  await h.store.preferences({ username: "aamer", enabled: false });
  h.setTime(2000);
  await h.store.connect({ username: "aamer", discordUserId: id, profile: { username: "newname", displayName: "New name", avatarHash: null } });
  const link = h.values.get(`discordlink:${id}`);
  assert.equal(link.remindersEnabled, false);
  assert.equal(link.linkedAt, 1000);
  assert.equal(link.discordUsername, "newname");
});

test("another PAB member cannot take an existing connection", async () => {
  const h = harness({ "user:faris": { username: "faris", discordUserId: id }, [`discordlink:${id}`]: { username: "faris", discordUserId: id, remindersEnabled: true } });
  await assert.rejects(h.store.connect({ username: "aamer", discordUserId: id }), { code: "already_linked" });
  assert.equal(h.values.get(`discordlink:${id}`).username, "faris");
  assert.equal(h.values.get("user:aamer").discordUserId, undefined);
});

test("a member must disconnect before changing Discord accounts", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id });
  await assert.rejects(h.store.connect({ username: "aamer", discordUserId: "223456789012345678" }), { code: "disconnect_first" });
});

test("unlink clears both directions and the index", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id });
  assert.deepEqual(await h.store.unlink("aamer"), { linked: false });
  assert.equal(h.values.get("user:aamer").discordUserId, undefined);
  assert.equal(h.values.has(`discordlink:${id}`), false);
  assert.deepEqual(h.values.get("discord-links-index"), []);
});

test("corrupt reverse ownership cannot edit or delete another member's connection", async () => {
  const h = harness({ "user:aamer": { username: "aamer", discordUserId: id }, [`discordlink:${id}`]: { username: "faris", discordUserId: id, remindersEnabled: true } });
  assert.deepEqual(await h.store.status("aamer"), { linked: false });
  await assert.rejects(h.store.preferences({ username: "aamer", enabled: false }));
  await assert.rejects(h.store.unlink("aamer"));
  assert.equal(h.values.get(`discordlink:${id}`).username, "faris");
  assert.equal(h.values.get(`discordlink:${id}`).remindersEnabled, true);
});

test("shared demo account cannot mutate connections", async () => {
  const h = harness({ "user:demo": { username: "demo" } });
  for (const action of [() => h.store.connect({ username: "demo", discordUserId: id }), () => h.store.preferences({ username: "demo", enabled: true }), () => h.store.unlink("demo")]) {
    await assert.rejects(action(), { status: 403 });
  }
});

test("session logout or expiry during OAuth prevents final connection", async () => {
  const h = harness({ "session:live": { username: "aamer", expiry: 1001 } });
  h.setTime(1001);
  await assert.rejects(h.store.connect({ username: "aamer", discordUserId: id, sessionToken: "live" }), { code: "sign_in_required" });
  await assert.rejects(h.store.connect({ username: "aamer", discordUserId: id, sessionToken: "missing" }), { code: "sign_in_required" });
  assert.equal(h.values.has(`discordlink:${id}`), false);
});

test("state is session-bound, expires, and is only consumed once", async () => {
  const h = harness();
  const state = "a".repeat(43);
  await h.store.putAttempt({ state, username: "aamer", sessionToken: "secret-session", returnPath: "/groups/friends" });
  assert.equal(JSON.stringify([...h.values.values()]).includes("secret-session"), false);
  await assert.rejects(h.store.consumeAttempt({ state, username: "aamer", sessionToken: "other" }), { code: "invalid_state" });
  const attempts = await Promise.allSettled([1, 2].map(() => h.store.consumeAttempt({ state, username: "aamer", sessionToken: "secret-session" })));
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(attempts.find(r => r.status === "fulfilled").value.returnPath, "/groups/friends");
  const next = "b".repeat(43);
  await h.store.putAttempt({ state: next, username: "aamer", sessionToken: "session", returnPath: "//evil.test" });
  h.setTime(601000);
  await assert.rejects(h.store.consumeAttempt({ state: next, username: "aamer", sessionToken: "session" }), { code: "invalid_state" });
  await h.store.cleanupAttempts();
  assert.equal([...h.values.keys()].some(k => k.startsWith("discordoauth:")), false);
});

test("signed token nonce is consumed atomically with linking", async () => {
  const h = harness();
  const args = { username: "aamer", discordUserId: id, nonce: { value: "signed-nonce", expiresAt: 2000 } };
  await h.store.connect(args);
  await assert.rejects(h.store.connect(args), { code: "invalid_state" });
});

test("concurrent preferences and unlink leave no dangling connection", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id });
  await Promise.allSettled([h.store.preferences({ username: "aamer", enabled: false }), h.store.unlink("aamer")]);
  assert.equal(h.values.has(`discordlink:${id}`), false);
  assert.equal(h.values.get("user:aamer").discordUserId, undefined);
});

test("a stale bot request cannot change a newly linked Discord account", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id });
  await assert.rejects(h.store.preferences({ username: "aamer", enabled: false, expectedDiscordUserId: "999" }), { code: "failed" });
  await assert.rejects(h.store.unlink("aamer", "999"), { code: "failed" });
  assert.equal(h.values.get(`discordlink:${id}`).remindersEnabled, true);
  assert.equal(h.values.get("user:aamer").discordUserId, id);
});
