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

export const db = getFirestore();

export function docKey(key) {
  return key.replace(/[/\\]/g, "_");
}

export async function getValue(key) {
  const snap = await db.collection("data").doc(docKey(key)).get();
  return snap.exists ? snap.data().value : null;
}

export async function setValue(key, value) {
  await db.collection("data").doc(docKey(key)).set({ value, updatedAt: Date.now() });
}

export async function patchValue(key, path, value) {
  await db.collection("data").doc(docKey(key)).update({ [`value.${path}`]: value, updatedAt: Date.now() });
}

export async function deleteValue(key) {
  await db.collection("data").doc(docKey(key)).delete();
}
