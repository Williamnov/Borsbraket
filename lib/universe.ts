/**
 * The pickable universe: the markets, and how an instrument is named.
 *
 * MARKETS covers every Nordic list, the main North American and UK
 * exchanges, the large continental European venues and Tokyo and Sydney.
 * Disable a market in the admin panel to close it.
 *
 * The instruments themselves are in ./universe.instruments — nearly four
 * thousand rows, generated from each exchange's own lists rather
 * than typed out, which is also why the Mid and Small Cap segments are
 * no longer empty. See that file for where every market's names came
 * from and which venues still have none.
 *
 * Nothing can be picked that is not in that collection.
 */

export type MarketSeed = {
  code: string;
  name: string;
  country: string;
  region: string;
  currency: string;
  sortOrder: number;
};

export type InstrumentSeed = {
  symbol: string;
  name: string;
  marketCode: string;
  currency: string;
  isBenchmark?: boolean;
};

export const MARKETS: MarketSeed[] = [
  { code: "SE_LARGE", name: "Large Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 10 },
  { code: "SE_MID", name: "Mid Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 11 },
  { code: "SE_SMALL", name: "Small Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 12 },
  { code: "SE_FN", name: "First North", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 13 },
  { code: "SE_SPOT", name: "Spotlight", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 14 },
  { code: "SE_NGM", name: "NGM Main Market", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 15 },
  { code: "SE_NGMPEP", name: "NGM PepMarket", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 16 },
  // The code stays SE_SME so no instrument id changes, but the name does
  // not: NGM's MTF is called NGM Growth Market now, its own site no
  // longer says "Nordic SME" anywhere, and its API reports exactly two
  // equity segments — Main Market and Growth Market.
  { code: "SE_SME", name: "NGM Growth Market", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 17 },

  { code: "FI_LARGE", name: "Large Cap Helsinki", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 20 },
  { code: "FI_MID", name: "Mid Cap Helsinki", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 21 },
  { code: "FI_SMALL", name: "Small Cap Helsinki", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 22 },
  { code: "FI_FN", name: "First North Finland", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 23 },

  { code: "DK_LARGE", name: "Large Cap Copenhagen", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 30 },
  { code: "DK_MID", name: "Mid Cap Copenhagen", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 31 },
  { code: "DK_SMALL", name: "Small Cap Copenhagen", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 32 },
  { code: "DK_FN", name: "First North Denmark", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 33 },
  { code: "DK_SPOT", name: "Spotlight Denmark", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 34 },

  { code: "NO_OSE", name: "Oslo Børs", country: "Norway", region: "Nordics", currency: "NOK", sortOrder: 40 },
  { code: "NO_EXPAND", name: "Euronext Expand Oslo", country: "Norway", region: "Nordics", currency: "NOK", sortOrder: 41 },
  { code: "NO_GROWTH", name: "Euronext Growth Oslo", country: "Norway", region: "Nordics", currency: "NOK", sortOrder: 42 },

  { code: "IS_LARGE", name: "Large Cap Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 50 },
  { code: "IS_MID", name: "Mid Cap Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 51 },
  { code: "IS_SMALL", name: "Small Cap Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 52 },
  { code: "IS_FN", name: "First North Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 53 },

  { code: "US_NYSE", name: "NYSE", country: "United States", region: "North America", currency: "USD", sortOrder: 60 },
  { code: "US_NASDAQ", name: "Nasdaq", country: "United States", region: "North America", currency: "USD", sortOrder: 61 },
  { code: "US_AMEX", name: "NYSE American", country: "United States", region: "North America", currency: "USD", sortOrder: 62 },
  { code: "CA_TSX", name: "Toronto Stock Exchange", country: "Canada", region: "North America", currency: "CAD", sortOrder: 70 },
  { code: "UK_LSE", name: "London Stock Exchange", country: "United Kingdom", region: "United Kingdom", currency: "GBP", sortOrder: 80 },

  { code: "DE_XETRA", name: "Xetra", country: "Germany", region: "Europe", currency: "EUR", sortOrder: 90 },
  { code: "FR_EPA", name: "Euronext Paris", country: "France", region: "Europe", currency: "EUR", sortOrder: 91 },
  { code: "CH_SIX", name: "SIX Swiss Exchange", country: "Switzerland", region: "Europe", currency: "CHF", sortOrder: 92 },
  { code: "NL_AMS", name: "Euronext Amsterdam", country: "Netherlands", region: "Europe", currency: "EUR", sortOrder: 93 },
  { code: "ES_BME", name: "Bolsa de Madrid", country: "Spain", region: "Europe", currency: "EUR", sortOrder: 94 },
  { code: "IT_MIL", name: "Borsa Italiana", country: "Italy", region: "Europe", currency: "EUR", sortOrder: 95 },

  { code: "JP_TSE", name: "Tokyo Stock Exchange", country: "Japan", region: "Asia-Pacific", currency: "JPY", sortOrder: 110 },
  { code: "AU_ASX", name: "Australian Securities Exchange", country: "Australia", region: "Asia-Pacific", currency: "AUD", sortOrder: 111 },
];

/*
 * A MARKET_MIC table used to live here, mapping each market to its ISO
 * 10383 venue code. It existed for one caller — Twelve Data's `mic_code`
 * parameter — and went with it. Naming the exchange is still necessary
 * ("SAN" is Sanofi in Paris and Banco Santander in Madrid), but each
 * feed spells that its own way, so the translation now sits beside the
 * feed in scripts/fetch-prices.mjs. What the app hands out is the
 * market code, which is its own fact rather than any vendor's.
 */

/** Stable Firestore document id for an instrument. */
export function instrumentId(marketCode: string, symbol: string): string {
  return `${marketCode}_${symbol.replace(/[^A-Za-z0-9]+/g, "-")}`;
}
