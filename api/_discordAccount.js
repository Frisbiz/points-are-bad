import { randomBytes } from "node:crypto";
import { createDiscordAuthorization, discordFailure, discordOrigin, fetchDiscordProfile, oauthConfig, safeDiscordReturnPath } from "./_discordOAuth.js";

const METHODS = { "discord-account-status": "GET", "discord-oauth-start": "POST", "discord-oauth-callback": "GET", "discord-account-preferences": "POST", "discord-account-unlink": "POST" };
const RESULT_CODES = new Set(["connected", "not_configured", "sign_in_required", "invalid_state", "cancelled", "provider_unavailable", "already_linked", "disconnect_first", "failed"]);

export function createDiscordAccountHandler({ env = process.env, store, getSession, readSessionToken, fetchProfile = fetchDiscordProfile, randomState = () => randomBytes(32).toString("base64url"), rateLimit = async () => true }) {
  return async function handle(req, res, action) {
    if (!Object.hasOwn(METHODS, action)) return false;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method !== METHODS[action]) {
      res.setHeader("Allow", METHODS[action]);
      res.status(405).json({ code: "failed", error: "This request method is not supported." });
      return true;
    }
    const origin = discordOrigin(env);
    const config = oauthConfig(env);
    let returnPath = "/dashboard";
    const redirect = code => {
      const query = new URLSearchParams({ discord: RESULT_CODES.has(code) ? code : "failed" });
      res.redirect(303, `${origin || ""}${safeDiscordReturnPath(returnPath)}?${query}`);
    };
    try {
      const token = readSessionToken(req);
      const session = await getSession(token);
      if (!session?.username) throw discordFailure("sign_in_required", 401);
      if (action === "discord-account-status") {
        res.status(200).json({ ...await store.status(session.username), oauthAvailable: !!config });
        return true;
      }
      if (!origin) throw discordFailure("not_configured", 503);
      if (req.method === "POST" && req.headers.origin !== origin) throw discordFailure("failed", 403);
      if (session.username === "demo") throw discordFailure("failed", 403);
      if (action === "discord-account-preferences") {
        await store.preferences({ username: session.username, enabled: req.body?.enabled });
        res.status(200).json({ ...await store.status(session.username), oauthAvailable: !!config });
      } else if (action === "discord-account-unlink") {
        res.status(200).json({ ...await store.unlink(session.username), oauthAvailable: !!config });
      } else if (action === "discord-oauth-start") {
        if (!config) throw discordFailure("not_configured", 503);
        if (!await rateLimit(session.username)) throw discordFailure("failed", 429);
        const state = randomState();
        await store.putAttempt({ state, username: session.username, sessionToken: token, returnPath: req.body?.returnPath });
        await store.cleanupAttempts();
        res.status(200).json({ url: createDiscordAuthorization(config, state) });
      } else {
        if (!config) throw discordFailure("not_configured", 503);
        const query = req.query || {};
        if (typeof query.state !== "string" || (query.code != null && typeof query.code !== "string") || (query.error != null && typeof query.error !== "string")) throw discordFailure("invalid_state");
        const attempt = await store.consumeAttempt({ state: query.state, username: session.username, sessionToken: token });
        returnPath = attempt.returnPath;
        if (query.error) throw discordFailure(query.error === "access_denied" ? "cancelled" : "provider_unavailable");
        if (!query.code || query.code.length > 4096) throw discordFailure("invalid_state");
        let profile;
        try { profile = await fetchProfile({ config, code: query.code }); } catch { throw discordFailure("provider_unavailable", 502); }
        const current = await getSession(token);
        if (current?.username !== session.username) throw discordFailure("sign_in_required", 401);
        await store.connect({ username: session.username, discordUserId: profile.id, profile, sessionToken: token });
        redirect("connected");
      }
    } catch (error) {
      const code = RESULT_CODES.has(error.code) ? error.code : "failed";
      if (action === "discord-oauth-callback") redirect(code);
      else {
        const safe = discordFailure(code, error.status || 500);
        res.status(safe.status).json({ code, error: safe.message });
      }
    }
    return true;
  };
}
