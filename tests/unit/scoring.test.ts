import { describe, expect, it } from "vitest";
import {
  buildSeason,
  instrumentReturn,
  pointsForRank,
  roundPhase,
  scoreRound,
  sortEntries,
  sortSeason,
  weekIndexFor,
  weeklyPath,
} from "../../lib/scoring";
import type { PicksDoc, PriceDoc, Round, ScoredEntry, SeasonRow } from "../../lib/types";

/**
 * The scoring functions.
 *
 * These decide who wins. They are pure, they need no emulator and no
 * network, and they had no coverage at all — the existing tests are on
 * the rules, which is where the irreversible bug was rather than where
 * the likely one is.
 *
 * Imports are relative rather than through the "@/" alias: these run
 * under vitest, which does not read tsconfig paths, and a config that
 * resolves the alias is one more thing to get wrong.
 */

// ── Builders ──────────────────────────────────────────────────────────

/** A price document from however many weekly checkpoints are given. */
function price(...weeks: (number | null)[]): PriceDoc {
  const w = [0, 1, 2, 3, 4].map((i) => weeks[i] ?? null);
  return {
    instrumentId: "X",
    symbol: "X",
    currency: "SEK",
    w0: w[0],
    w1: w[1],
    w2: w[2],
    w3: w[3],
    w4: w[4],
  };
}

function round(id: string, status: Round["status"] = "settled"): Round {
  const [year, month] = id.split("-").map(Number);
  return {
    id,
    year,
    month,
    opensAt: new Date(Date.UTC(year, month - 1, 1, 6)),
    locksAt: new Date(Date.UTC(year, month - 1, 4, 7)),
    startsOn: `${id}-01`,
    endsOn: `${id}-28`,
    picksPerRound: 5,
    status,
  };
}

function picks(uid: string, instrumentIds: string[]): PicksDoc {
  return {
    uid,
    roundId: "2026-01",
    picks: Object.fromEntries(
      instrumentIds.map((id, i) => [id, { symbol: id, name: id, marketCode: "TEST", slot: i + 1 }]),
    ),
  };
}

function entry(uid: string, ret: number | null, rank: number | null, points: number | null): ScoredEntry {
  return { uid, picks: [], ret, priced: ret === null ? 0 : 1, total: 1, rank, points };
}

function row(
  uid: string,
  points: number,
  wins: number,
  played: number,
  cumulative: number | null,
  average: number | null,
): SeasonRow {
  return { uid, points, wins, played, cumulative, average, monthly: [] };
}

const uidsOf = <T extends { uid: string }>(rows: T[]) => rows.map((r) => r.uid);

// ── instrumentReturn ──────────────────────────────────────────────────

describe("instrumentReturn", () => {
  it("has no return at all when there is no price document", () => {
    expect(instrumentReturn(undefined)).toEqual({
      open: null,
      latest: null,
      latestWeek: null,
      ret: null,
    });
  });

  it("has no return from an opening price alone", () => {
    const result = instrumentReturn(price(100));
    expect(result.open).toBe(100);
    expect(result.latest).toBeNull();
    expect(result.latestWeek).toBeNull();
    expect(result.ret).toBeNull();
  });

  it("measures from the open to the newest checkpoint recorded", () => {
    const result = instrumentReturn(price(100, 110));
    expect(result.latestWeek).toBe(1);
    expect(result.ret).toBeCloseTo(0.1, 10);
  });

  it("skips gaps and uses the latest week that has a price", () => {
    // Week 2 never got recorded; week 3 is still the newest.
    const result = instrumentReturn(price(100, 110, null, 90));
    expect(result.latestWeek).toBe(3);
    expect(result.latest).toBe(90);
    expect(result.ret).toBeCloseTo(-0.1, 10);
  });

  it("reads the final week when only it and the open exist", () => {
    const result = instrumentReturn(price(100, null, null, null, 120));
    expect(result.latestWeek).toBe(4);
    expect(result.ret).toBeCloseTo(0.2, 10);
  });

  it("treats a non-positive or unreadable opening price as no price", () => {
    // A zero open would otherwise divide, and a negative one would
    // silently invert every return that month.
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = instrumentReturn(price(bad, 110));
      expect(result.open).toBeNull();
      expect(result.ret).toBeNull();
    }
  });
});

// ── weeklyPath ────────────────────────────────────────────────────────

describe("weeklyPath", () => {
  it("gives four points, one per week, against the open", () => {
    const path = weeklyPath(price(100, 110, 90));
    expect(path).toHaveLength(4);
    expect(path[0]).toBeCloseTo(0.1, 10);
    expect(path[1]).toBeCloseTo(-0.1, 10);
    expect(path[2]).toBeNull();
    expect(path[3]).toBeNull();
  });

  it("is empty without a usable open", () => {
    expect(weeklyPath(price(null, 110))).toEqual([null, null, null, null]);
    expect(weeklyPath(price(0, 110))).toEqual([null, null, null, null]);
  });
});

// ── pointsForRank ─────────────────────────────────────────────────────

describe("pointsForRank", () => {
  it("pays the table down to sixth", () => {
    expect([1, 2, 3, 4, 5, 6].map(pointsForRank)).toEqual([10, 7, 5, 4, 3, 2]);
  });

  it("pays everyone below sixth a point for turning up", () => {
    expect(pointsForRank(7)).toBe(1);
    expect(pointsForRank(50)).toBe(1);
  });
});

// ── scoreRound ────────────────────────────────────────────────────────

describe("scoreRound", () => {
  const prices = new Map<string, PriceDoc>([
    ["UP", price(100, 110)], // +10%
    ["DOWN", price(100, 90)], // −10%
    ["FLAT", price(100, 100)], // 0%
  ]);

  it("equal-weights a portfolio and ranks by return", () => {
    const entries = scoreRound(
      round("2026-01"),
      [picks("ann", ["UP"]), picks("bob", ["UP", "DOWN"])],
      prices,
    );

    expect(uidsOf(entries)).toEqual(["ann", "bob"]);
    expect(entries[0].ret).toBeCloseTo(0.1, 10);
    // The mean of +10% and −10%, not the sum.
    expect(entries[1].ret).toBeCloseTo(0, 10);
    expect(entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(entries.map((e) => e.points)).toEqual([10, 7]);
  });

  it("averages only the holdings that have prices", () => {
    // "NONE" is held but never priced: the portfolio is the one holding
    // that is, rather than a return dragged toward zero by a missing one.
    const entries = scoreRound(round("2026-01"), [picks("ann", ["UP", "NONE"])], prices);
    expect(entries[0].ret).toBeCloseTo(0.1, 10);
    expect(entries[0].priced).toBe(1);
    expect(entries[0].total).toBe(2);
  });

  it("gives a portfolio with nothing priced no return, no rank and no points", () => {
    const entries = scoreRound(
      round("2026-01"),
      [picks("ann", ["UP"]), picks("bob", ["NONE"])],
      prices,
    );

    const bob = entries.find((e) => e.uid === "bob");
    expect(bob?.ret).toBeNull();
    expect(bob?.rank).toBeNull();
    expect(bob?.points).toBeNull();
    // and sorts below everyone who has one
    expect(uidsOf(entries)).toEqual(["ann", "bob"]);
  });

  it("ranks an unsettled month but awards nothing for it", () => {
    const entries = scoreRound(
      round("2026-01", "live"),
      [picks("ann", ["UP"]), picks("bob", ["DOWN"])],
      prices,
    );
    expect(entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(entries.map((e) => e.points)).toEqual([null, null]);
  });
});

// ── buildSeason ───────────────────────────────────────────────────────

describe("buildSeason", () => {
  const rounds = [round("2026-01"), round("2026-02"), round("2026-03", "open")];

  const scored = new Map<string, ScoredEntry[]>([
    ["2026-01", [entry("ann", 0.1, 1, 10), entry("bob", -0.05, 2, 7)]],
    ["2026-02", [entry("ann", 0.2, 1, 10), entry("bob", null, null, null)]],
    // Still open, so none of this counts.
    ["2026-03", [entry("bob", 5, 1, 10)]],
  ]);

  it("compounds the monthly returns rather than adding them", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob"]);
    const ann = season.find((r) => r.uid === "ann");
    // 1.10 × 1.20 − 1, not 0.30.
    expect(ann?.cumulative).toBeCloseTo(0.32, 10);
    expect(ann?.average).toBeCloseTo(0.15, 10);
    expect(ann?.points).toBe(20);
    expect(ann?.wins).toBe(2);
    expect(ann?.played).toBe(2);
  });

  it("counts a month a player was not priced for as unplayed", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob"]);
    const bob = season.find((r) => r.uid === "bob");
    expect(bob?.played).toBe(1);
    expect(bob?.points).toBe(7);
    expect(bob?.cumulative).toBeCloseTo(-0.05, 10);
  });

  it("ignores rounds that are not settled", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob"]);
    const bob = season.find((r) => r.uid === "bob");
    // March would have made bob a winner with +500%.
    expect(bob?.wins).toBe(0);
    expect(bob?.points).toBe(7);
  });

  it("gives a player who has never scored a row rather than nothing", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob", "cid"]);
    const cid = season.find((r) => r.uid === "cid");
    expect(cid).toBeDefined();
    expect(cid?.played).toBe(0);
    expect(cid?.cumulative).toBeNull();
    expect(cid?.average).toBeNull();
  });
});

// ── sortSeason ────────────────────────────────────────────────────────

describe("sortSeason", () => {
  const rows = [
    row("ann", 10, 1, 2, 0.3, 0.15),
    row("bob", 10, 0, 2, 0.1, 0.05),
    row("cid", 3, 0, 1, -0.2, -0.2),
    row("dee", 0, 0, 0, null, null),
  ];

  it("breaks a tie on points with the compounded return", () => {
    expect(uidsOf(sortSeason(rows, "points", "desc"))).toEqual(["ann", "bob", "cid", "dee"]);
  });

  it("reverses the order without moving the tie-break", () => {
    // ann still leads bob: the tie-break is stable, not mirrored, so the
    // table does not jitter between renders.
    expect(uidsOf(sortSeason(rows, "points", "asc"))).toEqual(["dee", "cid", "ann", "bob"]);
  });

  it("keeps players with nothing in the column at the bottom either way", () => {
    // Flipping the direction should surface the season's worst player,
    // not the one who has not played yet.
    expect(uidsOf(sortSeason(rows, "average", "desc"))).toEqual(["ann", "bob", "cid", "dee"]);
    expect(uidsOf(sortSeason(rows, "average", "asc"))).toEqual(["cid", "bob", "ann", "dee"]);
  });

  it("sorts by name when asked, using the supplied names", () => {
    const nameOf = (uid: string) => uid;
    expect(uidsOf(sortSeason(rows, "player", "asc", nameOf))).toEqual(["ann", "bob", "cid", "dee"]);
    expect(uidsOf(sortSeason(rows, "player", "desc", nameOf))).toEqual(["dee", "cid", "bob", "ann"]);
  });

  it("does not modify the array it is given", () => {
    const before = uidsOf(rows);
    sortSeason(rows, "points", "asc");
    expect(uidsOf(rows)).toEqual(before);
  });
});

// ── sortEntries ───────────────────────────────────────────────────────

describe("sortEntries", () => {
  const entries = [entry("ann", 0.2, 1, 10), entry("bob", 0.1, 2, 7), entry("cid", null, null, null)];

  it("sorts by finishing position", () => {
    expect(uidsOf(sortEntries(entries, "rank", "asc"))).toEqual(["ann", "bob", "cid"]);
    expect(uidsOf(sortEntries(entries, "rank", "desc"))).toEqual(["bob", "ann", "cid"]);
  });

  it("keeps an unpriced player at the bottom whichever way the column runs", () => {
    expect(uidsOf(sortEntries(entries, "ret", "asc"))).toEqual(["bob", "ann", "cid"]);
    expect(uidsOf(sortEntries(entries, "ret", "desc"))).toEqual(["ann", "bob", "cid"]);
  });
});

// ── weekIndexFor ──────────────────────────────────────────────────────

describe("weekIndexFor", () => {
  const january = round("2026-01");
  const on = (iso: string) => weekIndexFor(january, new Date(iso));

  it("counts weeks from the first day of the month", () => {
    expect(on("2026-01-01T00:00:00Z")).toBe(1);
    expect(on("2026-01-07T23:59:00Z")).toBe(1);
    expect(on("2026-01-08T00:00:00Z")).toBe(2);
    expect(on("2026-01-15T00:00:00Z")).toBe(3);
    expect(on("2026-01-22T00:00:00Z")).toBe(4);
  });

  it("clamps to the four weeks the round actually has", () => {
    expect(on("2026-02-10T00:00:00Z")).toBe(4);
    expect(on("2025-12-25T00:00:00Z")).toBe(1);
  });

  /**
   * Documents a real disagreement rather than asserting it is right.
   *
   * Picks lock on the 4th and the cron runs on Mondays, so the first run
   * that finds no opening price is after the lock — which makes w0 the
   * first-Monday price and measures the month Monday-to-Monday. Entering
   * the same month by hand from the admin grid gives a different w0.
   * Both paths are self-consistent and they do not agree with each other.
   */
  it("indexes the same as the first Monday run regardless of the lock", () => {
    // Monday 5 January 2026, the first cron run of that month, is still
    // week 1 — so the price it records is w1's by this function's
    // reckoning but w0's by the cron's "no open yet" rule.
    expect(on("2026-01-05T06:00:00Z")).toBe(1);
  });
});

// ── roundPhase ────────────────────────────────────────────────────────

describe("roundPhase", () => {
  it("reads the clock rather than a stale status field", () => {
    const january = round("2026-01", "open");
    expect(roundPhase(january, new Date("2026-01-02T00:00:00Z"))).toBe("open");
    // Past the lock, still marked open in Firestore.
    expect(roundPhase(january, new Date("2026-01-20T00:00:00Z"))).toBe("live");
  });

  it("always reports a settled round as settled", () => {
    expect(roundPhase(round("2026-01", "settled"), new Date("2026-01-02T00:00:00Z"))).toBe("settled");
  });
});
