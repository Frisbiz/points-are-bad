import bcrypt from "bcryptjs";
import { getValue, setValue, deleteValue } from "./_db.js";

const SESSION_PREFIX = "session:";
const USERNAME_RE = /^[a-z0-9_-]+$/;

export function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validUsername(username) {
  return USERNAME_RE.test(username);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  if (!hash || typeof hash !== "string") return false;
  return bcrypt.compare(password, hash);
}

export function safeUser(user) {
  if (!user) return null;
  const { password, passwordHash, ...rest } = user;
  return rest;
}

export function randomToken() {
  return crypto.randomUUID();
}

export async function createSession(username) {
  const token = randomToken();
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 14;
  await setValue(`${SESSION_PREFIX}${token}`, { username, expiry });
  return { token, expiry };
}

export async function getSession(token) {
  if (!token) return null;
  const session = await getValue(`${SESSION_PREFIX}${token}`);
  if (!session?.username || !session?.expiry) return null;
  if (Date.now() > session.expiry) {
    await deleteValue(`${SESSION_PREFIX}${token}`).catch(() => {});
    return null;
  }
  return session;
}

export async function destroySession(token) {
  if (!token) return;
  await deleteValue(`${SESSION_PREFIX}${token}`).catch(() => {});
}

export function readSessionToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|; )pab_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setSessionCookie(res, token, expiry) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `pab_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiry).toUTCString()}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `pab_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`);
}
