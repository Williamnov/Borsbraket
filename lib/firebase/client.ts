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

/**
 * App Check, when a site key has been configured.
 *
 * The web config above is public by design, which means anyone can point
 * their own script at this project and start making requests as a
 * signed-in account they control. firestore.rules still decides what
 * such a request may read or write — that is the real defence, and it
 * does not change here — but App Check adds the question "did this come
 * from the site at all", which the rules cannot ask.
 *
 * It is off until NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY exists, so the
 * app runs unchanged without it. Switching it on is two steps and they
 * are deliberately separate: setting the key here makes the browser
 * start sending tokens, and turning on *enforcement* in the Firebase
 * console is what starts refusing requests without one. Do them in that
 * order, and watch the console's App Check metrics in between — turning
 * enforcement on first locks every real player out.
 *
 * Imported dynamically, and only when there is a key. firebase/app-check
 * pulls in the reCAPTCHA v3 loader, and a static import put all of it in
 * the first chunk every visitor downloads before anything is on screen —
 * including deployments that have no key and will never call this.
 * Nothing waits on the promise: App Check attaches itself to the app and
 * the SDK picks the token up from there.
 */
let appCheckStarted = false;

function startAppCheck(instance: ReturnType<typeof initializeApp>) {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (appCheckStarted || !siteKey || typeof window === "undefined") return;
  appCheckStarted = true;

  // A debug token lets a developer machine, which has no reCAPTCHA
  // standing, register itself in the console and be allowed through.
  // Never set in production: it is an explicit bypass.
  const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugToken && process.env.NODE_ENV !== "production") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken;
  }

  void import("firebase/app-check")
    .then(({ ReCaptchaV3Provider, initializeAppCheck }) => {
      initializeAppCheck(instance, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch(() => {
      // A bad key, a blocked reCAPTCHA script, or a second
      // initialisation. With enforcement off this costs nothing; with it
      // on the request fails anyway, and failing here would take the
      // whole page down instead of one request.
    });
}

function app() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Copy env.example to .env.local and fill in the " +
        "NEXT_PUBLIC_FIREBASE_* values from your Firebase project settings.",
    );
  }
  const instance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  startAppCheck(instance);
  return instance;
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
 * is 450 documents and the league pages subscribe to it; without a
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
