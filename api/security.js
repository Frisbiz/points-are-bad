import { getValue, setValue, deleteValue } from "./_db.js";
import { normalizeUsername, normalizeEmail, validEmail, validUsername, hashPassword, verifyPassword, safeUser, createSession, getSession, destroySession, readSessionToken, setSessionCookie, clearSessionCookie } from "./_auth.js";
import { normName, parseMatchesToFixtures, mergeGlobalIntoGroup, regroupGlobalDoc } from "./_fixtureSync.js";
import { DEMO_GROUP_CODE, DEMO_WC_GROUP_CODE, DEMO_SHARED_USERNAME, DEMO_MEMBERS, makeDemoPick } from "./_demo.js";

async function fetchFromFD(matchday, season, competition = 'PL') {
  let url = `https://api.football-data.org/v4/competitions/${competition}/matches?season=${season}`;
  if (matchday != null) url += `&matchday=${matchday}`;
  const r = await fetch(url, { headers: { 'X-Auth-Token': process.env.VITE_FD_API_KEY } });
  if (!r.ok) { const err = new Error(`API error ${r.status}`); err.status = r.status; throw err; }
  const data = await r.json();
  return data.matches || [];
}

const OWNER_USERNAME = "faris";
const SITE_DEFAULTS = { defaultTheme: "dark", landingTheme: null };

// ── Rate limiting (Firestore-backed, reliable across serverless instances) ───
const RATE_LIMIT_WINDOW_MS = 60_000;      // 1 minute window
const RATE_LIMIT_MAX_AUTH   = 10;         // max login/register attempts per window
const RATE_LIMIT_MAX_UNLOCK = 30;         // looser limit for non-auth actions

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0] : req.socket?.remoteAddress || "unknown").trim();
}

async function checkRateLimit(ip, action, max = RATE_LIMIT_MAX_AUTH) {
  const key = `ratelimit:${action}:${ip}`;
  const now = Date.now();
  try {
    const record = await getValue(key);
    if (record && record.resetAt > now) {
      if (record.count >= max) return false;
      await setValue(key, { count: record.count + 1, resetAt: record.resetAt });
    } else {
      await setValue(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    return true;
  } catch {
    return true; // fail open rather than lock everyone out on DB error
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function bad(res, code, error) {
  return res.status(code).json({ error });
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makeFixturesFallback(gw, season = 2025) {
  const prefix = season !== 2025 ? `${season}-` : '';
  return Array.from({ length: 10 }, (_, i) => ({ id: `${prefix}gw${gw}-f${i}`, home: 'TBD', away: 'TBD', result: null, status: 'SCHEDULED' }));
}

function makeWCRounds() {
  return [
    { gw: 1, season: 2026, fixtures: [] },
    { gw: 2, season: 2026, fixtures: [] },
    { gw: 3, season: 2026, fixtures: [] },
    { gw: 4, season: 2026, fixtures: [] },
    { gw: 5, season: 2026, fixtures: [] },
    { gw: 6, season: 2026, fixtures: [] },
    { gw: 7, season: 2026, fixtures: [] },
    { gw: 8, season: 2026, fixtures: [] },
  ];
}

function getFixtureSeasonIndex(group, fixtureId) {
  const gws = (group.gameweeks || []).filter(gw => (gw.fixtures || []).some(f => f.id === fixtureId));
  if (!gws.length) return null;
  const gw = gws[0].gw;
  const season = gws[0].season || group.season || 2025;
  const ordered = (group.gameweeks || [])
    .filter(g => (g.season || group.season || 2025) === season)
    .sort((a, b) => a.gw - b.gw);
  return ordered.findIndex(g => g.gw === gw);
}

function computeDibsTurn(group, fixtureId) {
  const memberOrder = group.memberOrder || group.members || [];
  const n = memberOrder.length;
  if (n === 0) return null;
  const seasonIdx = getFixtureSeasonIndex(group, fixtureId);
  if (seasonIdx === null) return null;
  const skips = (group.dibsSkips || {})[fixtureId] || [];
  const preds = group.predictions || {};
  const rotStart = seasonIdx % n;
  const queue = [];
  for (let i = 0; i < n; i++) {
    const member = memberOrder[(rotStart + i) % n];
    if (!skips.includes(member)) queue.push(member);
  }
  for (const member of queue) {
    if (!/^\d+-\d+$/.test(preds[member]?.[fixtureId] || '')) return member;
  }
  return null;
}

function makeDemoWCGameweeks() {
  const F = (id, home, away, result, date, stage) => ({ id, home, away, result, status: result ? 'FINISHED' : 'SCHEDULED', date, stage });
  return [
    { gw:1, season:2026, fixtures:[
      F('wc-gw1-f1','Qatar','Ecuador','0-2','2026-06-12T16:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f2','England','Iran','6-2','2026-06-13T13:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f3','Argentina','Saudi Arabia','1-2','2026-06-13T16:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f4','France','Australia','4-1','2026-06-14T19:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f5','Morocco','Croatia','0-0','2026-06-14T10:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f6','Germany','Japan','1-2','2026-06-14T13:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f7','Brazil','Serbia','2-0','2026-06-15T19:00:00Z','GROUP_STAGE'),
      F('wc-gw1-f8','Portugal','Ghana','3-2','2026-06-15T16:00:00Z','GROUP_STAGE'),
    ]},
    { gw:2, season:2026, fixtures:[
      F('wc-gw2-f1','Netherlands','Ecuador','1-1','2026-06-19T19:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f2','England','USA','0-0','2026-06-19T19:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f3','Argentina','Mexico','2-0','2026-06-20T19:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f4','France','Denmark','2-1','2026-06-20T19:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f5','Belgium','Morocco','0-2','2026-06-21T19:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f6','Croatia','Canada','4-1','2026-06-21T16:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f7','Brazil','Switzerland','1-0','2026-06-22T13:00:00Z','GROUP_STAGE'),
      F('wc-gw2-f8','Portugal','Uruguay','2-0','2026-06-22T19:00:00Z','GROUP_STAGE'),
    ]},
    { gw:3, season:2026, fixtures:[
      F('wc-gw3-f1','Netherlands','Qatar','2-0','2026-06-26T19:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f2','England','Wales','3-0','2026-06-26T19:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f3','Argentina','Poland','2-0','2026-06-26T19:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f4','Tunisia','France','1-0','2026-06-25T19:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f5','Japan','Spain','2-1','2026-06-25T19:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f6','Morocco','Canada','2-1','2026-06-25T16:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f7','South Korea','Portugal','2-1','2026-06-26T15:00:00Z','GROUP_STAGE'),
      F('wc-gw3-f8','Cameroon','Brazil','1-0','2026-06-26T19:00:00Z','GROUP_STAGE'),
    ]},
    { gw:4, season:2026, fixtures:[
      F('wc-gw4-f1','Netherlands','Scotland','2-0','2026-07-05T15:00:00Z','LAST_32'),
      F('wc-gw4-f2','USA','Jamaica','3-0','2026-07-05T18:00:00Z','LAST_32'),
      F('wc-gw4-f3','Argentina','El Salvador','3-1','2026-07-06T15:00:00Z','LAST_32'),
      F('wc-gw4-f4','Australia','Indonesia','2-1','2026-07-06T18:00:00Z','LAST_32'),
      F('wc-gw4-f5','France','Algeria','3-0','2026-07-07T15:00:00Z','LAST_32'),
      F('wc-gw4-f6','Poland','Slovakia','2-1','2026-07-07T18:00:00Z','LAST_32'),
      F('wc-gw4-f7','England','Panama','4-1','2026-07-07T21:00:00Z','LAST_32'),
      F('wc-gw4-f8','Senegal','Ivory Coast','2-0','2026-07-08T15:00:00Z','LAST_32'),
      F('wc-gw4-f9','Japan','Vietnam','2-0','2026-07-08T18:00:00Z','LAST_32'),
      F('wc-gw4-f10','Croatia','Romania','3-1','2026-07-08T21:00:00Z','LAST_32'),
      F('wc-gw4-f11','Brazil','Venezuela','5-1','2026-07-09T15:00:00Z','LAST_32'),
      F('wc-gw4-f12','South Korea','Thailand','2-1','2026-07-09T18:00:00Z','LAST_32'),
      F('wc-gw4-f13','Morocco','Cameroon','1-0','2026-07-09T21:00:00Z','LAST_32'),
      F('wc-gw4-f14','Spain','Costa Rica','3-0','2026-07-10T15:00:00Z','LAST_32'),
      F('wc-gw4-f15','Portugal','Ghana','4-1','2026-07-10T18:00:00Z','LAST_32'),
      F('wc-gw4-f16','Switzerland','Hungary','2-1','2026-07-10T21:00:00Z','LAST_32'),
    ]},
    { gw:5, season:2026, fixtures:[
      F('wc-gw5-f1','Netherlands','USA','3-1','2026-07-13T15:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f2','Argentina','Australia','2-1','2026-07-13T19:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f3','France','Poland','3-1','2026-07-14T15:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f4','England','Senegal','3-0','2026-07-14T19:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f5','Japan','Croatia','1-1','2026-07-15T15:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f6','Brazil','South Korea','4-1','2026-07-15T19:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f7','Morocco','Spain','0-0','2026-07-16T15:00:00Z','ROUND_OF_16'),
      F('wc-gw5-f8','Portugal','Switzerland','6-1','2026-07-16T19:00:00Z','ROUND_OF_16'),
    ]},
    { gw:6, season:2026, fixtures:[
      F('wc-gw6-f1','Argentina','Netherlands','2-2','2026-07-18T19:00:00Z','QUARTER_FINAL'),
      F('wc-gw6-f2','Croatia','Brazil','1-1','2026-07-18T15:00:00Z','QUARTER_FINAL'),
      F('wc-gw6-f3','Morocco','Portugal','1-0','2026-07-19T19:00:00Z','QUARTER_FINAL'),
      F('wc-gw6-f4','England','France','1-2','2026-07-19T15:00:00Z','QUARTER_FINAL'),
    ]},
    { gw:7, season:2026, fixtures:[
      F('wc-gw7-f1','Argentina','Croatia','3-0','2026-07-22T19:00:00Z','SEMI_FINAL'),
      F('wc-gw7-f2','France','Morocco','2-0','2026-07-23T19:00:00Z','SEMI_FINAL'),
    ]},
    { gw:8, season:2026, fixtures:[
      F('wc-gw8-f1','Argentina','France',null,'2026-07-26T20:00:00Z','FINAL'),
    ]},
  ];
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

  if (action === 'member-names' && req.method === 'GET') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { groupId } = req.query || {};
    if (!groupId) return bad(res, 400, 'Missing groupId');
    const group = await getValue(`group:${groupId}`);
    if (!group) return bad(res, 404, 'Group not found');
    if (!(group.members || []).includes(username)) return bad(res, 403, 'Not a member');
    const members = group.members || [];
    const nameEntries = await Promise.all(members.map(async u => {
      const userDoc = await getValue(`user:${u}`);
      return [u, userDoc?.displayName || (u[0].toUpperCase() + u.slice(1))];
    }));
    return res.status(200).json({ names: Object.fromEntries(nameEntries) });
  }

  if (action === 'auth-logout' && req.method === 'POST') {
    const token = readSessionToken(req);
    await destroySession(token);
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === 'auth-register' && req.method === 'POST') {
    const ip = getClientIp(req);
    if (!await checkRateLimit(ip, 'auth-register')) return bad(res, 429, "Too many attempts. Try again in a minute.");
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
    const existingEmailOwner = await getValue(`useremail:${mail}`);
    if (existingEmailOwner && existingEmailOwner.username !== uname) {
      await deleteValue(`user:${uname}`);
      return bad(res, 409, "Email already in use");
    }
    await setValue(`useremail:${mail}`, { username: uname });
    const freshUser = await getValue(`user:${uname}`);
    if (!freshUser || normalizeEmail(freshUser.email) !== mail) {
      await deleteValue(`useremail:${mail}`);
      return bad(res, 409, "Username taken");
    }
    const { token, expiry } = await createSession(uname);
    setSessionCookie(res, token, expiry);
    return res.status(200).json({ user: safeUser(freshUser) });
  }

  if (action === 'auth-login' && req.method === 'POST') {
    const ip = getClientIp(req);
    if (!await checkRateLimit(ip, 'auth-login')) return bad(res, 429, "Too many attempts. Try again in a minute.");
    const { username, password } = req.body || {};
    const uname = normalizeUsername(username);
    if (!uname || !password) return bad(res, 400, "Missing fields");
    const user = await getValue(`user:${uname}`);
    if (!user) return bad(res, 401, "Invalid credentials");

    let ok = false;
    let migratedUser = user;

    if (user.passwordHash) {
      ok = await verifyPassword(String(password), user.passwordHash);
    } else if (user.password && user.password === String(password)) {
      ok = true;
      const passwordHash = await hashPassword(String(password));
      const { password: _oldPassword, ...rest } = user;
      migratedUser = { ...rest, passwordHash };
      await setValue(`user:${uname}`, migratedUser);
    }

    if (!ok) return bad(res, 401, "Invalid credentials");
    const { token, expiry } = await createSession(uname);
    setSessionCookie(res, token, expiry);
    return res.status(200).json({ user: safeUser(migratedUser) });
  }

  if (action === 'account-change-password' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return bad(res, 400, "Missing fields");
    if (String(newPassword).trim().length < 6) return bad(res, 400, "Password must be at least 6 characters.");
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, "User not found");
    const ok = user.passwordHash
      ? await verifyPassword(String(currentPassword), user.passwordHash)
      : user.password === String(currentPassword);
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
    const prevEmail = normalizeEmail(user.email || "");
    if (prevEmail === nextEmail) return res.status(200).json({ ok: true, email: nextEmail });
    const existing = await getValue(`useremail:${nextEmail}`);
    if (existing && existing.username !== username) return bad(res, 409, "Email already in use.");
    await setValue(`useremail:${nextEmail}`, { username });
    const claimed = await getValue(`useremail:${nextEmail}`);
    if (!claimed || claimed.username !== username) return bad(res, 409, "Email already in use.");
    await setValue(`user:${username}`, { ...user, email: nextEmail });
    const freshUser = await getValue(`user:${username}`);
    if (!freshUser || normalizeEmail(freshUser.email || '') !== nextEmail) {
      if (prevEmail) await setValue(`useremail:${prevEmail}`, { username });
      else await deleteValue(`useremail:${nextEmail}`);
      return bad(res, 500, "Failed to update email.");
    }
    if (prevEmail && prevEmail !== nextEmail) await deleteValue(`useremail:${prevEmail}`);
    return res.status(200).json({ ok: true, email: nextEmail });
  }

  if (action === 'unlock-theme' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { theme, badClicks } = req.body || {};
    if (!theme || typeof theme !== 'string') return bad(res, 400, 'Missing theme');
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, 'User not found');
    const unlockedThemes = Array.from(new Set([...(user.unlockedThemes || []), theme]));
    const updatedUser = { ...user, unlockedThemes, badClicks: typeof badClicks === 'number' ? badClicks : (user.badClicks || 0) };
    await setValue(`user:${username}`, updatedUser);
    return res.status(200).json({ ok: true, user: safeUser(updatedUser) });
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

  if (action === 'create-group' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { name, competition, setupGW, setupLimit, setupPickMode } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return bad(res, 400, 'Missing group name');
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, 'User not found');
    const id = Date.now().toString();
    let code = '';
    for (let i = 0; i < 10; i++) {
      const candidate = genCode();
      const taken = await getValue(`groupcode:${candidate}`);
      if (!taken) {
        code = candidate;
        break;
      }
    }
    if (!code) return bad(res, 500, 'Failed to generate group code');
    const isWC = competition === 'WC';
    const startGW = Math.max(1, Math.min(38, parseInt(setupGW) || 1));
    let group = isWC
      ? { id, name: trimmedName, code, creatorUsername: username, members: [username], admins: [username], gameweeks: makeWCRounds(), currentGW: 1, apiKey: '', season: 2026, competition: 'WC', hiddenGWs: [], scoreScope: 'all', draw11Limit: setupLimit || 'unlimited', mode: setupPickMode || 'open', memberOrder: [username], dibsSkips: {}, hiddenFixtures: [], adminLog: [] }
      : { id, name: trimmedName, code, creatorUsername: username, members: [username], admins: [username], gameweeks: Array.from({ length: 38 - startGW + 1 }, (_, i) => ({ gw: startGW + i, season: 2025, fixtures: makeFixturesFallback(startGW + i, 2025) })), currentGW: startGW, apiKey: '', season: 2025, hiddenGWs: [], scoreScope: 'all', draw11Limit: setupLimit || 'unlimited', mode: setupPickMode || 'open', memberOrder: [username], dibsSkips: {}, hiddenFixtures: [], adminLog: [] };
    try {
      const globalDoc = await getValue(isWC ? 'fixtures:WC:2026' : 'fixtures:PL:2025');
      if (globalDoc && (globalDoc.gameweeks || []).length) group = mergeGlobalIntoGroup(globalDoc, group);
    } catch {}
    await setValue(`group:${id}`, group);
    const claimedCode = await getValue(`groupcode:${code}`);
    if (claimedCode && claimedCode !== id) {
      await deleteValue(`group:${id}`);
      return bad(res, 409, 'Group code collision');
    }
    await setValue(`groupcode:${code}`, id);
    const nextUser = { ...user, groupIds: Array.from(new Set([...(user.groupIds || []), id])) };
    await setValue(`user:${username}`, nextUser);
    const freshUser = await getValue(`user:${username}`);
    if (!freshUser || !(freshUser.groupIds || []).includes(id)) {
      await deleteValue(`groupcode:${code}`);
      await deleteValue(`group:${id}`);
      return bad(res, 500, 'Failed to create group');
    }
    return res.status(200).json({ group, user: safeUser(freshUser) });
  }

  if (action === 'join-group' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (code.length !== 6) return bad(res, 400, 'Enter a 6-character code.');
    const id = await getValue(`groupcode:${code}`);
    if (!id) return bad(res, 404, 'Group not found');
    const group = await getValue(`group:${id}`);
    if (!group) return bad(res, 404, 'Group not found');
    if ((group.members || []).includes(username)) return bad(res, 400, "You're already in this group.");
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, 'User not found');
    const currentOrder = group.memberOrder || group.members || [];
    const nextGroup = { ...group, members: [...(group.members || []), username], memberOrder: currentOrder.includes(username) ? currentOrder : [...currentOrder, username] };
    const nextUser = { ...user, groupIds: Array.from(new Set([...(user.groupIds || []), id])) };
    await setValue(`group:${id}`, nextGroup);
    await setValue(`user:${username}`, nextUser);
    const freshUser = await getValue(`user:${username}`);
    if (!freshUser || !(freshUser.groupIds || []).includes(id)) {
      await setValue(`group:${id}`, group);
      return bad(res, 500, 'Failed to join group');
    }
    return res.status(200).json({ group: nextGroup, user: safeUser(freshUser) });
  }

  if (action === 'leave-group' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const groupId = req.body?.groupId;
    if (!groupId) return bad(res, 400, 'Missing groupId');
    const group = await getValue(`group:${groupId}`);
    if (!group) return bad(res, 404, 'Group not found');
    if (group.creatorUsername === username) return bad(res, 400, 'Creator cannot leave group');
    if (group.code === DEMO_GROUP_CODE || group.code === DEMO_WC_GROUP_CODE || group.code === 'DEMO2025' || group.code === 'WC2026') return bad(res, 400, 'Cannot leave demo group');
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, 'User not found');
    const nextUser = { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) };
    const nextGroup = { ...group, members: (group.members || []).filter(m => m !== username), admins: (group.admins || []).filter(a => a !== username), memberOrder: (group.memberOrder || []).filter(m => m !== username) };
    await setValue(`user:${username}`, nextUser);
    const freshUser = await getValue(`user:${username}`);
    if (!freshUser || (freshUser.groupIds || []).includes(groupId)) return bad(res, 500, 'Failed to leave group');
    await setValue(`group:${groupId}`, nextGroup);
    const freshGroup = await getValue(`group:${groupId}`);
    if (!freshGroup || (freshGroup.members || []).includes(username)) {
      await setValue(`user:${username}`, user);
      return bad(res, 500, 'Failed to leave group');
    }
    return res.status(200).json({ ok: true, user: safeUser(freshUser), group: freshGroup });
  }

  if (action === 'demo-bootstrap' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    if (username !== DEMO_SHARED_USERNAME) return bad(res, 403, 'Forbidden');
    const groupId = await getValue(`groupcode:${DEMO_GROUP_CODE}`);
    if (!groupId) return bad(res, 404, 'Demo group not found');
    const demoGroup = await getValue(`group:${groupId}`);
    if (!demoGroup) return bad(res, 404, 'Demo group not found');
    const wcGroupId = (await getValue(`groupcode:${DEMO_WC_GROUP_CODE}`)) || 'demo-wc-2026';
    await setValue(`groupcode:${DEMO_WC_GROUP_CODE}`, wcGroupId);
    const memberNames = DEMO_MEMBERS.map(m => m.username);
    const oldDemoNames = ['faris', 'damon', 'vall', 'aamer'];
    for (const old of oldDemoNames) {
      const doc = await getValue(`user:${old}`);
      if (!doc) continue;
      const cleaned = (doc.groupIds || []).filter(id => id !== groupId && id !== wcGroupId && id !== 'demo-wc-2026');
      if (cleaned.length !== (doc.groupIds || []).length) await setValue(`user:${old}`, { ...doc, groupIds: cleaned });
    }
    const wcPredictions = {};
    memberNames.forEach(u => { wcPredictions[u] = {}; });
    const wcGameweeks = makeDemoWCGameweeks();
    wcGameweeks.forEach(({ gw, fixtures }) => {
      fixtures.forEach(fixture => {
        DEMO_MEMBERS.forEach(member => {
          if (fixture.result) wcPredictions[member.username][fixture.id] = makeDemoPick(member.username, fixture, gw, 2026);
          else if (member.username !== DEMO_SHARED_USERNAME) wcPredictions[member.username][fixture.id] = makeDemoPick(member.username, fixture, gw, 2026);
        });
      });
    });
    const wcGroup = {
      id: wcGroupId, name: 'World Cup 2026', code: DEMO_WC_GROUP_CODE,
      creatorUsername: DEMO_SHARED_USERNAME, competition: 'WC', season: 2026,
      currentGW: 8, scoreScope: 'all', draw11Limit: 'unlimited', mode: 'normal',
      hiddenGWs: [], hiddenFixtures: [], adminLog: [], dibsSkips: {},
      lastAutoSync: Date.now(), members: memberNames, memberOrder: memberNames,
      admins: [DEMO_SHARED_USERNAME], gameweeks: wcGameweeks, predictions: wcPredictions,
    };
    await setValue(`group:${wcGroupId}`, wcGroup);
    for (const member of DEMO_MEMBERS) {
      const key = `user:${member.username}`;
      const existing = await getValue(key);
      const nextUser = { ...(existing || {}), username: member.username, displayName: member.displayName, email: existing?.email || '', groupIds: Array.from(new Set([...(existing?.groupIds || []), groupId, wcGroupId])) };
      delete nextUser.password;
      await setValue(key, nextUser);
    }
    const now = new Date();
    const nextPredictions = { ...(demoGroup.predictions || {}) };
    memberNames.forEach(u => { nextPredictions[u] = { ...(nextPredictions[u] || {}) }; });
    const nextGroup = { ...demoGroup, members: memberNames, memberOrder: memberNames, admins: Array.from(new Set([...(demoGroup.admins || []), DEMO_SHARED_USERNAME])), predictions: nextPredictions };
    (nextGroup.gameweeks || []).forEach(gwObj => {
      const season = gwObj.season || nextGroup.season || 2025;
      (gwObj.fixtures || []).forEach(fixture => {
        const fixtureDone = !!fixture.result || fixture.status === 'POSTPONED' || fixture.status === 'FINISHED';
        const isOpen = !fixtureDone && fixture.status !== 'IN_PLAY' && fixture.status !== 'PAUSED' && (!fixture.date || new Date(fixture.date) > now);
        DEMO_MEMBERS.forEach(member => {
          if (member.username === DEMO_SHARED_USERNAME) return;
          if (fixtureDone || isOpen) nextPredictions[member.username][fixture.id] = makeDemoPick(member.username, fixture, gwObj.gw, season);
        });
        if (isOpen) delete nextPredictions[DEMO_SHARED_USERNAME][fixture.id];
        else if (fixtureDone && !nextPredictions[DEMO_SHARED_USERNAME][fixture.id]) nextPredictions[DEMO_SHARED_USERNAME][fixture.id] = makeDemoPick(DEMO_SHARED_USERNAME, fixture, gwObj.gw, season);
      });
    });
    await setValue(`group:${groupId}`, nextGroup);
    const refreshedDemoUser = await getValue(`user:${DEMO_SHARED_USERNAME}`);
    return res.status(200).json({ groupId, group: nextGroup, user: safeUser(refreshedDemoUser) });
  }

  if (action === 'group-user' && req.method === 'POST') {
    const { groupId, payload = {} } = req.body || {};
    if (!groupId) return bad(res, 400, 'Missing groupId');
    const username = await requireUser(req, res);
    if (!username) return;
    const group = await getValue(`group:${groupId}`);
    if (!group) return bad(res, 404, 'Group not found');
    if (!(group.members || []).includes(username)) return bad(res, 403, 'Forbidden');
    const groupKey = `group:${groupId}`;

    if (payload.type === 'save-prediction') {
      const fixtureId = payload.fixtureId;
      const value = String(payload.value || '');
      if (!fixtureId || !/^\d+-\d+$/.test(value)) return bad(res, 400, 'Invalid prediction');
      if (group.mode === 'dibs') {
        const freshTurn = computeDibsTurn(group, fixtureId);
        if (freshTurn !== username) return bad(res, 400, 'Not your turn');
        const takenFresh = Object.entries(group.predictions || {})
          .filter(([u]) => u !== username)
          .some(([, picks]) => picks?.[fixtureId] === value);
        if (takenFresh) return bad(res, 400, 'Prediction already taken');
      }
      const predictions = { ...(group.predictions || {}) };
      predictions[username] = { ...(predictions[username] || {}), [fixtureId]: value };
      const next = { ...group, predictions };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'lock-picks') {
      const season = Number(payload.season || group.season || 2025);
      const gw = Number(payload.gw || group.currentGW || 1);
      if (!gw) return bad(res, 400, 'Missing gw');
      const pl = group.picksLocked || {};
      const ul = pl[username] || {};
      const sl = ul[season] || {};
      const next = { ...group, picksLocked: { ...pl, [username]: { ...ul, [season]: { ...sl, [gw]: true } } } };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'auto-sync-fixtures') {
      // Any member can trigger a fixture sync - this refreshes global fixture data and applies to group
      const targetGW = Number(payload.gw || group.currentGW || 1);
      const isWC = (group.competition || 'PL') === 'WC';
      const seas = group.season || 2025;
      const globalKey = isWC ? `fixtures:WC:2026` : `fixtures:PL:${seas}`;
      let globalDoc = await getValue(globalKey) || { season: seas, updatedAt: 0, gameweeks: [] };
      const existingGWNums = new Set((globalDoc.gameweeks || []).map(g => g.gw));
      const missingPast = Array.from({ length: targetGW - 1 }, (_, i) => i + 1).some(n => !existingGWNums.has(n));
      try {
        if (missingPast) {
          const allMatches = await fetchFromFD(null, isWC ? 2026 : seas, isWC ? 'WC' : 'PL');
          if (!allMatches.length) return res.status(200).json({ group, updated: false });
          if (isWC) {
            const byGW = {};
            allMatches.forEach(m => { const gw = m.matchday; if (!byGW[gw]) byGW[gw] = []; byGW[gw].push(m); });
            const otherGWs = (globalDoc.gameweeks || []).filter(g => !byGW[g.gw]);
            const newGWs = Object.entries(byGW).map(([gw, ms]) => ({ gw: Number(gw), fixtures: parseMatchesToFixtures(ms, Number(gw), 'WC') }));
            globalDoc = { ...globalDoc, updatedAt: Date.now(), gameweeks: [...otherGWs, ...newGWs] };
          } else {
            let updated = { ...globalDoc };
            const byGW = {};
            allMatches.forEach(m => { const gw = m.matchday; if (!byGW[gw]) byGW[gw] = []; byGW[gw].push(m); });
            Object.entries(byGW).forEach(([gw, ms]) => { updated = regroupGlobalDoc(updated, Number(gw), parseMatchesToFixtures(ms, Number(gw), 'PL')); });
            globalDoc = updated;
          }
        } else {
          const matches = await fetchFromFD(targetGW, isWC ? 2026 : seas, isWC ? 'WC' : 'PL');
          if (!matches.length) return res.status(200).json({ group, updated: false });
          const apiFixtures = parseMatchesToFixtures(matches, targetGW, isWC ? 'WC' : 'PL');
          globalDoc = isWC
            ? { ...globalDoc, updatedAt: Date.now(), gameweeks: [...(globalDoc.gameweeks || []).filter(g => g.gw !== targetGW), { gw: targetGW, fixtures: apiFixtures }] }
            : regroupGlobalDoc(globalDoc, targetGW, apiFixtures);
        }
      } catch (e) { return bad(res, e.status || 500, e.message); }
      await setValue(globalKey, globalDoc);
      if (globalDoc.updatedAt <= (group.lastAutoSync || 0)) return res.status(200).json({ group, updated: false });
      const merged = mergeGlobalIntoGroup(globalDoc, group);
      if (!merged) return res.status(200).json({ group, updated: false });
      const next = { ...merged, lastAutoSync: globalDoc.updatedAt };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next, updated: true });
    }

    return bad(res, 400, 'Unsupported group user action');
  }

  if (action === 'group-admin' && req.method === 'POST') {
    const { groupId, payload = {} } = req.body || {};
    if (!groupId) return bad(res, 400, 'Missing groupId');
    const auth = await requireAdmin(req, res, groupId);
    if (!auth) return;
    const { username, group } = auth;
    const groupKey = `group:${groupId}`;

    if (payload.type === 'create-backup') {
      const now = Date.now();
      const id = String(now);
      const { backups: _omit, ...snapshot } = group;
      await setValue(`backup:${groupId}:${id}`, { groupId, createdAt: now, createdBy: username, snapshot });
      const next = { ...group, backups: [{ id, createdAt: now, createdBy: username }, ...(group.backups || [])].slice(0, 5) };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next, backupId: id });
    }

    if (payload.type === 'delete-backup') {
      const id = payload.id;
      if (!id) return bad(res, 400, 'Missing backup id');
      await deleteValue(`backup:${groupId}:${id}`);
      const next = { ...group, backups: (group.backups || []).filter(b => b.id !== id) };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'restore-backup') {
      const id = payload.id;
      if (!id) return bad(res, 400, 'Missing backup id');
      const bk = await getValue(`backup:${groupId}:${id}`);
      if (!bk?.snapshot) return bad(res, 404, 'Backup not found');
      const next = { ...bk.snapshot, backups: group.backups };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'delete-group') {
      if (group.creatorUsername !== username) return bad(res, 403, 'Only creator can delete group');
      if (group.code === 'DEMO2025' || group.code === 'WC2026' || group.code === DEMO_GROUP_CODE || group.code === DEMO_WC_GROUP_CODE) return bad(res, 400, 'Demo group cannot be deleted');
      const previousUsers = {};
      for (const member of group.members || []) {
        const user = await getValue(`user:${member}`);
        if (user) previousUsers[member] = user;
      }
      await deleteValue(groupKey);
      await deleteValue(`groupcode:${group.code}`);
      for (const member of group.members || []) {
        const user = previousUsers[member];
        if (user) await setValue(`user:${member}`, { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) });
      }
      for (const member of Object.keys(previousUsers)) {
        const freshUser = await getValue(`user:${member}`);
        if (!freshUser || (freshUser.groupIds || []).includes(groupId)) {
          await setValue(groupKey, group);
          await setValue(`groupcode:${group.code}`, groupId);
          for (const [name, doc] of Object.entries(previousUsers)) await setValue(`user:${name}`, doc);
          return bad(res, 500, 'Failed to delete group');
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (payload.type === 'save-name') {
      const name = String(payload.name || '').trim();
      if (!name) return bad(res, 400, 'Missing group name');
      const next = { ...group, name };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'save-scope') {
      const next = { ...group, scoreScope: payload.value };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'save-11-limit') {
      const next = { ...group, draw11Limit: payload.value };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'toggle-hidden-gw') {
      const gw = Number(payload.gw);
      if (!gw) return bad(res, 400, 'Missing gw');
      const hidden = group.hiddenGWs || [];
      const isHidden = hidden.includes(gw);
      const next = { ...group, hiddenGWs: isHidden ? hidden.filter(x => x !== gw) : [...hidden, gw] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'toggle-hidden-fixture') {
      const fixtureId = payload.fixtureId;
      if (!fixtureId) return bad(res, 400, 'Missing fixtureId');
      const hidden = group.hiddenFixtures || [];
      const isHidden = hidden.includes(fixtureId);
      const next = { ...group, hiddenFixtures: isHidden ? hidden.filter(x => x !== fixtureId) : [...hidden, fixtureId] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'dibs-skip') {
      const playerId = payload.playerId;
      const fixtureId = payload.fixtureId;
      if (!playerId || !fixtureId) return bad(res, 400, 'Missing player or fixture');
      const current = (group.dibsSkips || {})[fixtureId] || [];
      if (current.includes(playerId)) return res.status(200).json({ group });
      const fixture = ((group.gameweeks || []).flatMap(gw => gw.fixtures || [])).find(f => f.id === fixtureId);
      const entry = { id: Date.now(), at: Date.now(), by: username, action: 'dibs-skip', for: playerId, fixture: fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId, gw: group.currentGW };
      const next = { ...group, dibsSkips: { ...(group.dibsSkips || {}), [fixtureId]: [...current, playerId] }, adminLog: [...(group.adminLog || []), entry] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'set-result') {
      const fixtureId = payload.fixtureId;
      const value = String(payload.value || '');
      if (!fixtureId || !/^\d+-\d+$/.test(value)) return bad(res, 400, 'Invalid result');
      const fixture = ((group.gameweeks || []).flatMap(gw => gw.fixtures || [])).find(f => f.id === fixtureId);
      const oldVal = fixture?.result || null;
      const entry = { id: Date.now(), at: Date.now(), by: username, action: 'result', fixture: fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId, gw: group.currentGW, old: oldVal, new: value };
      const next = {
        ...group,
        gameweeks: (group.gameweeks || []).map(gw => ({ ...gw, fixtures: (gw.fixtures || []).map(f => f.id === fixtureId ? { ...f, result: value } : f) })),
        adminLog: oldVal === value ? (group.adminLog || []) : [...(group.adminLog || []), entry]
      };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'clear-result') {
      const fixtureId = payload.fixtureId;
      if (!fixtureId) return bad(res, 400, 'Missing fixtureId');
      const fixture = ((group.gameweeks || []).flatMap(gw => gw.fixtures || [])).find(f => f.id === fixtureId);
      const entry = { id: Date.now(), at: Date.now(), by: username, action: 'result-clear', fixture: fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId, gw: group.currentGW, old: fixture?.result || null, new: null };
      const next = {
        ...group,
        gameweeks: (group.gameweeks || []).map(gw => ({ ...gw, fixtures: (gw.fixtures || []).map(f => f.id === fixtureId ? { ...f, result: null } : f) })),
        adminLog: [...(group.adminLog || []), entry]
      };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'edit-pick') {
      const targetUsername = payload.username;
      const fixtureId = payload.fixtureId;
      const value = payload.value;
      const oldVal = payload.oldValue ?? null;
      if (!targetUsername || !fixtureId || !value) return bad(res, 400, 'Missing edit-pick payload');
      const fixture = ((group.gameweeks || []).flatMap(gw => gw.fixtures || [])).find(f => f.id === fixtureId);
      const predictions = { ...(group.predictions || {}) };
      predictions[targetUsername] = { ...(predictions[targetUsername] || {}), [fixtureId]: value };
      const entry = { id: Date.now(), at: Date.now(), by: username, for: targetUsername, fixture: fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId, gw: payload.gw ?? group.currentGW, old: oldVal, new: value };
      const next = { ...group, predictions, adminLog: [...(group.adminLog || []), entry] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'rename-member') {
      const targetUsername = payload.username;
      const oldName = payload.oldName;
      const newName = String(payload.newName || '').trim();
      if (!targetUsername || !oldName || !newName) return bad(res, 400, 'Missing rename payload');
      const targetUser = await getValue(`user:${targetUsername}`);
      if (!targetUser) return bad(res, 404, 'User not found');
      await setValue(`user:${targetUsername}`, { ...targetUser, displayName: newName });
      const freshUser = await getValue(`user:${targetUsername}`);
      if (!freshUser || String(freshUser.displayName || '').trim() !== newName) return bad(res, 500, 'Failed to rename member');
      const entry = { id: Date.now(), at: Date.now(), by: username, action: 'rename', for: targetUsername, old: oldName, new: newName };
      const next = { ...group, adminLog: [...(group.adminLog || []), entry] };
      await setValue(groupKey, next);
      const freshGroup = await getValue(groupKey);
      if (!freshGroup || (freshGroup.adminLog || []).length < (next.adminLog || []).length) {
        await setValue(`user:${targetUsername}`, targetUser);
        return bad(res, 500, 'Failed to rename member');
      }
      return res.status(200).json({ group: freshGroup });
    }

    if (payload.type === 'save-api-settings') {
      const next = { ...group, apiKey: String(payload.apiKey || '').trim(), season: Number(payload.season) || group.season || 2025 };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'start-new-season') {
      const season = Number(payload.season);
      if (!season) return bad(res, 400, 'Missing season');
      const next = { ...group, season, gameweeks: [], hiddenGWs: [], hiddenFixtures: [], predictions: {}, results: {} };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'backfill-gws') {
      const existing = group.gameweeks || [];
      const season = group.season || 2025;
      const maxGw = existing.reduce((m,g)=>Math.max(m,g.gw||0),0);
      const toAdd = Array.from({ length: Math.max(0, 38 - maxGw) }, (_,i)=>({ gw:maxGw+i+1, season, fixtures:[] }));
      const next = { ...group, gameweeks: [...existing, ...toAdd] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'backfill-all-gws') {
      const season = group.season || 2025;
      const existing = new Map((group.gameweeks || []).map(g => [g.gw, g]));
      const gameweeks = Array.from({ length: 38 }, (_,i)=> existing.get(i+1) || ({ gw:i+1, season, fixtures:[] }));
      const next = { ...group, gameweeks };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'sync-all-dates') {
      const matchesRes = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/fixtures?season=${group.season || 2025}&competition=${group.competition || 'PL'}`);
      if (!matchesRes.ok) return bad(res, matchesRes.status, `API error ${matchesRes.status}`);
      const matchesData = await matchesRes.json();
      const matches = matchesData.matches || [];
      if (!matches.length) return res.status(200).json({ group, updated: 0 });
      const dateByTeams = {};
      matches.forEach(m => {
        const home = String(m.homeTeam?.name || m.homeTeam?.shortName || '').trim();
        const away = String(m.awayTeam?.name || m.awayTeam?.shortName || '').trim();
        if (m.utcDate && home && away) dateByTeams[`${home}|${away}`] = new Date(m.utcDate).toISOString();
      });
      let updated = 0;
      const next = {
        ...group,
        gameweeks: (group.gameweeks || []).map(gw => ({
          ...gw,
          fixtures: (gw.fixtures || []).map(f => {
            if (f.date) return f;
            const d = dateByTeams[`${f.home}|${f.away}`];
            if (d) { updated++; return { ...f, date: d }; }
            return f;
          })
        }))
      };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next, updated });
    }

    if (payload.type === 'delete-gw') {
      const gwToClear = Number(payload.gw);
      if (!gwToClear) return bad(res, 400, 'Missing gw');
      const seas = group.season || 2025;
      const gwObj = (group.gameweeks || []).find(gw => gw.gw === gwToClear && (gw.season || seas) === seas);
      const fixtureIds = new Set((gwObj?.fixtures || []).map(f => f.id));
      const isWC = (group.competition || 'PL') === 'WC';
      const prefix = isWC ? 'wc-' : seas !== 2025 ? `${seas}-` : '';
      const freshFixtures = isWC ? [] : Array.from({ length: 10 }, (_, i) => ({ id: `${prefix}gw${gwToClear}-f${i}`, home: 'TBD', away: 'TBD', result: null, status: 'SCHEDULED' }));
      const preds = { ...(group.predictions || {}) };
      Object.keys(preds).forEach(u => {
        const up = { ...preds[u] };
        fixtureIds.forEach(id => { delete up[id]; });
        preds[u] = up;
      });
      const next = { ...group, gameweeks: (group.gameweeks || []).map(gw => gw.gw === gwToClear && (gw.season || seas) === seas ? { ...gw, fixtures: freshFixtures } : gw), predictions: preds };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'remove-gw') {
      const gwToRemove = Number(payload.gw);
      if (!gwToRemove) return bad(res, 400, 'Missing gw');
      const seas = group.season || 2025;
      const gwObj = (group.gameweeks || []).find(gw => gw.gw === gwToRemove && (gw.season || seas) === seas);
      const fixtureIds = new Set((gwObj?.fixtures || []).map(f => f.id));
      const preds = { ...(group.predictions || {}) };
      Object.keys(preds).forEach(u => {
        const up = { ...preds[u] };
        fixtureIds.forEach(id => { delete up[id]; });
        preds[u] = up;
      });
      const remaining = (group.gameweeks || []).filter(gw => !(gw.gw === gwToRemove && (gw.season || seas) === seas));
      const newCurrentGW = remaining.filter(gw => (gw.season || seas) === seas).sort((a, b) => b.gw - a.gw)[0]?.gw || 1;
      const next = { ...group, gameweeks: remaining, predictions: preds, currentGW: newCurrentGW };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
    }

    if (payload.type === 'sync-fixtures') {
      const currentGW = Number(payload.gw || group.currentGW || 1);
      const isWC = (group.competition || 'PL') === 'WC';
      const seas = group.season || 2025;
      const comp = isWC ? 'WC' : 'PL';
      let matches;
      try { matches = await fetchFromFD(currentGW, isWC ? 2026 : seas, comp); }
      catch (e) { return bad(res, e.status || 500, e.message); }
      if (!matches.length) return bad(res, 404, 'No matches found for this round.');
      const apiFixtures = parseMatchesToFixtures(matches, currentGW, comp);
      const globalKey = isWC ? `fixtures:WC:2026` : `fixtures:PL:${seas}`;
      const existingGlobal = await getValue(globalKey) || { season: isWC ? 2026 : seas, updatedAt: 0, gameweeks: [] };
      const updatedGlobal = isWC
        ? { ...existingGlobal, updatedAt: Date.now(), gameweeks: [...(existingGlobal.gameweeks || []).filter(g => g.gw !== currentGW), { gw: currentGW, fixtures: apiFixtures }] }
        : regroupGlobalDoc(existingGlobal, currentGW, apiFixtures);
      await setValue(globalKey, updatedGlobal);
      const next = mergeGlobalIntoGroup(updatedGlobal, group);
      const finished = apiFixtures.filter(f => f.result).length;
      next.adminLog = [...(next.adminLog || []), { id: Date.now(), at: Date.now(), by: username, action: 'api-sync', gw: currentGW, fixtures: apiFixtures.length, results: finished }];
      await setValue(groupKey, next);
      return res.status(200).json({ group: next, fixtures: apiFixtures.length, results: finished });
    }

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
      const next = { ...group, members: (group.members || []).filter(x => x !== target), admins: (group.admins || []).filter(x => x !== target), memberOrder: (group.memberOrder || []).filter(x => x !== target) };
      await setValue(groupKey, next);
      const freshGroup = await getValue(groupKey);
      if (!freshGroup || (freshGroup.members || []).includes(target)) return bad(res, 500, 'Failed to kick member');
      const user = await getValue(`user:${target}`);
      if (user) {
        await setValue(`user:${target}`, { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) });
        const freshUser = await getValue(`user:${target}`);
        if (!freshUser || (freshUser.groupIds || []).includes(groupId)) {
          await setValue(groupKey, group);
          return bad(res, 500, 'Failed to kick member');
        }
      }
      return res.status(200).json({ group: freshGroup || next });
    }

    return bad(res, 400, 'Unsupported group admin action');
  }

  return bad(res, 405, 'Method not allowed');
}
