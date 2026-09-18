#!/usr/bin/env node
/**
 * Fetch this week's prices and hand them to the app.
 *
 * This runs in GitHub Actions rather than as a Vercel cron, for one
 * concrete reason: Twelve Data's free tier allows eight API credits a
 * minute and each symbol costs one, so thirty instruments take about
 * four minutes of paced requests. A Vercel Hobby function is killed at
 * sixty seconds. Actions has hours.
 *
 * Moving it here buys three other things. Vercel Hobby only permits
 * daily cron schedules, and Actions will run on any cron. A failed
 * workflow emails you, which is the missing alert for a job whose
 * failure mode was previously silence. And the Twelve Data key lives in
 * GitHub while the Firebase admin key lives in Vercel, so neither
 * service holds both.
 *
 * The script is deliberately ignorant. It asks the app what is needed,
 * looks those symbols up, and posts the numbers back. Every decision
 * about which checkpoint a price belongs to, and whether it may be
 * written at all, stays in the app.
 *
 *   SITE_URL=https://… CRON_SECRET=… TWELVEDATA_API_KEY=… \
 *     node scripts/fetch-prices.mjs
 */

const SITE = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const KEY = process.env.TWELVEDATA_API_KEY ?? "";

/**
 * The free plan's ceiling. Eight credits a minute, one per symbol.
 * BATCH stays under it and PAUSE waits out the window with a little room,
 * because the limit is measured on their clock and not ours.
 */
const BATCH = 8;
const PAUSE_MS = 65_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Not yet configured is a state, not a failure.
 *
 * The workflow runs daily whether or not the secrets exist. Exiting
 * green with an explanation means nobody is emailed about a setup step
 * they have not taken yet — while a run that is configured and then
 * breaks still goes red, which is the whole point of running it here.
 */
const missing = [
  ["SITE_URL", SITE],
  ["CRON_SECRET", SECRET],
  ["TWELVEDATA_API_KEY", KEY],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.log(`Not configured yet — set ${missing.join(", ")} in the repository secrets.`);
  console.log("Prices can still be entered by hand from the admin panel until then.");
  process.exit(0);
}

const auth = { authorization: `Bearer ${SECRET}` };

/**
 * Our symbols to theirs.
 *
 * The Nordic B-share convention is the only real difference: we show
 * "ERIC B" and "NOVO B", Twelve Data wants "ERIC.B" and "NOVO.B".
 * Everything else — SAP, ASML, 7203, BHP — is already the local ticker.
 */
function vendorSymbol(symbol) {
  return symbol.trim().replace(/\s+/g, ".");
}

async function plan() {
  const response = await fetch(`${SITE}/api/cron/weekly-prices?plan=1`, { headers: auth });
  if (!response.ok) {
    throw new Error(`Asking the app what it needs failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/**
 * One request per exchange-and-batch.
 *
 * Twelve Data takes a comma-separated list but one mic_code for the
 * whole call, so the work is grouped by exchange first and chunked
 * second. A single symbol comes back as a bare object rather than a map
 * keyed by symbol, which is the kind of thing that only shows up on the
 * month when exactly one instrument needs a price.
 */
async function quoteBatch(mic, rows) {
  const symbols = rows.map((r) => r.vendor).join(",");
  const url =
    `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols)}` +
    (mic ? `&mic_code=${encodeURIComponent(mic)}` : "") +
    `&apikey=${encodeURIComponent(KEY)}`;

  const response = await fetch(url);
  const body = await response.json();

  if (body.status === "error") {
    throw new Error(`Twelve Data: ${body.message ?? "unknown error"}`);
  }

  const out = [];
  const missing = [];

  for (const row of rows) {
    const entry = rows.length === 1 ? body : body[row.vendor];
    const price = Number(entry?.price);
    if (Number.isFinite(price) && price > 0) {
      out.push({ instrumentId: row.instrumentId, price });
    } else {
      missing.push(`${row.symbol}${mic ? `@${mic}` : ""}`);
    }
  }

  return { quotes: out, missing };
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
        unique.set(request.instrumentId, { ...request, vendor: vendorSymbol(request.symbol) });
      }
    }
  }

  if (unique.size === 0) {
    console.log("Everything due is already recorded.");
    return;
  }

  const byMic = new Map();
  for (const row of unique.values()) {
    const list = byMic.get(row.mic) ?? [];
    list.push(row);
    byMic.set(row.mic, list);
  }

  const batches = [];
  for (const [mic, rows] of byMic) {
    for (let i = 0; i < rows.length; i += BATCH) batches.push([mic, rows.slice(i, i + BATCH)]);
  }

  console.log(`\n${unique.size} symbol(s) across ${byMic.size} exchange(s), ${batches.length} request(s).`);

  const quotes = [];
  const missing = [];
  const failures = [];

  for (const [index, [mic, rows]] of batches.entries()) {
    if (index > 0) {
      console.log(`  …waiting ${PAUSE_MS / 1000}s for the rate limit`);
      await sleep(PAUSE_MS);
    }
    try {
      const result = await quoteBatch(mic, rows);
      quotes.push(...result.quotes);
      missing.push(...result.missing);
      console.log(`  ${mic || "(no exchange)"}: ${result.quotes.length}/${rows.length} priced`);
    } catch (error) {
      // One bad exchange should not cost the other twenty-nine symbols.
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${mic}: ${reason}`);
      console.log(`  ${mic || "(no exchange)"}: FAILED — ${reason}`);
    }
  }

  if (quotes.length === 0) {
    throw new Error(`Nothing could be priced. ${failures.join(" · ") || missing.join(", ")}`);
  }

  const note = [
    missing.length ? `no price: ${missing.slice(0, 15).join(", ")}` : "",
    failures.length ? `failed: ${failures.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const response = await fetch(`${SITE}/api/cron/weekly-prices`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ quotes, source: "twelvedata", note: note || null }),
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
  if (missing.length > 0 || failures.length > 0) {
    throw new Error(`${missing.length} symbol(s) unpriced, ${failures.length} request(s) failed.`);
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
