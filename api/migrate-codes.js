// Temporary one-off migration endpoint.
// Hit: /api/migrate-codes?secret=YOUR_SECRET
// DELETE THIS FILE after running.

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

function genCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const snap = await db.collection("data")
    .where(db.FieldPath.documentId(), ">=", "group:")
    .where(db.FieldPath.documentId(), "<", "group;")
    .get();

  const groups = snap.docs
    .map(d => ({ docId: d.id, ...d.data().value }))
    .filter(g => g.code && /^\d{4}$/.test(g.code));

  if (groups.length === 0) {
    return res.status(200).json({ message: "No 4-digit codes found, nothing to do." });
  }

  const usedCodes = new Set();
  const results = [];

  for (const group of groups) {
    let newCode;
    do { newCode = genCode(); } while (usedCodes.has(newCode));
    usedCodes.add(newCode);

    const oldCode = group.code;
    const batch = db.batch();
    batch.update(db.collection("data").doc(`group:${group.id}`), { "value.code": newCode, updatedAt: Date.now() });
    batch.set(db.collection("data").doc(`groupcode:${newCode}`), { value: group.id, updatedAt: Date.now() });
    batch.delete(db.collection("data").doc(`groupcode:${oldCode}`));
    await batch.commit();

    results.push({ group: group.name || group.id, oldCode, newCode });
  }

  return res.status(200).json({ migrated: results.length, results });
}
