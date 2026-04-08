import { getValue, setValue, deleteValue } from "./_db.js";
import { normalizeUsername, normalizeEmail, validEmail, validUsername, hashPassword, verifyPassword, safeUser, createSession, getSession, destroySession, readSessionToken, setSessionCookie, clearSessionCookie } from "./_auth.js";

const OWNER_USERNAME = "faris";
const SITE_DEFAULTS = { defaultTheme: "dark", landingTheme: null };

function bad(res, code, error) {
  return res.status(code).json({ error });
}

async function requireUser(req, res) {
  const token = readSessionToken(req);
  const session = await getSession(token);
  if (!session?.username) {
    bad(res, 401, "Unauthorized");
    return null;
  }
  return session.username;
}

async function requireAdmin(req, res, groupId) {
  const username = await requireUser(req, res);
  if (!username) return null;
  const group = await getValue(`group:${groupId}`);
  if (!group) {
    bad(res, 404, "Group not found");
    return null;
  }
  const isCreator = group.creatorUsername === username;
  const isAdmin = (group.admins || []).includes(username);
  if (!isCreator && !isAdmin) {
    bad(res, 403, "Forbidden");
    return null;
  }
  return { username, group };
}

export default async function handler(req, res) {
  const action = req.method === 'GET' ? req.query.action : req.body?.action;
  if (!action) return bad(res, 400, "Missing action");

  if (action === 'auth-session' && req.method === 'GET') {
    const token = readSessionToken(req);
    const session = await getSession(token);
    if (!session?.username) return res.status(200).json({ user: null });
    const user = await getValue(`user:${session.username}`);
    return res.status(200).json({ user: safeUser(user) });
  }

  if (action === 'auth-logout' && req.method === 'POST') {
    const token = readSessionToken(req);
    await destroySession(token);
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === 'auth-register' && req.method === 'POST') {
    const { username, password, email } = req.body || {};
    const uname = normalizeUsername(username);
    const mail = normalizeEmail(email);
    if (!uname || !password || !mail) return bad(res, 400, "Missing fields");
    if (!validUsername(uname)) return bad(res, 400, "Invalid username");
    if (!validEmail(mail)) return bad(res, 400, "Invalid email");
    if (String(password).trim().length < 6) return bad(res, 400, "Password too short");
    if (await getValue(`user:${uname}`)) return bad(res, 409, "Username taken");
    if (await getValue(`useremail:${mail}`)) return bad(res, 409, "Email already in use");
    const passwordHash = await hashPassword(String(password));
    const user = { username: uname, displayName: uname[0].toUpperCase() + uname.slice(1), email: mail, groupIds: [], passwordHash };
    await setValue(`user:${uname}`, user);
    await setValue(`useremail:${mail}`, { username: uname });
    const { token, expiry } = await createSession(uname);
    setSessionCookie(res, token, expiry);
    return res.status(200).json({ user: safeUser(user) });
  }

  if (action === 'auth-login' && req.method === 'POST') {
    const { username, password } = req.body || {};
    const uname = normalizeUsername(username);
    if (!uname || !password) return bad(res, 400, "Missing fields");
    const user = await getValue(`user:${uname}`);
    if (!user?.passwordHash) return bad(res, 401, "Invalid credentials");
    const ok = await verifyPassword(String(password), user.passwordHash);
    if (!ok) return bad(res, 401, "Invalid credentials");
    const { token, expiry } = await createSession(uname);
    setSessionCookie(res, token, expiry);
    return res.status(200).json({ user: safeUser(user) });
  }

  if (action === 'account-change-password' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return bad(res, 400, "Missing fields");
    if (String(newPassword).trim().length < 6) return bad(res, 400, "Password must be at least 6 characters.");
    const user = await getValue(`user:${username}`);
    if (!user?.passwordHash) return bad(res, 400, "Account not ready");
    const ok = await verifyPassword(String(currentPassword), user.passwordHash);
    if (!ok) return bad(res, 400, "Current password incorrect.");
    const passwordHash = await hashPassword(String(newPassword));
    await setValue(`user:${username}`, { ...user, passwordHash });
    return res.status(200).json({ ok: true });
  }

  if (action === 'account-change-email' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { email } = req.body || {};
    const nextEmail = normalizeEmail(email);
    if (!validEmail(nextEmail)) return bad(res, 400, "Invalid email.");
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, "User not found");
    const existing = await getValue(`useremail:${nextEmail}`);
    if (existing && existing.username !== username) return bad(res, 409, "Email already in use.");
    const prevEmail = normalizeEmail(user.email || "");
    await setValue(`useremail:${nextEmail}`, { username });
    await setValue(`user:${username}`, { ...user, email: nextEmail });
    if (prevEmail && prevEmail !== nextEmail) await deleteValue(`useremail:${prevEmail}`);
    return res.status(200).json({ ok: true, email: nextEmail });
  }

  if (action === 'site-preferences') {
    if (req.method === 'GET') {
      const prefs = await getValue('site:preferences');
      return res.status(200).json({ value: prefs && typeof prefs === 'object' ? { ...SITE_DEFAULTS, ...prefs } : SITE_DEFAULTS });
    }
    if (req.method === 'POST') {
      const username = await requireUser(req, res);
      if (!username) return;
      if (username !== OWNER_USERNAME) return bad(res, 403, 'Forbidden');
      const incoming = req.body || {};
      const next = {
        defaultTheme: typeof incoming.defaultTheme === 'string' ? incoming.defaultTheme : SITE_DEFAULTS.defaultTheme,
        landingTheme: incoming.landingTheme === null || typeof incoming.landingTheme === 'string' ? incoming.landingTheme : SITE_DEFAULTS.landingTheme,
      };
      await setValue('site:preferences', next);
      return res.status(200).json({ value: next });
    }
  }

  if (action === 'group-admin' && req.method === 'POST') {
    const { groupId, payload = {} } = req.body || {};
    if (!groupId) return bad(res, 400, 'Missing groupId');
    const auth = await requireAdmin(req, res, groupId);
    if (!auth) return;
    const { username, group } = auth;
    const groupKey = `group:${groupId}`;

    if (payload.type === 'toggle-admin') {
      const target = payload.username;
      if (!target) return bad(res, 400, 'Missing target username');
      if (group.creatorUsername === target) return bad(res, 400, 'Cannot modify creator admin status');
      const admins = group.admins || [];
      const isNowAdmin = !admins.includes(target);
      const entry = { id: Date.now(), at: Date.now(), by: username, action: isNowAdmin ? 'make-admin' : 'remove-admin', for: target };
      const next = { ...group, admins: isNowAdmin ? [...admins, target] : admins.filter(x => x !== target), adminLog: [...(group.adminLog || []), entry] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'kick') {
      const target = payload.username;
      if (!target) return bad(res, 400, 'Missing target username');
      if (group.creatorUsername === target) return bad(res, 400, 'Cannot kick creator');
      const next = { ...group, members: (group.members || []).filter(x => x !== target), admins: (group.admins || []).filter(x => x !== target) };
      await setValue(groupKey, next);
      const user = await getValue(`user:${target}`);
      if (user) await setValue(`user:${target}`, { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) });
      return res.status(200).json({ group: next });
    }

    return bad(res, 400, 'Unsupported group admin action');
  }

  return bad(res, 405, 'Method not allowed');
}
