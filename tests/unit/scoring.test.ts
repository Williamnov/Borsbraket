import { describe, expect, it } from "vitest";
import {
  buildSeason,
  checkpointDueDates,
  currentCheckpoint,
  defaultRoundShape,
  instrumentReturn,
  isPricingOpen,
  lastMondayOfMonth,
  lastWeekdayOfMonth,
  roundPhase,
  scoreRound,
  sortEntries,
  sortSeason,
  weeklyPath,
} from "../../lib/scoring";
import type { Awards, PicksDoc, PriceDoc, Round, ScoredEntry, SeasonRow } from "../../lib/types";

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

/**
 * A round on the standard schedule, so the fixtures cannot describe a
 * calendar the app would never produce. January 2026 therefore opens on
 * Monday 29 December 2025, locks on Wednesday 31 December, and ends on
 * Monday 26 January 2026.
 */
function round(id: string, status: Round["status"] = "settled"): Round {
  const [year, month] = id.split("-").map(Number);
  const shape = defaultRoundShape(year, month);
  return { id, year, month, ...shape, picksPerRound: 5, status };
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

function entry(
  uid: string,
  ret: number | null,
  rank: number | null,
  points: number | null,
  awards: Partial<Awards> = {},
): ScoredEntry {
  return {
    uid,
    picks: [],
    ret,
    priced: ret === null ? 0 : 1,
    total: 1,
    rank,
    points,
    awards: { bestPortfolio: false, bestStock: false, positive: false, ...awards },
    bestStockSymbol: null,
  };
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

    // ann takes all three: the best portfolio, the best single stock
    // (UP, which she also holds alone) and a positive month.
    expect(entries[0].points).toBe(17);
    expect(entries[0].awards).toEqual({ bestPortfolio: true, bestStock: true, positive: true });

    // bob holds UP too, so he shares the best-stock award — but his
    // portfolio is flat, which is not a gain and does not win the month.
    expect(entries[1].points).toBe(5);
    expect(entries[1].awards).toEqual({ bestPortfolio: false, bestStock: true, positive: false });
  });

  /**
   * The month's win goes to the least bad portfolio when every
   * portfolio is bad. Losing by less is still the best anyone managed,
   * and it is the one award with no floor under it.
   */
  it("pays the best portfolio even when it is a loss", () => {
    const entries = scoreRound(
      round("2026-01"),
      [picks("ann", ["SMALL-LOSS"]), picks("bob", ["DOWN"])],
      new Map<string, PriceDoc>([
        ["SMALL-LOSS", price(100, 99)], // −1%
        ["DOWN", price(100, 90)], // −10%
      ]),
    );

    expect(entries[0].uid).toBe("ann");
    expect(entries[0].awards.bestPortfolio).toBe(true);
    expect(entries[0].awards.positive).toBe(false);
    // The win, and nothing else: no stock was up, so nobody takes that.
    expect(entries[0].awards.bestStock).toBe(false);
    expect(entries[0].points).toBe(10);
    expect(entries[1].points).toBe(0);
  });

  /**
   * Unlike the portfolio award, the single-stock award has a floor. The
   * least bad stock in a bad month is not a good call.
   */
  it("pays nobody for the best stock when the best stock is down", () => {
    const entries = scoreRound(
      round("2026-01"),
      [picks("ann", ["DOWN"])],
      new Map<string, PriceDoc>([["DOWN", price(100, 90)]]),
    );
    expect(entries[0].awards.bestStock).toBe(false);
    expect(entries[0].bestStockSymbol).toBeNull();
  });

  it("names the winning stock on the entry holding it", () => {
    const entries = scoreRound(round("2026-01"), [picks("ann", ["UP", "DOWN"])], prices);
    expect(entries[0].bestStockSymbol).toBe("UP");
  });

  /**
   * Two identical portfolios have both beaten the field, and there is
   * no sensible tiebreak between them.
   */
  it("lets a tie share the win rather than splitting it", () => {
    const entries = scoreRound(round("2026-01"), [picks("ann", ["UP"]), picks("bob", ["UP"])], prices);
    expect(entries.map((e) => e.awards.bestPortfolio)).toEqual([true, true]);
    expect(entries.map((e) => e.points)).toEqual([17, 17]);
  });

  it("pays a positive month that won nothing else", () => {
    const entries = scoreRound(
      round("2026-01"),
      [picks("ann", ["UP"]), picks("bob", ["SMALL-GAIN"])],
      new Map<string, PriceDoc>([
        ["UP", price(100, 110)],
        ["SMALL-GAIN", price(100, 101)],
      ]),
    );
    const bob = entries.find((e) => e.uid === "bob");
    expect(bob?.awards).toEqual({ bestPortfolio: false, bestStock: false, positive: true });
    expect(bob?.points).toBe(2);
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
    [
      "2026-01",
      [
        entry("ann", 0.1, 1, 12, { bestPortfolio: true, positive: true }),
        entry("bob", -0.05, 2, 0),
      ],
    ],
    [
      "2026-02",
      [entry("ann", 0.2, 1, 12, { bestPortfolio: true, positive: true }), entry("bob", null, null, null)],
    ],
    // Still open, so none of this counts.
    ["2026-03", [entry("bob", 5, 1, 12, { bestPortfolio: true, positive: true })]],
  ]);

  it("compounds the monthly returns rather than adding them", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob"]);
    const ann = season.find((r) => r.uid === "ann");
    // 1.10 × 1.20 − 1, not 0.30.
    expect(ann?.cumulative).toBeCloseTo(0.32, 10);
    expect(ann?.average).toBeCloseTo(0.15, 10);
    expect(ann?.points).toBe(24);
    expect(ann?.wins).toBe(2);
    expect(ann?.played).toBe(2);
  });

  it("counts a month a player was not priced for as unplayed", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob"]);
    const bob = season.find((r) => r.uid === "bob");
    expect(bob?.played).toBe(1);
    // Down in January and unpriced in February — a losing month that
    // was also beaten now pays nothing at all.
    expect(bob?.points).toBe(0);
    expect(bob?.cumulative).toBeCloseTo(-0.05, 10);
  });

  it("ignores rounds that are not settled", () => {
    const season = buildSeason(rounds, scored, ["ann", "bob"]);
    const bob = season.find((r) => r.uid === "bob");
    // March would have made bob a winner with +500%.
    expect(bob?.wins).toBe(0);
    expect(bob?.points).toBe(0);
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

// ── Checkpoints ───────────────────────────────────────────────────────

describe("the standard schedule", () => {
  it("finds the first day of a month's last week", () => {
    // September 2026 ends on Wednesday the 30th, so its last week opens
    // on Monday the 28th.
    expect(lastMondayOfMonth(2026, 9).toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(lastMondayOfMonth(2026, 10).toISOString().slice(0, 10)).toBe("2026-10-26");
    // November 2026 ends *on* a Monday, which is therefore its own last.
    expect(lastMondayOfMonth(2026, 11).toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  it("finds the last weekday, stepping back over a weekend", () => {
    // Wednesday: the last day of the month is already a weekday.
    expect(lastWeekdayOfMonth(2026, 9).toISOString().slice(0, 10)).toBe("2026-09-30");
    // Saturday 31 October falls back to Friday the 30th.
    expect(lastWeekdayOfMonth(2026, 10).toISOString().slice(0, 10)).toBe("2026-10-30");
    // Sunday 31 January 2027 falls back to Friday the 29th.
    expect(lastWeekdayOfMonth(2027, 1).toISOString().slice(0, 10)).toBe("2027-01-29");
  });

  it("picks in the last week of the month before, and runs through the month", () => {
    const october = defaultRoundShape(2026, 10);
    expect(october.opensAt.toISOString()).toBe("2026-09-28T06:00:00.000Z");
    expect(october.locksAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(october.startsOn).toBe("2026-09-30");
    expect(october.endsOn).toBe("2026-10-26");
  });

  it("crosses the year end", () => {
    const january = defaultRoundShape(2026, 1);
    expect(january.opensAt.toISOString()).toBe("2025-12-29T06:00:00.000Z");
    expect(january.locksAt.toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(january.endsOn).toBe("2026-01-26");
  });

  /**
   * One round's last day is the next round's first, with no gap and no
   * overlap. Under the old shape — picks on the 1st, lock on the 4th —
   * the first three trading days of every month went unmeasured.
   */
  it("hands straight over from one month to the next", () => {
    for (const [year, month] of [[2026, 10], [2026, 11], [2026, 12], [2027, 1]] as const) {
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const ends = defaultRoundShape(year, month).endsOn;
      const opens = defaultRoundShape(nextYear, nextMonth).opensAt;
      expect(opens.toISOString().slice(0, 10)).toBe(ends);
    }
  });

  /**
   * A month that ends on a Monday makes the last Monday and the last
   * weekday the same day. The window is short but it is a whole trading
   * day, which is what the 06:00-to-22:00 hours are for.
   */
  it("leaves a picking window even when the two days coincide", () => {
    // December 2026 is picked on Monday 30 November, which is both.
    const december = defaultRoundShape(2026, 12);
    expect(december.opensAt.toISOString()).toBe("2026-11-30T06:00:00.000Z");
    expect(december.locksAt.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(december.locksAt.getTime()).toBeGreaterThan(december.opensAt.getTime());
  });
});

describe("checkpointDueDates", () => {
  it("starts at the lock, then every seven days, then the round's end", () => {
    // January 2026 locks on Wednesday 31 December and ends on Monday
    // 26 January, which is 26 days — so the final leg is five days
    // rather than seven.
    const due = checkpointDueDates(round("2026-01"));
    expect(due?.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2025-12-31",
      "2026-01-07",
      "2026-01-14",
      "2026-01-21",
      "2026-01-26",
    ]);
  });

  it("keeps every checkpoint at the same hour", () => {
    const due = checkpointDueDates(round("2026-01")) ?? [];
    for (const date of due) expect(date.getUTCHours()).toBe(22);
  });

  /**
   * An admin can type anything into the end date. A run of due dates
   * that is not increasing would have currentCheckpoint reporting
   * nonsense, so a useless one is ignored rather than trusted.
   */
  it("falls back to four weeks when the end date cannot be the last one", () => {
    const base = round("2026-01");
    const fourWeeks = "2026-01-28";
    for (const endsOn of ["", "not-a-date", "2026-01-02"]) {
      const due = checkpointDueDates({ ...base, endsOn });
      expect(due?.[4].toISOString().slice(0, 10)).toBe(fourWeeks);
    }
  });

  it("has nothing to say about a round with no lock", () => {
    expect(checkpointDueDates({ ...round("2026-01"), locksAt: null })).toBeNull();
  });
});

describe("currentCheckpoint", () => {
  const january = round("2026-01");
  const at = (iso: string) => currentCheckpoint(january, new Date(iso));

  /**
   * The baseline is the price at the lock, not the price on the 1st.
   *
   * Picking runs through the last week of December and seals on the
   * 31st. Measuring from January's opening price would hand whoever
   * submits last a few days of hindsight — they could pick something
   * that had already moved and bank a gain that happened before they
   * chose. Everyone's baseline is the same price at the same instant.
   */
  it("records nothing before the lock", () => {
    expect(at("2025-12-29T06:00:00Z")).toBeNull();
    expect(at("2025-12-31T21:59:00Z")).toBeNull();
    // The first cron run after the lock is the next morning, and it
    // reads the closing price the lock hour was chosen to wait for.
    expect(at("2026-01-01T06:00:00Z")).toBe(0);
  });

  it("counts the weeks from the lock rather than from the month", () => {
    expect(at("2025-12-31T22:00:00Z")).toBe(0);
    expect(at("2026-01-07T21:00:00Z")).toBe(0);
    expect(at("2026-01-08T06:00:00Z")).toBe(1);
    expect(at("2026-01-15T06:00:00Z")).toBe(2);
    expect(at("2026-01-22T06:00:00Z")).toBe(3);
    expect(at("2026-01-27T06:00:00Z")).toBe(4);
  });

  it("stays at the last checkpoint once the month has run out", () => {
    expect(at("2026-02-20T07:00:00Z")).toBe(4);
  });
});

describe("isPricingOpen", () => {
  const january = round("2026-01");

  it("is shut before the lock and open through to the end", () => {
    expect(isPricingOpen(january, new Date("2025-12-30T00:00:00Z"))).toBe(false);
    expect(isPricingOpen(january, new Date("2025-12-31T22:00:00Z"))).toBe(true);
    expect(isPricingOpen(january, new Date("2026-01-27T06:00:00Z"))).toBe(true);
  });

  it("allows a week's grace to catch up a missed run, then closes", () => {
    expect(isPricingOpen(january, new Date("2026-02-01T07:00:00Z"))).toBe(true);
    expect(isPricingOpen(january, new Date("2026-02-20T07:00:00Z"))).toBe(false);
  });

  /**
   * The cron prices every round inside its window, not just the newest
   * unsettled one — opening February before settling January used to
   * stop January getting checkpoints for the rest of its life.
   *
   * The two overlap by design now: February's picking week runs inside
   * January's final week of scoring.
   */
  it("is open for two overlapping rounds at once", () => {
    const february = round("2026-02", "open");
    const when = new Date("2026-01-30T07:00:00Z");
    expect(isPricingOpen(january, when)).toBe(true);
    expect(isPricingOpen(february, when)).toBe(false);
    // February starts being priced once its own picks have sealed.
    const afterFebLock = new Date("2026-02-01T07:00:00Z");
    expect(isPricingOpen(january, afterFebLock)).toBe(true);
    expect(isPricingOpen(february, afterFebLock)).toBe(true);
  });
});

// ── roundPhase ────────────────────────────────────────────────────────

describe("roundPhase", () => {
  it("reads the clock rather than a stale status field", () => {
    // January's picking week runs through the end of December.
    const january = round("2026-01", "open");
    expect(roundPhase(january, new Date("2025-12-30T00:00:00Z"))).toBe("open");
    // Past the lock, still marked open in Firestore.
    expect(roundPhase(january, new Date("2026-01-20T00:00:00Z"))).toBe("live");
  });

  it("always reports a settled round as settled", () => {
    expect(roundPhase(round("2026-01", "settled"), new Date("2025-12-30T00:00:00Z"))).toBe("settled");
  });
});
