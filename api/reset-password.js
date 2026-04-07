import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: "Missing fields" });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }

  try {
    const tokenKey = `reset:${token}`;
    const tokenDoc = db.collection("data").doc(tokenKey.replace(/[/\\]/g, "_"));
    const snap = await tokenDoc.get();

    if (!snap.exists) return res.status(400).json({ error: "Invalid or expired reset link" });

    const { username, expiry } = snap.data().value;
    if (Date.now() > expiry) {
      await tokenDoc.delete();
      return res.status(400).json({ error: "Reset link has expired" });
    }

    const userKey = `user:${username}`;
    const userDocId = userKey.replace(/[/\\]/g, "_");
    const userSnap = await db.collection("data").doc(userDocId).get();
    if (!userSnap.exists) return res.status(400).json({ error: "User not found" });

    const user = userSnap.data().value;
    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    const { password, ...rest } = user;
    await db.collection("data").doc(userDocId).set({ value: { ...rest, passwordHash }, updatedAt: Date.now() });
    await tokenDoc.delete();

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("reset-password error", e);
    return res.status(500).json({ error: "Reset failed" });
  }
}
