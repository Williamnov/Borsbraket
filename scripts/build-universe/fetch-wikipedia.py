#!/usr/bin/env python3
"""
Fetch the index constituent pages to a local cache, politely.

Everything outside the four Nasdaq Nordic countries, the US and Tokyo
comes from one of these tables. Cached because build.py reads them
repeatedly and because re-fetching fourteen pages to change one column
index is how a polite script becomes an impolite one.

  python3 fetch-wikipedia.py OBX_Index CAC_40 ...

See README.md for the list build.py expects.
"""
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Wikipedia asks for a user agent that says who is calling and why, and
# rate-limits anonymous bulk fetching hard — this script was throttled
# mid-run while the universe was being built, which is why it caches and
# waits rather than retrying in a tight loop.
UA = "BorsbraketUniverseBuilder/1.0 (+https://github.com/Williamnov/Borsbraket)"


def cache_name(title):
    return "wk_" + "".join(c if c.isalnum() or c in "_-" else "" for c in title) + ".html"


def grab(title):
    path = cache_name(title)
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        return path
    url = f"https://en.wikipedia.org/api/rest_v1/page/html/{urllib.parse.quote(title, safe='')}"
    for attempt in range(1, 6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            body = urllib.request.urlopen(req, timeout=40).read()
            with open(path, "wb") as fh:
                fh.write(body)
            print(f"{title}: {len(body)} bytes", file=sys.stderr)
            return path
        except urllib.error.HTTPError as err:
            if err.code in (429, 503):
                wait = attempt * 20
                print(f"{title}: {err.code}, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"{title}: HTTP {err.code}", file=sys.stderr)
            return None
        except Exception as err:  # noqa: BLE001
            print(f"{title}: {err}", file=sys.stderr)
            time.sleep(attempt * 10)
    return None


if __name__ == "__main__":
    for index, title in enumerate(sys.argv[1:]):
        if index:
            time.sleep(8)
        grab(title)
