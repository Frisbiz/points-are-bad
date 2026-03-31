import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import { emailHtml } from "./email-template.js";

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

function docKey(key) {
  return key.replace(/[/\\]/g, "_");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { groupId, gw, season } = req.body || {};
  if (!groupId || !gw || !season) return res.status(400).json({ error: "Missing groupId, gw, or season" });

  const groupSnap = await db.collection("data").doc(docKey(`group:${groupId}`)).get();
  if (!groupSnap.exists) return res.status(404).json({ error: "Group not found" });

  const group = groupSnap.data().value;
  const gwObj = (group.gameweeks || []).find(g => g.gw === gw && (g.season || group.season || 2025) === season);
  if (!gwObj) return res.status(404).json({ error: "Gameweek not found" });

  const openFixtures = (gwObj.fixtures || []).filter(f =>
    !f.result &&
    f.status !== "FINISHED" &&
    f.status !== "IN_PLAY" &&
    f.status !== "PAUSED" &&
    f.status !== "POSTPONED"
  );

  if (!openFixtures.length) return res.status(200).json({ sent: 0, reason: "No open fixtures" });

  const preds = group.predictions || {};
  const needsReminder = (group.members || []).filter(username => {
    return openFixtures.some(f => !preds[username]?.[f.id]);
  });

  if (!needsReminder.length) return res.status(200).json({ sent: 0, reason: "Everyone has submitted picks" });

  const appUrl = process.env.APP_URL || "https://points-are-bad.vercel.app";
  let sent = 0;
  let noEmail = 0;

  await Promise.all(needsReminder.map(async username => {
    try {
      const userSnap = await db.collection("data").doc(docKey(`user:${username}`)).get();
      if (!userSnap.exists) { noEmail++; return; }
      const user = userSnap.data().value;
      if (!user?.email) { noEmail++; return; }

      const name = user.displayName || username;
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: `GW${gw} picks reminder`,
        html: emailHtml({
          title: `Gameweek ${gw} Picks`,
          greeting: `Hey ${name},`,
          body: `You haven't submitted all your picks for <strong style="color:#f0f0f8;">Gameweek ${gw}</strong> yet.<br/><br/>Get them in before the first kickoff. Picks lock when the whistle blows.`,
          cta: { url: appUrl, label: "Submit my picks →" },
        }),
      });
      sent++;
    } catch (e) {
      console.error("send-picks-reminder error for", username, e);
    }
  }));

  const reason = sent === 0 && noEmail > 0 ? `${noEmail} member${noEmail !== 1 ? "s" : ""} have no email on file` : undefined;
  return res.status(200).json({ sent, noEmail, reason });
}
