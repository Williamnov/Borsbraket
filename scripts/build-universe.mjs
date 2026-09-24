#!/usr/bin/env node
/**
 * Build the Nordic half of the pickable universe from the exchanges'
 * own lists.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * Every Nordic market below the large caps was either empty or a
 * fragment. Mid Cap, Small Cap and First North in Stockholm came from
 * index constituents matched against a ticker source by name, which left
 * 57 names unresolved and covered none of Helsinki, Copenhagen,
 * Reykjavík or Oslo — those four countries had a hand-typed large cap
 * list and nothing else at all.
 *
 * The premise behind that was that segment membership is reshuffled
 * annually and a guess would put wrong names in front of players. The
 * premise was right; the conclusion was not, because each exchange
 * publishes its own segmentation and will hand it over to anyone who
 * asks in the right shape. So nothing here is matched, inferred or
 * typed: every instrument below arrives from the venue that lists it,
 * already labelled with the list it belongs to and already carrying the
 * ticker that venue quotes it under.
 *
 * ── The sources ───────────────────────────────────────────────────────
 *
 *   SE/FI/DK/IS main + First North   api.nasdaq.com/api/nordic/screener/shares
 *   SE_NGM, SE_SME                   ngm-api-prod.vmate.se/instrument/list
 *   SE_SPOT                          spotlightstockmarket.com/Umbraco/api/…
 *   NO_OSE, NO_EXPAND, NO_GROWTH     live.euronext.com product directory,
 *                                    named properly from Oslo Børs's
 *                                    NewsWeb issuer list
 *
 * Three of those four look unreachable until you get one detail right,
 * and each detail is written down beside the fetch that needs it. They
 * are worth reading before writing another venue off as publishing
 * nothing: in every case the failure looked exactly like an empty market.
 *
 * ── What it does not promise ──────────────────────────────────────────
 *
 * That the price feed can price any of it. An exchange says what it
 * lists; it says nothing about what Yahoo calls the same instrument, and
 * those are different questions. The symbols follow the Nordic "ERIC B"
 * convention that scripts/fetch-prices.mjs already translates, so they
 * should — but anything unpriced comes back reported rather than
 * guessed at, and goes into the admin grid by hand.
 *
 *   node scripts/build-universe.mjs            # report only
 *   node scripts/build-universe.mjs --write    # rewrite the generated file
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../lib/universe.generated.ts");
const WRITE = process.argv.includes("--write");

/**
 * A browser user-agent, on every request without exception.
 *
 * ngm.se answers 406 to anything else — not 403, not an empty list, a
 * 406 on every path, which is why NGM was once written off as a venue
 * that publishes nothing. The others are less fussy but no less
 * entitled to be, and it costs nothing to say who is calling.
 */
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Every market this script fills, in the order the file lists them. */
const MARKET_ORDER = [
  "SE_LARGE", "SE_MID", "SE_SMALL", "SE_FN", "SE_SPOT", "SE_NGM", "SE_SME",
  "FI_LARGE", "FI_MID", "FI_SMALL", "FI_FN",
  "DK_LARGE", "DK_MID", "DK_SMALL", "DK_FN",
  "NO_OSE", "NO_EXPAND", "NO_GROWTH",
  "IS_LARGE", "IS_MID", "IS_SMALL", "IS_FN",
];

/**
 * Subscription warrants and interim shares, which are not the company.
 *
 * Small companies raise money by issuing these, and they trade beside
 * the ordinary share under names like SMOL TO 9, APTA BTU and ZENZIP BTA
 * B. TO is teckningsoption, BTA a paid subscribed share, BTU a paid
 * subscribed unit, UR and TR the subscription rights themselves. Every
 * one of them expires, and none is a thing to hold for a month.
 *
 * Matched as whole tokens on both the ticker and the name. Losing a real
 * company to a substring match would be the worse failure, so what this
 * drops is printed on every run — and the name is matched case
 * sensitively, because these are suffixes a register shouts and "to" is
 * an ordinary English word. Wall to Wall Group is a listed company.
 */
const NOT_AN_ORDINARY_SHARE = /(^|\s)(TO|BTA|BTU|BT|UR|TR|IR|UNIT|UNITS)(\s|$|\s*\d)/;

const ordinary = (symbol, name) =>
  !NOT_AN_ORDINARY_SHARE.test(symbol.toUpperCase()) && !NOT_AN_ORDINARY_SHARE.test(name);

/**
 * Legal form, which every register carries and no player needs.
 *
 * Only ever stripped from the end, and never from a name that is nothing
 * else: "Hennes & Mauritz AB" is H&M, but "AB Volvo" is Volvo and NYAB
 * is a company. Finnish registers stack two of them — "Fiskars Oyj Abp"
 * — so it strips twice and then stops, which is also what keeps
 * "Oyj" inside a name safe.
 */
const LEGAL_TAIL =
  /[,\s]+(AB|ASA|AS|A\/S|Oyj|Abp|Oy|plc|Plc|PLC|Ltd|Ltd\.|Limited|Inc|Inc\.|Corp|Corp\.|SE|S\.A|S\.A\.|SA|N\.V|NV|hf|hf\.|ehf|ehf\.)\.?$/;

function cleanName(raw) {
  let name = String(raw ?? "").replace(/\s+/g, " ").trim();
  name = name.replace(/\s*\(publ\)\s*$/i, "");
  for (let pass = 0; pass < 2; pass++) {
    const stripped = name.replace(LEGAL_TAIL, "");
    if (stripped === name) break;
    name = stripped;
  }
  return name.trim().replace(/[,.\s]+$/, "");
}

/** The instruments, keyed so that the same listing cannot arrive twice. */
const instruments = [];
const seen = new Set();
const dropped = [];

function add(marketCode, symbol, name, currency) {
  const ticker = String(symbol ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  const label = cleanName(name);
  if (!ticker || !label) return;

  if (!ordinary(ticker, label)) {
    dropped.push(`${marketCode} ${ticker} — ${label}`);
    return;
  }

  // The seed builds the Firestore id out of the symbol, so a ticker with
  // nothing alphanumeric in it has nowhere to live.
  if (!/[A-Z0-9]/.test(ticker)) return;

  const key = `${marketCode} ${ticker}`;
  if (seen.has(key)) return;
  seen.add(key);
  instruments.push({ symbol: ticker, name: label, marketCode, currency });
}

// ── Nasdaq Nordic ─────────────────────────────────────────────────────
//
// The exchange's own screener, asked one (category, market, segment) at
// a time so that every row arrives already labelled with the list it is
// in. This is not a guess at the segmentation — it is the thing that
// decides it.

const NASDAQ_SEGMENT = {
  "STO LARGE_CAP": "SE_LARGE", "STO MID_CAP": "SE_MID", "STO SMALL_CAP": "SE_SMALL",
  "HEL LARGE_CAP": "FI_LARGE", "HEL MID_CAP": "FI_MID", "HEL SMALL_CAP": "FI_SMALL",
  "CPH LARGE_CAP": "DK_LARGE", "CPH MID_CAP": "DK_MID", "CPH SMALL_CAP": "DK_SMALL",
  "ICE LARGE_CAP": "IS_LARGE", "ICE MID_CAP": "IS_MID", "ICE SMALL_CAP": "IS_SMALL",
};
const NASDAQ_FIRST_NORTH = { STO: "SE_FN", HEL: "FI_FN", CPH: "DK_FN", ICE: "IS_FN" };
const NASDAQ_FALLBACK_CURRENCY = { STO: "SEK", HEL: "EUR", CPH: "DKK", ICE: "ISK" };

async function nasdaqList(params) {
  const query = new URLSearchParams({ tableonly: "false", ...params });
  const url = `https://api.nasdaq.com/api/nordic/screener/shares?${query}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(attempt * 4000);
      continue;
    }
    const body = await response.json();
    const rows = body?.data?.instrumentListing?.rows;
    if (!rows) throw new Error(`Nasdaq ${JSON.stringify(params)}: ${JSON.stringify(body?.status)}`);
    // The screener pages, and every one of these lists fits in a page.
    // If one ever stops fitting, say so rather than truncate it.
    const total = Number(body?.data?.pagination?.total ?? rows.length);
    if (rows.length < total) {
      throw new Error(`Nasdaq ${JSON.stringify(params)}: ${rows.length} of ${total} — page it`);
    }
    return rows;
  }
  throw new Error(`Nasdaq ${JSON.stringify(params)}: throttled on four attempts`);
}

async function nasdaq() {
  for (const market of ["STO", "HEL", "CPH", "ICE"]) {
    for (const segment of ["LARGE_CAP", "MID_CAP", "SMALL_CAP"]) {
      const code = NASDAQ_SEGMENT[`${market} ${segment}`];
      const rows = await nasdaqList({ category: "MAIN_MARKET", market, segment });
      report(code, rows.length);
      for (const row of rows) {
        add(code, row.symbol, row.fullName, row.currency || NASDAQ_FALLBACK_CURRENCY[market]);
      }
      await sleep(700);
    }

    const code = NASDAQ_FIRST_NORTH[market];
    const rows = await nasdaqList({ category: "FIRST_NORTH", market });
    report(code, rows.length);
    for (const row of rows) {
      add(code, row.symbol, row.fullName, row.currency || NASDAQ_FALLBACK_CURRENCY[market]);
    }
    await sleep(700);
  }
}

// ── NGM ───────────────────────────────────────────────────────────────
//
// www.ngm.se/market is a single-page app, and the host below is named in
// its own bundle. The 406 without a browser user-agent is the whole trap:
// it reads exactly like a venue with nothing to publish.

/**
 * NGM's two equity segments.
 *
 * SE_SME keeps its code so that no instrument id moves, but not its
 * name: the MTF is called NGM Growth Market now and NGM's site does not
 * say "Nordic SME" anywhere. PepMarket is not here because it is not a
 * quoted market — NGM's own API reports exactly these two.
 */
const NGM_SEGMENT = { "NGM Main Market": "SE_NGM", "NGM Growth Market": "SE_SME" };

async function ngm() {
  const response = await fetch("https://ngm-api-prod.vmate.se/instrument/list", {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/json",
      accept: "application/json",
      origin: "https://www.ngm.se",
      referer: "https://www.ngm.se/",
    },
    // The same endpoint serves sixty-odd thousand certificates and
    // warrants; `market: "equities"` is what keeps those out. One page
    // holds the lot — about a hundred names.
    body: JSON.stringify({ page: 0, size: 1000, market: "equities", instrumentType: "ALL" }),
  });
  if (!response.ok) throw new Error(`NGM: HTTP ${response.status}`);

  const body = await response.json();
  const rows = body.data ?? [];
  if (rows.length < (body.totalNumber ?? 0)) {
    throw new Error(`NGM: ${rows.length} of ${body.totalNumber} — raise the page size`);
  }

  const counts = { SE_NGM: 0, SE_SME: 0 };
  for (const row of rows) {
    const code = NGM_SEGMENT[row.marketSegment ?? ""];
    if (!code || row.type !== "Shares") continue;
    counts[code] += 1;
    add(code, row.symbol, row.name, "SEK");
  }
  for (const code of ["SE_NGM", "SE_SME"]) report(code, counts[code]);
}

// ── Spotlight ─────────────────────────────────────────────────────────

/**
 * Spotlight publishes no list, only a search box — so ask it for every
 * letter and digit and union the answers, on the grounds that every name
 * contains at least one of the thirty-six.
 *
 * The /Umbraco/ path segment is load-bearing. Without it the domain
 * still answers 200, from its own 404 page, which is the second way a
 * reachable venue can look like an unreachable one.
 */
async function spotlight() {
  const found = new Map();

  for (const [index, letter] of [..."abcdefghijklmnopqrstuvwxyz0123456789"].entries()) {
    if (index > 0) await sleep(400);
    const url =
      "https://spotlightstockmarket.com/Umbraco/api/companyapi/CompanySimpleSearch" +
      `?searchText=${letter}&lang=en-US&getAll=true`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!response.ok) {
      console.error(`  Spotlight "${letter}": HTTP ${response.status}`);
      continue;
    }

    const body = await response.json();
    for (const row of body.results ?? []) {
      // The API wraps the matched substring in <b><u>…</u></b>.
      const label = String(row.companyName ?? row.heading ?? "").replace(/<[^>]+>/g, "");
      const id = (String(row.url ?? "").match(/InstrumentId=([A-Za-z0-9]+)/) ?? [])[1];
      if (!id || found.has(id)) continue;
      // "Abera Bioscience (ABERA)" — name, then ticker in brackets.
      const parts = label.match(/^(.*)\s+\(([^()]+)\)\s*$/);
      if (parts) found.set(id, { id, name: parts[1].trim(), symbol: parts[2].trim() });
    }
  }

  if (found.size === 0) throw new Error("Spotlight returned nothing — the endpoint has changed");

  // Every id came back on XSAT, Spotlight's Swedish market. Spotlight
  // Denmark stays empty because the search knows of no such instrument,
  // not because nobody looked.
  let kept = 0;
  for (const row of found.values()) {
    if (!row.id.startsWith("XSAT")) continue;
    kept += 1;
    add("SE_SPOT", row.symbol, row.name, "SEK");
  }
  report("SE_SPOT", kept);
}

// ── Oslo ──────────────────────────────────────────────────────────────
//
// Euronext's public JSON is behind a route the page names for itself:
// each market page carries a `jsongateway` pointing at
// /en/product_directory/data/<slug>. The generic /pd/data/stocks
// endpoint that a previous attempt used answers with the right row count
// and every field blank, which is why Oslo was declared unreachable and
// filled from an index instead.

const OSLO_LISTS = [
  ["NO_OSE", "stocks-oslo-euronext-regulated-", "XOSL"],
  ["NO_EXPAND", "stocks-oslo-euronext-expand-", "XOAS"],
  ["NO_GROWTH", "stocks-oslo-euronext-growth-", "MERK"],
];

/**
 * Euronext shouts. Every name in the product directory is upper case —
 * "AKER BP", "ODFJELL SER. B" — which is not how anything else in this
 * universe is spelled and not how a person reads a list.
 *
 * Oslo Børs's own NewsWeb keeps the same companies in mixed case, keyed
 * by ticker, so that is where the names come from and Euronext is left
 * to do what only it can: say which of the three Oslo lists each one is
 * on. A B-share is registered under its issuer's ticker, so a miss
 * retries without the trailing class letter and puts the letter back on
 * the name, exactly as "ERIC B" is spelled everywhere else here.
 */
async function osloNames() {
  const response = await fetch("https://api3.oslo.oslobors.no/v1/newsreader/issuers", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`NewsWeb: HTTP ${response.status}`);

  const body = await response.json();
  const byTicker = new Map();
  for (const issuer of body?.data?.issuers ?? []) {
    if (issuer.issuerSign && !byTicker.has(issuer.issuerSign)) {
      byTicker.set(issuer.issuerSign, issuer.name);
    }
  }
  if (byTicker.size === 0) throw new Error("NewsWeb returned no issuers");
  return byTicker;
}

async function oslo() {
  const names = await osloNames();
  const unnamed = [];

  for (const [code, slug, mic] of OSLO_LISTS) {
    const response = await fetch(
      `https://live.euronext.com/en/product_directory/data/${slug}?mics=${mic}`,
      {
        method: "POST",
        headers: {
          "user-agent": UA,
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/x-www-form-urlencoded",
          referer: "https://live.euronext.com/en/markets/oslo/equities/list",
        },
        body: "draw=1&start=0&length=500&iDisplayLength=500&iDisplayStart=0",
      },
    );
    if (!response.ok) throw new Error(`Euronext ${mic}: HTTP ${response.status}`);

    const body = await response.json();
    const rows = body.aaData ?? [];
    if (rows.length < Number(body.iTotalRecords ?? 0)) {
      throw new Error(`Euronext ${mic}: ${rows.length} of ${body.iTotalRecords} — page it`);
    }
    // The blank-row failure this route exists to avoid returns a full
    // count and empty cells, so check a cell rather than the count.
    if (rows.length > 0 && !String(rows[0][2] ?? "").trim()) {
      throw new Error(`Euronext ${mic}: rows came back blank — the gateway has changed`);
    }

    report(code, rows.length);
    for (const row of rows) {
      const symbol = String(row[2] ?? "").trim().toUpperCase();
      const shouted =
        (String(row[0]).match(/data-title-hover="([^"]*)"/) ?? [])[1] ??
        String(row[0]).replace(/<[^>]+>/g, "");
      const currency =
        (String(row[4]).replace(/<[^>]+>/g, "").trim().match(/^([A-Z]{3})/) ?? [])[1] ?? "NOK";

      let name = names.get(symbol);
      if (!name) {
        const klass = symbol.match(/^(.+?)([A-D])$/);
        const parent = klass && names.get(klass[1]);
        if (parent) name = `${cleanName(parent)} ${klass[2]}`;
      }
      if (!name) {
        unnamed.push(`${code} ${symbol}`);
        name = shouted;
      }
      add(code, symbol, name, currency);
    }
    await sleep(700);
  }

  if (unnamed.length > 0) {
    console.error(
      `\n  ${unnamed.length} Oslo listing(s) NewsWeb does not name; Euronext's own spelling kept:`,
    );
    for (const line of unnamed) console.error(`    ${line}`);
  }
}

// ── Reporting ─────────────────────────────────────────────────────────

const fetched = new Map();
function report(code, count) {
  fetched.set(code, count);
  console.error(`  ${code.padEnd(10)} ${String(count).padStart(4)}`);
}

/**
 * What the generated file held last time, so that a run says what it
 * changed rather than only what it found. A market that empties out, or
 * a company the exchange has stopped listing, is worth seeing before the
 * file is written — not after the seed has run.
 */
function previous() {
  const held = new Map();
  try {
    const text = readFileSync(OUT, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/symbol: "([^"]+)", name: "([^"]+)", marketCode: "([^"]+)"/);
      if (match) held.set(`${match[3]} ${match[1]}`, match[2]);
    }
  } catch {
    // No previous file: everything is new, which is what an empty map says.
  }
  return held;
}

// ── Emit ──────────────────────────────────────────────────────────────

function emit() {
  const escape = (text) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines = [
    "/**",
    " * Generated by scripts/build-universe.mjs — do not edit by hand.",
    " *",
    " * Every Nordic list, taken from the exchange that publishes it:",
    " * Nasdaq's Nordic screener for the main-market segments and First",
    " * North of all four countries, NGM's and Spotlight's own APIs for the",
    " * Swedish growth venues, and Euronext's product directory for Oslo.",
    " *",
    " * Nothing here is matched by name or typed from memory. Re-run the",
    " * script to refresh it, then `npm run seed` to put it in Firestore.",
    " */",
    "",
    'import type { InstrumentSeed } from "./universe";',
    "",
    "export const NORDIC_LISTINGS: InstrumentSeed[] = [",
  ];

  for (const code of MARKET_ORDER) {
    const rows = instruments
      .filter((row) => row.marketCode === code)
      .sort((a, b) => a.symbol.localeCompare(b.symbol, "en"));
    if (rows.length === 0) continue;
    lines.push(`  // ${code} — ${rows.length}`);
    for (const row of rows) {
      lines.push(
        `  { symbol: "${escape(row.symbol)}", name: "${escape(row.name)}", ` +
          `marketCode: "${code}", currency: "${row.currency}" },`,
      );
    }
  }

  lines.push("];", "");
  return lines.join("\n");
}

// ── Run ───────────────────────────────────────────────────────────────

console.error("Nasdaq Nordic");
await nasdaq();
console.error("\nNGM");
await ngm();
console.error("\nSpotlight");
await spotlight();
console.error("\nOslo");
await oslo();

const unlisted = [...MARKET_ORDER].filter((code) => !fetched.has(code));
if (unlisted.length > 0) console.error(`\nNo source for: ${unlisted.join(", ")}`);

if (dropped.length > 0) {
  console.error(`\n${dropped.length} warrant, right or interim line(s) dropped:`);
  for (const line of dropped) console.error(`  ${line}`);
}

const held = previous();
const current = new Map(instruments.map((row) => [`${row.marketCode} ${row.symbol}`, row.name]));
const nowIn = new Map(instruments.map((row) => [row.symbol, row.marketCode]));
const added = [...current.keys()].filter((key) => !held.has(key));
const gone = [...held.keys()].filter((key) => !current.has(key));

// A company promoted out of Small Cap has not stopped existing, and the
// two cases want different things done about them: a move leaves the old
// document behind in Firestore, where it stays pickable under a heading
// the company has left. Both are the seed's business, and it can only
// act on what it is told, so both are named here.
const moved = gone.filter((key) => nowIn.has(key.split(" ").slice(1).join(" ")));
const delisted = gone.filter((key) => !moved.includes(key));

console.error(`\n${instruments.length} instruments across ${fetched.size} markets`);
console.error(`  ${added.length} not in the previous file`);
if (moved.length > 0) {
  console.error(`  ${moved.length} moved to another list:`);
  for (const key of moved) {
    const symbol = key.split(" ").slice(1).join(" ");
    console.error(`    ${key} — ${held.get(key)} → ${nowIn.get(symbol)}`);
  }
}
console.error(`  ${delisted.length} in the previous file and no longer listed anywhere:`);
for (const key of delisted) console.error(`    ${key} — ${held.get(key)}`);

// A rename is how a takeover, a demerger or a rebrand reaches this file,
// and it is the one change that alters nothing a seed keys on — same
// market, same ticker, different company on the label.
const renamed = [...current.keys()].filter(
  (key) => held.has(key) && held.get(key) !== current.get(key),
);
if (renamed.length > 0) {
  console.error(`  ${renamed.length} renamed:`);
  for (const key of renamed) console.error(`    ${key} — ${held.get(key)} → ${current.get(key)}`);
}

if (!WRITE) {
  console.error("\nReport only. Re-run with --write to rewrite lib/universe.generated.ts.");
  process.exit(0);
}

writeFileSync(OUT, emit());
console.error(`\nWrote ${OUT}`);
console.error("Run `npm run seed` to put it in Firestore.");
