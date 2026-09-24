const isDev = process.env.NODE_ENV !== "production";

/** Enforcing only when explicitly switched on. Report-only is the default. */
const enforce = process.env.CSP_ENFORCE === "1";

/**
 * Firebase Auth resolves the Google popup through a hidden iframe on the
 * project's own auth domain, so that host has to be nameable.
 */
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const authOrigin = AUTH_DOMAIN ? `https://${AUTH_DOMAIN}` : "";

/**
 * Content-Security-Policy.
 *
 * ── Why it is a static header ──────────────────────────────────────────
 *
 * It used to be built in middleware.ts, because it carried a per-request
 * nonce. The nonce is gone — see below — and what is left is the same
 * string for every response, so there was nothing left for the
 * middleware to do except run. On Vercel that is an edge invocation in
 * front of every page load: latency on the one hop that should be a
 * cache hit, and a line on the plan's usage, to attach a constant.
 *
 * CSP_ENFORCE is therefore read at build time rather than per request.
 * On a hosted deployment that is not a change in practice: an
 * environment variable there only takes effect on the next deploy
 * anyway.
 *
 * ── Why there is no nonce ──────────────────────────────────────────────
 *
 * There was one, and it took the site down. The mechanism only works for
 * pages Next renders per request: Next reads the nonce back out of the
 * request's `content-security-policy` header while rendering and stamps
 * it onto the script tags it emits. Every page here is a client component
 * with no request-time data, so Next prerenders all of them at build
 * time — when there is no request and no nonce to read. The HTML went out
 * with no `nonce=` anywhere on it, while the middleware kept attaching a
 * freshly generated nonce to each response.
 *
 * The result was not a partly-broken page. Next's external chunks are
 * allowed by 'self' and loaded fine; its inline `self.__next_f.push(...)`
 * scripts — which carry the entire payload React hydrates against — were
 * blocked. React started up, found nothing to hydrate, and cleared the
 * server-rendered DOM. A blank white page, and nothing in the server logs,
 * because as far as the server was concerned it had served a 200.
 *
 * So `script-src` carries 'unsafe-inline' instead, and this policy is
 * honest about being weaker for scripts than it looks. Earning the nonce
 * back means rendering the pages dynamically (`export const dynamic =
 * "force-dynamic"` on the root layout), which is a real decision about
 * caching rather than something to slip in beside a header change.
 *
 * ── Why it ships report-only ───────────────────────────────────────────
 *
 * A report-only header never blocks anything, so a directive that is
 * wrong costs a console message instead of the site. The connect-src
 * origins below were written from memory rather than from a trace of a
 * real session, and Firestore picks its transport endpoint at runtime —
 * exactly the kind of thing that fails as a blank page.
 *
 * Set CSP_ENFORCE=1 once a full session — sign in, post a message, upload
 * a photo — produces no reports.
 */
const directives = {
  "default-src": ["'self'"],

  // next/font/google downloads the font files at build time and serves
  // them from our own origin, so no Google font host is needed.
  "font-src": ["'self'", "data:"],

  // Profile pictures are inline JPEG data URLs on the profile
  // document — see the photoUrl cap in firestore.rules.
  "img-src": ["'self'", "data:", "https://*.googleusercontent.com"],

  // 'unsafe-inline' covers Next's inline bootstrap and flight data; see
  // the note above for why it is not a nonce. apis.google.com and
  // gstatic.com are the gapi loader Firebase Auth pulls in for the
  // sign-in popup. 'unsafe-eval' is development only: the dev server's
  // hot reload needs it, a production build does not.
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "https://apis.google.com",
    "https://www.gstatic.com",
    // App Check's reCAPTCHA, when it is switched on. Listed
    // unconditionally: the policy is one string for every response,
    // and naming a host that is never asked for costs nothing.
    "https://www.google.com",
    "https://www.recaptcha.net",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ],

  // React `style={{…}}` attributes throughout the pages count as inline
  // styles, so this one was never going to be tight either.
  "style-src": ["'self'", "'unsafe-inline'"],

  // Firestore's web transport, the token service and the identity
  // toolkit all sit under googleapis.com; the socket is the streaming
  // listener behind onSnapshot. These are the directives the
  // report-only run is really here to check.
  "connect-src": [
    "'self'",
    "https://*.googleapis.com",
    "wss://*.googleapis.com",
    "https://*.firebaseio.com",
    "wss://*.firebaseio.com",
    "https://*.firebaseapp.com",
    "https://apis.google.com",
    "https://accounts.google.com",
    "https://content-firebaseappcheck.googleapis.com",
    ...(authOrigin ? [authOrigin] : []),
  ],

  // reCAPTCHA renders in an iframe even in its invisible v3 form.
  "frame-src": [
    "'self'",
    "https://accounts.google.com",
    "https://www.google.com",
    "https://www.recaptcha.net",
    ...(authOrigin ? [authOrigin] : []),
  ],

  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  // Belt and braces with the X-Frame-Options header below, which older
  // browsers understand and this directive replaces.
  "frame-ancestors": ["'none'"],
};

const rendered = Object.entries(directives)
  .map(([name, values]) => `${name} ${values.join(" ")}`)
  .join("; ");

// Violations go somewhere durable rather than to whichever console
// happened to be open. report-uri is the deprecated spelling every
// browser still implements.
const reporting = "report-uri /api/csp-report";

// upgrade-insecure-requests only in production: on http://localhost it
// would upgrade the dev server's own requests and break the page.
const csp = isDev
  ? `${rendered}; ${reporting}`
  : `${rendered}; upgrade-insecure-requests; ${reporting}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
            value: csp,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
