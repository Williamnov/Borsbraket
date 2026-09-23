#!/usr/bin/env python3
"""Write lib/universe.instruments.ts from instruments.json."""
import json
from collections import Counter, OrderedDict

ORDER = [
    ("SE_LARGE", "SEK"), ("SE_MID", "SEK"), ("SE_SMALL", "SEK"), ("SE_FN", "SEK"),
    ("FI_LARGE", "EUR"), ("FI_MID", "EUR"), ("FI_SMALL", "EUR"), ("FI_FN", "EUR"),
    ("DK_LARGE", "DKK"), ("DK_MID", "DKK"), ("DK_SMALL", "DKK"), ("DK_FN", "DKK"),
    ("NO_OSE", "NOK"),
    ("IS_LARGE", "ISK"), ("IS_MID", "ISK"), ("IS_SMALL", "ISK"), ("IS_FN", "ISK"),
    ("US_NYSE", "USD"), ("US_NASDAQ", "USD"), ("US_AMEX", "USD"), ("CA_TSX", "CAD"),
    ("UK_LSE", "GBP"),
    ("DE_XETRA", "EUR"), ("FR_EPA", "EUR"), ("CH_SIX", "CHF"), ("NL_AMS", "EUR"),
    ("ES_BME", "EUR"), ("IT_MIL", "EUR"),
    ("JP_TSE", "JPY"), ("AU_ASX", "AUD"),
]

HEADING = {
    "SE_LARGE": "Sweden — Nasdaq Stockholm and First North",
    "FI_LARGE": "Finland — Nasdaq Helsinki and First North",
    "DK_LARGE": "Denmark — Nasdaq Copenhagen and First North",
    "NO_OSE": "Norway — Oslo Børs",
    "IS_LARGE": "Iceland — Nasdaq Iceland and First North",
    "US_NYSE": "North America",
    "UK_LSE": "United Kingdom",
    "DE_XETRA": "Continental Europe",
    "JP_TSE": "Asia-Pacific",
}

SOURCE_NOTE = {
    "SE_LARGE": "Nasdaq's own screener, so the Large/Mid/Small split is the exchange's.",
    "FI_LARGE": "Nasdaq's own screener.",
    "DK_LARGE": "Nasdaq's own screener.",
    "NO_OSE": "The OBX index, plus the names that were already here.",
    "IS_LARGE": "Nasdaq's own screener. Iceland's Large Cap really is five names.",
    "US_NYSE": "Nasdaq's US screener, above USD 10bn on NYSE and Nasdaq and USD 1bn\n  // on NYSE American; Toronto is the S&P/TSX Composite.",
    "UK_LSE": "The FTSE 100 and the FTSE 250.",
    "DE_XETRA": "DAX and MDAX, CAC 40, SMI and SMIM, AEX and AMX, IBEX 35, FTSE MIB.",
    "JP_TSE": "JPX's listed-company master, TOPIX Core30, Large70 and Mid400;\n  // Sydney is the S&P/ASX 200.",
}


def ts(text):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


rows = json.load(open("instruments.json"))
by_market = OrderedDict()
for row in rows:
    by_market.setdefault(row["marketCode"], []).append(row)

missing = set(by_market) - {m for m, _ in ORDER}
assert not missing, f"no position in ORDER for {missing}"

out = []
out.append('''/**
 * The pickable universe: every instrument, by market.
 *
 * Split out of lib/universe.ts because it is three and a half thousand
 * rows, and UniverseAdmin — a client component — imports instrumentId
 * from there. Tree shaking ought to keep this out of the browser bundle
 * either way, but "ought to" is not a thing to leave a hundred and
 * twenty kilobytes of tickers resting on.
 *
 * ── Where these came from ─────────────────────────────────────────────
 *
 * Nothing here is typed out by hand. Each market is generated from a
 * source that is accountable for the list:
 *
 *   Nasdaq Nordic's screener  every share on Stockholm, Helsinki,
 *                             Copenhagen and Reykjavík, already labelled
 *                             Large, Mid, Small or First North
 *   Nasdaq's US screener      NYSE, Nasdaq and NYSE American, with the
 *                             market caps the size floors below use
 *   JPX's company master      every Prime Market listing, with its TOPIX
 *                             size class
 *   Index constituent tables  everywhere else
 *
 * The Nordic segments are the exchange's own, which is what the previous
 * note here said could not be guessed at — and was right. They are
 * reviewed annually, so this is a snapshot: re-run the generator rather
 * than editing a name into a segment by hand.
 *
 * ── What is NOT here ──────────────────────────────────────────────────
 *
 * Spotlight, NGM, NGM PepMarket, Nordic SME, Spotlight Denmark and the
 * two Euronext Growth/Expand lists in Oslo are still empty. Those
 * venues publish no list this could read — Euronext actively refuses
 * one — so their names go in from the admin panel. The markets exist so
 * that an instrument has somewhere to go.
 *
 * ── Before trusting a new name ────────────────────────────────────────
 *
 * A name nobody can price is worse than a name nobody can pick.
 * scripts/verify-universe.mjs checks every symbol here against the price
 * feed and prints the ones it cannot resolve; the Verify universe
 * workflow runs it on a GitHub runner. It has not been run against this
 * set yet — see STATUS.md.
 */

import type { InstrumentSeed } from "./universe";

/**
 * Rows are [symbol, name] and take the market's currency, or
 * [symbol, name, currency] where one listing differs — Verisure trades
 * on Stockholm in euro.
 */
function list(
  marketCode: string,
  currency: string,
  rows: ([string, string] | [string, string, string])[],
): InstrumentSeed[] {
  return rows.map(([symbol, name, own]) => ({
    symbol,
    name,
    marketCode,
    currency: own ?? currency,
  }));
}

export const INSTRUMENTS: InstrumentSeed[] = [''')

first = True
for market, default_currency in ORDER:
    market_rows = by_market.get(market)
    if not market_rows:
        continue
    if market in HEADING:
        rule = "─" * max(3, 66 - len(HEADING[market]))
        out.append(f"\n  // {HEADING[market]} {rule}")
        if market in SOURCE_NOTE:
            out.append(f"  // {SOURCE_NOTE[market]}")
    out.append(f"\n  ...list({ts(market)}, {ts(default_currency)}, [")

    line = "   "
    for row in market_rows:
        if row["currency"] == default_currency:
            entry = f" [{ts(row['symbol'])}, {ts(row['name'])}],"
        else:
            entry = f" [{ts(row['symbol'])}, {ts(row['name'])}, {ts(row['currency'])}],"
        if len(line) + len(entry) > 98:
            out.append(line)
            line = "   "
        line += entry
    if line.strip():
        out.append(line)
    out.append("  ]),")

out.append('''
  // Priced alongside the picks for comparison, never pickable.
  { symbol: "OMXS30", name: "OMX Stockholm 30", marketCode: "SE_LARGE", currency: "SEK", isBenchmark: true },
  { symbol: "SPX", name: "S&P 500", marketCode: "US_NYSE", currency: "USD", isBenchmark: true },
];
''')

open("universe.instruments.ts", "w", encoding="utf8").write("\n".join(out))
print(f"{len(rows)} instruments written")
print(f"{sum(len(l) for l in out)} bytes, {len(out)} lines")
