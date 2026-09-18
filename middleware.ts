import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy.
 *
 * This lives in middleware rather than in next.config.mjs because the
 * policy carries a per-request nonce. Next inlines a handful of its own
 * bootstrap scripts into every page; without a nonce the only ways to
 * allow them are 'unsafe-inline', which makes the whole policy
 * decorative, or a hash list that changes with every Next release.
 *
 * Next reads the nonce back out of this header and stamps it onto the
 * script tags it renders, so nothing in the app has to thread it through
 * by hand. Server components that need it can read `x-nonce`.
 *
 * The static headers — nosniff, Referrer-Policy and the rest — stay in
 * next.config.mjs, which is the cheaper place for anything constant.
 */

const isDev = process.env.NODE_ENV !== "production";

/**
 * Firebase Auth resolves the Google popup through a hidden iframe on the
 * project's own auth domain, so that host has to be nameable. It is a
 * NEXT_PUBLIC_ variable, which means it is inlined at build time and is
 * readable here in the edge runtime.
 */
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

function policy(nonce: string): string {
  const authOrigin = AUTH_DOMAIN ? `https://${AUTH_DOMAIN}` : "";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // next/font/google downloads the font files at build time and serves
    // them from our own origin, so no Google font host is needed.
    "font-src": ["'self'", "data:"],

    // Profile pictures are inline JPEG data URLs on the profile
    // document — see the photoUrl cap in firestore.rules.
    "img-src": ["'self'", "data:"],

    // The nonce covers Next's bootstrap. apis.google.com is the gapi
    // loader Firebase Auth pulls in for the sign-in popup.
    // 'unsafe-eval' is development only: the dev server's hot reload
    // needs it, and a production build does not.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "https://apis.google.com",
      "https://www.gstatic.com",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],

    // 'unsafe-inline' is load-bearing and not an oversight: the pages
    // use React `style={{…}}` attributes throughout, and CSP counts
    // those as inline styles. Removing it means rewriting every one of
    // them into a class first. Scripts, which are what actually matter
    // here, are nonce-gated above.
    "style-src": ["'self'", "'unsafe-inline'"],

    // Firestore's web transport, the token service and the identity
    // toolkit all sit under googleapis.com; the socket is the streaming
    // listener behind onSnapshot.
    "connect-src": [
      "'self'",
      "https://*.googleapis.com",
      "wss://*.googleapis.com",
      "https://*.firebaseio.com",
      "wss://*.firebaseio.com",
      ...(authOrigin ? [authOrigin] : []),
    ],

    "frame-src": ["'self'", "https://accounts.google.com", ...(authOrigin ? [authOrigin] : [])],

    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Belt and braces with the X-Frame-Options header in next.config.mjs,
    // which older browsers understand and this directive replaces.
    "frame-ancestors": ["'none'"],
  };

  const rendered = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

  // Only in production: on http://localhost this directive would upgrade
  // the dev server's own requests to https and break the page.
  return isDev ? rendered : `${rendered}; upgrade-insecure-requests`;
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const header = policy(nonce);

  // Next looks for the nonce on the request headers it re-reads while
  // rendering, so it has to be set on the way in as well as the way out.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", header);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", header);
  return response;
}

export const config = {
  matcher: [
    /*
     * Every page, but not the things a policy would do nothing for:
     * Next's own immutable build output, the image optimiser, and the
     * app icon. Skipping them keeps the middleware off the hot path for
     * static assets.
     */
    {
      source: "/((?!_next/static|_next/image|icon.png|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
