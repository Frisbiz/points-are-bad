import { getValue, setValue, deleteValue } from "./_db.js";
import { readSessionToken, getSession, normalizeEmail, validEmail } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = readSessionToken(req);
  const session = await getSession(token);
  if (!session?.username) return res.status(401).json({ error: "Unauthorized" });

  const { email } = req.body || {};
  const nextEmail = normalizeEmail(email);
  if (!validEmail(nextEmail)) return res.status(400).json({ error: "Invalid email." });

  const user = await getValue(`user:${session.username}`);
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = await getValue(`useremail:${nextEmail}`);
  if (existing && existing.username !== session.username) return res.status(409).json({ error: "Email already in use." });

  const prevEmail = normalizeEmail(user.email || "");
  await setValue(`useremail:${nextEmail}`, { username: session.username });
  await setValue(`user:${session.username}`, { ...user, email: nextEmail });
  if (prevEmail && prevEmail !== nextEmail) await deleteValue(`useremail:${prevEmail}`);

  return res.status(200).json({ ok: true, email: nextEmail });
}
