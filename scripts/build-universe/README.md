# Building the universe

These are the scripts that produced `lib/universe.instruments.ts`. They ran once, on 2026-09-23,
and are committed so that the next person can re-run them rather than take the file on trust.

Nothing here runs in CI, on a schedule, or in the app. They talk to Nasdaq, JPX, NGM, Spotlight and
Wikipedia; the deployed site talks to none of those.

## Why generate it at all

The list this replaced was maintained by hand, and it had drifted in exactly the ways a hand-kept
list does: a company that had been taken private, two that had changed exchange, one the exchange
had delisted, and seven filed under a segment they had been promoted out of. None of that is
carelessness — it is what happens to four hundred tickers over a year with no source to check them
against.

The bigger problem was the Nordic segments. Mid Cap, Small Cap and First North were seeded empty on
the grounds that membership is reshuffled annually and a guess would put wrong names in front of
players. That reasoning was right. It just turned out that Nasdaq publishes the answer.

## The sources

| Markets | Source | Why it is trusted |
| --- | --- | --- |
| `SE_*`, `FI_*`, `DK_*`, `IS_*` | `api.nasdaq.com/api/nordic/screener/shares`, filtered by `market` and `segment` | The exchange's own screener. It is the thing that *decides* the segments. |
| `US_NYSE`, `US_NASDAQ`, `US_AMEX` | `api.nasdaq.com/api/screener/stocks` | Carries market caps, which is how the size floors below are applied. |
| `JP_TSE` | JPX's listed-company master (`data_e.xlsx`) | The exchange's own file, with each listing's TOPIX size class. |
| `SE_NGM`, `SE_SME` | `ngm-api-prod.vmate.se/instrument/list` | NGM's own market pages, segment included. |
| `SE_SPOT` | `spotlightstockmarket.com/Umbraco/api/companyapi/CompanySimpleSearch` | Spotlight's own site search. |
| everything else | Wikipedia index constituent tables | Not an exchange, and treated accordingly — see **What this does not guarantee**. |

Euronext was tried for Oslo, Paris, Amsterdam and Milan and abandoned. `live.euronext.com` returns
`{"iTotalRecords":199,"aaData":[[],[],…]}` — the right row count and every field blank — unless the
request arrives with a browser session, and the CSV download redirects to an antibot page. That is
why Oslo is the OBX index merged with what was already there, rather than a listing.

**NGM and Spotlight were written off as unreachable on the first pass, and both were wrong.** NGM
answers `406` to every request without a browser user-agent, and Spotlight's search endpoint is
under `/Umbraco/`, which is easy to miss because the domain still answers `200` to the path without
it. Both failures look exactly like "this venue publishes nothing". They are worth 236 instruments.
If another venue looks unreachable, check the headers and the path before believing it.

Spotlight has no list at all, only a search box — so `spotlight.mjs` asks it for each letter and
digit in turn and unions the answers, on the grounds that every name contains at least one of the
thirty-six.

## What is regenerated and what is merged

The four Nasdaq Nordic countries are **regenerated outright**: the screener is the whole exchange,
so whatever it does not list is not listed.

Everywhere else is **merged** with the previous contents. Those sources are indices, not exchanges —
a company can be genuinely listed in Frankfurt and not be in the DAX or the MDAX. Dropping it
because an index does not mention it would be throwing away a name somebody had already checked
against the price feed. `RETIRED` in `build.py` is the short list of entries the sources positively
contradict, each with its reason, so nothing disappears without being named.

## Size floors

Nearly four thousand instruments is already a lot to read on a cold cache; the whole US market
is thirty thousand lines of shell companies and closed-end funds. So:

- NYSE and Nasdaq: market cap at or above **USD 10bn**
- NYSE American: at or above **USD 1bn**
- Tokyo: Prime Market, TOPIX **Core30, Large70 or Mid400**
- Nordics: **everything**, including First North, because the whole premise of the league is Nordic
  coverage and a market can be closed in the admin panel if it turns out nobody wants it

Warrants, units, rights, preferred lines and notes are filtered out by name and by ticker suffix.
Watch the word boundaries in `NOT_A_SHARE` if you touch it: an earlier version matched `unit` without
a trailing `\b` and silently dropped UnitedHealth and United Parcel Service.

The Swedish growth venues need their own filter, `NOT_AN_ORDINARY_SHARE`. Small companies raise
money by issuing subscription warrants and interim shares, and those trade alongside the ordinary
share under names like `SMOL TO 9`, `APTA BTU` and `ZENZIP BTA B` — TO is *teckningsoption*, BTA a
paid subscribed share, BTU a paid subscribed unit, UR and TR the rights themselves. They all expire
and none of them is the company. Eleven of Spotlight's 150 are these.

## Running it

```bash
cd scripts/build-universe

node harvest.mjs            # -> nordic.json   (~20 requests)
node us.mjs                 # -> us.json       (3 requests)
node ngm.mjs                # -> ngm.json      (1 request)
node spotlight.mjs          # -> spotlight.json (36 requests)
curl -o jpx.xlsx https://www.jpx.co.jp/english/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_e.xlsx

python3 fetch-wikipedia.py OBX_Index CAC_40 AEX_index AMX_index DAX MDAX \
    Swiss_Market_Index SMIM IBEX_35 FTSE_MIB FTSE_100_Index FTSE_250_Index \
    'S&P/TSX_Composite_Index' 'S&P/ASX_200'

python3 extract-existing.py # -> existing.json, read back out of the current file
python3 build.py            # -> instruments.json, and the reconciliation report
python3 emit.py             # -> universe.instruments.ts

cp universe.instruments.ts ../../lib/
```

Read `build.py`'s output before copying anything. It prints what it retired, what the exchange no
longer lists, and the count per market.

**The `WIKI` table in `build.py` pins a table index and two column indices per page.** Wikipedia
articles get re-edited and tables get reordered, so check the `kept N of M` line for each page — a
page whose table moved will keep a plausible-looking number of rows out of the wrong table.

## What this does not guarantee

That the price feed can price any of it. The exchanges say what is listed; they say nothing about
what Yahoo calls it, and those are different questions. `npm run verify`, or the **Verify universe**
workflow, is what answers the second one — run it after regenerating, before seeding.
