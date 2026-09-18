"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Empty,
  PageHead,
  PlayerCell,
  RequirePlayer,
  Reveal,
  SortHeader,
  Value,
  useColumnSort,
} from "@/components/ui";
import { useLeagueBase, useRoundBundles } from "@/lib/hooks";
import { instrumentReturn, scoreRound, sortEntries, type EntrySort } from "@/lib/scoring";
import { displayName, formatPercent, monthLabel } from "@/lib/format";
import type { Profile, ScoredEntry } from "@/lib/types";

/** Columns whose first click should read small-to-large. */
const ASC_FIRST: readonly EntrySort[] = ["rank", "player"];

export default function HistoryPage() {
  return (
    <RequirePlayer>
      <History />
    </RequirePlayer>
  );
}

function History() {
  const { profile } = useAuth();
  const { profileMap, rounds, instruments, loading } = useLeagueBase(true);

  const settled = useMemo(
    () => rounds.filter((r) => r.status === "settled").sort((a, b) => b.id.localeCompare(a.id)),
    [rounds],
  );
  const { bundles, loading: bundlesLoading } = useRoundBundles(
    settled.map((r) => r.id),
    settled.length > 0,
  );

  const scoredByRound = useMemo(() => {
    const map = new Map<string, ScoredEntry[]>();
    for (const round of settled) {
      const bundle = bundles.get(round.id);
      if (bundle) map.set(round.id, scoreRound(round, bundle.pickDocs, bundle.prices));
    }
    return map;
  }, [settled, bundles]);

  const records = useMemo(() => {
    let best: { uid: string; symbol: string; ret: number; roundId: string } | null = null;
    let worst: { uid: string; symbol: string; ret: number; roundId: string } | null = null;
    let bestMonth: { uid: string; ret: number; roundId: string } | null = null;

    for (const [roundId, entries] of scoredByRound) {
      for (const entry of entries) {
        if (entry.ret !== null && (!bestMonth || entry.ret > bestMonth.ret)) {
          bestMonth = { uid: entry.uid, ret: entry.ret, roundId };
        }
        for (const pick of entry.picks) {
          if (pick.ret === null) continue;
          if (!best || pick.ret > best.ret) best = { uid: entry.uid, symbol: pick.symbol, ret: pick.ret, roundId };
          if (!worst || pick.ret < worst.ret) worst = { uid: entry.uid, symbol: pick.symbol, ret: pick.ret, roundId };
        }
      }
    }
    return { best, worst, bestMonth };
  }, [scoredByRound]);

  if (loading || bundlesLoading) return <Empty>Loading history…</Empty>;

  if (settled.length === 0) {
    return (
      <>
        <PageHead title="History">
          No month has been settled yet. Once one is, it lands here with the full table.
        </PageHead>
      </>
    );
  }

  return (
    <>
      <PageHead title="History">
        {settled.length} settled {settled.length === 1 ? "month" : "months"}. Open one for the full
        table and every holding; click a column to sort that month by it.
      </PageHead>

      <Reveal>
      <section className="panel" style={{ marginBottom: 20 }}>
        <header>
          <h2>Record book</h2>
        </header>
        <div className="panel-body">
          <div className="grid-2">
            <RecordLine
              label="Best single holding"
              value={records.best ? formatPercent(records.best.ret) : "—"}
              meta={
                records.best
                  ? `${records.best.symbol} — ${nameOf(profileMap, records.best.uid)}, ${monthLabel(records.best.roundId)}`
                  : undefined
              }
              tone="up"
            />
            <RecordLine
              label="Worst single holding"
              value={records.worst ? formatPercent(records.worst.ret) : "—"}
              meta={
                records.worst
                  ? `${records.worst.symbol} — ${nameOf(profileMap, records.worst.uid)}, ${monthLabel(records.worst.roundId)}`
                  : undefined
              }
              tone="down"
            />
            <RecordLine
              label="Best month"
              value={records.bestMonth ? formatPercent(records.bestMonth.ret) : "—"}
              meta={
                records.bestMonth
                  ? `${nameOf(profileMap, records.bestMonth.uid)}, ${monthLabel(records.bestMonth.roundId)}`
                  : undefined
              }
              tone="up"
            />
          </div>
        </div>
      </section>
      </Reveal>

      <div className="stack-sm">
        {settled.map((round, index) => {
          const entries = scoredByRound.get(round.id) ?? [];
          const winner = entries[0];
          const bundle = bundles.get(round.id);
          const benchmark = instruments
            .filter((i) => i.isBenchmark)
            .map((i) => ({ symbol: i.symbol, ...instrumentReturn(bundle?.prices.get(i.id)) }))
            .filter((b) => b.ret !== null);

          return (
            <Reveal key={round.id} delay={Math.min(index, 5) * 50}>
            <details className="panel">
              <summary
                style={{
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ minWidth: "11ch" }}>{monthLabel(round.id)}</strong>
                {winner ? (
                  <span className="row" style={{ gap: 8 }}>
                    <span className="label" style={{ color: "var(--gold)" }}>
                      Winner
                    </span>
                    <PlayerCell profile={profileMap.get(winner.uid)} you={winner.uid === profile?.uid} />
                    <Value value={winner.ret} />
                  </span>
                ) : (
                  <span className="hint">No entries</span>
                )}
                {benchmark.map((b) => (
                  <span key={b.symbol} className="pill">
                    {b.symbol} {formatPercent(b.ret)}
                  </span>
                ))}
              </summary>

              <MonthTable entries={entries} profileMap={profileMap} meUid={profile?.uid} />
            </details>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}

function nameOf(map: Map<string, Profile>, uid: string): string {
  return displayName(map.get(uid) ?? null);
}

/**
 * One settled month's full table.
 *
 * A component of its own so each month keeps its own sort — opening
 * three of them and sorting one by return should not disturb the others.
 * The # column shows the real finishing position rather than a row
 * number, so it stays true however the table is ordered.
 */
function MonthTable({
  entries,
  profileMap,
  meUid,
}: {
  entries: ScoredEntry[];
  profileMap: Map<string, Profile>;
  meUid: string | undefined;
}) {
  const { sortBy, direction, onSort } = useColumnSort<EntrySort>("rank", ASC_FIRST);

  const rows = useMemo(
    () => sortEntries(entries, sortBy, direction, (uid) => nameOf(profileMap, uid)),
    [entries, sortBy, direction, profileMap],
  );

  return (
    <div className="table-scroll" style={{ borderTop: "1px solid var(--line)" }}>
      <table>
        <thead>
          <tr>
            <SortHeader
              column="rank"
              active={sortBy}
              direction={direction}
              onSort={onSort}
              align="center"
            >
              #
            </SortHeader>
            <SortHeader column="player" active={sortBy} direction={direction} onSort={onSort}>
              Player
            </SortHeader>
            <th>Holdings</th>
            <SortHeader
              column="ret"
              active={sortBy}
              direction={direction}
              onSort={onSort}
              align="right"
            >
              Return
            </SortHeader>
            <SortHeader
              column="points"
              active={sortBy}
              direction={direction}
              onSort={onSort}
              align="right"
            >
              Points
            </SortHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.uid} className={entry.uid === meUid ? "is-me" : undefined}>
              <td className={`rank${entry.rank && entry.rank <= 3 ? ` r${entry.rank}` : ""}`}>
                {entry.rank ?? "–"}
              </td>
              <td>
                <PlayerCell profile={profileMap.get(entry.uid)} you={entry.uid === meUid} />
              </td>
              <td>
                <span className="tickers">
                  {entry.picks.map((pick) => (
                    <span key={pick.instrumentId} className="ticker" title={pick.name}>
                      <strong>{pick.symbol}</strong>
                      <span
                        className={`delta ${pick.ret === null ? "" : pick.ret >= 0 ? "up" : "down"}`}
                      >
                        {formatPercent(pick.ret)}
                      </span>
                    </span>
                  ))}
                </span>
              </td>
              <td className="right">
                <Value value={entry.ret} precise />
              </td>
              <td className="right">
                <span className="value">{entry.points ?? "–"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordLine({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta?: string;
  tone: "up" | "down";
}) {
  return (
    <div className="stack-sm" style={{ gap: 2 }}>
      <span className="label">{label}</span>
      <span className={`value ${tone}`} style={{ fontSize: 18 }}>
        {value}
      </span>
      {meta ? <span className="hint">{meta}</span> : null}
    </div>
  );
}
