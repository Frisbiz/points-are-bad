import { getValue } from "./_db.js";
import { readSessionToken, getSession, safeUser } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const token = readSessionToken(req);
  const session = await getSession(token);
  if (!session?.username) return res.status(200).json({ user: null });
  const user = await getValue(`user:${session.username}`);
  return res.status(200).json({ user: safeUser(user) });
}
