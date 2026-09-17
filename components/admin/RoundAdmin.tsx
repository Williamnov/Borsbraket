"use client";

import { useEffect, useState } from "react";
import { Timestamp, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { defaultRoundShape, roundPhase } from "@/lib/scoring";
import { monthLabel, nextRoundId, roundId as makeRoundId } from "@/lib/format";
import { toDate, type Round } from "@/lib/types";

function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RoundAdmin({
  rounds,
  selectedId,
  onSelect,
}: {
  rounds: Round[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const round = rounds.find((r) => r.id === selectedId) ?? null;

  const [locksAt, setLocksAt] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [picksPerRound, setPicksPerRound] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [confirmSettle, setConfirmSettle] = useState(false);

  useEffect(() => {
    if (!round) return;
    setLocksAt(toLocalInput(toDate(round.locksAt)));
    setStartsOn(round.startsOn ?? "");
    setEndsOn(round.endsOn ?? "");
    setPicksPerRound(round.picksPerRound ?? 5);
    setConfirmSettle(false);
    setMessage(null);
  }, [round?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRound() {
    if (!round) return;
    setBusy(true);
    setMessage(null);
    try {
      const locks = new Date(locksAt);
      if (Number.isNaN(locks.getTime())) throw new Error("The lock time is not a valid date.");
      await updateDoc(doc(firestore(), "rounds", round.id), {
        locksAt: Timestamp.fromDate(locks),
        startsOn,
        endsOn,
        picksPerRound: Math.min(5, Math.max(1, picksPerRound)),
      });
      setMessage({ kind: "good", text: "Round saved." });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleSettled() {
    if (!round) return;
    const settling = round.status !== "settled";
    if (settling && !confirmSettle) {
      setConfirmSettle(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateDoc(doc(firestore(), "rounds", round.id), {
        status: settling ? "settled" : "live",
        settledAt: settling ? serverTimestamp() : null,
      });
      setConfirmSettle(false);
      setMessage({
        kind: "good",
        text: settling ? `${monthLabel(round.id)} settled — points awarded.` : "Round reopened.",
      });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Could not update." });
    } finally {
      setBusy(false);
    }
  }

  async function openNextMonth() {
    setBusy(true);
    setMessage(null);
    try {
      const last = rounds[rounds.length - 1];
      const now = new Date();
      const id = last ? nextRoundId(last.id) : makeRoundId(now.getFullYear(), now.getMonth() + 1);
      if (rounds.some((r) => r.id === id)) throw new Error(`${monthLabel(id)} already exists.`);

      const [year, month] = id.split("-").map(Number);
      const shape = defaultRoundShape(year, month);

      await setDoc(doc(firestore(), "rounds", id), {
        id,
        year,
        month,
        opensAt: Timestamp.fromDate(shape.opensAt),
        locksAt: Timestamp.fromDate(shape.locksAt),
        startsOn: shape.startsOn,
        endsOn: shape.endsOn,
        picksPerRound: last?.picksPerRound ?? 5,
        status: "open",
        settledAt: null,
      });
      onSelect(id);
      setMessage({ kind: "good", text: `${monthLabel(id)} is open for picks.` });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Could not open a round." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header>
        <h2>Rounds</h2>
        <span className="grow" />
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          style={{ width: "auto" }}
          aria-label="Select a round"
        >
          {rounds.length === 0 ? <option value="">No rounds yet</option> : null}
          {[...rounds].reverse().map((r) => (
            <option key={r.id} value={r.id}>
              {monthLabel(r.id)}
              {r.status === "settled" ? " · settled" : ""}
            </option>
          ))}
        </select>
      </header>

      <div className="panel-body">
        {round ? (
          <>
            <div className="row" style={{ marginBottom: 16 }}>
              <span className={`pill ${roundPhase(round)}`}>{roundPhase(round)}</span>
              <span className="hint">
                Prices are recorded once a week, four times a month, from the opening price.
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              }}
            >
              <label className="field" htmlFor="locksAt">
                <span>Picks close</span>
                <input
                  id="locksAt"
                  type="datetime-local"
                  className="mono"
                  value={locksAt}
                  onChange={(e) => setLocksAt(e.target.value)}
                />
              </label>
              <label className="field" htmlFor="startsOn">
                <span>First day</span>
                <input
                  id="startsOn"
                  type="date"
                  className="mono"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </label>
              <label className="field" htmlFor="endsOn">
                <span>Last day</span>
                <input
                  id="endsOn"
                  type="date"
                  className="mono"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </label>
              <label className="field" htmlFor="picksPerRound">
                <span>Picks allowed</span>
                <input
                  id="picksPerRound"
                  type="number"
                  min={1}
                  max={5}
                  className="mono"
                  value={picksPerRound}
                  onChange={(e) => setPicksPerRound(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => void saveRound()} disabled={busy}>
                Save round
              </button>
              <button
                type="button"
                className={confirmSettle ? "danger" : "primary"}
                onClick={() => void toggleSettled()}
                disabled={busy}
              >
                {round.status === "settled"
                  ? "Reopen round"
                  : confirmSettle
                    ? "Click again to settle"
                    : "Settle month"}
              </button>
              <button type="button" onClick={() => void openNextMonth()} disabled={busy}>
                Open next month
              </button>
            </div>
          </>
        ) : (
          <div className="stack-sm">
            <p className="hint">No rounds exist yet.</p>
            <div>
              <button type="button" className="primary" onClick={() => void openNextMonth()} disabled={busy}>
                Open the first month
              </button>
            </div>
          </div>
        )}

        {message ? (
          <div className={`notice ${message.kind}`} style={{ marginTop: 16 }}>
            {message.text}
          </div>
        ) : null}
      </div>
    </section>
  );
}
