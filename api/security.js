import { getValue, setValue, deleteValue } from "./_db.js";
import { normalizeUsername, normalizeEmail, validEmail, validUsername, hashPassword, verifyPassword, safeUser, createSession, getSession, destroySession, readSessionToken, setSessionCookie, clearSessionCookie } from "./_auth.js";
import { normName, parseMatchesToFixtures, mergeGlobalIntoGroup, regroupGlobalDoc } from "./_fixtureSync.js";

const OWNER_USERNAME = "faris";
const SITE_DEFAULTS = { defaultTheme: "dark", landingTheme: null };

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

  if (action === 'create-group' && req.method === 'POST') {
    const username = await requireUser(req, res);
    if (!username) return;
    const { name, competition, setupGW, setupLimit, setupPickMode } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return bad(res, 400, 'Missing group name');
    const user = await getValue(`user:${username}`);
    if (!user) return bad(res, 404, 'User not found');
    const id = Date.now().toString();
    let code = genCode();
    for (let i = 0; i < 10; i++) {
      const taken = await getValue(`groupcode:${code}`);
      if (!taken) break;
      code = genCode();
    }
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
    await setValue(`groupcode:${code}`, id);
    const nextUser = { ...user, groupIds: [...(user.groupIds || []), id] };
    await setValue(`user:${username}`, nextUser);
    return res.status(200).json({ group, user: safeUser(nextUser) });
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
    const nextUser = { ...user, groupIds: [...(user.groupIds || []), id] };
    await setValue(`group:${id}`, nextGroup);
    await setValue(`user:${username}`, nextUser);
    return res.status(200).json({ group: nextGroup, user: safeUser(nextUser) });
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
      if (group.code === 'DEMO2025' || group.code === 'WC2026') return bad(res, 400, 'Demo group cannot be deleted');
      await deleteValue(groupKey);
      await deleteValue(`groupcode:${group.code}`);
      for (const member of group.members || []) {
        const user = await getValue(`user:${member}`);
        if (user) await setValue(`user:${member}`, { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) });
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

    if (payload.type === 'log-rename') {
      const targetUsername = payload.username;
      const oldName = payload.oldName;
      const newName = payload.newName;
      if (!targetUsername || !oldName || !newName) return bad(res, 400, 'Missing rename payload');
      const entry = { id: Date.now(), at: Date.now(), by: username, action: 'rename', for: targetUsername, old: oldName, new: newName };
      const next = { ...group, adminLog: [...(group.adminLog || []), entry] };
      await setValue(groupKey, next);
      return res.status(200).json({ group: next });
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
      const matchesRes = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/fixtures?matchday=${currentGW}&season=${isWC ? 2026 : seas}&competition=${comp}`);
      if (!matchesRes.ok) return bad(res, matchesRes.status, `API error ${matchesRes.status}`);
      const matchesData = await matchesRes.json();
      const matches = matchesData.matches || [];
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
