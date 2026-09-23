"use client";

import { useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Instrument, Market, PickItem, PicksDoc, Round } from "@/lib/types";

type Selection = Record<string, PickItem>;

/**
 * Two ways to find a stock, and the difference is a read cost.
 *
 * **A named market** loads that market and nothing else, and the search
 * box filters what arrived. This is the cheap one, and it is why the
 * "All markets" option was taken away once: the old version subscribed
 * to the whole `instruments` collection so that its search could cover
 * everything, which was affordable at 460 documents and is not at four
 * thousand — every cold visit paid for all of them, and that is the
 * shape of the read that exhausted the daily quota once already.
 *
 * **All markets** is back, and does not do that. It loads no market at
 * all; the search term goes to the server and comes back with the
 * handful of documents that match it. So it costs a few reads per
 * search rather than the whole universe per visit, and it stays that way
 * however many markets get added.
 *
 * The one thing it cannot do is match the middle of a word. Firestore
 * has no substring search, so this is a prefix: "volvo" finds Volvo, and
 * "olvo" finds nothing. Pick the market instead when you want to browse
 * rather than search — that list is filtered in the browser and matches
 * anywhere.
 */
export function PickEditor({
  round,
  uid,
  instruments,
  markets,
  marketCode,
  onMarketChange,
  search,
  onSearchChange,
  searchTooShort,
  instrumentsLoading,
  myPicks,
  maxPicks,
}: {
  round: Round;
  uid: string;
  /** The selected market's instruments, or the search hits under All markets. */
  instruments: Instrument[];
  markets: Market[];
  /** "" means All markets. */
  marketCode: string;
  onMarketChange: (code: string) => void;
  search: string;
  onSearchChange: (term: string) => void;
  /** Under All markets, whether the term is still too short to search on. */
  searchTooShort: boolean;
  instrumentsLoading: boolean;
  myPicks: PicksDoc | null;
  maxPicks: number;
}) {
  const [selection, setSelection] = useState<Selection>(() => ({ ...(myPicks?.picks ?? {}) }));
  const [touched, setTouched] = useState(false);
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

  const allMarkets = marketCode === "";

  /**
   * Under All markets the server has already done the matching, so
   * filtering again here would only re-apply a prefix test to rows that
   * passed it. Within one market the whole list is in the browser, so
   * the filter is a substring and matches anywhere in the name.
   */
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = allMarkets
      ? pickable
      : pickable.filter((i) =>
          term ? i.symbol.toLowerCase().includes(term) || i.name.toLowerCase().includes(term) : true,
        );
    return [...matched].sort((a, b) => a.symbol.localeCompare(b.symbol)).slice(0, 40);
  }, [pickable, search, allMarkets]);

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
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={allMarkets ? "Search every market" : "Search company or ticker"}
          aria-label="Search for a stock"
          style={{ flex: "2 1 220px" }}
        />
        <select
          value={marketCode}
          onChange={(e) => onMarketChange(e.target.value)}
          aria-label="Choose a market"
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
        {instrumentsLoading ? (
          <div className="empty">{allMarkets ? "Searching…" : "Loading this market…"}</div>
        ) : allMarkets && searchTooShort ? (
          <div className="empty">
            Type a company or ticker to search every market at once. Or choose one market above to
            browse it.
          </div>
        ) : results.length === 0 ? (
          <div className="empty">
            {allMarkets ? (
              <>
                Nothing starts with that. Searching every market matches the beginning of a name or
                ticker, so try the first word — or pick the market above, where the search matches
                anywhere.
              </>
            ) : (
              <>
                No eligible stock in this market matches that. Try another market, or ask an admin
                to add it.
              </>
            )}
          </div>
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
