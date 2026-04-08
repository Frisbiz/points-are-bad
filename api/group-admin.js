import { getValue, setValue, deleteValue } from "./_db.js";
import { readSessionToken, getSession } from "./_auth.js";

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
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const { action, groupId, payload = {} } = req.body || {};
  if (!action || !groupId) return bad(res, 400, "Missing action or groupId");

  const auth = await requireAdmin(req, res, groupId);
  if (!auth) return;
  const { username, group } = auth;
  const groupKey = `group:${groupId}`;

  if (action === "toggle-admin") {
    const target = payload.username;
    if (!target) return bad(res, 400, "Missing target username");
    if (group.creatorUsername === target) return bad(res, 400, "Cannot modify creator admin status");
    const admins = group.admins || [];
    const isNowAdmin = !admins.includes(target);
    const entry = { id: Date.now(), at: Date.now(), by: username, action: isNowAdmin ? "make-admin" : "remove-admin", for: target };
    const next = { ...group, admins: isNowAdmin ? [...admins, target] : admins.filter(x => x !== target), adminLog: [...(group.adminLog || []), entry] };
    await setValue(groupKey, next);
    return res.status(200).json({ group: next });
  }

  if (action === "kick") {
    const target = payload.username;
    if (!target) return bad(res, 400, "Missing target username");
    if (group.creatorUsername === target) return bad(res, 400, "Cannot kick creator");
    const next = {
      ...group,
      members: (group.members || []).filter(x => x !== target),
      admins: (group.admins || []).filter(x => x !== target),
    };
    await setValue(groupKey, next);
    const user = await getValue(`user:${target}`);
    if (user) {
      await setValue(`user:${target}`, { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) });
    }
    return res.status(200).json({ group: next });
  }

  if (action === "save-name") {
    const name = String(payload.name || "").trim();
    if (!name) return bad(res, 400, "Missing group name");
    const next = { ...group, name };
    await setValue(groupKey, next);
    return res.status(200).json({ group: next });
  }

  if (action === "save-scope") {
    const val = payload.value;
    const next = { ...group, scoreScope: val };
    await setValue(groupKey, next);
    return res.status(200).json({ group: next });
  }

  if (action === "save-11-limit") {
    const val = payload.value;
    const next = { ...group, draw11Limit: val };
    await setValue(groupKey, next);
    return res.status(200).json({ group: next });
  }

  if (action === "delete-group") {
    if (group.creatorUsername !== username) return bad(res, 403, "Only creator can delete group");
    await deleteValue(groupKey);
    for (const member of group.members || []) {
      const user = await getValue(`user:${member}`);
      if (user) {
        await setValue(`user:${member}`, { ...user, groupIds: (user.groupIds || []).filter(id => id !== groupId) });
      }
    }
    await deleteValue(`groupcode:${group.code}`).catch?.(() => {});
    return res.status(200).json({ ok: true });
  }

  return bad(res, 400, "Unsupported action");
}
