import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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
const OWNER_USERNAME = "faris";
const COLLECTION = "changelog";

function bad(res, code, error) {
  return res.status(code).json({ error });
}

async function requireOwner(req, res) {
  const token = readSessionToken(req);
  const session = await getSession(token);
  if (!session?.username) {
    bad(res, 401, "Unauthorized");
    return null;
  }
  if (session.username !== OWNER_USERNAME) {
    bad(res, 403, "Forbidden");
    return null;
  }
  return session.username;
}

function cleanString(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeBullets(bullets) {
  if (!Array.isArray(bullets)) return [];
  return bullets.map((b) => cleanString(b, 300)).filter(Boolean).slice(0, 20);
}

function validateEntry(input) {
  const title = cleanString(input?.title, 120);
  const version = cleanString(input?.version, 40);
  const emoji = cleanString(input?.emoji, 16) || "🎉";
  const date = cleanString(input?.date, 20);
  const bullets = sanitizeBullets(input?.bullets);

  if (!title) return { error: "Title is required." };
  if (!bullets.length) return { error: "At least one bullet is required." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date." };

  return {
    value: {
      title,
      version,
      emoji,
      date,
      bullets,
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
      const entries = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ entries });
    }

    if (req.method === "POST") {
      const username = await requireOwner(req, res);
      if (!username) return;
      const parsed = validateEntry(req.body || {});
      if (parsed.error) return bad(res, 400, parsed.error);
      const payload = {
        ...parsed.value,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: username,
        updatedBy: username,
      };
      const ref = await db.collection(COLLECTION).add(payload);
      const created = await ref.get();
      return res.status(200).json({ entry: { id: created.id, ...created.data() } });
    }

    if (req.method === "PATCH") {
      const username = await requireOwner(req, res);
      if (!username) return;
      const id = cleanString(req.body?.id, 120);
      if (!id) return bad(res, 400, "Missing id.");
      const parsed = validateEntry(req.body || {});
      if (parsed.error) return bad(res, 400, parsed.error);
      const ref = db.collection(COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return bad(res, 404, "Entry not found.");
      const payload = {
        ...parsed.value,
        updatedAt: Date.now(),
        updatedBy: username,
      };
      await ref.set(payload, { merge: true });
      const updated = await ref.get();
      return res.status(200).json({ entry: { id: updated.id, ...updated.data() } });
    }

    if (req.method === "DELETE") {
      const username = await requireOwner(req, res);
      if (!username) return;
      const id = cleanString(req.body?.id ?? req.query?.id, 120);
      if (!id) return bad(res, 400, "Missing id.");
      const ref = db.collection(COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return bad(res, 404, "Entry not found.");
      await ref.delete();
      return res.status(200).json({ ok: true });
    }

    return bad(res, 405, "Method not allowed");
  } catch (error) {
    console.error("changelog error", error);
    return bad(res, 500, "Server error");
  }
}
