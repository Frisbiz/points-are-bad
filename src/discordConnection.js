const MESSAGES = {
  connected: "Discord connected.",
  not_configured: "Discord connection is not available yet.",
  sign_in_required: "Sign in to PAB and try again.",
  invalid_state: "This connection attempt expired. Please try again.",
  cancelled: "Discord connection was cancelled.",
  provider_unavailable: "Discord is unavailable. Please try again.",
  already_linked: "This Discord account is already connected to another PAB account.",
  disconnect_first: "Disconnect your current Discord account before connecting a different one.",
  failed: "Could not update your Discord connection. Please try again.",
};

export function readDiscordConnectionResult(search) {
  const results = new URLSearchParams(search).getAll("discord");
  return results.length === 1 && Object.hasOwn(MESSAGES, results[0]) ? results[0] : null;
}

export function discordResultMessage(code) { return MESSAGES[code] || MESSAGES.failed; }

export async function requestDiscordAccount(action, payload, { fetcher = fetch, signal } = {}) {
  const status = action === "discord-account-status";
  if (!["discord-account-status", "discord-oauth-start", "discord-account-preferences", "discord-account-unlink"].includes(action)) throw new Error(MESSAGES.failed);
  try {
    const response = await fetcher(status ? `/api/security?action=${action}` : "/api/security", {
      method: status ? "GET" : "POST", signal,
      ...(status ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, action }) }),
    });
    const data = await response.json();
    if (!response.ok) {
      const code = response.status === 401 ? "sign_in_required" : Object.hasOwn(MESSAGES, data?.code) ? data.code : "failed";
      throw Object.assign(new Error(discordResultMessage(code)), { code });
    }
    if (action === "discord-oauth-start") {
      const url = new URL(data?.url);
      if (url.origin !== "https://discord.com" || url.pathname !== "/oauth2/authorize" || url.username || url.password || url.searchParams.get("scope") !== "identify") throw new Error(MESSAGES.failed);
      return { url: url.toString() };
    }
    if (typeof data?.linked !== "boolean" || typeof data.oauthAvailable !== "boolean" || (data.linked && typeof data.remindersEnabled !== "boolean")) throw new Error(MESSAGES.failed);
    if (!data.linked) return { linked: false, oauthAvailable: data.oauthAvailable };
    let profile = null;
    if (data.profile != null) {
      if (typeof data.profile.username !== "string" || !data.profile.username || data.profile.username.length > 128 || typeof data.profile.displayName !== "string" || data.profile.displayName.length > 128) throw new Error(MESSAGES.failed);
      profile = { username: data.profile.username, displayName: data.profile.displayName, avatarHash: typeof data.profile.avatarHash === "string" ? data.profile.avatarHash : null };
    }
    return { linked: true, oauthAvailable: data.oauthAvailable, remindersEnabled: data.remindersEnabled, profile };
  } catch (error) {
    if (error.name === "AbortError") throw error;
    if (Object.hasOwn(MESSAGES, error.code)) throw error;
    throw Object.assign(new Error(MESSAGES.failed), { code: "failed" });
  }
}
