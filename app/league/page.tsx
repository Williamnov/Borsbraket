"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Empty, Footer, PageHead, PlayerCell, RequirePlayer, Value, WeekBars } from "@/components/ui";
import { useLeagueBase, useRoundBundles } from "@/lib/hooks";
import { buildSeason, scoreRound, sortSeason, type SeasonSort } from "@/lib/scoring";
import { shortMonth } from "@/lib/format";
import type { ScoredEntry } from "@/lib/types";

export default function LeaguePage() {
  return (
    <RequirePlayer>
      <LeagueTable />
    </RequirePlayer>
  );
}

const SORTS: { value: SeasonSort; label: string }[] = [
  { value: "points", label: "Points" },
  { value: "cumulative", label: "Compounded return" },
  { value: "average", label: "Average month" },
  { value: "wins", label: "Monthly wins" },
];

function LeagueTable() {
  const { profile } = useAuth();
  const { profiles, profileMap, rounds, loading } = useLeagueBase(true);
  const [sortBy, setSortBy] = useState<SeasonSort>("points");

  const settledIds = useMemo(
    () => rounds.filter((r) => r.status === "settled").map((r) => r.id),
    [rounds],
  );
  const { bundles, loading: bundlesLoading } = useRoundBundles(settledIds, settledIds.length > 0);

  const season = useMemo(() => {
    const scored = new Map<string, ScoredEntry[]>();
    for (const round of rounds) {
      const bundle = bundles.get(round.id);
      if (!bundle) continue;
      scored.set(round.id, scoreRound(round, bundle.pickDocs, bundle.prices));
    }
    const rows = buildSeason(
      rounds,
      scored,
      profiles.map((p) => p.uid),
    );
    return sortSeason(
      rows.filter((r) => r.played > 0 || r.points > 0),
      sortBy,
    );
  }, [rounds, bundles, profiles, sortBy]);

  if (loading || bundlesLoading) return <Empty>Loading the table…</Empty>;

  const settledCount = settledIds.length;

  return (
    <>
      <PageHead
        title="Season table"
        action={
          <label className="row" style={{ gap: 8 }}>
            <span className="label">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SeasonSort)}
              style={{ width: "auto" }}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {settledCount === 0
          ? "No month has been settled yet. The table fills in once the first one closes."
          : `${settledCount} ${settledCount === 1 ? "month" : "months"} settled. Points are 10/7/5/4/3/2, then 1 for everyone else who submitted.`}
      </PageHead>

      <section className="panel">
        <div className="panel-body flush table-scroll">
          <table>
            <thead>
              <tr>
                <th className="center">#</th>
                <th>Player</th>
                <th className="center">Months</th>
                <th>Form</th>
                <th className="right">Average</th>
                <th className="right">Compounded</th>
                <th className="right">Wins</th>
                <th className="right">Points</th>
              </tr>
            </thead>
            <tbody>
              {season.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <Empty>Nothing to rank yet.</Empty>
                  </td>
                </tr>
              ) : (
                season.map((row, index) => {
                  const position = index + 1;
                  return (
                    <tr key={row.uid} className={row.uid === profile?.uid ? "is-me" : undefined}>
                      <td className={`rank${position <= 3 ? ` r${position}` : ""}`}>{position}</td>
                      <td>
                        <PlayerCell
                          profile={profileMap.get(row.uid)}
                          you={row.uid === profile?.uid}
                          withMotto
                        />
                      </td>
                      <td className="center mono">{row.played}</td>
                      <td>
                        <WeekBars
                          unit="Month"
                          path={row.monthly.slice(-6).map((m) => m.ret)}
                          labels={row.monthly.slice(-6).map((m) => shortMonth(m.roundId))}
                        />
                      </td>
                      <td className="right">
                        <Value value={row.average} />
                      </td>
                      <td className="right">
                        <Value value={row.cumulative} />
                      </td>
                      <td className="right mono">{row.wins}</td>
                      <td className="right">
                        <span className="value">{row.points}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {season.length > 0 && settledCount > 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>
          Form shows the last {Math.min(6, settledCount)} settled months, most recent on the right.
          Hover a bar for the figure.
        </p>
      ) : null}

      <Footer />
    </>
  );
}
