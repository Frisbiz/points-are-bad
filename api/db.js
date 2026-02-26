import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

const ALLOWED_PREFIXES = ["user:", "group:", "groupcode:"];

function validKey(key) {
  return typeof key === "string" && ALLOWED_PREFIXES.some(p => key.startsWith(p));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { key } = req.query;
    if (!validKey(key)) return res.status(400).json({ error: "Invalid key" });
    try {
      const snap = await db.collection("data").doc(key.replace(/[/\\]/g, "_")).get();
      return res.status(200).json({ value: snap.exists ? snap.data().value : null });
    } catch (e) {
      console.error("db GET error", key, e);
      return res.status(500).json({ error: "Read failed" });
    }
  }

  if (req.method === "POST") {
    const { key, value } = req.body;
    if (!validKey(key)) return res.status(400).json({ error: "Invalid key" });
    try {
      await db.collection("data").doc(key.replace(/[/\\]/g, "_")).set({ value, updatedAt: Date.now() });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("db POST error", key, e);
      return res.status(500).json({ error: "Write failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
