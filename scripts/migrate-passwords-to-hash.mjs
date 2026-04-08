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
const DRY_RUN = process.argv.includes('--dry-run');

function isUserKey(key) {
  return typeof key === 'string' && key.startsWith('user:');
}

async function main() {
  const snap = await db.collection('data').get();
  const docs = snap.docs.filter(doc => isUserKey(doc.id.replace(/_/g, ':')) || (doc.data()?.value?.username && doc.id.startsWith('user:')));

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const value = doc.data()?.value;
    if (!value?.username) continue;
    scanned++;

    if (value.passwordHash || !value.password) {
      skipped++;
      continue;
    }

    const passwordHash = await bcrypt.hash(String(value.password), 12);
    const { password, ...rest } = value;
    const next = { ...rest, passwordHash };

    if (!DRY_RUN) {
      await doc.ref.set({ value: next, updatedAt: Date.now() }, { merge: true });
    }

    migrated++;
    console.log(`${DRY_RUN ? '[dry-run] ' : ''}migrated ${value.username}`);
  }

  console.log(JSON.stringify({ scanned, migrated, skipped, dryRun: DRY_RUN }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
