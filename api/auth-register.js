import { getValue, setValue } from "./_db.js";
import { normalizeUsername, normalizeEmail, validEmail, validUsername, hashPassword, safeUser, createSession, setSessionCookie } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password, email } = req.body || {};
  const uname = normalizeUsername(username);
  const mail = normalizeEmail(email);

  if (!uname || !password || !mail) return res.status(400).json({ error: "Missing fields" });
  if (!validUsername(uname)) return res.status(400).json({ error: "Invalid username" });
  if (!validEmail(mail)) return res.status(400).json({ error: "Invalid email" });
  if (String(password).trim().length < 6) return res.status(400).json({ error: "Password too short" });

  const existingUser = await getValue(`user:${uname}`);
  if (existingUser) return res.status(409).json({ error: "Username taken" });

  const existingEmail = await getValue(`useremail:${mail}`);
  if (existingEmail) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await hashPassword(String(password));
  const user = {
    username: uname,
    displayName: uname[0].toUpperCase() + uname.slice(1),
    email: mail,
    groupIds: [],
    passwordHash,
  };

  await setValue(`user:${uname}`, user);
  await setValue(`useremail:${mail}`, { username: uname });

  const { token, expiry } = await createSession(uname);
  setSessionCookie(res, token, expiry);
  return res.status(200).json({ user: safeUser(user) });
}
