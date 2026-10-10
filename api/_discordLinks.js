import { discordFailure, hashDiscordValue, safeDiscordReturnPath } from "./_discordOAuth.js";

export function createDiscordLinkStore({ db, docKey, now = Date.now }) {
  const data = db.collection("data");
  const ref = key => data.doc(docKey(key));
  const read = async (transaction, key) => (await transaction.get(ref(key))).data()?.value;
  const write = (transaction, key, value) => transaction.set(ref(key), { value, updatedAt: now() });
  const ensureMember = username => { if (!/^[a-z0-9_-]+$/.test(username || "") || username === "demo") throw discordFailure("failed", 403); };
  const ensureId = id => { if (typeof id !== "string" || !/^\d{1,20}$/.test(id)) throw discordFailure("failed"); };

  async function owned(transaction, username) {
    const user = await read(transaction, `user:${username}`);
    if (!user) throw discordFailure("sign_in_required", 401);
    const id = user.discordUserId;
    if (!id) return { user, link: null };
    ensureId(id);
    const link = await read(transaction, `discordlink:${id}`);
    if (link && (link.username !== username || link.discordUserId !== id)) throw discordFailure("failed", 409);
    return { user, link };
  }

  return {
    async status(username) {
      return db.runTransaction(async transaction => {
        const user = await read(transaction, `user:${username}`);
        if (!user?.discordUserId || !/^\d{1,20}$/.test(user.discordUserId)) return { linked: false };
        const link = await read(transaction, `discordlink:${user.discordUserId}`);
        if (link?.username !== username || link.discordUserId !== user.discordUserId) return { linked: false };
        return {
          linked: true, remindersEnabled: link.remindersEnabled !== false,
          profile: link.discordUsername ? { username: link.discordUsername, displayName: link.discordDisplayName || link.discordUsername, avatarHash: link.discordAvatarHash || null } : null,
        };
      });
    },

    async connect({ username, discordUserId, profile, sessionToken, nonce }) {
      ensureMember(username);
      ensureId(discordUserId);
      return db.runTransaction(async transaction => {
        const [user, existing, index, session, consumed] = await Promise.all([
          read(transaction, `user:${username}`), read(transaction, `discordlink:${discordUserId}`), read(transaction, "discord-links-index"),
          sessionToken ? read(transaction, `session:${sessionToken}`) : null,
          nonce ? read(transaction, `discord-link-token:${nonce.value}`) : null,
        ]);
        if (!user) throw discordFailure("sign_in_required", 401);
        if (sessionToken && (session?.username !== username || !(session.expiry > now()))) throw discordFailure("sign_in_required", 401);
        if (nonce && (consumed || !(nonce.expiresAt > now()))) throw discordFailure("invalid_state", 409);
        if (existing && (existing.username !== username || existing.discordUserId !== discordUserId)) throw discordFailure("already_linked", 409);
        if (user.discordUserId && user.discordUserId !== discordUserId) throw discordFailure("disconnect_first", 409);
        const link = {
          discordUserId, username, remindersEnabled: existing?.remindersEnabled !== false,
          linkedAt: existing?.linkedAt ?? now(), updatedAt: now(),
          ...(existing?.discordUsername ? { discordUsername: existing.discordUsername, discordDisplayName: existing.discordDisplayName || existing.discordUsername, discordAvatarHash: existing.discordAvatarHash || null } : {}),
          ...(profile ? { discordUsername: profile.username, discordDisplayName: profile.displayName, discordAvatarHash: profile.avatarHash || null } : {}),
        };
        write(transaction, `user:${username}`, { ...user, discordUserId });
        write(transaction, `discordlink:${discordUserId}`, link);
        write(transaction, "discord-links-index", [...new Set([...(Array.isArray(index) ? index : []), discordUserId])]);
        if (nonce) write(transaction, `discord-link-token:${nonce.value}`, { usedAt: now(), exp: nonce.expiresAt });
        return link;
      });
    },

    async preferences({ username, enabled }) {
      ensureMember(username);
      if (typeof enabled !== "boolean") throw discordFailure("failed");
      return db.runTransaction(async transaction => {
        const { user, link } = await owned(transaction, username);
        if (!link) throw discordFailure("failed", 404);
        const next = { ...link, remindersEnabled: enabled, updatedAt: now() };
        write(transaction, `discordlink:${user.discordUserId}`, next);
        return next;
      });
    },

    async unlink(username) {
      ensureMember(username);
      return db.runTransaction(async transaction => {
        const { user } = await owned(transaction, username);
        if (!user.discordUserId) return { linked: false };
        const index = await read(transaction, "discord-links-index");
        const { discordUserId, ...nextUser } = user;
        write(transaction, `user:${username}`, nextUser);
        transaction.delete(ref(`discordlink:${discordUserId}`));
        write(transaction, "discord-links-index", (Array.isArray(index) ? index : []).filter(id => id !== discordUserId));
        return { linked: false };
      });
    },

    async putAttempt({ state, username, sessionToken, returnPath }) {
      ensureMember(username);
      if (!/^[a-zA-Z0-9_-]{43}$/.test(state) || !sessionToken) throw discordFailure("invalid_state");
      return db.runTransaction(async transaction => {
        const key = `discordoauth:${hashDiscordValue(state)}`;
        if (await read(transaction, key)) throw discordFailure("invalid_state");
        write(transaction, key, { kind: "discord-oauth", username, sessionHash: hashDiscordValue(sessionToken), returnPath: safeDiscordReturnPath(returnPath), expiresAt: now() + 600_000, consumedAt: null });
      });
    },

    async consumeAttempt({ state, username, sessionToken }) {
      if (typeof state !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(state) || !sessionToken) throw discordFailure("invalid_state");
      return db.runTransaction(async transaction => {
        const key = `discordoauth:${hashDiscordValue(state)}`;
        const attempt = await read(transaction, key);
        if (!attempt || attempt.kind !== "discord-oauth" || attempt.username !== username || attempt.sessionHash !== hashDiscordValue(sessionToken) || !(attempt.expiresAt > now()) || attempt.consumedAt != null) throw discordFailure("invalid_state");
        write(transaction, key, { ...attempt, consumedAt: now() });
        return attempt;
      });
    },

    async cleanupAttempts() {
      try {
        const expired = await data.where("value.kind", "==", "discord-oauth").where("value.expiresAt", "<=", now()).limit(25).get();
        if (!expired.docs.length) return;
        const batch = db.batch();
        for (const document of expired.docs) batch.delete(document.ref);
        await batch.commit();
      } catch { console.warn("Expired Discord authorization cleanup failed"); }
    },
  };
}
