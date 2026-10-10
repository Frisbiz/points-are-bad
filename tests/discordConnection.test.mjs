import test from "node:test";
import assert from "node:assert/strict";
import { requestDiscordAccount, readDiscordConnectionResult, discordResultMessage } from "../src/discordConnection.js";

test("callback notices only accept one known result code", () => {
  assert.equal(readDiscordConnectionResult("?discord=connected"), "connected");
  for (const query of ["?discord=<script>", "?discord=connected&discord=cancelled", "?discord[]=connected", "?x=connected", ""]) assert.equal(readDiscordConnectionResult(query), null);
  assert.equal(discordResultMessage("connected"), "Discord connected.");
  assert.equal(discordResultMessage("unknown-private-error"), "Could not update your Discord connection. Please try again.");
});

test("status is read with GET and returns only public connection fields", async () => {
  let request;
  const result = await requestDiscordAccount("discord-account-status", undefined, { fetcher: async (url, options) => {
    request = { url, options };
    return Response.json({ linked: true, oauthAvailable: true, remindersEnabled: false, profile: { username: "aamer", displayName: "Aamer", avatarHash: null, access_token: "secret" }, private: "secret" });
  } });
  assert.equal(request.url, "/api/security?action=discord-account-status");
  assert.equal(request.options.method, "GET");
  assert.deepEqual(result, { linked: true, oauthAvailable: true, remindersEnabled: false, profile: { username: "aamer", displayName: "Aamer", avatarHash: null } });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("mutations use POST JSON and rejected updates have safe messages", async () => {
  let body;
  await assert.rejects(requestDiscordAccount("discord-account-preferences", { enabled: false }, { fetcher: async (_url, options) => {
    body = JSON.parse(options.body);
    assert.equal(options.method, "POST");
    return Response.json({ error: "secret exception" }, { status: 401 });
  } }), { code: "sign_in_required", message: "Sign in to PAB and try again." });
  assert.deepEqual(body, { action: "discord-account-preferences", enabled: false });
});

test("authorization response cannot send the user to another site or grant broader scope", async () => {
  for (const url of ["https://evil.test", "http://discord.com/oauth2/authorize?scope=identify", "https://discord.com/oauth2/authorize?scope=identify+email"]) {
    await assert.rejects(requestDiscordAccount("discord-oauth-start", {}, { fetcher: async () => Response.json({ url }) }));
  }
  const result = await requestDiscordAccount("discord-oauth-start", {}, { fetcher: async () => Response.json({ url: "https://discord.com/oauth2/authorize?scope=identify&state=s" }) });
  assert.ok(result.url.startsWith("https://discord.com/"));
});

test("malformed and failed responses never look like disconnected success", async () => {
  for (const fetcher of [async () => new Response("invalid", { status: 200 }), async () => Response.json({ linked: "false", oauthAvailable: true }), async () => { throw new Error("private network error"); }]) {
    await assert.rejects(requestDiscordAccount("discord-account-status", undefined, { fetcher }), { message: "Could not update your Discord connection. Please try again." });
  }
});

test("aborted requests stay aborted rather than producing an in-app error", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestDiscordAccount("discord-account-status", undefined, { signal: controller.signal, fetcher: async (_url, options) => { options.signal.throwIfAborted(); } }), { name: "AbortError" });
});
