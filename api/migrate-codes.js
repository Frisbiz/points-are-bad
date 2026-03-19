// Temporary one-off migration endpoint.
// Hit: /api/migrate-codes?secret=YOUR_SECRET
// DELETE THIS FILE after running.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

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

  // Query groupcode: docs — the key suffix IS the code, so easy to filter for 4-digit ones
  const snap = await db.collection("data")
    .where(FieldPath.documentId(), ">=", "groupcode:")
    .where(FieldPath.documentId(), "<", "groupcode;")
    .get();

  const toMigrate = snap.docs
    .map(d => ({ docId: d.id, groupId: d.data().value, code: d.id.replace("groupcode:", "") }))
    .filter(d => /^\d{4}$/.test(d.code));

  const allCodes = snap.docs.map(d => d.id);
  if (toMigrate.length === 0) {
    return res.status(200).json({ message: "No 4-digit codes found, nothing to do.", totalGroupcodeDocs: snap.size, allDocIds: allCodes });
  }

  const usedCodes = new Set();
  const results = [];

  for (const { code: oldCode, groupId } of toMigrate) {
    // Fetch the group doc to get the name
    const groupSnap = await db.collection("data").doc(`group:${groupId}`).get();
    const group = groupSnap.exists ? groupSnap.data().value : null;

    let newCode;
    do { newCode = genCode(); } while (usedCodes.has(newCode));
    usedCodes.add(newCode);

    const batch = db.batch();
    // Update code field on the group doc
    if (group) {
      batch.update(db.collection("data").doc(`group:${groupId}`), { "value.code": newCode, updatedAt: Date.now() });
    }
    // Create new groupcode lookup
    batch.set(db.collection("data").doc(`groupcode:${newCode}`), { value: groupId, updatedAt: Date.now() });
    // Delete old groupcode lookup
    batch.delete(db.collection("data").doc(`groupcode:${oldCode}`));
    await batch.commit();

    results.push({ group: group?.name || groupId, oldCode, newCode });
  }

  return res.status(200).json({ migrated: results.length, results });
}
