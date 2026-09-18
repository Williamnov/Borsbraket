#!/usr/bin/env node
/**
 * Post-deploy smoke check.
 *
 * This exists because of one specific outage. A nonce-based CSP shipped,
 * compiled cleanly, deployed cleanly, and served every page as a 200 —
 * with every inline script blocked, because the pages are prerendered and
 * Next only stamps nonces onto pages it renders per request. React booted
 * with no hydration payload and cleared the DOM. Blank white site,
 * nothing in the server logs, a green build.
 *
 * Nothing that runs before a deploy catches that. So this runs after one,
 * against the real URL, and asserts the things a green build cannot:
 * that the page is actually served, that its markup arrived, and — the
 * one that matters — that the Content-Security-Policy and the HTML agree
 * about how inline scripts are allowed to run.
 *
 * No dependencies and no browser: plain fetch, so it can run from CI or
 * from a laptop.
 *
 *   node scripts/smoke.mjs https://borsbraket.vercel.app
 */

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "https://borsbraket.vercel.app").replace(
  /\/$/,
  "",
);

const failures = [];
const notes = [];

function check(ok, label, detail) {
  if (ok) {
    notes.push(`  ok   ${label}`);
  } else {
    failures.push(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

/** Cache-bust, so a stale CDN entry cannot pass for a fresh deploy. */
async function get(path) {
  const url = `${base}${path}${path.includes("?") ? "&" : "?"}smoke=${Date.now()}`;
  const response = await fetch(url, { redirect: "follow" });
  return { response, body: await response.text() };
}

const { response, body } = await get("/");

check(response.status === 200, "GET / returns 200", `got ${response.status}`);

// The server-rendered shell. If this is missing the page never had
// content to begin with, whatever the scripts do afterwards.
check(body.includes("BörsBråket"), "the page markup arrived", "no masthead in the HTML");

// ── The one this file is really for ───────────────────────────────────
const csp =
  response.headers.get("content-security-policy") ??
  response.headers.get("content-security-policy-report-only");
const enforcing = response.headers.has("content-security-policy");

if (!csp) {
  notes.push("  --   no Content-Security-Policy header; nothing to check");
} else {
  const scriptSrc = (csp.match(/script-src ([^;]*)/) ?? [])[1] ?? "";
  const policyHasNonce = /'nonce-/.test(scriptSrc);
  const htmlHasNonce = /<script[^>]*\snonce=/.test(body);
  const unsafeInline = scriptSrc.includes("'unsafe-inline'");

  // A nonce in the policy that never reaches the markup blocks every
  // inline script Next emits — which is the whole hydration payload.
  check(
    !policyHasNonce || htmlHasNonce,
    "a nonce in script-src also appears in the HTML",
    "script-src carries a nonce but no script tag has one: the page is prerendered, " +
      "so Next never stamped it. Every inline script is blocked.",
  );

  // Belt and braces: inline scripts have to be allowed somehow.
  check(
    !enforcing || unsafeInline || (policyHasNonce && htmlHasNonce),
    "inline scripts are allowed by the enforced policy",
    "script-src has neither 'unsafe-inline' nor a nonce that reached the HTML",
  );

  notes.push(`  --   policy is ${enforcing ? "ENFORCING" : "report-only"}`);
}

// Two assets worth one request each: the stylesheet the page names, and
// the icon. A white page with unstyled text is its own kind of outage.
const stylesheet = (body.match(/href="(\/_next\/static\/css\/[^"]+)"/) ?? [])[1];
if (stylesheet) {
  const css = await fetch(`${base}${stylesheet}`);
  check(css.status === 200, "the stylesheet loads", `got ${css.status}`);
} else {
  failures.push("  FAIL the page names no stylesheet");
}

const icon = (body.match(/<link rel="icon" href="([^"]+)"/) ?? [])[1];
if (icon) {
  const png = await fetch(`${base}${icon}`);
  check(png.status === 200, "the icon loads", `got ${png.status}`);
}

console.log(`smoke: ${base}`);
for (const line of notes) console.log(line);
for (const line of failures) console.log(line);

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nall checks passed.");
