#!/usr/bin/env python3
"""
Read the instruments already in the universe back out of the TypeScript.

build.py needs them for the merge: outside the four Nasdaq Nordic
countries the sources are index constituent tables, which are lists of
an index and not lists of an exchange, so a name that is genuinely
listed but not in the index has to survive. Those names were checked
against the price feed once, and that is worth keeping.

Writes existing.json: {marketCode: [[symbol, name, currency?], ...]},
carrying the third element only where a row overrides its market's
currency — Verisure trades on Stockholm in euro.

Parsing source with a regular expression is normally a bad idea. It is
tolerable here because the file it reads is the one emit.py writes, in a
shape this script and that one agree on — and because it asserts a
plausible count rather than quietly returning nothing.
"""
import json
import re
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / "lib" / "universe.instruments.ts"

text = SOURCE.read_text(encoding="utf8")

ROW = re.compile(
    r'\["((?:[^"\\]|\\.)+)",\s*"((?:[^"\\]|\\.)+)"(?:,\s*"([A-Z]{3})")?\s*\]'
)

existing: dict[str, list[list[str]]] = {}
for block in re.finditer(r'\.\.\.list\("([A-Z_]+)",\s*"([A-Z]{3})",\s*\[(.*?)\n  \]\),', text, re.S):
    market, _currency, body = block.groups()
    for symbol, name, own in ROW.findall(body):
        existing.setdefault(market, []).append([symbol, name] + ([own] if own else []))

total = sum(len(rows) for rows in existing.values())
if total < 100:
    sys.exit(
        f"Only {total} instruments parsed out of {SOURCE}. The file's shape has changed "
        "and this regular expression no longer matches it — fix this before running build.py, "
        "because a silent zero here would look exactly like a clean rebuild."
    )

Path("existing.json").write_text(json.dumps(existing, ensure_ascii=False), encoding="utf8")
print(f"{total} instruments across {len(existing)} markets -> existing.json")
