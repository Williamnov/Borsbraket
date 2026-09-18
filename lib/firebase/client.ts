"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

/**
 * Firebase web config.
 *
 * None of these are secrets. A web API key identifies the project; it
 * grants nothing on its own. What a signed-in person may read or write
 * is decided entirely by firestore.rules, which run on Google's servers.
 * That is why this file is safe in a public repository — and why the
 * rules file is the thing to review carefully.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
}

function app() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Copy env.example to .env.local and fill in the " +
        "NEXT_PUBLIC_FIREBASE_* values from your Firebase project settings.",
    );
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth(): Auth {
  return getAuth(app());
}

/**
 * Firestore, with the on-disk cache switched on.
 *
 * This is the single largest cost control in the app, and it is here
 * because the project went through the Spark plan's 50,000 reads in a
 * day with one person clicking around. The instruments collection alone
 * is ~300 documents and the league pages subscribe to it; without a
 * cache every visit re-read all of them from the server, and every
 * client-side navigation did it again.
 *
 * With a persistent cache Firestore keeps the last snapshot in IndexedDB
 * and resumes each listener with a resume token, so re-attaching bills
 * for the documents that actually changed rather than the whole
 * collection. Nothing else in the app has to know: onSnapshot behaves
 * exactly as before, it is just no longer paying full price to learn
 * that nothing happened.
 *
 * persistentMultipleTabManager keeps two open tabs sharing one cache
 * instead of fighting over the IndexedDB lock — the single-tab manager
 * simply fails in the second tab.
 */
let cached: Firestore | null = null;

export function firestore(): Firestore {
  if (cached) return cached;
  const instance = app();

  try {
    cached = initializeFirestore(instance, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Either Firestore was already initialised on this app — in which
    // case getFirestore returns that same configured instance — or
    // IndexedDB is unavailable, as in a private window or an embedded
    // browser. Working without the cache is slower and dearer, not
    // broken, so this falls back rather than failing the page.
    cached = getFirestore(instance);
  }

  return cached;
}
