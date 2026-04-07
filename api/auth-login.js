import { getValue } from "./_db.js";
import { normalizeUsername, verifyPassword, safeUser, createSession, setSessionCookie } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password } = req.body || {};
  const uname = normalizeUsername(username);
  if (!uname || !password) return res.status(400).json({ error: "Missing fields" });

  const user = await getValue(`user:${uname}`);
  if (!user?.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await verifyPassword(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const { token, expiry } = await createSession(uname);
  setSessionCookie(res, token, expiry);
  return res.status(200).json({ user: safeUser(user) });
}
