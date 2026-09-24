"use client";

import { useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { Empty, Value } from "@/components/ui";
import { checkpointDueDates, instrumentReturn } from "@/lib/scoring";
import type { Instrument, PicksDoc, PriceDoc, Round } from "@/lib/types";

const WEEK_LABELS = ["Baseline", "Week 1", "Week 2", "Week 3", "Week 4"];
const WEEK_FIELDS = ["w0", "w1", "w2", "w3", "w4"] as const;

/**
 * The date each column is meant to hold, read from the same function the
 * cron uses.
 *
 * This is the other half of making the two entry paths agree. The
 * baseline is the price at the lock and the weeks run from there, which
 * is not something you can guess from a column headed "Open" — and
 * guessing wrong by a few days moves every return that month.
 */
function dueLabels(round: Round): (string | null)[] {
  const due = checkpointDueDates(round);
  if (!due) return WEEK_FIELDS.map(() => null);
  return due.map((d) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  );
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function PriceGrid({
  round,
  pickDocs,
  instruments,
  instrumentMap,
  prices,
}: {
  round: Round;
  pickDocs: PicksDoc[];
  instruments: Instrument[];
  instrumentMap: Map<string, Instrument>;
  prices: Map<string, PriceDoc>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [bulkWeek, setBulkWeek] = useState(1);
  const due = useMemo(() => dueLabels(round), [round]);
  const [bulkText, setBulkText] = useState("");

  /** Everything picked this month. */
  const rows = useMemo(() => {
    const ids = new Set<string>();
    for (const doc of pickDocs) for (const id of Object.keys(doc.picks ?? {})) ids.add(id);
    for (const id of prices.keys()) ids.add(id);

    const pickedBy = new Map<string, number>();
    for (const doc of pickDocs) {
      for (const id of Object.keys(doc.picks ?? {})) {
        pickedBy.set(id, (pickedBy.get(id) ?? 0) + 1);
      }
    }

    return [...ids]
      .map((id) => {
        const instrument = instrumentMap.get(id);
        const fallbackSymbol =
          pickDocs.flatMap((d) => Object.entries(d.picks ?? {})).find(([key]) => key === id)?.[1]
            ?.symbol ?? id;
        return {
          id,
          symbol: instrument?.symbol ?? fallbackSymbol,
          name: instrument?.name ?? "",
          currency: instrument?.currency ?? "",
          holders: pickedBy.get(id) ?? 0,
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [pickDocs, prices, instrumentMap]);

  async function savePrice(instrumentId: string, symbol: string, currency: string, week: number, raw: string) {
    const value = raw.trim() === "" ? null : parseNumber(raw);
    if (raw.trim() !== "" && value === null) {
      setMessage({ kind: "bad", text: `Could not read the price "${raw}".` });
      return;
    }
    setMessage(null);
    try {
      await setDoc(
        doc(firestore(), "rounds", round.id, "prices", instrumentId),
        {
          instrumentId,
          symbol,
          currency,
          [WEEK_FIELDS[week]]: value,
          source: "manual",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      setMessage({
        kind: "bad",
        text: error instanceof Error ? error.message : "Could not save that price.",
      });
    }
  }

  async function applyBulk() {
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const bySymbol = new Map<string, { id: string; currency: string }>();
    for (const row of rows) bySymbol.set(row.symbol.toUpperCase(), { id: row.id, currency: row.currency });

    setBusy(true);
    setMessage(null);
    try {
      const batch = writeBatch(firestore());
      let written = 0;
      const skipped: string[] = [];

      for (const line of lines) {
        let tokens = line.split(/[\t;]+/).map((t) => t.trim()).filter(Boolean);
        if (tokens.length < 2) tokens = line.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) {
          skipped.push(line);
          continue;
        }
        const value = parseNumber(tokens[tokens.length - 1]);
        const symbol = tokens.slice(0, -1).join(" ").toUpperCase();
        const target = bySymbol.get(symbol);
        if (!target || value === null) {
          skipped.push(line);
          continue;
        }
        batch.set(
          doc(firestore(), "rounds", round.id, "prices", target.id),
          {
            instrumentId: target.id,
            symbol,
            currency: target.currency,
            [WEEK_FIELDS[bulkWeek]]: value,
            source: "manual",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        written += 1;
      }

      if (written === 0) {
        setMessage({ kind: "bad", text: "No line matched a ticker in this round." });
        return;
      }

      await batch.commit();
      setBulkText("");
      setMessage({
        kind: "good",
        text: `${written} ${written === 1 ? "price" : "prices"} saved to ${WEEK_LABELS[bulkWeek]}${
          skipped.length ? ` · ${skipped.length} line(s) skipped` : ""
        }.`,
      });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Bulk save failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header>
        <h2>Weekly prices</h2>
        <span className="grow" />
        <button
          type="button"
          className="quiet small"
          onClick={() => {
            const list = rows.map((r) => r.symbol).join("\n");
            // The optional chain short-circuits the .catch() with it, so
            // a browser with no clipboard API — an insecure origin is
            // enough — used to make this button do nothing at all rather
            // than fall back. Putting the list in the box is the
            // fallback; it is selectable, which is all the button was
            // ever for.
            const copied = navigator.clipboard?.writeText(list);
            if (copied) copied.catch(() => setBulkText(list));
            else setBulkText(list);
          }}
        >
          Copy tickers
        </button>
      </header>

      <div className="panel-body flush table-scroll">
        {rows.length === 0 ? (
          <Empty>Tickers appear here as soon as someone submits picks.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                {WEEK_LABELS.map((label, week) => (
                  <th key={label}>
                    {label}
                    {due[week] ? (
                      <span className="hint" style={{ display: "block", fontWeight: 400 }}>
                        {due[week]}
                      </span>
                    ) : null}
                  </th>
                ))}
                <th className="right">Return</th>
                <th className="center">Held by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const price = prices.get(row.id);
                const { ret } = instrumentReturn(price);
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="ticker" title={row.name}>
                        <strong>{row.symbol}</strong>
                      </span>
                    </td>
                    {WEEK_FIELDS.map((field, week) => (
                      <td key={field}>
                        <input
                          className="mono"
                          inputMode="decimal"
                          defaultValue={price?.[field] ?? ""}
                          aria-label={`${WEEK_LABELS[week]} price for ${row.symbol}`}
                          style={{ maxWidth: 104, padding: "6px 8px" }}
                          onBlur={(e) =>
                            void savePrice(row.id, row.symbol, row.currency, week, e.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td className="right">
                      <Value value={ret} precise />
                    </td>
                    <td className="center mono">{row.holders}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel-body" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="row" style={{ gap: 8 }}>
            <span className="label">Paste into</span>
            <select
              value={bulkWeek}
              onChange={(e) => setBulkWeek(Number(e.target.value))}
              style={{ width: "auto" }}
            >
              {WEEK_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                  {due[index] ? ` · ${due[index]}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          className="mono"
          rows={4}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"ERIC B  98.10\nNOVO B;455\nAAPL 231.4"}
          aria-label="Paste prices"
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" onClick={() => void applyBulk()} disabled={busy}>
            {busy ? "Saving…" : "Load prices"}
          </button>
          <span className="hint">
            One line per ticker: <code>ticker price</code>. Tab, semicolon or spaces all work.
          </span>
        </div>

        {message ? (
          <div className={`notice ${message.kind}`} style={{ marginTop: 14 }}>
            {message.text}
          </div>
        ) : null}
      </div>
    </section>
  );
}
