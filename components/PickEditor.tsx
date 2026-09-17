"use client";

import { useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Instrument, Market, PickItem, PicksDoc, Round } from "@/lib/types";

type Selection = Record<string, PickItem>;

export function PickEditor({
  round,
  uid,
  instruments,
  markets,
  myPicks,
  maxPicks,
}: {
  round: Round;
  uid: string;
  instruments: Instrument[];
  markets: Market[];
  myPicks: PicksDoc | null;
  maxPicks: number;
}) {
  const [selection, setSelection] = useState<Selection>(() => ({ ...(myPicks?.picks ?? {}) }));
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);

  const marketName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of markets) map.set(m.code, m.name);
    return map;
  }, [markets]);

  const enabledMarkets = useMemo(() => new Set(markets.filter((m) => m.isEnabled).map((m) => m.code)), [markets]);

  const pickable = useMemo(
    () => instruments.filter((i) => i.eligible && !i.isBenchmark && enabledMarkets.has(i.marketCode)),
    [instruments, enabledMarkets],
  );

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pickable
      .filter((i) => (marketFilter ? i.marketCode === marketFilter : true))
      .filter((i) =>
        term ? i.symbol.toLowerCase().includes(term) || i.name.toLowerCase().includes(term) : true,
      )
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .slice(0, 40);
  }, [pickable, search, marketFilter]);

  const chosen = Object.entries(selection).sort((a, b) => a[1].slot - b[1].slot);
  const full = chosen.length >= maxPicks;

  function toggle(instrument: Instrument) {
    setTouched(true);
    setMessage(null);
    setSelection((current) => {
      const next = { ...current };
      if (next[instrument.id]) {
        delete next[instrument.id];
      } else {
        if (Object.keys(next).length >= maxPicks) return current;
        const usedSlots = new Set(Object.values(next).map((p) => p.slot));
        let slot = 1;
        while (usedSlots.has(slot)) slot += 1;
        next[instrument.id] = {
          symbol: instrument.symbol,
          name: instrument.name,
          marketCode: instrument.marketCode,
          slot,
        };
      }
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const db = firestore();
      const count = Object.keys(selection).length;

      if (count === 0) {
        await deleteDoc(doc(db, "rounds", round.id, "picks", uid));
        await deleteDoc(doc(db, "rounds", round.id, "submissions", uid)).catch(() => {});
        setTouched(false);
        setMessage({ kind: "good", text: "Picks cleared." });
        return;
      }

      const batch = writeBatch(db);
      batch.set(doc(db, "rounds", round.id, "picks", uid), {
        uid,
        roundId: round.id,
        picks: selection,
        submittedAt: serverTimestamp(),
      });
      batch.set(doc(db, "rounds", round.id, "submissions", uid), {
        uid,
        count,
        submittedAt: serverTimestamp(),
      });
      await batch.commit();

      setTouched(false);
      setMessage({ kind: "good", text: `${count} ${count === 1 ? "pick" : "picks"} submitted.` });
    } catch (error) {
      setMessage({
        kind: "bad",
        text:
          error instanceof Error && error.message.includes("permission")
            ? "The database refused that — the month may have just locked, or a stock is not eligible."
            : error instanceof Error
              ? error.message
              : "Could not save your picks.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="label">
          {chosen.length} of {maxPicks} chosen
        </span>
        {touched ? <span className="hint">Unsaved changes</span> : null}
      </div>

      {chosen.length === 0 ? (
        <p className="hint">Nothing picked yet. Search below and choose up to {maxPicks}.</p>
      ) : (
        <div className="tickers">
          {chosen.map(([id, item]) => (
            <button
              key={id}
              type="button"
              className="ticker"
              onClick={() => {
                setTouched(true);
                setSelection((current) => {
                  const next = { ...current };
                  delete next[id];
                  return next;
                });
              }}
              title={`${item.name} — click to remove`}
              style={{ cursor: "pointer" }}
            >
              <strong>{item.symbol}</strong>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or ticker"
          aria-label="Search for a stock"
          style={{ flex: "2 1 220px" }}
        />
        <select
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
          aria-label="Filter by market"
          style={{ flex: "1 1 180px" }}
        >
          <option value="">All markets</option>
          {markets
            .filter((m) => m.isEnabled)
            .map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
        </select>
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-sm)",
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {results.length === 0 ? (
          <div className="empty">No eligible stock matches that. Ask an admin to add it.</div>
        ) : (
          results.map((instrument) => {
            const isChosen = Boolean(selection[instrument.id]);
            return (
              <button
                key={instrument.id}
                type="button"
                onClick={() => toggle(instrument)}
                disabled={!isChosen && full}
                style={{
                  display: "flex",
                  width: "100%",
                  gap: 10,
                  alignItems: "baseline",
                  textAlign: "left",
                  border: 0,
                  borderBottom: "1px solid var(--line)",
                  borderRadius: 0,
                  background: isChosen ? "var(--accent-soft)" : "transparent",
                  padding: "9px 12px",
                  fontWeight: 400,
                }}
              >
                <strong className="mono" style={{ minWidth: "8ch", fontSize: 13 }}>
                  {instrument.symbol}
                </strong>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {instrument.name}
                </span>
                <span className="hint">{marketName.get(instrument.marketCode) ?? instrument.marketCode}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Submit picks"}
        </button>
        <button
          type="button"
          className="quiet"
          disabled={busy || chosen.length === 0}
          onClick={() => {
            setSelection({});
            setTouched(true);
          }}
        >
          Clear
        </button>
      </div>

      {message ? <div className={`notice ${message.kind}`}>{message.text}</div> : null}
    </div>
  );
}
