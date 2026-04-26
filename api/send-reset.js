import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import { emailHtml } from "./email-template.js";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
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

function docKey(key) { return key.replace(/[/\\]/g, "_"); }

async function checkRateLimit(key, max) {
  const fullKey = `ratelimit:${key}`;
  const now = Date.now();
  const ref = db.collection("data").doc(docKey(fullKey));
  try {
    const snap = await ref.get();
    const record = snap.exists ? snap.data().value : null;
    if (record && record.resetAt > now) {
      if (record.count >= max) return false;
      await ref.set({ value: { count: record.count + 1, resetAt: record.resetAt }, updatedAt: now });
    } else {
      await ref.set({ value: { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }, updatedAt: now });
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
    const emailKey = `useremail:${normalised}`;
    const lookupSnap = await db.collection("data").doc(emailKey.replace(/[/\\]/g, "_")).get();
    if (!lookupSnap.exists) return res.status(200).json(OK_MSG);

    const { username } = lookupSnap.data().value;
    const token = crypto.randomUUID();
    const expiry = Date.now() + 3_600_000;

    const resetKey = `reset:${token}`;
    await db.collection("data").doc(resetKey.replace(/[/\\]/g, "_")).set({ value: { username, expiry }, updatedAt: Date.now() });

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
