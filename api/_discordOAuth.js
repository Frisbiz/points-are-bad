import { createHash } from "node:crypto";

const MESSAGES = {
  not_configured: "Discord connection is not available yet.",
  sign_in_required: "Sign in to PAB and try again.",
  invalid_state: "This connection attempt expired. Please try again.",
  cancelled: "Discord connection was cancelled.",
  provider_unavailable: "Discord is unavailable. Please try again.",
  already_linked: "This Discord account is already connected to another PAB account.",
  disconnect_first: "Disconnect your current Discord account before connecting a different one.",
  failed: "Could not update your Discord connection. Please try again.",
};

export function discordFailure(code, status = 400) {
  return Object.assign(new Error(MESSAGES[code] || MESSAGES.failed), { code, status });
}

export function discordOrigin(env) {
  try {
    const url = new URL(env.APP_URL);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

export function oauthConfig(env) {
  const origin = discordOrigin(env);
  if (!origin || !/^\d{17,20}$/.test(env.DISCORD_CLIENT_ID || "") || !env.DISCORD_CLIENT_SECRET?.trim()) return null;
  return { origin, clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET, redirectUri: `${origin}/api/security?action=discord-oauth-callback` };
}

export function safeDiscordReturnPath(path) {
  if (path === "/dashboard") return path;
  if (typeof path !== "string" || !/^\/groups\/[^/?#\\]+$/.test(path)) return "/dashboard";
  try {
    const id = decodeURIComponent(path.slice(8));
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return "/dashboard";
    return `/groups/${encodeURIComponent(id)}`;
  } catch { return "/dashboard"; }
}

export function hashDiscordValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createDiscordAuthorization(config, state) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "identify", state }).toString();
  return url.toString();
}

export async function fetchDiscordProfile({ config, code, fetcher = fetch }) {
  let accessToken;
  try {
    const response = await fetcher("https://discord.com/api/v10/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw discordFailure("provider_unavailable");
    const token = await response.json();
    if (typeof token?.access_token !== "string" || !token.access_token || token.access_token.length > 4096 || String(token.token_type).toLowerCase() !== "bearer") throw discordFailure("provider_unavailable");
    accessToken = token.access_token;
    const identity = await fetcher("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
    if (!identity.ok) throw discordFailure("provider_unavailable");
    const profile = await identity.json();
    if (!/^\d{17,20}$/.test(profile?.id || "") || typeof profile.username !== "string" || !profile.username.trim() || profile.username.length > 128 || (profile.global_name != null && (typeof profile.global_name !== "string" || profile.global_name.length > 128)) || (profile.avatar != null && (typeof profile.avatar !== "string" || !/^[a-zA-Z0-9_]{1,128}$/.test(profile.avatar)))) throw discordFailure("provider_unavailable");
    return { id: profile.id, username: profile.username, displayName: profile.global_name || profile.username, avatarHash: profile.avatar || null };
  } catch {
    throw discordFailure("provider_unavailable", 502);
  } finally {
    if (accessToken) {
      try {
        await fetcher("https://discord.com/api/v10/oauth2/token/revoke", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token: accessToken, token_type_hint: "access_token" }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch { console.warn("Temporary Discord authorization revocation failed"); }
    }
  }
}
