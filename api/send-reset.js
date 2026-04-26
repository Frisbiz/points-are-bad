import { Resend } from "resend";
import { emailHtml } from "./email-template.js";
import { getValue, setValue } from "./_db.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const OK_MSG = { message: "If that email is registered, a reset link has been sent." };

// ── Rate limiting (same Firestore-backed approach as /api/security) ──────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_IP = 5;      // an IP can request 5 resets/min
const RATE_LIMIT_MAX_PER_EMAIL = 3;   // a given address can be targeted 3 times/min

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0] : req.socket?.remoteAddress || "unknown").trim();
}

async function checkRateLimit(key, max) {
  const fullKey = `ratelimit:${key}`;
  const now = Date.now();
  try {
    const record = await getValue(fullKey);
    if (record && record.resetAt > now) {
      if (record.count >= max) return false;
      await setValue(fullKey, { count: record.count + 1, resetAt: record.resetAt });
    } else {
      await setValue(fullKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    return true;
  } catch {
    return true; // fail open
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  if (!email || typeof email !== "string") return res.status(200).json(OK_MSG);

  const normalised = email.trim().toLowerCase();
  const ip = getClientIp(req);

  // Rate-limit before doing any Firestore lookup or email send. Return the generic
  // OK_MSG on limit hits so attackers can't distinguish rate limiting from a
  // nonexistent email (preserves the existing enumeration-resistance behavior).
  if (!await checkRateLimit(`send-reset-ip:${ip}`, RATE_LIMIT_MAX_PER_IP)) return res.status(200).json(OK_MSG);
  if (!await checkRateLimit(`send-reset-email:${normalised}`, RATE_LIMIT_MAX_PER_EMAIL)) return res.status(200).json(OK_MSG);

  try {
    const emailOwner = await getValue(`useremail:${normalised}`);
    if (!emailOwner?.username) return res.status(200).json(OK_MSG);

    const { username } = emailOwner;
    const token = crypto.randomUUID();
    const expiry = Date.now() + 3_600_000;
    await setValue(`reset:${token}`, { username, expiry });

    const appUrl = process.env.APP_URL || "https://pab.wtf";
    const resetLink = `${appUrl}?reset=${token}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: normalised,
      subject: "Reset your Points Are Bad password",
      html: emailHtml({
        title: "Password Reset",
        greeting: `Hey ${username},`,
        body: `We received a request to reset your password. The link expires in <strong style="color:#f0f0f8;">1 hour</strong>.<br/><br/>If you didn't request this, you can safely ignore this email.`,
        cta: { url: resetLink, label: "Reset my password" },
        name: username,
      }),
    });
  } catch (e) {
    console.error("send-reset error", e);
  }

  return res.status(200).json(OK_MSG);
}
