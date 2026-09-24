import {
  toDate,
  type PickItem,
  type PicksDoc,
  type PriceDoc,
  type Round,
  type ScoredEntry,
  type ScoredPick,
  type SeasonRow,
} from "./types";

/**
 * What a month pays, and for what.
 *
 * Three awards rather than a finishing table. A podium paid six places
 * for turning up in a league of a handful of players, which meant the
 * difference between second and fifth was worth more than beating
 * everybody, and the monthly total told you nothing about what anyone
 * had actually done.
 *
 * Each award answers a different question, and one player can take all
 * three in the same month:
 *
 *  - bestPortfolio — did you beat everyone? This pays on the best
 *    return of the month whether or not that return is positive. In a
 *    month where everyone is down, -1% against -2% is still the best
 *    portfolio in the league and is still worth winning.
 *
 *  - bestStock — did you hold the single best pick anyone made? This is
 *    the one award with a floor: a stock that is down cannot be the
 *    month's best call, however much less it fell than everything else.
 *
 *  - positive — did you make money at all? The consolation, and the
 *    reason a good month in a strong field is still worth something.
 *
 * A losing portfolio that wins nothing scores nothing. These three
 * numbers are the whole tuning surface of the league; change them here.
 */
export const POINTS = {
  bestPortfolio: 10,
  bestStock: 5,
  positive: 2,
} as const;

export const WEEKS_PER_ROUND = 4;
export const MAX_PICKS = 5;

/** The most one player can take from one month. */
export const MAX_MONTHLY_POINTS = POINTS.bestPortfolio + POINTS.bestStock + POINTS.positive;

/** Where a round is right now, read from the clock rather than a stale field. */
export function roundPhase(round: Round, now = new Date()): "open" | "live" | "settled" {
  if (round.status === "settled") return "settled";
  const locks = toDate(round.locksAt);
  if (locks && now < locks) return "open";
  return "live";
}

export function weekPrices(price: PriceDoc | undefined): (number | null)[] {
  if (!price) return [null, null, null, null, null];
  return [price.w0, price.w1, price.w2, price.w3, price.w4].map((v) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null,
  );
}

/**
 * Return for one instrument: from the opening price to the most recent
 * weekly checkpoint that has been recorded.
 */
export function instrumentReturn(price: PriceDoc | undefined): {
  open: number | null;
  latest: number | null;
  latestWeek: number | null;
  ret: number | null;
} {
  const weeks = weekPrices(price);
  const open = weeks[0];
  let latestWeek: number | null = null;
  for (let w = WEEKS_PER_ROUND; w >= 1; w--) {
    if (weeks[w] !== null) {
      latestWeek = w;
      break;
    }
  }
  const latest = latestWeek === null ? null : weeks[latestWeek];
  const ret = open !== null && latest !== null && open > 0 ? latest / open - 1 : null;
  return { open, latest, latestWeek, ret };
}

/** Weekly progression against the opening price, for the sparkline. */
export function weeklyPath(price: PriceDoc | undefined): (number | null)[] {
  const weeks = weekPrices(price);
  const open = weeks[0];
  if (open === null || open <= 0) return [null, null, null, null];
  return weeks.slice(1).map((p) => (p === null ? null : p / open - 1));
}

function sortedItems(doc: PicksDoc): [string, PickItem][] {
  return Object.entries(doc.picks ?? {}).sort((a, b) => (a[1].slot ?? 0) - (b[1].slot ?? 0));
}

/**
 * Score one month. A portfolio return is the equal-weighted mean of the
 * holdings that have prices; a portfolio with nothing priced has no
 * return at all rather than a misleading zero.
 */
export function scoreRound(
  round: Round,
  pickDocs: PicksDoc[],
  prices: Map<string, PriceDoc>,
): ScoredEntry[] {
  const entries: ScoredEntry[] = pickDocs.map((doc) => {
    const scored: ScoredPick[] = sortedItems(doc).map(([instrumentId, item]) => ({
      instrumentId,
      symbol: item.symbol,
      name: item.name,
      ...instrumentReturn(prices.get(instrumentId)),
    }));

    const priced = scored.filter((s) => s.ret !== null).map((s) => s.ret as number);
    return {
      uid: doc.uid,
      picks: scored,
      ret: priced.length ? priced.reduce((a, b) => a + b, 0) / priced.length : null,
      priced: priced.length,
      total: scored.length,
      rank: null,
      points: null,
      awards: { bestPortfolio: false, bestStock: false, positive: false },
      bestStockSymbol: null,
    };
  });

  entries.sort((a, b) => {
    if (a.ret === null && b.ret === null) return 0;
    if (a.ret === null) return 1;
    if (b.ret === null) return -1;
    return b.ret - a.ret;
  });

  /*
   * How far from zero a return has to be before it counts as a gain.
   *
   * A portfolio holding +10% and −10% averages to 5.6e-17, not 0, in
   * binary floating point — enough to collect the award for finishing
   * the month up on a portfolio that did nothing of the kind. Nothing
   * this league measures means anything below a millionth of a percent.
   */
  const FLAT = 1e-9;

  // The best portfolio in the field. Not "the best positive portfolio":
  // in a month where everyone is down, somebody still lost least, and
  // that is the month's win.
  const returns = entries.map((e) => e.ret).filter((r): r is number => r !== null);
  const bestReturn = returns.length ? Math.max(...returns) : null;

  // The best single pick anyone made. Unlike the portfolio award this
  // one has a floor: the least bad stock in a bad month is not a good
  // call, so a negative best pays nobody.
  let bestPick: number | null = null;
  for (const entry of entries) {
    for (const pick of entry.picks) {
      if (pick.ret !== null && (bestPick === null || pick.ret > bestPick)) bestPick = pick.ret;
    }
  }
  const stockAwardStands = bestPick !== null && bestPick > 0;

  const settled = round.status === "settled";
  entries.forEach((entry, i) => {
    entry.rank = entry.ret === null ? null : i + 1;

    // Ties share rather than split. Two players on the same return have
    // both beaten the field, and there is no sensible tiebreak between
    // two portfolios that performed identically.
    const bestPortfolio = entry.ret !== null && entry.ret === bestReturn;
    const winner = stockAwardStands
      ? (entry.picks.find((p) => p.ret === bestPick) ?? null)
      : null;
    const positive = entry.ret !== null && entry.ret > FLAT;

    entry.awards = { bestPortfolio, bestStock: winner !== null, positive };
    entry.bestStockSymbol = winner?.symbol ?? null;

    // Points are the settlement, not a running total: nothing is
    // awarded until an admin closes the month. A portfolio with nothing
    // priced has no result rather than a result of zero — it is waiting
    // on the price job, not beaten.
    entry.points =
      settled && entry.ret !== null
        ? (bestPortfolio ? POINTS.bestPortfolio : 0) +
          (winner !== null ? POINTS.bestStock : 0) +
          (positive ? POINTS.positive : 0)
        : null;
  });

  return entries;
}

/**
 * Season table. Only settled months award points; the cumulative figure
 * compounds the monthly returns the way a portfolio actually would.
 */
export function buildSeason(
  rounds: Round[],
  scoredByRound: Map<string, ScoredEntry[]>,
  uids: string[],
): SeasonRow[] {
  const rows = new Map<string, SeasonRow>(
    uids.map((uid) => [
      uid,
      { uid, points: 0, wins: 0, played: 0, cumulative: null, average: null, monthly: [] },
    ]),
  );

  const settled = rounds
    .filter((r) => r.status === "settled")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const round of settled) {
    for (const entry of scoredByRound.get(round.id) ?? []) {
      const row = rows.get(entry.uid);
      if (!row) continue;
      row.points += entry.points ?? 0;
      // The award, not rank 1 — two players tied on the month's best
      // return have both won it, and the sort gives one of them rank 2.
      if (entry.awards.bestPortfolio) row.wins += 1;
      if (entry.ret !== null) {
        row.played += 1;
        row.monthly.push({ roundId: round.id, ret: entry.ret });
      }
    }
  }

  for (const row of rows.values()) {
    if (row.played > 0) {
      row.cumulative = row.monthly.reduce((acc, m) => acc * (1 + m.ret), 1) - 1;
      row.average = row.monthly.reduce((acc, m) => acc + m.ret, 0) / row.played;
    }
  }

  return [...rows.values()];
}

export type SeasonSort = "player" | "played" | "average" | "cumulative" | "wins" | "points";
export type SortDirection = "asc" | "desc";

/**
 * Sort the season table by one column.
 *
 * Players with nothing in the column sort to the bottom either way —
 * reversing the direction should surface the worst player, not the ones
 * who have not played yet. Ties fall back to points, then compounded
 * return, so the order never jitters between renders.
 */
export function sortSeason(
  rows: SeasonRow[],
  by: SeasonSort,
  direction: SortDirection = "desc",
  nameOf?: (uid: string) => string,
): SeasonRow[] {
  const sign = direction === "asc" ? -1 : 1;

  if (by === "player") {
    const name = (r: SeasonRow) => (nameOf ? nameOf(r.uid) : r.uid);
    return [...rows].sort(
      (a, b) => -sign * name(a).localeCompare(name(b), "sv", { sensitivity: "base" }),
    );
  }

  const key = (r: SeasonRow): number | null =>
    by === "points" ? r.points
      : by === "wins" ? r.wins
      : by === "played" ? r.played
      : by === "average" ? r.average
      : r.cumulative;

  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    if ((y ?? 0) !== (x ?? 0)) return sign * ((y ?? 0) - (x ?? 0));
    if (b.points !== a.points) return b.points - a.points;
    return (b.cumulative ?? -Infinity) - (a.cumulative ?? -Infinity);
  });
}

export type EntrySort = "rank" | "player" | "ret" | "points";

/** Nothing in the column sorts to the bottom, whichever way round it is. */
function emptyLast(x: number | null, y: number | null): number | null {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return null;
}

/**
 * Sort one month's standings.
 *
 * Unlike the season table, the leading column here is the real finishing
 * position rather than a row number, so re-sorting the table never makes
 * it lie — the rank travels with the row.
 *
 * Ties fall back to rank so the order is stable between renders, and a
 * player with no priced holdings sorts to the bottom either way: flipping
 * the direction should surface the month's worst return, not the people
 * the prices have not caught up with.
 */
export function sortEntries(
  entries: ScoredEntry[],
  by: EntrySort,
  direction: SortDirection = "asc",
  nameOf?: (uid: string) => string,
): ScoredEntry[] {
  const list = [...entries];
  const flip = direction === "asc" ? 1 : -1;

  if (by === "player") {
    const name = (entry: ScoredEntry) => (nameOf ? nameOf(entry.uid) : entry.uid);
    return list.sort(
      (a, b) => flip * name(a).localeCompare(name(b), "sv", { sensitivity: "base" }),
    );
  }

  if (by === "rank") {
    return list.sort((a, b) => {
      const empty = emptyLast(a.rank, b.rank);
      return empty === null ? flip * ((a.rank ?? 0) - (b.rank ?? 0)) : empty;
    });
  }

  const key = (entry: ScoredEntry) => (by === "ret" ? entry.ret : entry.points);

  return list.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const empty = emptyLast(x, y);
    if (empty !== null) return empty;
    if (x === y) return (a.rank ?? Infinity) - (b.rank ?? Infinity);
    return flip * ((x as number) - (y as number));
  });
}

const DAY_MS = 86_400_000;

/**
 * When each checkpoint is due: the baseline at the lock, then weekly.
 *
 * ── Why the lock and not the first of the month ───────────────────────
 *
 * A month has to be measured from somewhere, and the two candidates are
 * not equally fair. Picks open on the 1st and seal on the 4th. If the
 * baseline were the month's opening price, anyone submitting on the 3rd
 * would already have seen three days of trading and could pick something
 * that had *already* moved, banking a gain that happened before they
 * chose. The later you submit, the more free information you get.
 *
 * Measuring from the lock removes that entirely: everyone's baseline is
 * the same price at the same instant, and it is an instant nobody can
 * see past. The cost is that "January" means the 4th to the 1st of
 * February rather than the calendar month, which is the honest trade —
 * the scoreboard measures your picks, and your picks do not exist until
 * they are sealed.
 *
 * ── Why this function exists at all ───────────────────────────────────
 *
 * The cron used to write the opening price on the first run that found
 * none, which with a Monday schedule meant w0 became the first-Monday
 * price — so a month was measured Monday-to-Monday, and entering the
 * same month by hand from the admin grid produced a different baseline.
 * Both paths now read their answer from here, so they cannot disagree.
 */
export function checkpointDueDates(round: Round): Date[] | null {
  const lock = toDate(round.locksAt);
  if (!lock) return null;

  const weekly = [0, 1, 2, 3].map((k) => new Date(lock.getTime() + k * 7 * DAY_MS));

  /*
   * The last checkpoint is the round's end date, not the lock plus
   * twenty-eight days.
   *
   * A round now finishes on the first day of the month's last week, and
   * the gap from the lock to there is not a whole number of weeks —
   * between 24 and 31 days depending on how the calendar falls. Pinning
   * the final checkpoint to the end means the last price recorded is
   * the one the month is actually judged on, rather than a price from
   * two days after the next month's picks have already opened.
   *
   * The first four stay exactly a week apart, so all that moves is the
   * length of the final leg.
   */
  const end = endInstant(round.endsOn, lock);
  const fourWeeks = new Date(lock.getTime() + 4 * 7 * DAY_MS);

  // An endsOn that is missing, malformed or earlier than the third
  // checkpoint cannot be the last one — an admin is free to type
  // anything into that field, and a non-monotonic run of due dates
  // would have currentCheckpoint reporting nonsense.
  return [...weekly, end && end > weekly[3] ? end : fourWeeks];
}

/**
 * A YYYY-MM-DD round boundary as an instant, at the same time of day as
 * the lock — so every checkpoint in a round falls at the same hour and
 * the first cron run after each one records the same kind of price.
 */
function endInstant(endsOn: string | undefined, lock: Date): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsOn ?? "");
  if (!parts) return null;
  const at = Date.UTC(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    lock.getUTCHours(),
    lock.getUTCMinutes(),
    lock.getUTCSeconds(),
  );
  return Number.isNaN(at) ? null : new Date(at);
}

/**
 * Which checkpoint `when` belongs to, 0-4, or null before the lock.
 *
 * A run records only the checkpoint it is standing in. It cannot invent
 * last week's price from a live quote, so a checkpoint that was missed
 * stays missing and is reported for manual entry rather than quietly
 * backfilled with today's number.
 */
export function currentCheckpoint(round: Round, when: Date): number | null {
  const due = checkpointDueDates(round);
  if (!due || when < due[0]) return null;
  for (let k = WEEKS_PER_ROUND; k >= 0; k--) {
    if (when >= due[k]) return k;
  }
  return null;
}

/**
 * How long after the final checkpoint the cron keeps looking at a round.
 * Enough that a week of failed runs can still be caught up by hand.
 */
export const PRICING_GRACE_DAYS = 7;

/** Whether this round is still within its pricing window. */
export function isPricingOpen(round: Round, when: Date): boolean {
  const due = checkpointDueDates(round);
  if (!due) return false;
  return (
    when >= due[0] && when.getTime() <= due[WEEKS_PER_ROUND].getTime() + PRICING_GRACE_DAYS * DAY_MS
  );
}

/* ── The shape of a month ──────────────────────────────────────────────
 *
 * Picking happens in the last week of the month *before* the one being
 * played. A round for October opens on the last Monday of September,
 * seals on the last weekday of September, and runs through October to
 * the last Monday of October — at which point the next round's picking
 * week begins, and the two meet end to end with no gap and no overlap.
 *
 * This replaced picking in the first few days of the month itself.
 * Under that shape a month's scoring did not start until the 4th, so
 * the first three trading days of every month went unmeasured, and the
 * round ran two days into the next one.
 */

/** Midnight UTC on the last day of a month. `month` is 1-based. */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/**
 * The first day of a month's last week: its last Monday.
 *
 * Weeks start on Monday here, as they do everywhere this league is
 * played. This is always the Monday of the week containing the month's
 * final day — the next Monday would already be in the month after.
 */
export function lastMondayOfMonth(year: number, month: number): Date {
  const day = lastDayOfMonth(year, month);
  // getUTCDay is 0 for Sunday, so this is "days back to Monday".
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - back * DAY_MS);
}

/**
 * The last Monday-to-Friday of a month — its final trading day, holidays
 * aside. Picks close here, which is also where the baseline is taken.
 */
export function lastWeekdayOfMonth(year: number, month: number): Date {
  const day = lastDayOfMonth(year, month);
  const weekday = day.getUTCDay();
  if (weekday === 0) return new Date(day.getTime() - 2 * DAY_MS); // Sunday
  if (weekday === 6) return new Date(day.getTime() - 1 * DAY_MS); // Saturday
  return day;
}

/** Picking opens at the start of the last Monday, in UTC. */
const OPEN_HOUR_UTC = 6;

/**
 * And closes late on the last weekday — after the US close, which is
 * 20:00 UTC in summer and 21:00 in winter.
 *
 * That hour is doing two jobs. It leaves a usable picking window even in
 * the months where the last Monday *is* the last weekday, which happens
 * whenever a month ends on a Monday or on the weekend after one. And it
 * puts every checkpoint after the last market of the day has shut, so
 * the next morning's cron run reads a settled closing price rather than
 * whatever a half-open market happened to be quoting.
 */
const LOCK_HOUR_UTC = 22;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function at(date: Date, hourUtc: number): Date {
  return new Date(date.getTime() + hourUtc * 60 * 60 * 1000);
}

/**
 * The standard schedule for a month: picking in the last week of the
 * month before, scoring through the month itself.
 */
export function defaultRoundShape(year: number, month: number) {
  const beforeYear = month === 1 ? year - 1 : year;
  const beforeMonth = month === 1 ? 12 : month - 1;

  const opens = at(lastMondayOfMonth(beforeYear, beforeMonth), OPEN_HOUR_UTC);
  const locks = at(lastWeekdayOfMonth(beforeYear, beforeMonth), LOCK_HOUR_UTC);
  const ends = lastMondayOfMonth(year, month);

  return {
    opensAt: opens,
    locksAt: locks,
    // The lock is the baseline, so it is also where the scoring window
    // starts. The old shape said the 1st and measured from the 4th.
    startsOn: isoDate(locks),
    endsOn: isoDate(ends),
  };
}
