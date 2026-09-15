import { timingSafeEqual } from "node:crypto";
import { getValue, setValue, deleteValue } from "./_db.js";
import { buildDiscordReminderJobs, buildDiscordReminderStatus } from "../shared/discordReminders.js";

function authorized(req) {
  const expected = process.env.PAB_DISCORD_SHARED_SECRET || "";
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function indexedLinks() {
  const ids = [...new Set((await getValue("discord-links-index")) || [])];
  const links = await Promise.all(ids.map(id => getValue(`discordlink:${id}`)));
  return links.filter(Boolean);
}

async function loadContext(links) {
  const usernames = [...new Set(links.map(link => link.username).filter(Boolean))];
  const users = await Promise.all(usernames.map(username => getValue(`user:${username}`)));
  const usersByUsername = Object.fromEntries(users.filter(Boolean).map(user => [user.username, user]));
  const groupIds = [...new Set(users.flatMap(user => user?.groupIds || []))];
  const groups = await Promise.all(groupIds.map(id => getValue(`group:${id}`)));
  const groupsById = Object.fromEntries(groupIds.map((id, index) => [id, groups[index]]).filter(([, group]) => Boolean(group)));
  return { usersByUsername, groupsById };
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const action = req.method === "GET" ? req.query?.action : req.body?.action;
  const discordUserId = String((req.method === "GET" ? req.query?.discordUserId : req.body?.discordUserId) || "");

  if (req.method === "GET" && action === "jobs") {
    const links = await indexedLinks();
    const context = await loadContext(links);
    const jobs = buildDiscordReminderJobs({ links, ...context, appUrl: process.env.APP_URL || "https://pab.wtf" });
    return res.status(200).json({ jobs });
  }

  if (req.method === "GET" && action === "status") {
    if (!discordUserId) return res.status(400).json({ error: "Missing Discord user ID" });
    const link = await getValue(`discordlink:${discordUserId}`);
    if (!link) return res.status(200).json({ linked: false, incomplete: [] });
    const user = await getValue(`user:${link.username}`);
    const context = await loadContext([link]);
    return res.status(200).json(buildDiscordReminderStatus({ link, user, groupsById: context.groupsById }));
  }

  if (req.method === "POST" && action === "preferences") {
    if (!discordUserId || typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Missing Discord user ID or enabled value" });
    const link = await getValue(`discordlink:${discordUserId}`);
    if (!link) return res.status(404).json({ error: "Discord account is not linked" });
    await setValue(`discordlink:${discordUserId}`, { ...link, remindersEnabled: req.body.enabled, updatedAt: Date.now() });
    return res.status(200).json({ linked: true, remindersEnabled: req.body.enabled });
  }

  if (req.method === "POST" && action === "unlink") {
    if (!discordUserId) return res.status(400).json({ error: "Missing Discord user ID" });
    const link = await getValue(`discordlink:${discordUserId}`);
    if (link) {
      const user = await getValue(`user:${link.username}`);
      if (user?.discordUserId === discordUserId) {
        const { discordUserId: _removed, ...nextUser } = user;
        await setValue(`user:${link.username}`, nextUser);
      }
      await deleteValue(`discordlink:${discordUserId}`);
      const ids = ((await getValue("discord-links-index")) || []).filter(id => String(id) !== discordUserId);
      await setValue("discord-links-index", ids);
    }
    return res.status(200).json({ linked: false });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
