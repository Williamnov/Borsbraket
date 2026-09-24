"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Approvals } from "@/components/admin/Approvals";
import { PriceGrid } from "@/components/admin/PriceGrid";
import { PriceRuns } from "@/components/admin/PriceRuns";
import { RoundAdmin } from "@/components/admin/RoundAdmin";
import { UniverseAdmin } from "@/components/admin/UniverseAdmin";
import { Empty, PageHead, RequirePlayer } from "@/components/ui";
import { useContacts, useRoundPicks, useRoundPrices } from "@/lib/hooks";
import { useLeagueBase, useUniverse } from "@/components/LeagueProvider";
import { monthLabel } from "@/lib/format";

export default function AdminPage() {
  return (
    <RequirePlayer admin>
      <AdminPanels />
    </RequirePlayer>
  );
}

/**
 * The four jobs an admin actually does, in the order a month needs them.
 *
 * This page was one column of five panels — approvals, the round, the
 * price grid, the run log, the universe — all open at once, several
 * thousand pixels of it, with no indication of which one you wanted.
 * They are unrelated tasks that happen to require the same permission,
 * so they are separated rather than stacked, and each one says what it
 * is for.
 */
const TABS = [
  {
    id: "players",
    label: "Players",
    blurb: "Let people into the league, or turn them away.",
  },
  {
    id: "month",
    label: "The month",
    blurb: "Open a month, lock it when picks close, settle it when it ends.",
  },
  {
    id: "prices",
    label: "Prices",
    blurb: "The weekly checkpoints, and whether the job that fills them ran.",
  },
  {
    id: "universe",
    label: "What can be picked",
    blurb: "Which markets are open and which instruments are eligible.",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

function AdminPanels() {
  const { profile } = useAuth();
  const { profiles, rounds, loading } = useLeagueBase();
  // Asking for the universe is what starts those listeners; the admin
  // panel is one of the few pages that genuinely needs the ticker list.
  const { instruments, instrumentMap, markets, loading: universeLoading } = useUniverse();
  // Only this page reads contacts/. The rules refuse the listing to
  // anyone who is not an admin, and RequirePlayer has already redirected
  // them by the time this runs.
  const { emails } = useContacts(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("players");

  useEffect(() => {
    if (selectedId && rounds.some((r) => r.id === selectedId)) return;
    const unsettled = rounds.filter((r) => r.status !== "settled");
    const fallback = unsettled.length ? unsettled[unsettled.length - 1] : rounds[rounds.length - 1];
    setSelectedId(fallback?.id ?? null);
  }, [rounds, selectedId]);

  // Admins may list picks at any point in the month; the rules allow it
  // explicitly so prices can be prepared before the lock.
  const { pickDocs } = useRoundPicks(selectedId, true);
  const { prices } = useRoundPrices(selectedId);

  const round = rounds.find((r) => r.id === selectedId) ?? null;

  // How many accounts are sitting in the waiting room. Worth a number on
  // the tab: it is the one thing here that somebody else is waiting on.
  const pending = profiles.filter((p) => p.status === "pending").length;

  if (loading || universeLoading) return <Empty>Loading the admin panel…</Empty>;

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <PageHead title="Admin">{current.blurb}</PageHead>

      <div className="segmented" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "players" && pending > 0 ? (
              <span className="segmented-count">{pending}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 20 }}>
        {tab === "players" ? (
          <Approvals profiles={profiles} emails={emails} meUid={profile?.uid ?? ""} />
        ) : null}

        {tab === "month" ? (
          <RoundAdmin rounds={rounds} selectedId={selectedId} onSelect={setSelectedId} />
        ) : null}

        {tab === "prices" ? (
          <>
            {/* The grid is per round, so the month it belongs to has to
                be choosable here — otherwise setting a price means
                switching tabs to find out which month you are setting it
                for, and switching back. The full round editor stays on
                its own tab; this is the selector out of it. */}
            <label className="row" style={{ gap: 10 }}>
              <span className="label">Month</span>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{ width: "auto" }}
              >
                {rounds.length === 0 ? <option value="">No months yet</option> : null}
                {[...rounds].reverse().map((r) => (
                  <option key={r.id} value={r.id}>
                    {monthLabel(r.id)}
                    {r.status === "settled" ? " · settled" : ""}
                  </option>
                ))}
              </select>
            </label>
            {round ? (
              <PriceGrid
                round={round}
                pickDocs={pickDocs}
                instruments={instruments}
                instrumentMap={instrumentMap}
                prices={prices}
              />
            ) : (
              <Empty>No month to price yet. Open one under “The month”.</Empty>
            )}
            <PriceRuns />
          </>
        ) : null}

        {tab === "universe" ? <UniverseAdmin instruments={instruments} markets={markets} /> : null}
      </div>
    </>
  );
}
