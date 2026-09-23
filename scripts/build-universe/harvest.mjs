#!/usr/bin/env node
/**
 * Pull the current Nasdaq Nordic constituent lists straight from the
 * exchange's own screener, one (category, market, segment) at a time, so
 * every row arrives already labelled with the list it belongs to.
 *
 * Writes nordic.json: [{category, market, segment, symbol, name, currency,
 * isin, orderbookId, turnover, sector}]
 */

import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BASE = "https://api.nasdaq.com/api/nordic/screener/shares";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchList(params) {
  const query = new URLSearchParams({ tableonly: "false", ...params });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`${BASE}?${query}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(attempt * 4000);
      continue;
    }
    const body = await response.json();
    if (!body.data) return { error: JSON.stringify(body.status?.bCodeMessage ?? body.status) };
    return { rows: body.data.instrumentListing?.rows ?? [], total: body.data.pagination?.total ?? 0 };
  }
  return { error: "gave up" };
}

const MARKETS = ["STO", "HEL", "CPH", "ICE"];
const SEGMENTS = ["LARGE_CAP", "MID_CAP", "SMALL_CAP"];

const out = [];

for (const market of MARKETS) {
  for (const segment of SEGMENTS) {
    const { rows, total, error } = await fetchList({ category: "MAIN_MARKET", market, segment });
    if (error) {
      console.error(`MAIN_MARKET ${market} ${segment}: ${error}`);
      continue;
    }
    console.error(`MAIN_MARKET ${market} ${segment}: ${rows.length} (total ${total})`);
    for (const row of rows) {
      out.push({
        category: "MAIN_MARKET",
        market,
        segment,
        symbol: row.symbol,
        name: row.fullName,
        currency: row.currency,
        isin: row.isin,
        orderbookId: row.orderbookId,
        turnover: row.turnover,
        lastSalePrice: row.lastSalePrice,
        sector: row.sector,
      });
    }
    await sleep(700);
  }

  const fn = await fetchList({ category: "FIRST_NORTH", market });
  if (fn.error) {
    console.error(`FIRST_NORTH ${market}: ${fn.error}`);
  } else {
    console.error(`FIRST_NORTH ${market}: ${fn.rows.length} (total ${fn.total})`);
    for (const row of fn.rows) {
      out.push({
        category: "FIRST_NORTH",
        market,
        segment: "",
        symbol: row.symbol,
        name: row.fullName,
        currency: row.currency,
        isin: row.isin,
        orderbookId: row.orderbookId,
        turnover: row.turnover,
        lastSalePrice: row.lastSalePrice,
        sector: row.sector,
      });
    }
  }
  await sleep(700);
}

writeFileSync("nordic.json", JSON.stringify(out, null, 1));
console.error(`\n${out.length} rows written to nordic.json`);
