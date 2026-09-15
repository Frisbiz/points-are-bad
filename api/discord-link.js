import { db, docKey } from "./_db.js";
import { getSession, readSessionToken } from "./_auth.js";
import { verifyDiscordLinkToken } from "../shared/discordReminders.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const session = await getSession(readSessionToken(req));
  if (!session?.username) return res.status(401).json({ error: "Sign in to PAB before linking Discord." });

  const payload = verifyDiscordLinkToken(req.body?.token, process.env.PAB_DISCORD_SHARED_SECRET);
  if (!payload) return res.status(400).json({ error: "This Discord link is invalid or has expired. Run /pab link again." });

  try {
    await db.runTransaction(async transaction => {
      const data = db.collection("data");
      const consumedRef = data.doc(docKey(`discord-link-token:${payload.nonce}`));
      const linkRef = data.doc(docKey(`discordlink:${payload.discordUserId}`));
      const userRef = data.doc(docKey(`user:${session.username}`));
      const indexRef = data.doc(docKey("discord-links-index"));
      const [consumedSnap, userSnap, indexSnap, linkSnap] = await Promise.all([
        transaction.get(consumedRef),
        transaction.get(userRef),
        transaction.get(indexRef),
        transaction.get(linkRef),
      ]);
      if (consumedSnap.exists) throw Object.assign(new Error("Link already used"), { status: 409 });
      const user = userSnap.data()?.value;
      if (!user) throw Object.assign(new Error("PAB account not found"), { status: 404 });
      const existingLink = linkSnap.data()?.value;
      const previousOwnerRef = existingLink?.username && existingLink.username !== session.username
        ? data.doc(docKey(`user:${existingLink.username}`))
        : null;
      const previousOwnerSnap = previousOwnerRef ? await transaction.get(previousOwnerRef) : null;
      const ids = new Set(indexSnap.data()?.value || []);
      ids.add(String(payload.discordUserId));
      if (user.discordUserId && user.discordUserId !== String(payload.discordUserId)) {
        ids.delete(String(user.discordUserId));
        transaction.delete(data.doc(docKey(`discordlink:${user.discordUserId}`)));
      }
      const now = Date.now();
      transaction.set(consumedRef, { value: { usedAt: now, exp: payload.exp }, updatedAt: now });
      transaction.set(linkRef, { value: { discordUserId: String(payload.discordUserId), username: session.username, remindersEnabled: true, linkedAt: now }, updatedAt: now });
      transaction.set(userRef, { value: { ...user, discordUserId: String(payload.discordUserId) }, updatedAt: now });
      const previousOwner = previousOwnerSnap?.data()?.value;
      if (previousOwnerRef && previousOwner?.discordUserId === String(payload.discordUserId)) {
        const { discordUserId: _removed, ...nextPreviousOwner } = previousOwner;
        transaction.set(previousOwnerRef, { value: nextPreviousOwner, updatedAt: now });
      }
      transaction.set(indexRef, { value: [...ids], updatedAt: now });
    });
    return res.status(200).json({ linked: true, username: session.username });
  } catch (error) {
    console.error("discord-link failed", error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Could not link Discord right now." });
  }
}
