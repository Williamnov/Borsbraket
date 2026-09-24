"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PickEditor } from "@/components/PickEditor";
import {
  Countdown,
  Empty,
  PageHead,
  Panel,
  PlayerCell,
  RequirePlayer,
  Reveal,
  SortHeader,
  StatusPill,
  Value,
  WeekBars,
  useColumnSort,
} from "@/components/ui";
import {
  useInstrumentSearch,
  useMarketInstruments,
  useMyPicks,
  useRoundPicks,
  useRoundPrices,
  useSubmissions,
} from "@/lib/hooks";
import { useLeagueBase } from "@/components/LeagueProvider";
import { instrumentReturn, roundPhase, scoreRound, sortEntries, weeklyPath, type EntrySort } from "@/lib/scoring";
import { displayName, formatDate, formatPercent, monthLabel } from "@/lib/format";
import { toDate, type ScoredEntry } from "@/lib/types";

/** Columns whose first click should read small-to-large. */
const ASC_FIRST: readonly EntrySort[] = ["rank", "player"];

/**
 * What a player won this month, under their name.
 *
 * Three awards can stack, so the points column alone does not say what
 * happened — 17 and 12 and 5 are all different stories. Nothing is
 * drawn for a month that has not been settled, because nothing has been
 * awarded yet; the flags are still computed so the running table can
 * show who is on course, which is what the "leading" tone is for.
 */
function AwardChips({ entry }: { entry: ScoredEntry }) {
  const { bestPortfolio, bestStock, positive } = entry.awards;
  if (!bestPortfolio && !bestStock && !positive) return null;

  return (
    <span className="awards">
      {bestPortfolio ? <span className="award best">Best portfolio</span> : null}
      {bestStock ? <span className="award stock">Best stock · {entry.bestStockSymbol}</span> : null}
      {positive ? <span className="award up">Up</span> : null}
    </span>
  );
}

export default function MonthPage() {
  return (
    <RequirePlayer>
      <MonthView />
    </RequirePlayer>
  );
}

function MonthView() {
  const { profile } = useAuth();
  // Markets come with the shared base now: a few dozen documents, and
  // the page needs them to offer a choice before it knows which
  // instruments to load. The instruments themselves arrive one market at
  // a time — see useMarketInstruments.
  const { profiles, profileMap, rounds, settings, markets, loading } = useLeagueBase();

  const enabledMarkets = useMemo(() => markets.filter((m) => m.isEnabled), [markets]);

  /**
   * "" is All markets, and is the default.
   *
   * Which means the page has two ways of finding instruments and picks
   * between them here rather than in the picker. A named market loads
   * that market and the search filters what arrived; All markets loads
   * nothing and asks the server for the few documents matching what has
   * been typed. Either way PickEditor is handed a list and a loading
   * flag and does not need to know which.
   */
  const [marketCode, setMarketCode] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!marketCode) return;
    if (enabledMarkets.some((m) => m.code === marketCode)) return;
    setMarketCode("");
  }, [enabledMarkets, marketCode]);

  const allMarkets = marketCode === "";

  const { instruments: marketInstruments, loading: marketLoading } =
    useMarketInstruments(allMarkets ? null : marketCode);
  const {
    instruments: searchHits,
    loading: searchLoading,
    tooShort,
  } = useInstrumentSearch(search, allMarkets);

  const pickerInstruments = allMarkets ? searchHits : marketInstruments;
  const instrumentsLoading = allMarkets ? searchLoading : marketLoading;

  const round = useMemo(() => {
    const unsettled = rounds.filter((r) => r.status !== "settled");
    return unsettled.length ? unsettled[unsettled.length - 1] : (rounds[rounds.length - 1] ?? null);
  }, [rounds]);

  const phase = round ? roundPhase(round) : null;
  const locked = phase !== "open";
  const locksAt = round ? toDate(round.locksAt) : null;

  const { myPicks } = useMyPicks(round?.id ?? null, profile?.uid ?? null);
  const { pickDocs } = useRoundPicks(round?.id ?? null, locked);
  const { prices } = useRoundPrices(round?.id ?? null);
  const { submissions } = useSubmissions(round?.id ?? null);

  const entries = useMemo(
    () => (round && locked ? scoreRound(round, pickDocs, prices) : []),
    [round, locked, pickDocs, prices],
  );


  const { sortBy, direction, onSort } = useColumnSort<EntrySort>("rank", ASC_FIRST);

  const standings = useMemo(
    () => sortEntries(entries, sortBy, direction, (uid) => displayName(profileMap.get(uid) ?? null)),
    [entries, sortBy, direction, profileMap],
  );

  // Only the shared base is waited on. The selected market's instruments
  // load behind their own flag, so choosing a market with three hundred
  // names in it does not blank the whole page while they arrive.
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
            {/* Owns its own ticking state, so the clock does not
                re-render the picker and both tables once a second. */}
            <Countdown target={phase === "open" ? locksAt : null} />
          </span>
        }
      >
        {/* What to do, rather than what the dates are. Somebody opening
            this page in an open month wants to know they have something
            to do and by when; the measurement window is detail, and it
            goes second. */}
        {phase === "open"
          ? `Choose up to ${maxPicks} stocks before ${formatDate(locksAt?.toISOString())}. Nobody else can see your picks until then, and you can change them as often as you like. Scored from ${round.startsOn} to ${round.endsOn}.`
          : phase === "live"
            ? `Picks are locked and everyone's are now visible. Prices are checked once a week, so the table moves weekly rather than tick by tick. Scored from ${round.startsOn} to ${round.endsOn}.`
            : `Settled. Final returns and points below, measured ${round.startsOn} to ${round.endsOn}.`}
      </PageHead>

      <Reveal className="grid-2">
        <Panel title="Your picks">
          {phase === "open" && profile ? (
            <PickEditor
              round={round}
              uid={profile.uid}
              instruments={pickerInstruments}
              markets={markets}
              marketCode={marketCode}
              onMarketChange={setMarketCode}
              search={search}
              onSearchChange={setSearch}
              searchTooShort={tooShort}
              instrumentsLoading={instrumentsLoading}
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

        <Panel title={phase === "open" ? "Who has picked" : "Everyone's picks"}>
          {phase === "open" ? (
            <div className="stack-sm">
              <p className="hint">
                Sealed until the lock — you can see who has submitted, not what they chose.
              </p>
              {profiles.map((p) => {
                const count = submissions.get(p.uid);
                return (
                  <div key={p.uid} className="row" style={{ justifyContent: "space-between" }}>
                    <PlayerCell profile={p} you={p.uid === profile?.uid} />
                    {/* A pill rather than grey text: at a glance this
                        column should read as a list of who is ready. */}
                    <span className={count ? "pill open" : "pill settled"}>
                      {count ? `${count} picked` : "Waiting"}
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
          <h2>This month&rsquo;s table</h2>
        </header>
        <div className="panel-body flush table-scroll">
          {phase === "open" ? (
            <Empty>The table appears when picks lock, and moves once a week after that.</Empty>
          ) : entries.length === 0 ? (
            <Empty>Nobody submitted picks this month, so there is nothing to rank.</Empty>
          ) : (
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
                  <th>Weeks</th>
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
                {standings.map((entry) => {
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
                        {/* What the points in the last column are for.
                            A bare "17" is a number you have to go and
                            work out from the rules page. */}
                        <AwardChips entry={entry} />
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
