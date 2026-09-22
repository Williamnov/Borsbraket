"use client";

import { Empty } from "@/components/ui";
import { usePriceRuns } from "@/lib/hooks";
import { monthLabel, timeAgo } from "@/lib/format";
import { toDate } from "@/lib/types";

/**
 * What the price job has been doing.
 *
 * The cron has written one of these rows per run since it was built and
 * nothing ever read them, so the claim that a missed week is visible was
 * only true to somebody with the Firebase console open. A job whose
 * failure mode is silence needs its silence to show up somewhere a
 * person actually looks, and this is that place.
 *
 * Read the gap between `written` and what the run wanted. A row saying
 * it wrote nothing is the same shape as a row that had nothing to do, so
 * both are spelled out rather than left to a number.
 */
export function PriceRuns() {
  const { runs, loading } = usePriceRuns(true);

  return (
    <section className="panel">
      <header>
        <h2>Price runs</h2>
        <span className="grow" />
        {runs.some((r) => r.note || (r.awaiting ?? 0) > 0) ? (
          <span className="pill warn">needs a look</span>
        ) : null}
      </header>

      <div className="panel-body flush">
        {loading ? (
          <Empty>Loading the price log…</Empty>
        ) : runs.length === 0 ? (
          <div style={{ padding: "14px 18px" }} className="hint">
            The price job has not recorded a run yet. That is expected until a month is inside its
            pricing window — it starts at the lock, not at the first of the month.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Month</th>
                  <th>Checkpoint</th>
                  <th>Source</th>
                  <th className="right">Written</th>
                  <th className="right">Awaiting</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const when = toDate(run.createdAt);
                  // These rows are cast out of Firestore rather than
                  // validated, and a row written by an older build has
                  // whatever shape that build gave it. The admin panel
                  // going blank over a missing array would be a poor
                  // trade for a log line.
                  const gaps = run.gaps ?? [];
                  const gapCount = run.gapCount ?? gaps.length;
                  const awaiting = run.awaiting ?? 0;
                  const wrong = Boolean(run.note) || awaiting > 0;
                  return (
                    <tr key={run.id}>
                      <td className="hint" title={when ? when.toISOString() : undefined}>
                        {when ? timeAgo(when) : "—"}
                      </td>
                      <td>{monthLabel(run.roundId)}</td>
                      <td>
                        <span className="pill">
                          {run.field}
                          {run.checkpoint === 0 ? " · baseline" : ""}
                        </span>
                      </td>
                      <td className="hint">{run.source}</td>
                      <td className="right">
                        <span className="value">{run.written ?? 0}</span>
                      </td>
                      <td className="right">
                        <span className={awaiting > 0 ? "value down" : "hint"}>{awaiting}</span>
                      </td>
                      <td className="hint">
                        {run.note ? (
                          run.note
                        ) : gapCount > 0 ? (
                          <>
                            {gapCount} earlier gap{gapCount === 1 ? "" : "s"}
                            {gaps.length > 0 ? ` — ${gaps.slice(0, 4).join(", ")}` : ""}
                          </>
                        ) : wrong ? (
                          "some instruments were not priced"
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
