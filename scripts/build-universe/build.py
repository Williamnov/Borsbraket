#!/usr/bin/env python3
"""
Turn the harvested sources into the INSTRUMENTS body of lib/universe.ts.

Sources, in order of authority:
  nordic.json  Nasdaq Nordic's own screener  (segment membership included)
  us.json      Nasdaq's US screener          (market cap included)
  jpx.xlsx     JPX's listed-company master   (TOPIX size class included)
  wk_*.html    Wikipedia index constituents  (everything else)
  existing.json  what lib/universe.instruments.ts already had,
                 via extract-existing.py

The Nordic lists are regenerated outright, because the exchange's own
segmentation is the thing that was missing. Everywhere else the sources
are merged with what was already there: those names were checked against
the price feed once and there is no reason to throw that away because an
index happens not to include them.

Writes instruments.json (data) and blocks.ts (paste-ready).
"""
import html
import json
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict

# ── shared helpers ────────────────────────────────────────────────────


def strip_tags(cell):
    cell = re.sub(r"<sup.*?</sup>", "", cell, flags=re.S)
    cell = re.sub(r"<style.*?</style>", "", cell, flags=re.S)
    cell = re.sub(r"<[^>]+>", "", cell, flags=re.S)
    return html.unescape(cell).replace("\xa0", " ").strip()


def wiki_tables(path):
    doc = open(path, encoding="utf8", errors="replace").read()
    out = []
    for tbl in re.findall(r"<table.*?</table>", doc, flags=re.S):
        rows = []
        for tr in re.findall(r"<tr.*?</tr>", tbl, flags=re.S):
            cells = [strip_tags(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, flags=re.S)]
            if cells:
                rows.append(cells)
        if len(rows) > 5:
            out.append(rows)
    return out


SECURITY_TAIL = re.compile(
    r"\s+(Common Stock|Common Shares|Ordinary Shares|Ordinary Share|Common Share"
    r"|Class [A-Z] Subordinate Voting Shares|Subordinate Voting Shares"
    r"|American Depositary Shares?|American Depositar|Registered Shares?"
    r"|Capital Stock|Shares of Beneficial Interest)\b.*$",
    re.I,
)
LEGAL_TAIL = re.compile(
    r"[,\s]+(Inc|Corp|Corporation|Company|Co|Ltd|Limited|PLC|N\.?V|S\.?A|S\.?E"
    r"|AB|A/S|Oyj|Abp|ASA|AG|SpA|S\.p\.A|SAS|hf|Holding)\.?$",
    re.I,
)


def clean_name(name):
    """Company names as a person would read them in the pick editor."""
    name = re.sub(r"\s*\[[a-z]{2}\]\s*$", "", name)      # wiki interlanguage marker
    name = SECURITY_TAIL.sub("", name)
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name)         # trailing "(DE)", "(Canada)"
    name = name.replace("’", "'").replace("‘", "'")
    for _ in range(2):                                    # "Foo Inc. Ltd." happens
        stripped = LEGAL_TAIL.sub("", name)
        if stripped == name:
            break
        name = stripped
    return " ".join(name.split()).strip(" .,")


def ascii_ok(text):
    """Firestore ids are built from the symbol, so it must survive slugging."""
    return bool(re.sub(r"[^A-Za-z0-9]+", "", text))


instruments = []          # {symbol, name, marketCode, currency}
seen = set()              # (marketCode, symbol)
sources = Counter()


def add(market, symbol, name, currency, source):
    symbol = " ".join(str(symbol).split()).upper()
    name = clean_name(name)
    if not symbol or not name or not ascii_ok(symbol):
        return False
    key = (market, symbol)
    if key in seen:
        return False
    seen.add(key)
    instruments.append({"symbol": symbol, "name": name, "marketCode": market, "currency": currency})
    sources[source] += 1
    return True


# ── 1. the Nordics, from Nasdaq's own screener ────────────────────────

SEGMENT_MARKET = {
    ("STO", "LARGE_CAP"): "SE_LARGE", ("STO", "MID_CAP"): "SE_MID", ("STO", "SMALL_CAP"): "SE_SMALL",
    ("HEL", "LARGE_CAP"): "FI_LARGE", ("HEL", "MID_CAP"): "FI_MID", ("HEL", "SMALL_CAP"): "FI_SMALL",
    ("CPH", "LARGE_CAP"): "DK_LARGE", ("CPH", "MID_CAP"): "DK_MID", ("CPH", "SMALL_CAP"): "DK_SMALL",
    ("ICE", "LARGE_CAP"): "IS_LARGE", ("ICE", "MID_CAP"): "IS_MID", ("ICE", "SMALL_CAP"): "IS_SMALL",
}
FIRST_NORTH_MARKET = {"STO": "SE_FN", "HEL": "FI_FN", "CPH": "DK_FN", "ICE": "IS_FN"}

for row in json.load(open("nordic.json")):
    if row["category"] == "FIRST_NORTH":
        market = FIRST_NORTH_MARKET.get(row["market"])
    else:
        market = SEGMENT_MARKET.get((row["market"], row["segment"]))
    if not market:
        continue
    add(market, row["symbol"], row["name"], row["currency"] or "SEK", f"nasdaq:{market}")


# ── 2. the US, from Nasdaq's screener, by market cap ──────────────────

US_MARKET = {"NYSE": "US_NYSE", "NASDAQ": "US_NASDAQ", "AMEX": "US_AMEX"}
US_FLOOR = {"NYSE": 10e9, "NASDAQ": 10e9, "AMEX": 1e9}

# Warrants, units, rights, preferreds and notes are not what this league
# means by a share, and several of them clear the size floor. The word
# boundaries on both ends matter: without the trailing one, "unit" ate
# UnitedHealth and United Parcel Service.
NOT_A_SHARE = re.compile(
    r"\b(warrants?|units?|rights?|preferred|depositary shares?|notes? due|debentures?"
    r"|subordinated notes?|convertible notes?)\b",
    re.I,
)
# Nasdaq suffixes a share class with a slash; Yahoo spells the same thing
# with a hyphen and the universe with a dot, which is what yahooSymbol
# normalises. /WS and /U are a warrant and a unit, not a share class.
NOT_A_SHARE_SUFFIX = re.compile(r"/(WS|U|R|RT|W)[A-Z]?$")


def to_number(text):
    text = str(text or "").replace(",", "").replace("$", "").strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


for row in sorted(json.load(open("us.json")), key=lambda r: -to_number(r["marketCap"])):
    market = US_MARKET.get(row["exchange"])
    if not market or to_number(row["marketCap"]) < US_FLOOR[row["exchange"]]:
        continue
    if NOT_A_SHARE.search(row["name"] or "") or NOT_A_SHARE_SUFFIX.search(row["symbol"] or ""):
        continue
    add(market, row["symbol"].replace("/", "."), row["name"], "USD", f"nasdaq:{market}")


# ── 3. Tokyo, from JPX's listed-company master ────────────────────────

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
book = zipfile.ZipFile("jpx.xlsx")
shared = []
if "xl/sharedStrings.xml" in book.namelist():
    for si in ET.fromstring(book.read("xl/sharedStrings.xml")):
        shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

jpx_rows = []
for tr in ET.fromstring(book.read("xl/worksheets/sheet1.xml")).iter(f"{NS}row"):
    cells = []
    for cell in tr:
        value = cell.find(f"{NS}v")
        text = "" if value is None else (value.text or "")
        if cell.get("t") == "s" and text:
            text = shared[int(text)]
        cells.append(text)
    jpx_rows.append(cells)

# Size (New Index Series): Core30, Large70 and Mid400 are the companies a
# player might plausibly have heard of. Below that, TOPIX Small is 1,500
# names nobody in this league is going to pick.
TOPIX_KEEP = {"TOPIX Core30", "TOPIX Large70", "TOPIX Mid400"}
for row in jpx_rows[1:]:
    if len(row) < 10 or not row[3].startswith("Prime Market"):
        continue
    if row[9] not in TOPIX_KEEP:
        continue
    add("JP_TSE", row[1], row[2].title(), "JPY", "jpx:JP_TSE")


# ── 4. everything else, from Wikipedia index constituents ─────────────
#
# (file, table index, symbol column, name column, market, currency,
#  suffix to strip off the ticker)

WIKI = [
    ("wk_OBX_Index.html",              0, 2, 0, "NO_OSE",   "NOK", None),
    ("wk_CAC_40.html",                 3, 3, 0, "FR_EPA",   "EUR", ".PA"),
    ("wk_AEX_index.html",              3, 0, 1, "NL_AMS",   "EUR", ".AS"),
    ("wk_AMX_index.html",              0, 2, 0, "NL_AMS",   "EUR", None),
    ("wk_DAX.html",                    3, 0, 2, "DE_XETRA", "EUR", ".DE"),
    ("wk_MDAX.html",                   1, 7, 1, "DE_XETRA", "EUR", None),
    ("wk_Swiss_Market_Index.html",     1, 3, 1, "CH_SIX",   "CHF", None),
    ("wk_SMIM.html",                   1, 3, 0, "CH_SIX",   "CHF", None),
    ("wk_IBEX_35.html",                2, 0, 1, "ES_BME",   "EUR", ".MC"),
    ("wk_FTSE_MIB.html",               1, 0, 1, "IT_MIL",   "EUR", ".MI"),
    ("wk_FTSE_100_Index.html",         4, 1, 0, "UK_LSE",   "GBP", None),
    ("wk_FTSE_250_Index.html",         3, 1, 0, "UK_LSE",   "GBP", None),
    ("wk_SPTSX_Composite_Index.html",  2, 0, 1, "CA_TSX",   "CAD", None),
    ("wk_SPASX_200.html",              2, 0, 1, "AU_ASX",   "AUD", None),
]

# Wikipedia gets a ticker wrong now and then, and an index table is the
# one source here with nobody accountable for it. Each override says what
# the table claims and why it is not that.
TICKER_FIX = {
    # The SMI article gives Roche as "ROP". The index, and essentially all
    # of the volume, is in the non-voting certificate, which is ROG.
    ("CH_SIX", "ROP"): "ROG",
}

for path, table_index, symbol_col, name_col, market, currency, suffix in WIKI:
    rows = wiki_tables(path)[table_index]
    kept = 0
    for row in rows[1:]:
        if len(row) <= max(symbol_col, name_col):
            continue
        symbol = re.sub(r"^[A-Z]{2,5}\s*:\s*", "", row[symbol_col]).strip()
        if suffix and symbol.upper().endswith(suffix.upper()):
            symbol = symbol[: -len(suffix)]
        symbol = symbol.strip().rstrip(".")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9. _-]{0,11}", symbol or ""):
            continue
        symbol = TICKER_FIX.get((market, symbol.upper()), symbol)
        if add(market, symbol, row[name_col], currency, f"wiki:{path}"):
            kept += 1
    print(f"{path:34} table {table_index}: {kept:4} kept of {len(rows) - 1}")


# ── 5. keep what was already there, outside the Nordics ───────────────
#
# Anything the index tables happen not to list but that is a real listing
# on that exchange — and that somebody has already checked against the
# feed — stays. The exceptions below are entries the sources positively
# contradict; each one is named so nothing disappears quietly.

# Only the four Nasdaq Nordic countries are regenerated outright — that
# screener is the whole exchange. Oslo's source here is the OBX index,
# which is twenty-five names and not a listing, so Oslo merges like the
# rest of the world.
REGENERATED = ("SE_", "FI_", "DK_", "IS_")

RETIRED = {
    ("US_NYSE", "WMT"): "Walmart's listing is on Nasdaq now; it is in US_NASDAQ.",
    ("US_NYSE", "SHOP"): "Shopify's listing is on Nasdaq now; it is in US_NASDAQ.",
    ("UK_LSE", "FERG"): "Ferguson's primary listing is NYSE now; it is in US_NYSE.",
    ("US_NASDAQ", "EA"): "Electronic Arts is absent from Nasdaq's screener — taken private.",
    ("CH_SIX", "RO"): "Roche's bearer share barely trades; the index line is ROG.",
}

existing = json.load(open("existing.json"))
carried = 0
for market, rows in sorted(existing.items()):
    if market.startswith(REGENERATED):
        continue
    currency = {"US_NYSE": "USD", "US_NASDAQ": "USD", "US_AMEX": "USD", "CA_TSX": "CAD",
                "UK_LSE": "GBP", "DE_XETRA": "EUR", "FR_EPA": "EUR", "CH_SIX": "CHF",
                "NL_AMS": "EUR", "ES_BME": "EUR", "IT_MIL": "EUR", "JP_TSE": "JPY",
                "AU_ASX": "AUD", "NO_OSE": "NOK"}[market]
    for row in rows:
        symbol, name = row[0], row[1]
        if (market, symbol) in RETIRED:
            continue
        # A row that overrode its market's currency keeps doing so.
        if add(market, symbol, name, row[2] if len(row) > 2 else currency, "existing"):
            carried += 1

print(f"\ncarried {carried} previously seeded non-Nordic entries not in the new sources")
for (market, symbol), why in sorted(RETIRED.items()):
    print(f"  retired {market} {symbol}: {why}")

# Which Nordic entries the regeneration drops.
now = {(r["marketCode"], r["symbol"]) for r in instruments}
nordic_symbols = {s for (m, s) in now if m.startswith(REGENERATED)}
print("\nNordic entries the exchange no longer lists:")
for market, rows in sorted(existing.items()):
    if not market.startswith(REGENERATED):
        continue
    for row in rows:
        if row[0] not in nordic_symbols:
            print(f"  {market} {row[0]} ({row[1]})")


# ── output ────────────────────────────────────────────────────────────

json.dump(instruments, open("instruments.json", "w"), ensure_ascii=False, indent=1)

by_market = OrderedDict()
for row in instruments:
    by_market.setdefault(row["marketCode"], []).append(row)

print("\n--- per market ---")
for market, rows in by_market.items():
    print(f"  {market:12} {len(rows):5}")
print(f"\ntotal {len(instruments)}")
