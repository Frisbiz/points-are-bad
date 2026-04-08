import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getSession, readSessionToken } from "./_auth.js";

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

// fixtures: are public (no sensitive data, needed for fixture display)
// group: and groupcode: require a valid session - group docs contain all member picks
const PUBLIC_READ_PREFIXES = ["fixtures:"];
const AUTH_READ_PREFIXES = ["group:", "groupcode:"];

// No direct writes allowed through this endpoint - all mutations go through /api/security
const ALLOWED_READ_PREFIXES = [...PUBLIC_READ_PREFIXES, ...AUTH_READ_PREFIXES];

function validKeyFor(key, prefixes) {
  return typeof key === "string" && key.length <= 200 && prefixes.some(p => key.startsWith(p));
}

function docId(key) {
  return key.replace(/[/\\]/g, "_");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { key } = req.query;
    if (!validKeyFor(key, ALLOWED_READ_PREFIXES)) return res.status(403).json({ error: "Forbidden" });

    // group: and groupcode: reads require a valid session
    if (validKeyFor(key, AUTH_READ_PREFIXES)) {
      const token = readSessionToken(req);
      const session = await getSession(token);
      if (!session?.username) return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const snap = await db.collection("data").doc(docId(key)).get();
      return res.status(200).json({ value: snap.exists ? snap.data().value : null });
    } catch (e) {
      console.error("db GET error", key, e);
      return res.status(500).json({ error: "Read failed" });
    }
  }

  // All writes go through /api/security - no direct writes via this endpoint
  return res.status(405).json({ error: "Method not allowed" });
}
