import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK. Bypasses firestore.rules completely.
 *
 * Exactly two callers are allowed to use this: the weekly price cron and
 * the seed script, neither of which has a signed-in user to act as.
 * Everything a player does goes through the client SDK so the rules
 * still apply.
 *
 * The service account is a real secret. It lives in Vercel's environment
 * variables, never in the repository.
 */
function credentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY from your service account JSON.",
    );
  }

  return {
    projectId,
    clientEmail,
    // Vercel stores the key with literal \n sequences; restore real newlines.
    privateKey: rawKey.replace(/\\n/g, "\n"),
  };
}

function adminApp(): App {
  if (getApps().length) return getApp();
  return initializeApp({ credential: cert(credentials()) });
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
