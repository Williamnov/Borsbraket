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

/** Points for finishing 1st, 2nd, 3rd … Everyone further down gets 1. */
export const POINTS = [10, 7, 5, 4, 3, 2] as const;
export const TAIL_POINTS = 1;
export const WEEKS_PER_ROUND = 4;
export const MAX_PICKS = 5;

export function pointsForRank(rank: number): number {
  return POINTS[rank - 1] ?? TAIL_POINTS;
}

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
    };
  });

  entries.sort((a, b) => {
    if (a.ret === null && b.ret === null) return 0;
    if (a.ret === null) return 1;
    if (b.ret === null) return -1;
    return b.ret - a.ret;
  });

  const settled = round.status === "settled";
  entries.forEach((entry, i) => {
    entry.rank = entry.ret === null ? null : i + 1;
    entry.points = settled && entry.rank !== null ? pointsForRank(entry.rank) : null;
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
      if (entry.rank === 1) row.wins += 1;
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

/** Which weekly checkpoint a date falls in, 1-4, counting from the round start. */
export function weekIndexFor(round: Round, when: Date): number {
  const start = new Date(`${round.startsOn}T00:00:00Z`);
  const days = Math.floor((when.getTime() - start.getTime()) / 86_400_000);
  return Math.min(WEEKS_PER_ROUND, Math.max(1, Math.floor(days / 7) + 1));
}

/** Sensible defaults for a fresh month: opens on the 1st, locks on the 4th. */
export function defaultRoundShape(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    opensAt: new Date(Date.UTC(year, month - 1, 1, 6, 0, 0)),
    locksAt: new Date(Date.UTC(year, month - 1, 4, 7, 0, 0)),
    startsOn: `${year}-${pad(month)}-01`,
    endsOn: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}
