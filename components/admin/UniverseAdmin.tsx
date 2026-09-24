"use client";

import { useMemo, useState } from "react";
import { doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { instrumentId } from "@/lib/universe";
import type { Instrument, Market } from "@/lib/types";

export function UniverseAdmin({
  instruments,
  markets,
}: {
  instruments: Instrument[];
  markets: Market[];
}) {
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);

  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newMarket, setNewMarket] = useState(markets[0]?.code ?? "");

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return instruments
      .filter((i) => (marketFilter ? i.marketCode === marketFilter : true))
      .filter((i) =>
        term ? i.symbol.toLowerCase().includes(term) || i.name.toLowerCase().includes(term) : true,
      )
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .slice(0, 60);
  }, [instruments, search, marketFilter]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of instruments) {
      if (!i.eligible) continue;
      map.set(i.marketCode, (map.get(i.marketCode) ?? 0) + 1);
    }
    return map;
  }, [instruments]);

  async function toggleEligible(instrument: Instrument) {
    setMessage(null);
    try {
      await updateDoc(doc(firestore(), "instruments", instrument.id), {
        eligible: !instrument.eligible,
      });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Could not update." });
    }
  }

  async function toggleMarket(market: Market) {
    setBusy(true);
    setMessage(null);
    try {
      const enabling = !market.isEnabled;
      await updateDoc(doc(firestore(), "markets", market.code), { isEnabled: enabling });

      // Eligibility is what the security rules actually check, so closing a
      // market has to reach its instruments too, not just the filter list.
      const affected = instruments.filter((i) => i.marketCode === market.code);
      for (let start = 0; start < affected.length; start += 400) {
        const batch = writeBatch(firestore());
        for (const instrument of affected.slice(start, start + 400)) {
          batch.update(doc(firestore(), "instruments", instrument.id), { eligible: enabling });
        }
        await batch.commit();
      }

      setMessage({
        kind: "good",
        text: `${market.name} ${enabling ? "opened" : "closed"} (${affected.length} instruments).`,
      });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Could not update." });
    } finally {
      setBusy(false);
    }
  }

  async function addInstrument(event: React.FormEvent) {
    event.preventDefault();
    const symbol = newSymbol.trim().toUpperCase();
    const name = newName.trim();
    if (!symbol || !name || !newMarket) return;

    setBusy(true);
    setMessage(null);
    try {
      const market = markets.find((m) => m.code === newMarket);
      const id = instrumentId(newMarket, symbol);
      await setDoc(doc(firestore(), "instruments", id), {
        symbol,
        name,
        // Kept in step with scripts/seed.ts: the picker's "All markets"
        // search matches on this, so a name added here that skipped it
        // would be findable by ticker and invisible by name.
        nameLower: name.toLowerCase(),
        marketCode: newMarket,
        currency: market?.currency ?? "SEK",
        eligible: true,
        marketCapMusd: null,
        tags: [],
      });
      setNewSymbol("");
      setNewName("");
      setMessage({ kind: "good", text: `${symbol} added to ${market?.name ?? newMarket}.` });
    } catch (error) {
      setMessage({ kind: "bad", text: error instanceof Error ? error.message : "Could not add it." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header>
        <h2>Pickable universe</h2>
        <span className="grow" />
        <span className="hint">
          {instruments.filter((i) => i.eligible).length} eligible
        </span>
      </header>

      <div className="panel-body">
        <p className="hint" style={{ marginBottom: 12 }}>
          Eligibility is enforced when picks are saved, not just in the picker. Closing a market
          also marks its instruments ineligible.
        </p>

        <div className="row" style={{ gap: 6, marginBottom: 18 }}>
          {markets.map((market) => (
            <button
              key={market.code}
              type="button"
              className="small"
              disabled={busy}
              onClick={() => void toggleMarket(market)}
              title={`${counts.get(market.code) ?? 0} eligible · click to ${market.isEnabled ? "close" : "open"}`}
              style={{
                borderColor: market.isEnabled ? "var(--accent)" : "var(--line-strong)",
                background: market.isEnabled ? "var(--accent-soft)" : "var(--surface-sunk)",
                color: market.isEnabled ? "var(--accent)" : "var(--ink-3)",
                fontWeight: 500,
              }}
            >
              {market.name}
              <span className="mono" style={{ marginLeft: 6, fontSize: 11 }}>
                {counts.get(market.code) ?? 0}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={addInstrument} className="row" style={{ marginBottom: 18, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 120px" }} htmlFor="newSymbol">
            <span>Ticker</span>
            <input
              id="newSymbol"
              className="mono"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              placeholder="ERIC B"
            />
          </label>
          <label className="field" style={{ flex: "2 1 200px" }} htmlFor="newName">
            <span>Company</span>
            <input
              id="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ericsson B"
            />
          </label>
          <label className="field" style={{ flex: "1 1 180px" }} htmlFor="newMarket">
            <span>Market</span>
            <select id="newMarket" value={newMarket} onChange={(e) => setNewMarket(e.target.value)}>
              {markets.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>

        <div className="row" style={{ marginBottom: 12 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the universe"
            aria-label="Search instruments"
            style={{ flex: "2 1 200px" }}
          />
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            aria-label="Filter by market"
            style={{ flex: "1 1 180px" }}
          >
            <option value="">All markets</option>
            {markets.map((m) => (
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
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {results.length === 0 ? (
            <div className="empty">Nothing matches.</div>
          ) : (
            results.map((instrument) => (
              <div
                key={instrument.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className="row" style={{ gap: 10, minWidth: 0 }}>
                  <strong className="mono" style={{ minWidth: "8ch", fontSize: 13 }}>
                    {instrument.symbol}
                  </strong>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {instrument.name}
                  </span>
                </span>
                <button
                  type="button"
                  className="small quiet"
                  onClick={() => void toggleEligible(instrument)}
                  style={{ color: instrument.eligible ? "var(--up)" : "var(--ink-3)" }}
                >
                  {instrument.eligible ? "Eligible" : "Blocked"}
                </button>
              </div>
            ))
          )}
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
