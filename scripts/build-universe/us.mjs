#!/usr/bin/env node
/** Pull the three US exchanges from Nasdaq's own screener, with market caps. */
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = [];
for (const exchange of ["NYSE", "NASDAQ", "AMEX"]) {
  const url =
    `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0` +
    `&exchange=${exchange}&download=true`;
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  const body = await response.json();
  const rows = body.data?.rows ?? body.data?.table?.rows ?? [];
  console.error(`${exchange}: ${rows.length}`);
  for (const row of rows) {
    out.push({
      exchange,
      symbol: row.symbol,
      name: row.name,
      lastsale: row.lastsale,
      marketCap: row.marketCap,
      country: row.country,
      sector: row.sector,
    });
  }
  await sleep(1500);
}
writeFileSync("us.json", JSON.stringify(out, null, 1));
console.error(`${out.length} rows -> us.json`);
