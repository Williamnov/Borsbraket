#!/usr/bin/env node
/**
 * Turn a list of company names into instruments the seed can use.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * The four Stockholm lists — Mid Cap, Small Cap, First North and
 * Spotlight — are published as company names, not tickers. The app needs
 * tickers, and a wrong one is the worst kind of wrong: it does not fail,
 * it quietly prices a different company for somebody's month. So the
 * names are never typed from memory and never guessed at. They are
 * matched against a list of real Stockholm listings, and anything that
 * does not match cleanly is printed for a human rather than invented.
 *
 * Membership comes from scripts/data/SE_*.txt, which are the index
 * constituents. Spotlight is fetched live from Spotlight's own API,
 * because they publish one.
 *
 * Tickers come from TradingView's Swedish screener, which is the only
 * free source found that returns ticker and name together in bulk —
 * Nasdaq's Nordic feed is retired, Nordnet needs a session, and Yahoo's
 * search endpoint rate-limits long before 600 lookups.
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
    " * The Stockholm segment lists, matched from published index",
    " * membership against real listings. Re-run the script to refresh.",
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
