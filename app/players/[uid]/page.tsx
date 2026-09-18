"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLeagueBase } from "@/components/LeagueProvider";
import { Avatar, Empty, PageHead, Panel, RequirePlayer, Reveal, Value } from "@/components/ui";
import { useRoundBundles } from "@/lib/hooks";
import { buildSeason, roundPhase, scoreRound } from "@/lib/scoring";
import { displayName, monthLabel } from "@/lib/format";
import { profileDescription, type ScoredEntry } from "@/lib/types";

/**
 * One player's page, as everyone else sees it.
 *
 * The search needed somewhere to send you, and the season figures the
 * profile page already worked out were only ever visible to their owner.
 * Nothing here is private: every month listed has locked, and the rules
 * make a locked month's picks readable by any approved player. A month
 * still open is left out, because that is the seal and it applies here
 * exactly as it does on your own page.
 */
export default function PlayerPage() {
  return (
    <RequirePlayer>
      <PlayerView />
    </RequirePlayer>
  );
}

function PlayerView() {
  const params = useParams<{ uid: string }>();
  const uid = typeof params.uid === "string" ? params.uid : "";
  const { profile: me } = useAuth();
  const { profiles, profileMap, rounds, loading } = useLeagueBase();

  const player = profileMap.get(uid) ?? null;
  const isMe = me?.uid === uid;

  const pastRounds = useMemo(
    () => rounds.filter((r) => roundPhase(r) !== "open").sort((a, b) => b.id.localeCompare(a.id)),
    [rounds],
  );
  const pastIds = useMemo(() => pastRounds.map((r) => r.id), [pastRounds]);
  const { bundles, loading: bundlesLoading } = useRoundBundles(pastIds, pastIds.length > 0);

  const scored = useMemo(() => {
    const map = new Map<string, ScoredEntry[]>();
    for (const round of rounds) {
      const bundle = bundles.get(round.id);
      if (bundle) map.set(round.id, scoreRound(round, bundle.pickDocs, bundle.prices));
    }
    return map;
  }, [rounds, bundles]);

  const season = useMemo(() => {
    const rows = buildSeason(rounds, scored, profiles.map((p) => p.uid));
    return rows.find((row) => row.uid === uid) ?? null;
  }, [rounds, scored, profiles, uid]);

  const months = useMemo(() => {
    const out: { roundId: string; entry: ScoredEntry; field: number }[] = [];
    for (const round of pastRounds) {
      const entries = scored.get(round.id) ?? [];
      const entry = entries.find((e) => e.uid === uid);
      if (entry) out.push({ roundId: round.id, entry, field: entries.length });
    }
    return out;
  }, [pastRounds, scored, uid]);

  if (loading) return <Empty>Loading…</Empty>;

  if (!player) {
    return (
      <>
        <PageHead title="No such player">
          Nobody in the league has that address. They may not have been approved yet.
        </PageHead>
        <Link href="/league" className="button">
          Back to the league
        </Link>
      </>
    );
  }

  const description = profileDescription(player);

  return (
    <>
      <PageHead
        title={displayName(player)}
        action={
          isMe ? (
            <Link href="/profile" className="button small">
              Edit your profile
            </Link>
          ) : null
        }
      >
        {description || "No description yet."}
      </PageHead>

      <Reveal className="grid-2">
        <div className="stack-sm">
          <div className="panel">
            <div className="panel-body">
              <div className="row" style={{ gap: 18 }}>
                <Avatar profile={player} size="xl" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>
                    {displayName(player)}
                    {isMe ? " (you)" : ""}
                  </div>
                  <div className="secondary" style={{ fontSize: 13 }}>
                    {description || "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Panel title="Season">
            {season && season.played > 0 ? (
              <div className="stack-sm">
                <Stat label="Points" value={String(season.points)} />
                <Stat label="Monthly wins" value={String(season.wins)} />
                <Stat label="Months played" value={String(season.played)} />
                <Stat label="Average month" node={<Value value={season.average} />} />
                <Stat label="Compounded" node={<Value value={season.cumulative} />} />
              </div>
            ) : (
              <p className="hint">Nothing settled yet.</p>
            )}
          </Panel>
        </div>

        <Panel title="Month by month" flush>
          {bundlesLoading ? (
            <Empty>Loading months…</Empty>
          ) : months.length === 0 ? (
            <Empty>No locked months yet.</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="right">Return</th>
                    <th className="right">Finish</th>
                    <th>Picks</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(({ roundId, entry, field }) => (
                    <tr key={roundId}>
                      <td>
                        <Link href="/history">{monthLabel(roundId)}</Link>
                      </td>
                      <td className="right">
                        <Value value={entry.ret} />
                      </td>
                      <td className="right mono">
                        {entry.rank === null ? "—" : `${entry.rank}/${field}`}
                      </td>
                      <td>
                        <span className="secondary" style={{ fontSize: 13 }}>
                          {entry.picks.map((p) => p.symbol).join(", ") || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Reveal>
    </>
  );
}

function Stat({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="label">{label}</span>
      {node ?? <span className="value">{value}</span>}
    </div>
  );
}
