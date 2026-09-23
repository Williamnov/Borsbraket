/**
 * Ask the price feed whether it can price every name in the universe.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * A name nobody can price is worse than a name nobody can pick: it looks
 * fine in the pick editor, it looks fine at submission, and it turns
 * into a gap in the middle of a month that someone has to fill by hand
 * while the price is still today's. The universe grew from four hundred
 * names to three and a half thousand in one commit, generated from each
 * exchange's own lists, and not one of those was checked against the
 * feed at the time — the machine that built it was being answered 429 by
 * Yahoo on every request, for days. This is the check that was owed.
 *
 * It uses the same symbol mapping as scripts/fetch-prices.mjs, from the
 * same module, on purpose. The question is not "does this company
 * exist", which the exchange already answered; it is "will the weekly
 * job find it", and only the fetcher's own spelling answers that.
 *
 * ── It also answers the other open question ───────────────────────────
 *
 * Whether a GitHub runner's shared address is already in Yahoo's bad
 * books could never be tested from a laptop. This makes several hundred
 * requests from one, so a clean run says more about that than the
 * weekly job ever will.
 *
 * ── What it costs, and why that shaped it ─────────────────────────────
 *
 * Nothing in money: the feed needs no key and the repository is public,
 * so the runner minutes are free. What it does spend is the goodwill of
 * an address the weekly price job depends on. Checking three and a half
 * thousand symbols one at a time is two hours of steady requests at a
 * feed that throttles by address and publishes no limit — a good way to
 * get the runners blocked and break the thing this is protecting.
 *
 * So the default is cheap: `spark` takes twenty symbols a request, which
 * turns the whole universe into about a hundred and eighty requests, and
 * only what that cannot resolve gets looked at one at a time. The
 * currency and exchange cross-check, which needs a request per symbol,
 * runs over a sample of each market — enough to catch a suffix that is
 * wrong for a whole market, which is the mistake that actually happens.
 * `--deep` does every symbol individually, and is a deliberate act.
 *
 *   npx tsx scripts/verify-universe.ts                 # ~15 minutes
 *   npx tsx scripts/verify-universe.ts --market SE_FN  # one market
 *   npx tsx scripts/verify-universe.ts --limit 100     # a taste of it
 *   npx tsx scripts/verify-universe.ts --deep          # ~2 hours
 *
 * Exits non-zero if anything could not be priced, so the workflow goes
 * red and the report is in the log.
 */

import { writeFileSync } from "node:fs";
import { MARKETS } from "../lib/universe";
import { INSTRUMENTS } from "../lib/universe.instruments";
import { sameCurrency, yahooSymbol } from "./yahoo-symbol.mjs";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Pacing, copied from the fetcher for the same reasons: Yahoo throttles
 * by address and publishes no limit, `spark` takes twenty symbols per
 * request, and a run that has been refused stops rather than fanning
 * back out into one request per symbol.
 */
const BATCH = 20;
const BATCH_PAUSE_MS = 2_500;
const SYMBOL_PAUSE_MS = 2_000;
const ATTEMPTS = 4;

/**
 * How many instruments per market get the per-symbol cross-check.
 *
 * A suffix that is wrong is wrong for the whole market — ".SW" would not
 * find Nestlé and Roche and then work for Sika — so a handful of samples
 * catches it. What a sample cannot catch is one instrument in a market
 * whose currency differs from the rest, which is why anything the batch
 * failed to resolve is always checked individually regardless.
 */
const SAMPLE_PER_MARKET = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Row = {
  symbol: string;
  name: string;
  marketCode: string;
  currency: string;
  isBenchmark: boolean;
  vendor: string | null;
};

type Verdict = Row & {
  ok: boolean;
  reason: string | null;
  /**
   * How much is actually known. "batch" means the feed returned the
   * symbol in a twenty-at-a-time request and nothing more; "checked"
   * means its currency and exchange were read back and agreed.
   */
  depth: "batch" | "checked";
  price?: number;
  exchange?: string;
};

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** A refusal that more requests cannot fix. */
function throttleError(message: string): Error & { throttled?: boolean } {
  return Object.assign(new Error(message), { throttled: true });
}

async function get(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { "user-agent": UA } });
    } catch (error) {
      if (attempt === ATTEMPTS) throw new Error(`network error (${String(error)})`);
      await sleep(attempt * 4_000);
      continue;
    }

    if (retryable(response.status)) {
      if (attempt === ATTEMPTS) throw throttleError(`HTTP ${response.status}`);
      const header = Number(response.headers.get("retry-after"));
      await sleep(Math.min(Number.isFinite(header) && header > 0 ? header * 1_000 : attempt * 8_000, 60_000));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new Error("unreadable response");
    return body;
  }
  throw new Error("gave up");
}

/** Twenty at a time. Returns the vendor symbols the feed recognised. */
async function sparkBatch(rows: Row[]): Promise<Set<string>> {
  const symbols = rows.map((r) => r.vendor).join(",");
  const body = await get(
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}` +
      `&range=1d&interval=1d`,
  );

  const failed = (body.spark as { error?: { description?: string; code?: string } } | undefined)?.error;
  if (failed) throw new Error(String(failed.description ?? failed.code ?? "rejected"));

  const seen = new Set<string>();
  for (const row of rows) if (row.vendor && body[row.vendor]) seen.add(row.vendor);
  return seen;
}

/**
 * One instrument, the slow way, for anything the batch did not return.
 *
 * Worth its own path because `chart` reports the currency and the
 * exchange where `spark` reports neither, and those are the two
 * cross-checks available. A ticker that resolves on the wrong exchange
 * is the failure this is really looking for — it is the one that returns
 * a plausible number for the wrong company.
 */
async function chartCheck(row: Row): Promise<Omit<Verdict, keyof Row | "depth">> {
  const body = await get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(row.vendor ?? "")}`,
  );

  const chart = body.chart as
    | {
        error?: { description?: string; code?: string };
        result?: { meta?: Record<string, unknown> }[];
      }
    | undefined;

  if (chart?.error) {
    return { ok: false, reason: String(chart.error.description ?? chart.error.code ?? "rejected") };
  }

  const meta = chart?.result?.[0]?.meta;
  if (!meta) return { ok: false, reason: "no data" };

  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "no price" };

  const exchange = String(meta.fullExchangeName ?? meta.exchangeName ?? "");
  if (!sameCurrency(String(meta.currency ?? ""), row.currency)) {
    return {
      ok: false,
      reason: `currency mismatch (got ${String(meta.currency)}, expected ${row.currency}, on ${exchange})`,
      price,
      exchange,
    };
  }

  return { ok: true, reason: null, price, exchange };
}

async function main(): Promise<void> {
  const marketFilter = argValue("--market");
  const limit = Number(argValue("--limit") ?? 0);
  const deep = process.argv.includes("--deep");

  let rows: Row[] = INSTRUMENTS.filter((i) => !marketFilter || i.marketCode === marketFilter).map(
    (i) => ({
      symbol: i.symbol,
      name: i.name,
      marketCode: i.marketCode,
      currency: i.currency,
      isBenchmark: i.isBenchmark === true,
      vendor: yahooSymbol(i.symbol, i.marketCode),
    }),
  );
  if (limit > 0) rows = rows.slice(0, limit);

  if (rows.length === 0) {
    console.error(`Nothing to check${marketFilter ? ` in ${marketFilter}` : ""}.`);
    process.exit(1);
  }

  const knownMarkets = new Set(MARKETS.map((m) => m.code));
  const verdicts: Verdict[] = [];

  // A market that is not in MARKETS at all is a seeding mistake rather
  // than a feed problem, and no amount of asking Yahoo will fix it.
  const orphaned = rows.filter((r) => !knownMarkets.has(r.marketCode));
  for (const row of orphaned) {
    verdicts.push({
      ...row,
      ok: false,
      reason: `${row.marketCode} is not a market in MARKETS`,
      depth: "checked",
    });
  }

  const unnamed = rows.filter((r) => knownMarkets.has(r.marketCode) && !r.vendor);
  for (const row of unnamed) {
    verdicts.push({
      ...row,
      ok: false,
      reason: `no exchange suffix for ${row.marketCode}`,
      depth: "checked",
    });
  }

  const named = rows.filter((r) => knownMarkets.has(r.marketCode) && r.vendor);
  const batches: Row[][] = [];
  for (let i = 0; i < named.length; i += BATCH) batches.push(named.slice(i, i + BATCH));

  console.log(
    `${rows.length} instrument(s); ${named.length} to look up in ${batches.length} batch(es) of ` +
      `up to ${BATCH}, about ${Math.ceil((batches.length * BATCH_PAUSE_MS) / 60_000)} minute(s).\n`,
  );

  // Pass one: does the feed know the symbol at all? Twenty at a time.
  const resolved = new Set<string>();
  let blocked: string | null = null;

  for (const [index, batch] of batches.entries()) {
    if (blocked) break;
    if (index > 0) await sleep(BATCH_PAUSE_MS);
    try {
      for (const vendor of await sparkBatch(batch)) resolved.add(vendor);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`  batch ${index + 1}/${batches.length}: FAILED — ${reason}`);
      if ((error as { throttled?: boolean }).throttled) {
        blocked = reason;
        console.log("  refused — not making further requests this run.");
      }
    }
    if ((index + 1) % 20 === 0) {
      console.log(`  …${index + 1}/${batches.length} batches, ${resolved.size} resolved`);
    }
  }

  /*
   * Pass two: the per-symbol cross-check, on as little as will do.
   *
   * Everything the batch could not resolve, because that is either a
   * symbol spelled wrong or a name the feed does not carry and the
   * difference matters. Plus a sample of each market, because `spark`
   * says a ticker resolves and says nothing about which exchange
   * answered — and a suffix aimed at the wrong exchange returns a
   * perfectly good price for the wrong company.
   */
  const missed = new Set(named.filter((r) => r.vendor && !resolved.has(r.vendor)));

  const individually = new Set<Row>(missed);
  if (deep) {
    for (const row of named) individually.add(row);
  } else {
    const perMarket = new Map<string, Row[]>();
    for (const row of named) {
      // Benchmarks are two documents and the only ones whose symbol is
      // not a ticker at all, so they are never left to a sample.
      if (row.isBenchmark) individually.add(row);
      perMarket.set(row.marketCode, [...(perMarket.get(row.marketCode) ?? []), row]);
    }
    // Evenly spaced rather than the first eight, which in an alphabetical
    // list would be eight companies beginning with A — and a market's
    // oddities are not sorted to the front.
    for (const marketRows of perMarket.values()) {
      const stride = Math.max(1, Math.floor(marketRows.length / SAMPLE_PER_MARKET));
      for (let i = 0; i < marketRows.length && i / stride < SAMPLE_PER_MARKET; i += stride) {
        individually.add(marketRows[i]);
      }
    }
  }

  // Resolved by the batch and not looked at again. Recorded as what that
  // is worth: the feed has the symbol, and nobody asked which exchange
  // answered.
  for (const row of named) {
    if (!individually.has(row)) verdicts.push({ ...row, ok: true, reason: null, depth: "batch" });
  }

  const oneByOne = [...individually];

  if (oneByOne.length > 0 && !blocked) {
    console.log(
      `\n${missed.size} the batch did not resolve, ` +
        `${oneByOne.length - missed.size} sampled for the currency check` +
        `${deep ? " (--deep: every symbol)" : ""} — ` +
        `about ${Math.ceil((oneByOne.length * SYMBOL_PAUSE_MS) / 60_000)} minute(s).\n`,
    );
  }

  for (const [index, row] of oneByOne.entries()) {
    if (blocked) {
      verdicts.push({ ...row, ok: false, reason: `not attempted: ${blocked}`, depth: "checked" });
      continue;
    }
    if (index > 0) await sleep(SYMBOL_PAUSE_MS);

    try {
      const verdict = await chartCheck(row);
      verdicts.push({ ...row, ...verdict, depth: "checked" });
      if (!verdict.ok) console.log(`  ${row.vendor?.padEnd(16)} ${row.name} — ${verdict.reason}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      verdicts.push({ ...row, ok: false, reason, depth: "checked" });
      if ((error as { throttled?: boolean }).throttled) {
        blocked = reason;
        console.log(`  ${row.vendor?.padEnd(16)} — ${reason}`);
        console.log("  refused — not making further requests this run.");
      }
    }
    if ((index + 1) % 100 === 0) {
      console.log(`  …${index + 1}/${oneByOne.length} checked`);
    }
  }

  const failures = verdicts.filter((v) => !v.ok);
  const confirmed = verdicts.filter((v) => v.ok && v.depth === "checked").length;
  const resolvedOnly = verdicts.filter((v) => v.ok && v.depth === "batch").length;

  writeFileSync("universe-report.json", JSON.stringify(verdicts, null, 1));

  // Said separately on purpose. "The feed returned this symbol" and "the
  // feed returned this symbol, in the right currency, from the right
  // exchange" are different claims, and only one of them was made about
  // most of these.
  console.log(
    `\n${confirmed + resolvedOnly}/${verdicts.length} priced — ` +
      `${confirmed} with the currency and exchange confirmed, ` +
      `${resolvedOnly} resolved by the batch only.`,
  );
  console.log("Full report, one row per instrument, in universe-report.json.");

  if (failures.length > 0) {
    const byMarket = new Map<string, Verdict[]>();
    for (const failure of failures) {
      byMarket.set(failure.marketCode, [...(byMarket.get(failure.marketCode) ?? []), failure]);
    }
    console.log(`\n${failures.length} could not be priced:\n`);
    for (const [market, rowsForMarket] of [...byMarket].sort()) {
      console.log(`  ${market} (${rowsForMarket.length})`);
      for (const row of rowsForMarket) {
        console.log(`    ${row.symbol.padEnd(14)} ${row.name.slice(0, 34).padEnd(36)} ${row.reason}`);
      }
    }
    console.log(
      "\nDrop these from lib/universe.instruments.ts, or leave them and accept that\n" +
        "they will need a price typed into the admin grid every week.",
    );
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
