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
const READ_PREFIXES = ["group:", "groupcode:", "fixtures:"];
const WRITE_PREFIXES = ["fixtures:"];

function validKeyFor(key, prefixes) {
  return typeof key === "string" && key.length <= 200 && prefixes.some(p => key.startsWith(p));
}

function docId(key) {
  return key.replace(/[/\\]/g, "_");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { key } = req.query;
    if (!validKeyFor(key, READ_PREFIXES)) return res.status(403).json({ error: "Forbidden" });
    try {
      const snap = await db.collection("data").doc(docId(key)).get();
      return res.status(200).json({ value: snap.exists ? snap.data().value : null });
    } catch (e) {
      console.error("db GET error", key, e);
      return res.status(500).json({ error: "Read failed" });
    }
  }

  if (req.method === "POST") {
    const { key, value } = req.body || {};
    if (!validKeyFor(key, WRITE_PREFIXES)) return res.status(403).json({ error: "Forbidden" });
    try {
      await db.collection("data").doc(docId(key)).set({ value, updatedAt: Date.now() });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("db POST error", key, e);
      return res.status(500).json({ error: "Write failed" });
    }
  }

  if (req.method === "PATCH") {
    const { key, path, value } = req.body || {};
    if (!validKeyFor(key, WRITE_PREFIXES)) return res.status(403).json({ error: "Forbidden" });
    if (!path || typeof path !== "string" || !/^[\w.-]+$/.test(path)) {
      return res.status(400).json({ error: "Invalid path" });
    }
    try {
      await db.collection("data").doc(docId(key)).update({ [`value.${path}`]: value, updatedAt: Date.now() });
      return res.status(200).json({ ok: true });
    } catch (e) {
      if (e.code === 5) return res.status(404).json({ error: "Document not found" });
      console.error("db PATCH error", key, path, e);
      return res.status(500).json({ error: "Patch failed" });
    }
  }

  if (req.method === "DELETE") {
    const { key } = req.query;
    if (!validKeyFor(key, WRITE_PREFIXES)) return res.status(403).json({ error: "Forbidden" });
    try {
      await db.collection("data").doc(docId(key)).delete();
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("db DELETE error", key, e);
      return res.status(500).json({ error: "Delete failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
