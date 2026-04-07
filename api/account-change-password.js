import { getValue, setValue } from "./_db.js";
import { readSessionToken, getSession, verifyPassword, hashPassword } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = readSessionToken(req);
  const session = await getSession(token);
  if (!session?.username) return res.status(401).json({ error: "Unauthorized" });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Missing fields" });
  if (String(newPassword).trim().length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const user = await getValue(`user:${session.username}`);
  if (!user?.passwordHash) return res.status(400).json({ error: "Account not ready" });

  const ok = await verifyPassword(String(currentPassword), user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Current password incorrect." });

  const passwordHash = await hashPassword(String(newPassword));
  await setValue(`user:${session.username}`, { ...user, passwordHash });
  return res.status(200).json({ ok: true });
}
