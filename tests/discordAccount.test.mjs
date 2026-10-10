import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordAccountHandler } from "../api/_discordAccount.js";
import { createDiscordLinkStore } from "../api/_discordLinks.js";
import { createDiscordFirestore } from "./helpers/discordFirestore.mjs";

const origin = "https://www.pab.wtf";
const id = "123456789012345678";
function harness(options = {}) {
  const { db, values } = createDiscordFirestore({
    "user:aamer": { username: "aamer" }, "user:faris": { username: "faris" }, "user:demo": { username: "demo" },
    "session:session-a": { username: "aamer", expiry: 100000 }, "session:session-b": { username: "faris", expiry: 100000 }, "session:session-demo": { username: "demo", expiry: 100000 },
  });
  const store = createDiscordLinkStore({ db, docKey: key => key.replace(/[/\\]/g, "_"), now: () => 1000 });
  let calls = 0;
  let states = 0;
  const handler = createDiscordAccountHandler({
    env: { APP_URL: origin, DISCORD_CLIENT_ID: id, DISCORD_CLIENT_SECRET: "private-client-secret", ...options.env }, store,
    getSession: async token => values.get(`session:${token}`) || null,
    readSessionToken: req => req.token,
    randomState: () => String(++states).padStart(43, "a"),
    fetchProfile: async () => { calls++; if (options.fetchProfile) return options.fetchProfile(values); return { id, username: "aamerdiscord", displayName: "Aamer", avatarHash: null }; },
    rateLimit: options.rateLimit,
  });
  async function request(action, changes = {}) {
    const req = { method: action.includes("status") || action.includes("callback") ? "GET" : "POST", token: "session-a", headers: { origin }, query: {}, body: {}, ...changes };
    const result = { status: 200, headers: {} };
    const res = { setHeader: (k, v) => { result.headers[k] = v; }, status: n => { result.status = n; return res; }, json: data => { result.body = data; return res; }, redirect: (status, location) => { result.status = status; result.headers.Location = location; return res; } };
    result.handled = await handler(req, res, action);
    return result;
  }
  async function start(changes) { const r = await request("discord-oauth-start", changes); return { result: r, state: r.body?.url ? new URL(r.body.url).searchParams.get("state") : null }; }
  return { values, store, request, start, calls: () => calls };
}

test("start requires a session, exact Origin, correct method and rate allowance", async () => {
  const h = harness();
  assert.equal((await h.request("discord-oauth-start", { token: null })).status, 401);
  for (const headers of [{}, { origin: "https://evil.test" }, { origin: `${origin}/` }]) assert.equal((await h.request("discord-oauth-start", { headers })).status, 403);
  assert.equal((await h.request("discord-oauth-start", { method: "GET" })).status, 405);
  assert.equal((await harness({ rateLimit: async () => false }).request("discord-oauth-start")).status, 429);
  const { result } = await h.start();
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(result.body.url.includes("private-client-secret"), false);
});

test("callback connects provider identity, not the browser-supplied ID", async () => {
  const h = harness();
  const { state } = await h.start({ body: { returnPath: "/groups/friends", discordUserId: "999" } });
  const result = await h.request("discord-oauth-callback", { query: { state, code: "code", discordUserId: "999" } });
  assert.equal(result.status, 303);
  assert.equal(result.headers.Location, `${origin}/groups/friends?discord=connected`);
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(h.values.get("user:aamer").discordUserId, id);
  assert.equal(h.values.has("discordlink:999"), false);
  assert.equal(JSON.stringify([...h.values.values()]).includes('"code"'), false);
});

test("switched sessions and invalid state never access the provider", async () => {
  const h = harness();
  const { state } = await h.start();
  for (const query of [{ state: [state, state], code: "code" }, { code: "code" }, { state: "invalid", code: "code" }]) {
    const result = await h.request("discord-oauth-callback", { query });
    assert.equal(result.headers.Location, `${origin}/dashboard?discord=invalid_state`);
  }
  const result = await h.request("discord-oauth-callback", { token: "session-b", query: { state, code: "code" } });
  assert.equal(result.headers.Location, `${origin}/dashboard?discord=invalid_state`);
  assert.equal(h.calls(), 0);
});

test("cancellation consumes state but preserves the connection and can retry", async () => {
  const h = harness();
  await h.store.connect({ username: "aamer", discordUserId: id });
  await h.store.preferences({ username: "aamer", enabled: false });
  const { state } = await h.start();
  const result = await h.request("discord-oauth-callback", { query: { state, error: "access_denied" } });
  assert.equal(result.headers.Location, `${origin}/dashboard?discord=cancelled`);
  assert.equal(h.values.get(`discordlink:${id}`).remindersEnabled, false);
  assert.equal(h.calls(), 0);
  const replay = await h.request("discord-oauth-callback", { query: { state, code: "code" } });
  assert.equal(replay.headers.Location, `${origin}/dashboard?discord=invalid_state`);
  assert.ok((await h.start()).state);
});

test("logout during provider requests blocks the final save", async () => {
  const h = harness({ fetchProfile: values => { values.delete("session:session-a"); return { id, username: "aamer", displayName: "Aamer", avatarHash: null }; } });
  const { state } = await h.start();
  const result = await h.request("discord-oauth-callback", { query: { state, code: "code" } });
  assert.equal(result.headers.Location, `${origin}/dashboard?discord=sign_in_required`);
  assert.equal(h.values.has(`discordlink:${id}`), false);
});

test("provider errors are sanitized and do not mutate connections", async () => {
  const h = harness({ fetchProfile: () => { throw new Error("private-client-secret code token"); } });
  const { state } = await h.start();
  const result = await h.request("discord-oauth-callback", { query: { state, code: "code" } });
  assert.equal(result.headers.Location, `${origin}/dashboard?discord=provider_unavailable`);
  assert.equal(JSON.stringify(result).includes("private-client-secret"), false);
  assert.equal(h.values.has(`discordlink:${id}`), false);
});

test("missing OAuth configuration leaves existing status and preferences usable", async () => {
  const h = harness({ env: { DISCORD_CLIENT_SECRET: "" } });
  await h.store.connect({ username: "aamer", discordUserId: id });
  const status = await h.request("discord-account-status");
  assert.deepEqual(status.body, { linked: true, remindersEnabled: true, profile: null, oauthAvailable: false });
  assert.equal((await h.start()).result.body.code, "not_configured");
  const update = await h.request("discord-account-preferences", { body: { enabled: false, discordUserId: "999" } });
  assert.equal(update.body.remindersEnabled, false);
  assert.equal(h.values.get(`discordlink:${id}`).remindersEnabled, false);
  assert.equal((await h.request("discord-account-unlink")).body.linked, false);
});

test("shared demo cannot mutate and signed-out users cannot read another connection", async () => {
  const h = harness();
  for (const action of ["discord-oauth-start", "discord-account-preferences", "discord-account-unlink"]) {
    assert.equal((await h.request(action, { token: "session-demo", body: { enabled: true } })).status, 403);
  }
  assert.equal((await h.request("discord-account-status", { token: null })).status, 401);
});

test("browser actions refuse method confusion and nonboolean preferences", async () => {
  const h = harness();
  assert.equal((await h.request("discord-account-status", { method: "POST" })).status, 405);
  await h.store.connect({ username: "aamer", discordUserId: id });
  assert.equal((await h.request("discord-account-preferences", { body: { enabled: "false" } })).status, 400);
  assert.equal((await h.request("other-action")).handled, false);
});
