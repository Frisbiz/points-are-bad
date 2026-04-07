import { getValue, setValue } from "./_db.js";
import { readSessionToken, getSession } from "./_auth.js";

const OWNER_USERNAME = "faris";
const KEY = "site:preferences";
const DEFAULTS = { defaultTheme: "dark", landingTheme: null };

export default async function handler(req, res) {
  if (req.method === "GET") {
    const prefs = await getValue(KEY);
    return res.status(200).json({ value: prefs && typeof prefs === 'object' ? { ...DEFAULTS, ...prefs } : DEFAULTS });
  }

  if (req.method === "POST") {
    const token = readSessionToken(req);
    const session = await getSession(token);
    if (!session?.username || session.username !== OWNER_USERNAME) return res.status(403).json({ error: "Forbidden" });

    const incoming = req.body || {};
    const next = {
      defaultTheme: typeof incoming.defaultTheme === 'string' ? incoming.defaultTheme : DEFAULTS.defaultTheme,
      landingTheme: incoming.landingTheme === null || typeof incoming.landingTheme === 'string' ? incoming.landingTheme : DEFAULTS.landingTheme,
    };
    await setValue(KEY, next);
    return res.status(200).json({ value: next });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
