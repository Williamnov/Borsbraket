"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PickEditor } from "@/components/PickEditor";
import {
  Empty,
  PageHead,
  Panel,
  PlayerCell,
  RequirePlayer,
  Reveal,
  StatusPill,
  Value,
  WeekBars,
} from "@/components/ui";
import { useCountdown, useLeagueBase, useMyPicks, useRoundPicks, useRoundPrices, useSubmissions } from "@/lib/hooks";
import { instrumentReturn, roundPhase, scoreRound, weeklyPath } from "@/lib/scoring";
import { formatDate, formatPercent, monthLabel } from "@/lib/format";
import { toDate } from "@/lib/types";

export default function MonthPage() {
  return (
    <RequirePlayer>
      <MonthView />
    </RequirePlayer>
  );
}

function MonthView() {
  const { profile } = useAuth();
  const { profiles, profileMap, rounds, instruments, markets, settings, loading } =
    useLeagueBase(true);

  const round = useMemo(() => {
    const unsettled = rounds.filter((r) => r.status !== "settled");
    return unsettled.length ? unsettled[unsettled.length - 1] : (rounds[rounds.length - 1] ?? null);
  }, [rounds]);

  const phase = round ? roundPhase(round) : null;
  const locked = phase !== "open";
  const locksAt = round ? toDate(round.locksAt) : null;
  const countdown = useCountdown(phase === "open" ? locksAt : null);

  const { myPicks } = useMyPicks(round?.id ?? null, profile?.uid ?? null);
  const { pickDocs } = useRoundPicks(round?.id ?? null, locked);
  const { prices } = useRoundPrices(round?.id ?? null);
  const { submissions } = useSubmissions(round?.id ?? null);

  const entries = useMemo(
    () => (round && locked ? scoreRound(round, pickDocs, prices) : []),
    [round, locked, pickDocs, prices],
  );

  const benchmarks = useMemo(
    () =>
      instruments
        .filter((i) => i.isBenchmark)
        .map((i) => ({ instrument: i, ...instrumentReturn(prices.get(i.id)) }))
        .filter((b) => b.ret !== null),
    [instruments, prices],
  );

  if (loading) return <Empty>Loading the month…</Empty>;
  if (!round || !phase) {
    return (
      <>
        <PageHead title="No month open">
          Nobody has opened a round yet. An admin starts one from the admin panel.
        </PageHead>
      </>
    );
  }

  const maxPicks = Math.min(round.picksPerRound ?? 5, settings.picksPerRound ?? 5, 5);

  return (
    <>
      <PageHead
        title={monthLabel(round.id)}
        action={
          <span className="row">
            <StatusPill phase={phase} />
            {phase === "open" && countdown ? (
              <span className="hint">Locks in {countdown}</span>
            ) : null}
          </span>
        }
      >
        {phase === "open"
          ? `Picks close ${formatDate(locksAt?.toISOString())}. Measured ${round.startsOn} to ${round.endsOn}.`
          : `Measured ${round.startsOn} to ${round.endsOn}, from the opening price to the latest weekly check.`}
      </PageHead>

      <Reveal className="grid-2">
        <Panel title="Your picks">
          {phase === "open" && profile ? (
            <PickEditor
              round={round}
              uid={profile.uid}
              instruments={instruments}
              markets={markets}
              myPicks={myPicks}
              maxPicks={maxPicks}
            />
          ) : myPicks && Object.keys(myPicks.picks ?? {}).length ? (
            <div className="tickers">
              {Object.entries(myPicks.picks)
                .sort((a, b) => a[1].slot - b[1].slot)
                .map(([id, item]) => {
                  const { ret } = instrumentReturn(prices.get(id));
                  return (
                    <span key={id} className="ticker" title={item.name}>
                      <strong>{item.symbol}</strong>
                      <span className={`delta ${ret === null ? "" : ret >= 0 ? "up" : "down"}`}>
                        {formatPercent(ret)}
                      </span>
                    </span>
                  );
                })}
            </div>
          ) : (
            <p className="hint">You did not submit picks for this month.</p>
          )}
        </Panel>

        <Panel title="The field">
          {phase === "open" ? (
            <div className="stack-sm">
              <p className="hint">
                Picks stay sealed until the month locks. Until then you can only see who has
                submitted, not what they chose.
              </p>
              {profiles.map((p) => {
                const count = submissions.get(p.uid);
                return (
                  <div key={p.uid} className="row" style={{ justifyContent: "space-between" }}>
                    <PlayerCell profile={p} you={p.uid === profile?.uid} />
                    <span className="hint">
                      {count ? `${count} in` : "not submitted"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : entries.length === 0 ? (
            <Empty>Nobody submitted picks this month.</Empty>
          ) : (
            <div className="stack-sm">
              {entries.map((entry) => (
                <div key={entry.uid} className="stack-sm" style={{ gap: 4 }}>
                  <PlayerCell profile={profileMap.get(entry.uid)} you={entry.uid === profile?.uid} />
                  <div className="tickers" style={{ paddingLeft: 38 }}>
                    {entry.picks.map((pick) => (
                      <span key={pick.instrumentId} className="ticker" title={pick.name}>
                        <strong>{pick.symbol}</strong>
                        <span className={`delta ${pick.ret === null ? "" : pick.ret >= 0 ? "up" : "down"}`}>
                          {formatPercent(pick.ret)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Reveal>

      <Reveal delay={80}>
      <section className="panel" style={{ marginTop: 20 }}>
        <header>
          <h2>Standings</h2>
          <span className="grow" />
          {benchmarks.map((b) => (
            <span key={b.instrument.id} className="pill">
              {b.instrument.symbol} {formatPercent(b.ret)}
            </span>
          ))}
        </header>
        <div className="panel-body flush table-scroll">
          {phase === "open" ? (
            <Empty>The standings appear when the month locks.</Empty>
          ) : entries.length === 0 ? (
            <Empty>No entries to rank.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="center">#</th>
                  <th>Player</th>
                  <th>Weeks</th>
                  <th className="right">Return</th>
                  <th className="right">Points</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const path = [1, 2, 3, 4].map((week) => {
                    const values = entry.picks.map((pick) => {
                      const p = weeklyPath(prices.get(pick.instrumentId))[week - 1];
                      return p;
                    });
                    const known = values.filter((v): v is number => v !== null);
                    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
                  });

                  return (
                    <tr key={entry.uid} className={entry.uid === profile?.uid ? "is-me" : undefined}>
                      <td className={`rank${entry.rank && entry.rank <= 3 ? ` r${entry.rank}` : ""}`}>
                        {entry.rank ?? "–"}
                      </td>
                      <td>
                        <PlayerCell
                          profile={profileMap.get(entry.uid)}
                          you={entry.uid === profile?.uid}
                        />
                      </td>
                      <td>
                        <WeekBars path={path} />
                      </td>
                      <td className="right">
                        <Value value={entry.ret} precise />
                        {entry.priced < entry.total ? (
                          <div className="hint">
                            {entry.priced}/{entry.total} priced
                          </div>
                        ) : null}
                      </td>
                      <td className="right">
                        <span className="value">{entry.points ?? "–"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      </Reveal>
    </>
  );
}
