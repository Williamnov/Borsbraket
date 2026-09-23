#!/usr/bin/env node
/**
 * Spotlight Stock Market's companies.
 *
 * Spotlight publishes no list anywhere — the market overview is rendered
 * in the browser against a widget, and there is no export. What it does
 * have is the search box in the site header, which is an Umbraco
 * endpoint that will return everything matching a substring.
 *
 * So: ask it for every letter and digit and union the answers. Any
 * company name or ticker contains at least one of the thirty-six, so the
 * union is the whole list. It is thirty-six requests, run once.
 *
 * The path is /Umbraco/api/... — the leading segment matters, and
 * without it the endpoint 404s while the domain still answers 200,
 * which is why this was written off as unreachable the first time.
 *
 * Writes spotlight.json: [{instrumentId, symbol, name}]
 */

import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const found = new Map();
const letters = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

for (const [index, letter] of letters.entries()) {
  if (index > 0) await sleep(400);

  const url =
    `https://spotlightstockmarket.com/Umbraco/api/companyapi/CompanySimpleSearch` +
    `?searchText=${letter}&lang=en-US&getAll=true`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!response.ok) {
    console.error(`  ${letter}: HTTP ${response.status}`);
    continue;
  }

  const body = await response.json();
  for (const row of body.results ?? []) {
    // The API wraps the matched substring in <b><u>…</u></b>.
    const label = String(row.companyName ?? row.heading ?? "").replace(/<[^>]+>/g, "");
    const id = (String(row.url ?? "").match(/InstrumentId=([A-Za-z0-9]+)/) ?? [])[1];
    if (!id || found.has(id)) continue;

    // "Abera Bioscience (ABERA)" — name, then ticker in brackets.
    const match = label.match(/^(.*)\s+\(([^()]+)\)\s*$/);
    if (!match) continue;

    found.set(id, { instrumentId: id, name: match[1].trim(), symbol: match[2].trim() });
  }
  process.stderr.write(`  ${letter}: ${body.totalNumberOfHits ?? 0} hits, ${found.size} unique\n`);
}

const rows = [...found.values()];
if (rows.length === 0) {
  console.error("Spotlight returned nothing. The endpoint has changed shape.");
  process.exit(1);
}

writeFileSync("spotlight.json", JSON.stringify(rows, null, 1));
console.error(`\n${rows.length} instruments -> spotlight.json`);

// XSAT is Spotlight's own MIC. Anything else would mean the search has
// started returning another venue's instruments, which the build would
// then file under Spotlight.
const foreign = rows.filter((r) => !r.instrumentId.startsWith("XSAT"));
if (foreign.length > 0) {
  console.error(`  ${foreign.length} not on XSAT: ${foreign.slice(0, 5).map((r) => r.symbol).join(", ")}`);
}
