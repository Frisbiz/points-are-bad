import bcrypt from "bcryptjs";
import { getValue, setValue, deleteValue } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: "Missing fields" });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }
  if (String(newPassword).trim().length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  try {
    const tokenKey = `reset:${token}`;
    const record = await getValue(tokenKey);
    if (!record) return res.status(400).json({ error: "Invalid or expired reset link" });

    const { username, expiry } = record;
    if (Date.now() > expiry) {
      await deleteValue(tokenKey);
      return res.status(400).json({ error: "Reset link has expired" });
    }

    const user = await getValue(`user:${username}`);
    if (!user) return res.status(400).json({ error: "User not found" });

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    // Strip any stale plaintext `password` field so legacy users are fully migrated
    // to bcrypt after a reset (mirrors account-change-password).
    const { password: _legacyPlaintext, ...userWithoutPlaintext } = user;
    await setValue(`user:${username}`, { ...userWithoutPlaintext, passwordHash });
    await deleteValue(tokenKey);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("reset-password error", e);
    return res.status(500).json({ error: "Reset failed" });
  }
}
