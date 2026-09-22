#!/usr/bin/env node
/**
 * Fetch this week's prices and hand them to the app.
 *
 * ── Why not Twelve Data ───────────────────────────────────────────────
 *
 * Twelve Data was the original choice and it cannot do this job. Its
 * free tier covers US equities, forex and crypto — every international
 * exchange, which is to say every Nordic list and the entire premise of
 * this league, starts at a paid plan. The same demo key that prices
 * AAPL returns a 401 for ERIC.B on XSTO. Nothing was ever scored on it:
 * the secrets were never set, so the workflow had been exiting green
 * without making a single call.
 *
 * Yahoo prices every market in the universe — all five Nordic exchanges
 * including Iceland, the continental venues, London, Tokyo and Sydney.
 * No key and no plan.
 *
 * What it charges instead is a guarantee. This is an undocumented
 * endpoint that can change shape without warning and has nobody to ask,
 * and it throttles by address without publishing a limit. Three things
 * make that survivable: a failed run emails you, a missed checkpoint is
 * reported rather than backfilled with a wrong number, and the admin
 * grid takes prices by hand at any time.
 *
 * The throttling is the part that shapes the code below — see the note
 * on pacing. In short: batch, do not iterate.
 *
 * ── What this script does not decide ──────────────────────────────────
 *
 * It is deliberately ignorant. It asks the app what is needed, looks
 * those symbols up, and posts the numbers back. Which checkpoint a
 * price belongs to, and whether it may be written at all, stays in the
 * app.
 *
 *   SITE_URL=https://… CRON_SECRET=… node scripts/fetch-prices.mjs
 */

const SITE = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";

/**
 * Not yet configured is a state, not a failure.
 *
 * The workflow runs daily whether or not the secrets exist. Exiting
 * green with an explanation means nobody is emailed about a setup step
 * they have not taken yet — while a run that is configured and then
 * breaks still goes red, which is the whole point of running it here.
 */
const missingEnv = [
  ["SITE_URL", SITE],
  ["CRON_SECRET", SECRET],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnv.length > 0) {
  console.log(`Not configured yet — set ${missingEnv.join(", ")} in the repository secrets.`);
  console.log("Prices can still be entered by hand from the admin panel until then.");
  process.exit(0);
}

const auth = { authorization: `Bearer ${SECRET}` };

/**
 * A browser user-agent, because this runs from a datacentre address.
 * Yahoo is markedly happier about a shared runner IP when the request
 * looks like a browser, and it costs nothing to say so.
 */
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Our market codes to Yahoo's exchange suffixes.
 *
 * Yahoo names an instrument by ticker *and* exchange — "ERIC-B.ST" is
 * Ericsson B in Stockholm — which is what stops a lookup handing back
 * Sanofi when you meant Banco Santander. Each Nordic country uses one
 * suffix across all of its segments, so those key on the country
 * prefix; everywhere else is a single market and is named outright.
 *
 * US listings carry no suffix at all, which is why the lookup below
 * tests for the key rather than for a truthy value.
 *
 * A market with no entry here can still be picked. Its instruments come
 * back unpriced and are typed into the admin grid, same as before.
 */
const COUNTRY_SUFFIX = { SE: ".ST", FI: ".HE", DK: ".CO", NO: ".OL", IS: ".IC", US: "" };

const MARKET_SUFFIX = {
  CA_TSX: ".TO",
  UK_LSE: ".L",
  DE_XETRA: ".DE",
  FR_EPA: ".PA",
  CH_SIX: ".SW",
  NL_AMS: ".AS",
  ES_BME: ".MC",
  IT_MIL: ".MI",
  JP_TSE: ".T",
  AU_ASX: ".AX",
};

function suffixFor(marketCode) {
  if (marketCode in MARKET_SUFFIX) return MARKET_SUFFIX[marketCode];
  const country = String(marketCode).split("_")[0];
  return country in COUNTRY_SUFFIX ? COUNTRY_SUFFIX[country] : null;
}

/**
 * Our symbols to Yahoo's.
 *
 * Both conventions the universe seeds collide with Yahoo's separator:
 * the Nordic share class is "ERIC B" here and "ERIC-B" there, and the
 * American one is "BRK.B" here and "BRK-B" there. Yahoo spells every
 * class with a hyphen and reserves the dot for the exchange, so
 * anything that is neither a letter nor a digit becomes a hyphen and
 * the suffix goes on afterwards. Tokyo's numeric tickers pass through
 * untouched.
 *
 * Returns null for a market with no known suffix, which is reported as
 * unpriced rather than guessed at — a wrong guess would find a real
 * instrument on the wrong exchange.
 */
function yahooSymbol(symbol, marketCode) {
  const suffix = suffixFor(marketCode);
  if (suffix === null) return null;
  const base = String(symbol)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}${suffix}` : null;
}

/**
 * Indices, which are named nothing like shares.
 *
 * Yahoo spells an index with a caret and no exchange suffix — ^OMXS30,
 * ^GSPC — so a benchmark cannot go through yahooSymbol() above. This is
 * not a cosmetic difference. "SPX" with no suffix resolves to a listed
 * US *company*, quoted in the same dollars the index is, so the currency
 * guard would wave it through and a month would be scored against the
 * wrong benchmark with nothing anywhere saying so.
 *
 * A benchmark that is not named here is therefore reported unpriced
 * rather than guessed at, and the admin grid takes it by hand. Adding
 * one is a line here beside the entry in lib/universe.ts.
 */
const INDEX_SYMBOL = {
  OMXS30: "^OMXS30",
  SPX: "^GSPC",
};

/**
 * London quotes in pence.
 *
 * Yahoo reports GBp on LSE lines where the universe says GBP. The
 * scoreboard only ever divides one checkpoint by another, so a constant
 * factor of a hundred cancels out and nothing needs converting — but
 * the two spellings still have to be recognised as the same currency,
 * or the guard below would throw away every British holding. Upper-casing
 * does it; GBX is the other spelling some feeds use for the same thing.
 */
function sameCurrency(a, b) {
  const norm = (c) => {
    const upper = String(c ?? "").toUpperCase();
    return upper === "GBX" ? "GBP" : upper;
  };
  return norm(a) === norm(b);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pacing.
 *
 * Yahoo throttles by address, hard, and publishes no limit. Twenty-two
 * symbols a seventh of a second apart got all but one of them a 429 from
 * an ordinary domestic connection, and about a hundred requests over
 * half an hour earned a block that was still answering 429 to everything
 * several minutes later.
 *
 * Hence batching: `spark` takes twenty symbols per request and refuses
 * above that, which turns a month's whole universe into three or four
 * calls a day rather than seventy. That is both the polite shape and the
 * robust one, and it is a very different profile from the burst that
 * earned the block.
 *
 * What is *not* known is how a GitHub runner fares. It is a shared
 * datacentre address that plenty of other people also point at Yahoo, so
 * it may arrive with a worse reputation than a home connection — that
 * could not be tested from here. If runs come back throttled, this is
 * the first thing to suspect, and the fallback is the admin grid.
 */
const BATCH = 20;
const BATCH_PAUSE_MS = 1_500;
const SYMBOL_PAUSE_MS = 1_500;
const ATTEMPTS = 4;

/** Waits longer each time, and honours Retry-After when one is offered. */
async function backoff(response, attempt) {
  const header = Number(response?.headers?.get?.("retry-after"));
  const wait = Number.isFinite(header) && header > 0 ? header * 1000 : attempt * 3000;
  await sleep(Math.min(wait, 30_000));
}

function retryable(status) {
  return status === 429 || status >= 500;
}

/**
 * A refusal that more requests cannot fix.
 *
 * Yahoo's limiter is burst-sensitive and unforgiving: a hundred requests
 * over half an hour earned a block that outlasted several minutes of
 * silence, and while blocked it answers 429 to everything. So once a run
 * has been told to stop, it stops — it does not fan the batch back out
 * into one request per symbol, which is the natural shape of the code
 * and exactly the wrong thing to do. Everything unpriced is reported and
 * the run goes red, which is what the admin grid is for.
 */
function throttleError(message) {
  return Object.assign(new Error(message), { throttled: true });
}

async function plan() {
  const response = await fetch(`${SITE}/api/cron/weekly-prices?plan=1`, { headers: auth });
  if (!response.ok) {
    throw new Error(
      `Asking the app what it needs failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
}

function usablePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Up to twenty instruments in one request.
 *
 * Returns a Map of vendor symbol to price. A symbol Yahoo does not
 * recognise is simply left out of its response rather than reported, so
 * whatever is missing from the Map is what still needs looking up one
 * at a time.
 *
 * Throws on a transport failure, because that is about the request and
 * not about any particular symbol. A refusal carries `throttled`, which
 * tells the caller to stop rather than retry the same symbols one by
 * one.
 */
async function sparkBatch(rows) {
  const symbols = rows.map((r) => r.vendor).join(",");
  const url =
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}` +
    `&range=1d&interval=1d`;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { "user-agent": UA } });
    } catch (error) {
      if (attempt === ATTEMPTS) throw new Error(`network error (${error.message ?? error})`);
      await backoff(null, attempt);
      continue;
    }

    if (retryable(response.status)) {
      if (attempt === ATTEMPTS) throw throttleError(`HTTP ${response.status}`);
      await backoff(response, attempt);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.json().catch(() => null);
    if (!body) throw new Error("unreadable response");

    // The error shape is nested under a "spark" key, which is also what
    // a symbol entry would look like. Checking for the error first is
    // what keeps it from being read as an instrument called "spark".
    const failed = body.spark?.error;
    if (failed) throw new Error(String(failed.description ?? failed.code ?? "rejected"));

    const prices = new Map();
    for (const row of rows) {
      const entry = body[row.vendor];
      if (!entry) continue;
      const closes = Array.isArray(entry.close) ? entry.close : [];
      const last = [...closes].reverse().find((c) => usablePrice(c) !== null);
      const price = usablePrice(last) ?? usablePrice(entry.fulldayPrice);
      if (price !== null) prices.set(row.vendor, price);
    }
    return prices;
  }

  throw new Error("gave up");
}

/**
 * One instrument, the slow way.
 *
 * Only for what the batch could not price, so this runs for a handful
 * of symbols rather than all of them. It is worth having its own path
 * because `chart` reports the currency and `spark` does not, and the
 * currency is the one cross-check available: a document whose currency
 * disagrees with the exchange is a seeding mistake, and it is better
 * found here than left to look like a price.
 *
 * Returns a number, or a string saying why not — except for a refusal,
 * which throws, because that is about the run and not about this symbol
 * and the caller needs to stop rather than move on to the next one.
 */
async function chartQuote(row) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(row.vendor)}`;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { "user-agent": UA } });
    } catch (error) {
      if (attempt === ATTEMPTS) return `network error (${error.message ?? error})`;
      await backoff(null, attempt);
      continue;
    }

    // Throttling and their own hiccups are worth waiting out; a 404 is a
    // symbol we have spelled wrong and will still be wrong in a second.
    if (retryable(response.status)) {
      if (attempt === ATTEMPTS) throw throttleError(`HTTP ${response.status}`);
      await backoff(response, attempt);
      continue;
    }
    if (!response.ok) return `HTTP ${response.status}`;

    const body = await response.json().catch(() => null);
    if (!body) return "unreadable response";

    const failed = body.chart?.error;
    if (failed) return String(failed.description ?? failed.code ?? "rejected");

    const meta = body.chart?.result?.[0]?.meta;
    if (!meta) return "no data";

    const price = usablePrice(meta.regularMarketPrice);
    if (price === null) return "no price";

    if (row.currency && !sameCurrency(meta.currency, row.currency)) {
      return `currency mismatch (got ${meta.currency}, expected ${row.currency})`;
    }

    return price;
  }

  return "gave up";
}

async function main() {
  const wanted = await plan();
  const rounds = wanted.rounds ?? [];

  if (rounds.length === 0) {
    console.log("No round is inside its pricing window. Nothing to do.");
    return;
  }

  // One instrument can be held in two open months at once; it only needs
  // looking up once.
  const unique = new Map();
  for (const round of rounds) {
    console.log(
      `${round.roundId}: ${round.field} due ${round.dueAt?.slice(0, 10) ?? "?"} — ` +
        `${round.requests.length} to price, ${round.gaps} gap(s)`,
    );
    for (const request of round.requests) {
      if (!unique.has(request.instrumentId)) {
        unique.set(request.instrumentId, {
          ...request,
          vendor: request.isBenchmark
            ? (INDEX_SYMBOL[String(request.symbol).trim().toUpperCase()] ?? null)
            : yahooSymbol(request.symbol, request.marketCode),
        });
      }
    }
  }

  if (unique.size === 0) {
    console.log("Everything due is already recorded.");
    return;
  }

  const quotes = [];
  const missing = [];

  // Something the fetcher has not been taught to name: a market with no
  // suffix, or an index missing from INDEX_SYMBOL. Guessing would find a
  // real instrument that is not the one meant, so these go straight to
  // the admin grid without a lookup.
  const named = [];
  for (const row of unique.values()) {
    if (row.vendor) {
      named.push(row);
      continue;
    }
    const why = row.isBenchmark
      ? "index not in INDEX_SYMBOL"
      : `no exchange suffix for ${row.marketCode}`;
    missing.push(`${row.symbol} (${why})`);
    console.log(`  ${String(row.symbol).padEnd(14)} — ${why}`);
  }

  const batches = [];
  for (let i = 0; i < named.length; i += BATCH) batches.push(named.slice(i, i + BATCH));

  console.log(
    `\n${named.length} symbol(s) to look up in ${batches.length} request(s) of up to ${BATCH}.\n`,
  );

  // Symbols a *successful* batch simply did not return. Those are worth
  // one careful look each — a batch that was refused outright is not.
  const stragglers = [];
  let blocked = null;

  for (const [index, rows] of batches.entries()) {
    if (blocked) {
      for (const row of rows) missing.push(`${row.symbol}@${row.vendor} (not attempted: ${blocked})`);
      continue;
    }
    if (index > 0) await sleep(BATCH_PAUSE_MS);

    let prices;
    try {
      prices = await sparkBatch(rows);
    } catch (error) {
      const reason = error.message ?? String(error);
      console.log(`  batch ${index + 1}: FAILED — ${reason}`);
      for (const row of rows) missing.push(`${row.symbol}@${row.vendor} (${reason})`);
      // Being throttled is about us, not about this batch. Stop asking.
      if (error.throttled) {
        blocked = reason;
        console.log("  refused — not making further requests this run.");
      }
      continue;
    }

    for (const row of rows) {
      const price = prices.get(row.vendor);
      if (price === undefined) {
        stragglers.push(row);
      } else {
        quotes.push({ instrumentId: row.instrumentId, price });
        console.log(`  ${row.vendor.padEnd(14)} ${price}`);
      }
    }
  }

  if (stragglers.length > 0 && !blocked) {
    console.log(`\n${stragglers.length} the batch did not return — asking one at a time.\n`);
    for (const [index, row] of stragglers.entries()) {
      if (blocked) {
        missing.push(`${row.symbol}@${row.vendor} (not attempted: ${blocked})`);
        continue;
      }
      if (index > 0) await sleep(SYMBOL_PAUSE_MS);

      let result;
      try {
        result = await chartQuote(row);
      } catch (error) {
        const reason = error.message ?? String(error);
        blocked = reason;
        missing.push(`${row.symbol}@${row.vendor} (${reason})`);
        console.log(`  ${row.vendor.padEnd(14)} — ${reason}`);
        console.log("  refused — not making further requests this run.");
        continue;
      }

      if (typeof result === "number") {
        quotes.push({ instrumentId: row.instrumentId, price: result });
        console.log(`  ${row.vendor.padEnd(14)} ${result}`);
      } else {
        missing.push(`${row.symbol}@${row.vendor} (${result})`);
        console.log(`  ${row.vendor.padEnd(14)} — ${result}`);
      }
    }
  }

  if (quotes.length === 0) {
    throw new Error(`Nothing could be priced. ${missing.join(", ")}`);
  }

  const note = missing.length ? `no price: ${missing.slice(0, 15).join(", ")}` : null;

  const response = await fetch(`${SITE}/api/cron/weekly-prices`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ quotes, source: "yahoo", note }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Writing prices failed: ${response.status} ${JSON.stringify(result)}`);
  }

  console.log(`\nWrote ${quotes.length} quote(s).`);
  for (const round of result.rounds ?? []) {
    console.log(`  ${round.roundId} ${round.checkpoint}: ${round.written} written, ${round.gaps} gap(s)`);
  }
  if (note) console.log(`\n${note}`);

  // A run that priced some but not all is worth a red tick: the month is
  // being scored on incomplete data and somebody should fill the rest in
  // by hand while the price is still today's.
  if (missing.length > 0) {
    throw new Error(`${missing.length} symbol(s) unpriced.`);
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
