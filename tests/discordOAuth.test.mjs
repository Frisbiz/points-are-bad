import test from "node:test";
import assert from "node:assert/strict";
import { oauthConfig, safeDiscordReturnPath, createDiscordAuthorization, fetchDiscordProfile, hashDiscordValue } from "../api/_discordOAuth.js";

const env = { APP_URL: "https://www.pab.wtf", DISCORD_CLIENT_ID: "123456789012345678", DISCORD_CLIENT_SECRET: "private-secret" };
const config = () => oauthConfig(env);

test("uses canonical callback and identity-only authorization", () => {
  const c = config();
  assert.equal(c.redirectUri, "https://www.pab.wtf/api/security?action=discord-oauth-callback");
  const url = new URL(createDiscordAuthorization(c, "state"));
  assert.equal(url.origin, "https://discord.com");
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state");
  assert.equal(url.toString().includes("private-secret"), false);
});

test("missing or unsafe configuration cannot start authorization", () => {
  for (const changes of [{ DISCORD_CLIENT_SECRET: "" }, { APP_URL: "http://www.pab.wtf" }, { APP_URL: "https://user:pass@www.pab.wtf" }, { APP_URL: "https://www.pab.wtf/path" }, { APP_URL: "https://www.pab.wtf?x=1" }]) {
    assert.equal(oauthConfig({ ...env, ...changes }), null);
  }
});

test("only local dashboard and safe group paths are returned", () => {
  for (const path of ["https://evil.test", "//evil.test", "/groups/a%2Fb", "/groups/a%5Cb", "/groups/..", "/groups/%2e%2e", "/dashboard?redirect=x", "/signin", null]) {
    assert.equal(safeDiscordReturnPath(path), "/dashboard");
  }
  assert.equal(safeDiscordReturnPath("/groups/friends"), "/groups/friends");
  assert.equal(hashDiscordValue("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

function provider({ token = { access_token: "temporary-token", token_type: "Bearer" }, profile = { id: "123456789012345678", username: "aamer", global_name: "Aamer", avatar: null }, failAt, revokeFails = false } = {}) {
  const requests = [];
  return { requests, fetcher: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/revoke")) {
      if (revokeFails) throw new Error("private failure");
      return new Response("", { status: 200 });
    }
    if (url === failAt) return new Response("provider secret", { status: 500 });
    return Response.json(url.endsWith("/@me") ? profile : token);
  } };
}

test("exchanges code privately, verifies identity and revokes temporary access", async () => {
  const p = provider();
  const result = await fetchDiscordProfile({ config: config(), code: "code", fetcher: p.fetcher });
  assert.deepEqual(result, { id: "123456789012345678", username: "aamer", displayName: "Aamer", avatarHash: null });
  assert.equal(JSON.stringify(result).includes("temporary-token"), false);
  assert.equal(p.requests[0].options.body.get("client_secret"), "private-secret");
  assert.equal(p.requests[0].options.body.get("redirect_uri"), config().redirectUri);
  assert.equal(p.requests[1].options.headers.Authorization, "Bearer temporary-token");
  assert.equal(p.requests[2].options.body.get("token"), "temporary-token");
  assert.ok(p.requests.every(r => r.options.signal instanceof AbortSignal));
});

test("malformed identities and tokens fail without exposing provider information", async () => {
  for (const args of [{ profile: { id: "other", username: "aamer" } }, { profile: { id: "123456789012345678", username: "" } }, { token: { access_token: "secret", token_type: "not-bearer" } }, { failAt: "https://discord.com/api/v10/users/@me" }]) {
    const p = provider(args);
    await assert.rejects(fetchDiscordProfile({ config: config(), code: "code", fetcher: p.fetcher }), { code: "provider_unavailable", message: "Discord is unavailable. Please try again." });
  }
});

test("revocation failure does not erase a verified identity", async () => {
  const p = provider({ revokeFails: true });
  assert.equal((await fetchDiscordProfile({ config: config(), code: "code", fetcher: p.fetcher })).username, "aamer");
});

test("network and invalid JSON failures become fixed errors", async () => {
  for (const fetcher of [async () => { throw new Error("access token secret"); }, async () => new Response("not json", { status: 200 })]) {
    await assert.rejects(fetchDiscordProfile({ config: config(), code: "code", fetcher }), { code: "provider_unavailable", message: "Discord is unavailable. Please try again." });
  }
});
