"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Approvals } from "@/components/admin/Approvals";
import { PriceGrid } from "@/components/admin/PriceGrid";
import { RoundAdmin } from "@/components/admin/RoundAdmin";
import { UniverseAdmin } from "@/components/admin/UniverseAdmin";
import { Empty, PageHead, RequirePlayer } from "@/components/ui";
import { useContacts, useLeagueBase, useRoundPicks, useRoundPrices } from "@/lib/hooks";

export default function AdminPage() {
  return (
    <RequirePlayer admin>
      <AdminPanels />
    </RequirePlayer>
  );
}

function AdminPanels() {
  const { profile } = useAuth();
  const { profiles, rounds, instruments, instrumentMap, markets, loading } = useLeagueBase(true);
  // Only this page reads contacts/. The rules refuse the listing to
  // anyone who is not an admin, and RequirePlayer has already redirected
  // them by the time this runs.
  const { emails } = useContacts(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  if (loading) return <Empty>Loading the admin panel…</Empty>;

  return (
    <>
      <PageHead title="Admin">
        Approve players, run the month, and keep the weekly prices up to date.
      </PageHead>

      <div className="stack">
        <Approvals profiles={profiles} emails={emails} meUid={profile?.uid ?? ""} />

        <RoundAdmin rounds={rounds} selectedId={selectedId} onSelect={setSelectedId} />

        {round ? (
          <PriceGrid
            round={round}
            pickDocs={pickDocs}
            instruments={instruments}
            instrumentMap={instrumentMap}
            prices={prices}
          />
        ) : null}

        <UniverseAdmin instruments={instruments} markets={markets} />
      </div>

    </>
  );
}
