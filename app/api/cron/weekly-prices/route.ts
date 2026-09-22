import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { getPriceProvider } from "@/lib/prices";
import { checkpointDueDates, currentCheckpoint, isPricingOpen } from "@/lib/scoring";
import { SYSTEM_UID, toDate, type Round } from "@/lib/types";
import { monthLabel } from "@/lib/format";
import type { PriceRequest, Quote } from "@/lib/prices/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_FIELDS = ["w0", "w1", "w2", "w3", "w4"] as const;

/**
 * The weekly price checkpoint.
 *
 * ── What decides what gets written ────────────────────────────────────
 *
 * The baseline is the price at the lock and the four checkpoints run
 * weekly from there; checkpointDueDates in lib/scoring.ts is the single
 * definition, shared with the admin grid so the two entry paths cannot
 * disagree. Two properties are worth keeping:
 *
 *  - Only the checkpoint the run is standing in is ever written, and
 *    only when it is still empty. A live quote cannot tell you last
 *    week's close, so a missed week stays missed and is reported rather
 *    than backfilled with today's number. That is also what makes it
 *    safe to run every day.
 *
 *  - Every round still inside its window is priced, not just the newest
 *    unsettled one. Opening February before settling January used to
 *    stop January getting checkpoints for the rest of its life.
 *
 * ── Why there are three ways in ───────────────────────────────────────
 *
 * GET ?plan=1  says what is needed and stops. Nothing is fetched.
 * POST {quotes} writes prices somebody else fetched.
 * GET          fetches through PRICE_PROVIDER and writes, in one go.
 *
 * The split exists for the alert. A failed GitHub Action emails you,
 * which is what a job whose failure mode is silence badly needs; a
 * Vercel cron that stops running tells nobody. So the fetching happens
 * in an Action while every decision about *what* a price means stays
 * here. The Action is deliberately ignorant: it is handed a list of
 * symbols with their market codes and hands back numbers. Translating a
 * market code into whatever a particular feed calls that exchange is its
 * business, not this route's.
 *
 * All three need the CRON_SECRET.
 */

function authorized(request: NextRequest): boolean | null {
  const expected = (() => {
    try {
      return serverEnv.cronSecret();
    } catch {
      return null;
    }
  })();
  if (!expected) return null;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

type Db = ReturnType<typeof adminDb>;

/** One round's worth of work: which checkpoint, and what is still missing. */
type RoundPlan = {
  roundId: string;
  checkpoint: number;
  field: string;
  dueAt: string | null;
  /** Instruments with no value at this checkpoint yet. */
  requests: PriceRequest[];
  /** Earlier checkpoints that were never recorded, for the admin to fill. */
  gaps: string[];
};

/**
 * What every open round still needs, without fetching anything.
 *
 * Reads are shared across rounds: the instruments collection is fetched
 * once however many months are open at the same time.
 */
async function buildPlan(db: Db, rounds: Round[], now: Date): Promise<RoundPlan[]> {
  const open = rounds
    .filter((r) => r.status !== "settled" && isPricingOpen(r, now))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (open.length === 0) return [];

  const instrumentsSnap = await db.collection("instruments").get();
  const instruments = new Map(
    instrumentsSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }]),
  );

  const plans: RoundPlan[] = [];

  for (const round of open) {
    const checkpoint = currentCheckpoint(round, now);
    if (checkpoint === null) continue;

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

    const existing = new Map(
      pricesSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );
    const field = WEEK_FIELDS[checkpoint];
    const requests: PriceRequest[] = [];
    const gaps: string[] = [];

    for (const id of wanted) {
      const instrument = instruments.get(id) as
        | { symbol?: string; marketCode?: string; currency?: string }
        | undefined;
      if (!instrument?.symbol) continue;

      const current = existing.get(id);

      for (let k = 0; k < checkpoint; k++) {
        if (typeof current?.[WEEK_FIELDS[k]] !== "number") {
          gaps.push(`${instrument.symbol}:${WEEK_FIELDS[k]}`);
        }
      }

      if (typeof current?.[field] === "number") continue;

      requests.push({
        instrumentId: id,
        symbol: instrument.symbol,
        // The market, so a feed can name the exchange and tell Sanofi
        // from Banco Santander. Translating it into whatever a
        // particular vendor calls that exchange is the fetcher's job.
        marketCode: instrument.marketCode ?? "",
        // Checked against what the feed reports, so a symbol that
        // resolves on the wrong exchange is dropped rather than scored.
        currency: instrument.currency ?? "",
      });
    }

    const due = checkpointDueDates(round);
    plans.push({
      roundId: round.id,
      checkpoint,
      field,
      dueAt: due ? due[checkpoint].toISOString() : null,
      requests,
      gaps,
    });
  }

  return plans;
}

/** Writes the quotes that belong to this plan, and records the run. */
async function writeQuotes(
  db: Db,
  plan: RoundPlan,
  quotes: Quote[],
  source: string,
  error: string | null,
): Promise<{ roundId: string; checkpoint: number; written: number; gaps: number; error: string | null }> {
  const byId = new Map(plan.requests.map((r) => [r.instrumentId, r]));
  let written = 0;

  if (quotes.length > 0) {
    const batch = db.batch();
    for (const quote of quotes) {
      const id = String(quote.instrumentId);
      const request = byId.get(id);
      // Only what this plan asked for, and only a usable number. A quote
      // for something already recorded is ignored rather than allowed to
      // overwrite a checkpoint that is meant to be final.
      if (!request || !Number.isFinite(quote.price) || quote.price <= 0) continue;

      batch.set(
        db.doc(`rounds/${plan.roundId}/prices/${id}`),
        {
          instrumentId: id,
          symbol: request.symbol,
          currency: request.currency,
          [plan.field]: quote.price,
          source,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      written += 1;
    }
    if (written > 0) await batch.commit();
  }

  await db.collection("priceRuns").add({
    roundId: plan.roundId,
    checkpoint: plan.checkpoint,
    field: plan.field,
    dueAt: plan.dueAt,
    source,
    written,
    awaiting: plan.requests.length - written,
    // Capped: a run where everything is missing should not write a
    // document listing every instrument in the league.
    gaps: plan.gaps.slice(0, 20),
    gapCount: plan.gaps.length,
    note: error,
    createdAt: new Date(),
  });

  return {
    roundId: plan.roundId,
    checkpoint: plan.checkpoint,
    written,
    gaps: plan.gaps.length,
    error,
  };
}

/**
 * Tell the board when a month opens and when it seals.
 *
 * Missing the lock used to be silent, which is a poor way to run a
 * competition whose whole premise is that picks are final at a moment
 * everyone knew about. Now the board says so, at both ends.
 *
 * Both messages are written through the Admin SDK as SYSTEM_UID. A
 * signed-in client cannot forge one: the chat rule pins the author to
 * the auth token, and there is no account with that uid.
 *
 * Each announcement is flagged on the round, so a job that runs every
 * day says each thing exactly once. Two details make "exactly once" true
 * rather than nearly true:
 *
 *  - The flag is read and set inside a transaction with the message, so
 *    two runs that overlap cannot both decide the flag is unset and both
 *    post. The flags on `rounds` passed in here came from a snapshot
 *    taken before any of this, which is a fine filter and not a decision.
 *
 *  - A round that opened *and* locked before anyone was being told about
 *    it gets its open flag set without a message. Announcing "picks seal
 *    on the 4th" beside "picks are sealed" reads as a bug, because it is
 *    one — and the only rounds this can happen to are the ones that
 *    predate the announcements.
 */
async function announce(db: Db, rounds: Round[], now: Date): Promise<string[]> {
  const said: string[] = [];

  for (const round of rounds) {
    if (round.status === "settled") continue;

    const opens = toDate(round.opensAt);
    const locks = toDate(round.locksAt);
    const label = monthLabel(round.id);
    const locked = Boolean(locks && now >= locks);

    /**
     * Claims the flag and, if `body` is given, posts the message with it.
     * Returns false when another run got there first.
     */
    const claim = async (flag: "announcedOpen" | "announcedLock", body: string | null) => {
      const ref = db.doc(`rounds/${round.id}`);
      const posted = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.get(flag) === true) return false;
        if (body !== null) {
          tx.set(db.collection("chat").doc(), {
            uid: SYSTEM_UID,
            body,
            parentId: null,
            createdAt: new Date(),
          });
        }
        tx.set(ref, { [flag]: true }, { merge: true });
        return true;
      });
      if (posted) said.push(`${round.id}:${flag}${body === null ? " (silent)" : ""}`);
    };

    if (!round.announcedOpen && opens && now >= opens) {
      const when = locks
        ? locks.toLocaleString("en-GB", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          })
        : null;
      await claim(
        "announcedOpen",
        locked
          ? null
          : `${label} is open. Up to five picks each, and they seal` +
              (when ? ` on ${when} UTC.` : " at the lock.") +
              " Nobody sees anyone else's until then.",
      );
    }

    if (!round.announcedLock && locked) {
      await claim(
        "announcedLock",
        `Picks are sealed for ${label}. Everyone's holdings are now visible, ` +
          "and the baseline price is the one taken at the lock. Four weekly " +
          "checkpoints from here.",
      );
    }
  }

  return said;
}

export async function GET(request: NextRequest) {
  const ok = authorized(request);
  if (ok === null) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminDb();
  const now = new Date();
  const roundsSnap = await db.collection("rounds").get();
  const rounds = roundsSnap.docs.map((d) => ({ ...(d.data() as Round), id: d.id }));

  const plans = await buildPlan(db, rounds, now);

  // Say what is needed and stop. This is what the GitHub Action asks for.
  if (request.nextUrl.searchParams.get("plan") === "1") {
    return NextResponse.json({
      ok: true,
      at: now.toISOString(),
      rounds: plans.map((p) => ({
        roundId: p.roundId,
        checkpoint: p.checkpoint,
        field: p.field,
        dueAt: p.dueAt,
        gaps: p.gaps.length,
        requests: p.requests,
      })),
    });
  }

  // Announcements are not conditional on there being prices to fetch: a
  // month opens before anyone has picked anything.
  const said = await announce(db, rounds, now);

  if (plans.length === 0) {
    return NextResponse.json({
      ok: true,
      announced: said,
      note: "No round is inside its pricing window.",
    });
  }

  const provider = getPriceProvider();
  const results = [];

  for (const plan of plans) {
    if (plan.requests.length === 0) {
      results.push({ roundId: plan.roundId, checkpoint: plan.checkpoint, written: 0, gaps: plan.gaps.length, error: null });
      continue;
    }
    let quotes: Quote[] = [];
    let error: string | null = null;
    try {
      quotes = (await provider.fetchQuotes(plan.requests)).quotes;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "The price provider failed.";
    }
    results.push(await writeQuotes(db, plan, quotes, provider.name, error));
  }

  return NextResponse.json({
    ok: results.every((r) => r.error === null),
    provider: provider.name,
    announced: said,
    rounds: results,
  });
}

/**
 * Prices fetched elsewhere.
 *
 * The body is a flat list of {instrumentId, price}; which checkpoint each
 * belongs to is decided here, not by the caller. A quote for something
 * this run did not ask for is dropped, so a stale or replayed request
 * cannot rewrite a checkpoint that is already final.
 */
export async function POST(request: NextRequest) {
  const ok = authorized(request);
  if (ok === null) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { quotes?: Quote[]; source?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const quotes = Array.isArray(body.quotes) ? body.quotes : null;
  if (!quotes) {
    return NextResponse.json({ error: "Expected { quotes: [{instrumentId, price}] }." }, { status: 400 });
  }

  const db = adminDb();
  const roundsSnap = await db.collection("rounds").get();
  const rounds = roundsSnap.docs.map((d) => ({ ...(d.data() as Round), id: d.id }));
  const plans = await buildPlan(db, rounds, new Date());
  if (plans.length === 0) {
    return NextResponse.json({ ok: true, note: "No round is inside its pricing window." });
  }

  const source = typeof body.source === "string" && body.source ? body.source.slice(0, 40) : "external";
  const note = typeof body.note === "string" && body.note ? body.note.slice(0, 500) : null;

  const results = [];
  for (const plan of plans) {
    results.push(await writeQuotes(db, plan, quotes, source, note));
  }

  return NextResponse.json({ ok: true, source, rounds: results });
}
