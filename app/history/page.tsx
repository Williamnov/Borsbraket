"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Empty, Footer, PageHead, PlayerCell, RequirePlayer, Value } from "@/components/ui";
import { useLeagueBase, useRoundBundles } from "@/lib/hooks";
import { instrumentReturn, scoreRound } from "@/lib/scoring";
import { displayName, formatPercent, monthLabel } from "@/lib/format";
import type { Profile, ScoredEntry } from "@/lib/types";

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
        <Footer />
      </>
    );
  }

  return (
    <>
      <PageHead title="History">
        {settled.length} settled {settled.length === 1 ? "month" : "months"}. Open one for the full
        table and every holding.
      </PageHead>

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

      <div className="stack-sm">
        {settled.map((round) => {
          const entries = scoredByRound.get(round.id) ?? [];
          const winner = entries[0];
          const bundle = bundles.get(round.id);
          const benchmark = instruments
            .filter((i) => i.isBenchmark)
            .map((i) => ({ symbol: i.symbol, ...instrumentReturn(bundle?.prices.get(i.id)) }))
            .filter((b) => b.ret !== null);

          return (
            <details key={round.id} className="panel">
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

              <div className="table-scroll" style={{ borderTop: "1px solid var(--line)" }}>
                <table>
                  <thead>
                    <tr>
                      <th className="center">#</th>
                      <th>Player</th>
                      <th>Holdings</th>
                      <th className="right">Return</th>
                      <th className="right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.uid} className={entry.uid === profile?.uid ? "is-me" : undefined}>
                        <td className={`rank${entry.rank && entry.rank <= 3 ? ` r${entry.rank}` : ""}`}>
                          {entry.rank ?? "–"}
                        </td>
                        <td>
                          <PlayerCell profile={profileMap.get(entry.uid)} you={entry.uid === profile?.uid} />
                        </td>
                        <td>
                          <span className="tickers">
                            {entry.picks.map((pick) => (
                              <span key={pick.instrumentId} className="ticker" title={pick.name}>
                                <strong>{pick.symbol}</strong>
                                <span className={`delta ${pick.ret === null ? "" : pick.ret >= 0 ? "up" : "down"}`}>
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
            </details>
          );
        })}
      </div>

      <Footer />
    </>
  );
}

function nameOf(map: Map<string, Profile>, uid: string): string {
  return displayName(map.get(uid) ?? null);
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
