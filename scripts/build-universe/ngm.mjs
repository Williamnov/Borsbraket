#!/usr/bin/env node
/**
 * Nordic Growth Market's equities, from the exchange's own market pages.
 *
 * www.ngm.se/market is a single-page app; the data behind it is a POST
 * to ngm-api-prod.vmate.se/instrument/list with a filter body. That host
 * is named in the page's own bundle, which is how it was found.
 *
 * One trap worth knowing: without a browser user-agent, ngm.se answers
 * 406 to everything, which reads exactly like "this site has no data"
 * and is why NGM was written off as unreachable the first time round.
 *
 * Writes ngm.json: [{segment, symbol, name, isin, marketCap, type}]
 */

import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const response = await fetch("https://ngm-api-prod.vmate.se/instrument/list", {
  method: "POST",
  headers: {
    "user-agent": UA,
    "content-type": "application/json",
    accept: "application/json",
    origin: "https://www.ngm.se",
    referer: "https://www.ngm.se/",
  },
  // One page is plenty: the whole equity list is about a hundred names.
  // The same endpoint serves sixty-odd thousand certificates and
  // warrants, which is what `market: "equities"` keeps out.
  body: JSON.stringify({ page: 0, size: 1000, market: "equities", instrumentType: "ALL" }),
});

if (!response.ok) {
  console.error(`NGM: HTTP ${response.status}`);
  process.exit(1);
}

const body = await response.json();
const rows = body.data ?? [];

if (rows.length < body.totalNumber) {
  console.error(`NGM returned ${rows.length} of ${body.totalNumber} — raise the page size.`);
  process.exit(1);
}

const out = rows.map((row) => ({
  segment: row.marketSegment,
  symbol: row.symbol,
  name: row.name,
  isin: row.isin,
  marketCap: row.marketCap,
  type: row.type,
}));

writeFileSync("ngm.json", JSON.stringify(out, null, 1));

const bySegment = new Map();
for (const row of out) bySegment.set(row.segment, (bySegment.get(row.segment) ?? 0) + 1);
console.error(`${out.length} instruments -> ngm.json`);
for (const [segment, count] of bySegment) console.error(`  ${segment ?? "(none)"}: ${count}`);
