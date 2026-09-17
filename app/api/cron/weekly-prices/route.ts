import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { getPriceProvider } from "@/lib/prices";
import { weekIndexFor } from "@/lib/scoring";
import { toDate, type Round } from "@/lib/types";
import type { PriceRequest } from "@/lib/prices/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_FIELDS = ["w0", "w1", "w2", "w3", "w4"] as const;

/**
 * Weekly price checkpoint. Vercel Cron calls this every Monday; the
 * schedule lives in vercel.json.
 *
 * It is deliberately safe to run twice: each write targets one named
 * week field on one instrument, so a repeat run overwrites the same
 * value rather than appending a second checkpoint.
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

  // The round being measured: the newest one that is not settled yet.
  const roundsSnap = await db.collection("rounds").get();
  const rounds = roundsSnap.docs
    .map((d) => ({ ...(d.data() as Round), id: d.id }))
    .filter((r) => r.status !== "settled")
    .sort((a, b) => a.id.localeCompare(b.id));

  const round = rounds[rounds.length - 1];
  if (!round) {
    return NextResponse.json({ ok: true, note: "No open round to price." });
  }

  const startsOn = toDate(`${round.startsOn}T00:00:00Z`);
  if (startsOn && now < startsOn) {
    return NextResponse.json({ ok: true, note: `${round.id} has not started yet.` });
  }

  // Everything held this month, plus the benchmarks.
  const [picksSnap, instrumentsSnap, pricesSnap] = await Promise.all([
    db.collection(`rounds/${round.id}/picks`).get(),
    db.collection("instruments").get(),
    db.collection(`rounds/${round.id}/prices`).get(),
  ]);

  const instruments = new Map(
    instrumentsSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }]),
  );

  const wanted = new Set<string>();
  for (const pickDoc of picksSnap.docs) {
    const picks = (pickDoc.data().picks ?? {}) as Record<string, unknown>;
    for (const id of Object.keys(picks)) wanted.add(id);
  }
  for (const [id, instrument] of instruments) {
    if ((instrument as { isBenchmark?: boolean }).isBenchmark) wanted.add(id);
  }

  if (wanted.size === 0) {
    return NextResponse.json({ ok: true, note: "Nothing is held this month yet." });
  }

  const existing = new Map(pricesSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const weekIndex = weekIndexFor(round, now);

  const requests: PriceRequest[] = [];
  const targetWeek = new Map<string, number>();

  for (const id of wanted) {
    const instrument = instruments.get(id) as
      | { symbol?: string; marketCode?: string; currency?: string }
      | undefined;
    if (!instrument?.symbol) continue;

    // Anything without an opening price gets one first; otherwise this
    // week's checkpoint.
    const current = existing.get(id);
    const hasOpen = typeof current?.w0 === "number";
    const week = hasOpen ? weekIndex : 0;

    targetWeek.set(id, week);
    requests.push({
      instrumentId: id,
      symbol: instrument.symbol,
      marketCode: instrument.marketCode ?? "",
      currency: instrument.currency ?? "",
    });
  }

  const provider = getPriceProvider();
  let quotes: { instrumentId: number | string; price: number }[] = [];
  let missing: { symbol: string; reason: string }[] = [];
  let failure: string | null = null;

  try {
    const result = await provider.fetchQuotes(requests);
    quotes = result.quotes;
    missing = result.missing.map((m) => ({ symbol: m.symbol, reason: m.reason }));
  } catch (error) {
    failure = error instanceof Error ? error.message : "The price provider failed.";
  }

  let written = 0;
  if (quotes.length > 0) {
    const batch = db.batch();
    for (const quote of quotes) {
      const id = String(quote.instrumentId);
      const week = targetWeek.get(id);
      if (week === undefined || !Number.isFinite(quote.price) || quote.price <= 0) continue;
      const instrument = instruments.get(id) as { symbol?: string; currency?: string } | undefined;

      batch.set(
        db.doc(`rounds/${round.id}/prices/${id}`),
        {
          instrumentId: id,
          symbol: instrument?.symbol ?? id,
          currency: instrument?.currency ?? "",
          [WEEK_FIELDS[week]]: quote.price,
          source: provider.name,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      written += 1;
    }
    await batch.commit();
  }

  await db.collection("priceRuns").add({
    roundId: round.id,
    weekIndex,
    source: provider.name,
    written,
    skipped: missing.length,
    note: failure ?? (missing.length ? missing.slice(0, 5).map((m) => m.symbol).join(", ") : null),
    createdAt: new Date(),
  });

  return NextResponse.json({
    ok: failure === null,
    round: round.id,
    weekIndex,
    provider: provider.name,
    written,
    awaiting: missing.length,
    error: failure,
  });
}
