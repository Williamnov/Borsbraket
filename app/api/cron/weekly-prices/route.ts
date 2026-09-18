import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { getPriceProvider } from "@/lib/prices";
import { checkpointDueDates, currentCheckpoint, isPricingOpen } from "@/lib/scoring";
import type { Round } from "@/lib/types";
import type { PriceRequest } from "@/lib/prices/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_FIELDS = ["w0", "w1", "w2", "w3", "w4"] as const;

/**
 * Weekly price checkpoint. The schedule lives in vercel.json.
 *
 * It runs daily rather than on Mondays, because what it records is tied
 * to the round's own clock and not to the week's. The baseline is the
 * price at the lock; a Monday-only job would record it on whichever
 * Monday came next, which is how the opening price used to drift by up
 * to six days and end up meaning something different from what the admin
 * grid meant by it. See checkpointDueDates in lib/scoring.ts.
 *
 * Two properties worth keeping:
 *
 *  - It only ever writes the checkpoint it is standing in, and only if
 *    that checkpoint is still empty. A live quote cannot tell you last
 *    week's price, so a missed week stays missed and is reported rather
 *    than quietly backfilled with today's number. This is also what makes
 *    a daily schedule safe: yesterday's w1 is not overwritten today.
 *
 *  - It prices every round still inside its window, not just the newest
 *    unsettled one. Opening February before settling January used to stop
 *    January getting checkpoints for the rest of its life.
 */
export async function GET(request: NextRequest) {
  const expected = (() => {
    try {
      return serverEnv.cronSecret();
    } catch {
      return null;
    }
  })();

  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const now = new Date();

  const roundsSnap = await db.collection("rounds").get();
  const open = roundsSnap.docs
    .map((d) => ({ ...(d.data() as Round), id: d.id }))
    .filter((r) => r.status !== "settled" && isPricingOpen(r, now))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (open.length === 0) {
    return NextResponse.json({ ok: true, note: "No round is inside its pricing window." });
  }

  const instrumentsSnap = await db.collection("instruments").get();
  const instruments = new Map(
    instrumentsSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }]),
  );

  const provider = getPriceProvider();
  const results = [];

  for (const round of open) {
    results.push(await priceRound(db, round, instruments, provider, now));
  }

  return NextResponse.json({
    ok: results.every((r) => r.error === null),
    provider: provider.name,
    rounds: results,
  });
}

type Db = ReturnType<typeof adminDb>;
type Provider = ReturnType<typeof getPriceProvider>;

async function priceRound(
  db: Db,
  round: Round,
  instruments: Map<string, Record<string, unknown>>,
  provider: Provider,
  now: Date,
) {
  const checkpoint = currentCheckpoint(round, now);
  if (checkpoint === null) {
    return { round: round.id, note: "Not locked yet.", written: 0, error: null };
  }

  const [picksSnap, pricesSnap] = await Promise.all([
    db.collection(`rounds/${round.id}/picks`).get(),
    db.collection(`rounds/${round.id}/prices`).get(),
  ]);

  // Everything held this month, plus the benchmarks.
  const wanted = new Set<string>();
  for (const pickDoc of picksSnap.docs) {
    for (const id of Object.keys((pickDoc.data().picks ?? {}) as Record<string, unknown>)) {
      wanted.add(id);
    }
  }
  for (const [id, instrument] of instruments) {
    if ((instrument as { isBenchmark?: boolean }).isBenchmark) wanted.add(id);
  }

  if (wanted.size === 0) {
    return { round: round.id, note: "Nothing is held this month.", written: 0, error: null };
  }

  const existing = new Map(pricesSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const field = WEEK_FIELDS[checkpoint];

  const requests: PriceRequest[] = [];
  const gaps: string[] = [];

  for (const id of wanted) {
    const instrument = instruments.get(id) as
      | { symbol?: string; marketCode?: string; currency?: string }
      | undefined;
    if (!instrument?.symbol) continue;

    const current = existing.get(id);

    // Earlier checkpoints that never got recorded. Reported, never
    // guessed at — today's quote is not last week's close.
    for (let k = 0; k < checkpoint; k++) {
      if (typeof current?.[WEEK_FIELDS[k]] !== "number") {
        gaps.push(`${instrument.symbol}:${WEEK_FIELDS[k]}`);
      }
    }

    // Already recorded for this checkpoint: leave it alone. This is what
    // makes a daily schedule safe.
    if (typeof current?.[field] === "number") continue;

    requests.push({
      instrumentId: id,
      symbol: instrument.symbol,
      marketCode: instrument.marketCode ?? "",
      currency: instrument.currency ?? "",
    });
  }

  let written = 0;
  let awaiting = 0;
  let error: string | null = null;

  if (requests.length > 0) {
    try {
      const result = await provider.fetchQuotes(requests);
      awaiting = result.missing.length;

      if (result.quotes.length > 0) {
        const batch = db.batch();
        for (const quote of result.quotes) {
          const id = String(quote.instrumentId);
          if (!Number.isFinite(quote.price) || quote.price <= 0) continue;
          const instrument = instruments.get(id) as
            | { symbol?: string; currency?: string }
            | undefined;

          batch.set(
            db.doc(`rounds/${round.id}/prices/${id}`),
            {
              instrumentId: id,
              symbol: instrument?.symbol ?? id,
              currency: instrument?.currency ?? "",
              [field]: quote.price,
              source: provider.name,
              updatedAt: new Date(),
            },
            { merge: true },
          );
          written += 1;
        }
        await batch.commit();
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "The price provider failed.";
    }
  }

  const due = checkpointDueDates(round);
  await db.collection("priceRuns").add({
    roundId: round.id,
    checkpoint,
    field,
    dueAt: due ? due[checkpoint] : null,
    source: provider.name,
    written,
    awaiting,
    // Capped: a run where every instrument is missing should not write a
    // document listing every instrument.
    gaps: gaps.slice(0, 20),
    gapCount: gaps.length,
    note: error,
    createdAt: new Date(),
  });

  return { round: round.id, checkpoint, field, written, awaiting, gaps: gaps.length, error };
}
