#!/usr/bin/env node
/**
 * Turn a list of company names into instruments the seed can use.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * The Swedish lists below Large Cap — Mid Cap, Small Cap, First North,
 * Spotlight and NGM's two segments — are published as company names, not
 * tickers. The app needs tickers, and a wrong one is the worst kind of
 * wrong: it does not fail, it quietly prices a different company for
 * somebody's month. So the names are never typed from memory and never
 * guessed at. They are matched against a list of real Swedish listings,
 * and anything that does not match cleanly is printed for a human rather
 * than invented.
 *
 * Membership comes from scripts/data/SE_*.txt, which are the index
 * constituents. Spotlight and NGM are fetched live from their own APIs,
 * because both publish one — which took two goes to establish: see the
 * note above ngmLists().
 *
 * Tickers come from TradingView's Swedish screener, which is the only
 * free source found that returns ticker and name together in bulk —
 * Nordnet needs a session, and Yahoo's search endpoint rate-limits long
 * before 600 lookups. It covers both venues: of its eleven hundred
 * Swedish listings, 239 are on NGM, which is what makes matching NGM
 * and Spotlight names against it work at all.
 *
 *   node scripts/resolve-tickers.mjs            # report only
 *   node scripts/resolve-tickers.mjs --write    # rewrite the seed block
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "data");
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** The lists that ship as files, and the market each one fills. */
const FILE_LISTS = [
  ["SE_MID", "SE_MID.txt"],
  ["SE_SMALL", "SE_SMALL.txt"],
  ["SE_FN", "SE_FN.txt"],
];

/**
 * Corporate furniture that appears on one side of a match and not the
 * other. "Storytel" and "Storytel AB (publ)" are the same company.
 *
 * GROUP and HOLDING are deliberately *not* here: they distinguish real
 * companies from each other, and dropping them invites a false match.
 */
const NOISE =
  /\b(AB|PUBL|PLC|ASA|OYJ|A\/S|AS|SE|AG|LTD|CORP|CORPORATION|INC|COMPANY|CLASS|SA|NV|OY)\b/g;

/** The share class, which has to survive normalisation to be matched on. */
function splitClass(raw) {
  const m = String(raw)
    .trim()
    .match(/[\s_.]([A-D])$/i);
  return m ? { base: raw.slice(0, m.index), cls: m[1].toUpperCase() } : { base: raw, cls: "" };
}

function normalise(raw) {
  return String(raw)
    .toUpperCase()
    .replace(/[ÅÄÁÀ]/g, "A")
    .replace(/[ÖÓÒØ]/g, "O")
    .replace(/[ÉÈÊ]/g, "E")
    .replace(/[ÜÚÙ]/g, "U")
    .replace(/&/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A name plus its class, both normalised, as one comparable key. */
function key(raw) {
  const { base, cls } = splitClass(raw);
  return `${normalise(base)}${cls ? `|${cls}` : ""}`;
}

async function tradingViewListings() {
  const response = await fetch("https://scanner.tradingview.com/sweden/scan", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/json" },
    body: JSON.stringify({
      filter: [{ left: "type", operation: "equal", right: "stock" }],
      symbols: { query: { types: [] }, tickers: [] },
      columns: ["name", "description", "market_cap_basic", "exchange", "currency"],
      sort: { sortBy: "name", sortOrder: "asc" },
      range: [0, 1500],
    }),
  });
  if (!response.ok) throw new Error(`TradingView: HTTP ${response.status}`);
  const body = await response.json();
  return body.data.map((row) => ({
    ticker: row.d[0],
    name: row.d[1],
    mcap: row.d[2],
    exchange: row.d[3],
    currency: row.d[4],
  }));
}

async function spotlightNames() {
  const response = await fetch(
    "https://spotlightstockmarket.com/Umbraco/api/companyapi/GetCompanies",
    { headers: { "user-agent": UA } },
  );
  if (!response.ok) throw new Error(`Spotlight: HTTP ${response.status}`);
  const body = await response.json();
  return (body.results ?? []).map((r) => r.heading).filter(Boolean);
}

/**
 * NGM's two equity segments, from NGM's own market pages.
 *
 * www.ngm.se/market is a single-page app and the API behind it is named
 * in its own bundle: a POST to ngm-api-prod.vmate.se with a filter body,
 * which returns every NGM equity with its segment and its ISIN. Worth
 * knowing before writing NGM off again — ngm.se answers 406 to a request
 * with no browser user-agent, which reads exactly like a venue that
 * publishes nothing.
 *
 * "NGM Growth Market" is the MTF this universe's market list still calls
 * Nordic SME. NGM's site no longer uses that name anywhere and its API
 * reports exactly these two segments, so SE_SME keeps its code — no
 * instrument id changes — and gets the current name in lib/universe.ts.
 *
 * Returns names, not tickers, even though the API has both: the point of
 * the matching below is that a ticker is confirmed against a real
 * listing rather than taken on one source's word.
 */
const NGM_SEGMENT = { "NGM Main Market": "SE_NGM", "NGM Growth Market": "SE_SME" };

/**
 * Subscription warrants and interim shares, which trade beside the
 * ordinary share and are not the company.
 *
 * TO is teckningsoption, BTA a paid subscribed share, BTU a paid
 * subscribed unit, UR and TR the rights themselves. They all expire, and
 * a month is not a thing to hold one for. Matched on the ticker rather
 * than the name so that a company merely containing the letters is safe.
 */
const NOT_AN_ORDINARY_SHARE = /(^|\s)(TO|BTA|BTU|BT|UR|TR|IR|UNIT|UNITS)(\s|$|\s*\d)/i;

async function ngmLists() {
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
    // warrants; `market: "equities"` is what keeps them out.
    body: JSON.stringify({ page: 0, size: 1000, market: "equities", instrumentType: "ALL" }),
  });
  if (!response.ok) throw new Error(`NGM: HTTP ${response.status}`);

  const body = await response.json();
  const rows = body.data ?? [];
  if (rows.length < (body.totalNumber ?? 0)) {
    throw new Error(`NGM returned ${rows.length} of ${body.totalNumber} — raise the page size`);
  }

  const lists = new Map(Object.values(NGM_SEGMENT).map((code) => [code, []]));
  for (const row of rows) {
    const marketCode = NGM_SEGMENT[row.marketSegment ?? ""];
    // `type` is the exchange's own word for it, and separates the
    // ordinary shares from the subscription rights outright.
    if (!marketCode || row.type !== "Shares") continue;
    if (NOT_AN_ORDINARY_SHARE.test(row.symbol) || NOT_AN_ORDINARY_SHARE.test(row.name)) continue;
    lists.get(marketCode).push(row.name);
  }
  return [...lists];
}

/**
 * Our symbol from TradingView's.
 *
 * TradingView separates the share class with an underscore or a dot;
 * the universe here uses a space, the same way Nasdaq writes it, and
 * scripts/fetch-prices.mjs turns that space into the hyphen the feed
 * wants. So one substitution covers all three spellings.
 */
function ourSymbol(ticker) {
  return ticker.replace(/[_.]/g, " ").trim();
}

function buildIndex(listings) {
  const byName = new Map();
  const byTicker = new Map();
  for (const row of listings) {
    const k = key(row.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(row);
    byTicker.set(key(row.ticker), row);
  }
  return { byName, byTicker };
}

function match(name, index) {
  const k = key(name);

  // 1. The name, with its share class, matches outright.
  const exact = index.byName.get(k);
  if (exact && exact.length === 1) return { row: exact[0], how: "name" };
  if (exact && exact.length > 1) return { ambiguous: exact, how: "name" };

  // 2. The list is naming the company by its ticker — "MTG B", "BTS Group B".
  const byTicker = index.byTicker.get(k);
  if (byTicker) return { row: byTicker, how: "ticker" };

  // 3. One side carries words the other leaves off: "Cibus Nordic Real
  //    Estate" against "Cibus Nordic Real Estate AB". Only accepted when
  //    exactly one listing starts with the whole of the shorter name, so
  //    a company that is a prefix of two others stays unmatched.
  const [base, cls = ""] = k.split("|");
  const starts = [];
  for (const [candidate, rows] of index.byName) {
    const [cbase, ccls = ""] = candidate.split("|");
    if (cls && ccls && cls !== ccls) continue;
    if (cbase === base || cbase.startsWith(`${base} `) || base.startsWith(`${cbase} `)) {
      starts.push(...rows);
    }
  }
  if (starts.length === 1) return { row: starts[0], how: "prefix" };
  if (starts.length > 1) return { ambiguous: starts, how: "prefix" };

  return null;
}

async function main() {
  const write = process.argv.includes("--write");

  console.log("Fetching Stockholm listings from TradingView…");
  const listings = await tradingViewListings();
  console.log(`  ${listings.length} listings\n`);
  const index = buildIndex(listings);

  const lists = [];
  for (const [marketCode, file] of FILE_LISTS) {
    const path = resolve(DATA, file);
    if (!existsSync(path)) {
      console.log(`  ${file} missing — skipping ${marketCode}`);
      continue;
    }
    const names = readFileSync(path, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
    lists.push([marketCode, names]);
  }

  console.log("Fetching Spotlight's own company list…");
  try {
    const names = await spotlightNames();
    console.log(`  ${names.length} companies\n`);
    lists.push(["SE_SPOT", names]);
  } catch (error) {
    console.log(`  failed: ${error.message}\n`);
  }

  console.log("Fetching NGM's own company list…");
  try {
    for (const [marketCode, names] of await ngmLists()) {
      console.log(`  ${marketCode}: ${names.length} companies`);
      lists.push([marketCode, names]);
    }
    console.log();
  } catch (error) {
    console.log(`  failed: ${error.message}\n`);
  }

  const resolved = new Map();
  const unmatched = [];
  const ambiguous = [];
  const seen = new Set();

  for (const [marketCode, names] of lists) {
    const rows = [];
    for (const name of names) {
      const hit = match(name, index);
      if (!hit) {
        unmatched.push(`${marketCode}: ${name}`);
        continue;
      }
      if (hit.ambiguous) {
        ambiguous.push(`${marketCode}: ${name} -> ${hit.ambiguous.map((r) => r.ticker).join(", ")}`);
        continue;
      }
      const symbol = ourSymbol(hit.row.ticker);
      // One instrument, one market. A company in two of the lists — they
      // are snapshots taken at different times — keeps the first.
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      rows.push([symbol, hit.row.name.replace(/\s+/g, " ").trim()]);
    }
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    resolved.set(marketCode, rows);
  }

  console.log("Resolved:");
  for (const [marketCode, rows] of resolved) {
    console.log(`  ${marketCode.padEnd(10)} ${String(rows.length).padStart(4)}`);
  }
  console.log(`\nUnmatched: ${unmatched.length}   Ambiguous: ${ambiguous.length}`);
  for (const line of [...ambiguous, ...unmatched].slice(0, 40)) console.log(`  ${line}`);
  if (unmatched.length + ambiguous.length > 40) {
    console.log(`  … and ${unmatched.length + ambiguous.length - 40} more`);
  }

  if (!write) {
    console.log("\nReport only. Pass --write to update lib/universe.ts.");
    return;
  }

  const out = resolve(here, "..", "lib", "universe.generated.ts");
  const parts = [
    "/**",
    " * Generated by scripts/resolve-tickers.mjs — do not edit by hand.",
    " *",
    " * The Swedish lists below Large Cap — Mid Cap, Small Cap, First",
    " * North, Spotlight and NGM — matched from published membership",
    " * against real listings. Re-run the script to refresh.",
    " */",
    "",
    'import type { InstrumentSeed } from "./universe";',
    "",
    "export const STOCKHOLM_SEGMENTS: InstrumentSeed[] = [",
  ];
  for (const [marketCode, rows] of resolved) {
    parts.push(`  // ${marketCode} — ${rows.length}`);
    for (const [symbol, name] of rows) {
      const safe = name.replace(/"/g, '\\"');
      parts.push(
        `  { symbol: ${JSON.stringify(symbol)}, name: "${safe}", marketCode: "${marketCode}", currency: "SEK" },`,
      );
    }
  }
  parts.push("];", "");
  writeFileSync(out, parts.join("\n"));
  console.log(`\nWrote ${out}`);
}

main().catch((error) => {
  console.error(`\n${error.message ?? error}`);
  process.exit(1);
});
