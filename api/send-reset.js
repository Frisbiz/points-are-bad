import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  if (!email || typeof email !== "string") return res.status(200).json(OK_MSG);

  const normalised = email.trim().toLowerCase();

  try {
    const emailKey = `useremail:${normalised}`;
    const lookupSnap = await db.collection("data").doc(emailKey.replace(/[/\\]/g, "_")).get();
    if (!lookupSnap.exists) return res.status(200).json(OK_MSG);

    const { username } = lookupSnap.data().value;
    const token = crypto.randomUUID();
    const expiry = Date.now() + 3_600_000;

    const resetKey = `reset:${token}`;
    await db.collection("data").doc(resetKey.replace(/[/\\]/g, "_")).set({ value: { username, expiry }, updatedAt: Date.now() });

    const appUrl = process.env.APP_URL || "https://points-are-bad.vercel.app";
    const resetLink = `${appUrl}?reset=${token}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: normalised,
      subject: "Reset your Points Are Bad password",
      html: `<p>Hi ${username},</p><p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, ignore this email.</p>`,
    });
  } catch (e) {
    console.error("send-reset error", e);
  }

  return res.status(200).json(OK_MSG);
}
