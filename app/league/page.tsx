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
  WeekBars,
  useColumnSort,
} from "@/components/ui";
import { useRoundBundles } from "@/lib/hooks";
import { useLeagueBase } from "@/components/LeagueProvider";
import { buildSeason, scoreRound, sortSeason, type SeasonSort } from "@/lib/scoring";
import { displayName, shortMonth } from "@/lib/format";
import type { ScoredEntry } from "@/lib/types";

/** Columns whose first click should read small-to-large. */
const ASC_FIRST: readonly SeasonSort[] = ["player"];

export default function LeaguePage() {
  return (
    <RequirePlayer>
      <LeagueTable />
    </RequirePlayer>
  );
}

function LeagueTable() {
  const { profile } = useAuth();
  const { profiles, profileMap, rounds, loading } = useLeagueBase();
  const { sortBy, direction, onSort } = useColumnSort<SeasonSort>("points", ASC_FIRST);

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
      direction,
      (uid) => displayName(profileMap.get(uid) ?? null),
    );
  }, [rounds, bundles, profiles, profileMap, sortBy, direction]);

  if (loading || bundlesLoading) return <Empty>Loading the table…</Empty>;

  const settledCount = settledIds.length;
  // Standings only mean anything in the default order. Sorted any other
  // way the leading column is a row number, not a position.
  const ranked = sortBy === "points" && direction === "desc";

  return (
    <>
      <PageHead title="Season table">
        {settledCount === 0
          ? "No month has been settled yet. The table fills in once the first one closes."
          : `${settledCount} ${settledCount === 1 ? "month" : "months"} settled. Points are 10/7/5/4/3/2, then 1 for everyone else who submitted. Click a column to sort by it.`}
      </PageHead>

      <Reveal>
        <section className="panel">
          <div className="panel-body flush table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="center">#</th>
                  <SortHeader column="player" active={sortBy} direction={direction} onSort={onSort}>
                    Player
                  </SortHeader>
                  <SortHeader
                    column="played"
                    active={sortBy}
                    direction={direction}
                    onSort={onSort}
                    align="center"
                  >
                    Months
                  </SortHeader>
                  <th>Form</th>
                  <SortHeader
                    column="average"
                    active={sortBy}
                    direction={direction}
                    onSort={onSort}
                    align="right"
                  >
                    Average
                  </SortHeader>
                  <SortHeader
                    column="cumulative"
                    active={sortBy}
                    direction={direction}
                    onSort={onSort}
                    align="right"
                  >
                    Compounded
                  </SortHeader>
                  <SortHeader
                    column="wins"
                    active={sortBy}
                    direction={direction}
                    onSort={onSort}
                    align="right"
                  >
                    Wins
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
                        <td className={`rank${ranked && position <= 3 ? ` r${position}` : ""}`}>
                          {position}
                        </td>
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
      </Reveal>

      {season.length > 0 && settledCount > 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>
          Form shows the last {Math.min(6, settledCount)} settled months, most recent on the right.
          Hover a bar for the figure.
          {ranked ? "" : " Sorted by a column other than points, so # is a row number."}
        </p>
      ) : null}
    </>
  );
}
