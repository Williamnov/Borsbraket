"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type {
  ChatMessage,
  Instrument,
  LeagueSettings,
  Market,
  PicksDoc,
  PriceDoc,
  Profile,
  Round,
} from "@/lib/types";

type Loadable<T> = { data: T; loading: boolean; error: string | null };

/** Live view of a whole collection, keyed by document id. */
function useCollection<T>(path: string, enabled: boolean): Loadable<(T & { id: string })[]> {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(firestore(), path),
      (snap) => {
        setData(snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })));
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [path, enabled]);

  return { data, loading, error };
}

/** Everything the league pages need, live. */
export function useLeagueBase(enabled: boolean) {
  const profiles = useCollection<Profile>("profiles", enabled);
  const rounds = useCollection<Round>("rounds", enabled);
  const instruments = useCollection<Instrument>("instruments", enabled);
  const markets = useCollection<Market>("markets", enabled);
  const settings = useCollection<LeagueSettings>("settings", enabled);

  const sortedRounds = useMemo(
    () => [...rounds.data].sort((a, b) => a.id.localeCompare(b.id)),
    [rounds.data],
  );

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of profiles.data) map.set(p.id, { ...p, uid: p.id });
    return map;
  }, [profiles.data]);

  const instrumentMap = useMemo(() => {
    const map = new Map<string, Instrument>();
    for (const i of instruments.data) map.set(i.id, i);
    return map;
  }, [instruments.data]);

  const league = useMemo<LeagueSettings>(() => {
    const found = settings.data.find((s) => s.id === "league");
    return {
      leagueName: found?.leagueName ?? "BörsBråket",
      picksPerRound: found?.picksPerRound ?? 5,
      minMarketCapMusd: found?.minMarketCapMusd ?? 300,
    };
  }, [settings.data]);

  return {
    profiles: profiles.data.map((p) => ({ ...p, uid: p.id })),
    profileMap,
    rounds: sortedRounds,
    instruments: instruments.data,
    instrumentMap,
    markets: [...markets.data].sort((a, b) => a.sortOrder - b.sortOrder),
    settings: league,
    loading:
      profiles.loading || rounds.loading || instruments.loading || markets.loading || settings.loading,
    error: profiles.error ?? rounds.error ?? instruments.error ?? markets.error ?? settings.error,
  };
}

/** Live prices for one round. */
export function useRoundPrices(roundId: string | null) {
  const path = roundId ? `rounds/${roundId}/prices` : "";
  const { data, loading, error } = useCollection<PriceDoc>(path, Boolean(roundId));

  const map = useMemo(() => {
    const m = new Map<string, PriceDoc>();
    for (const p of data) m.set(p.id, { ...p, instrumentId: p.id });
    return m;
  }, [data]);

  return { prices: map, loading, error };
}

/**
 * Picks for one round.
 *
 * While a round is still open the rules refuse a listing of everyone's
 * picks, so this only subscribes once the round has locked. Your own
 * picks always come through `useMyPicks`.
 */
export function useRoundPicks(roundId: string | null, locked: boolean) {
  const path = roundId ? `rounds/${roundId}/picks` : "";
  const { data, loading, error } = useCollection<PicksDoc>(path, Boolean(roundId) && locked);
  const docs = useMemo(() => data.map((d) => ({ ...d, uid: d.id })), [data]);
  return { pickDocs: docs, loading, error };
}

/**
 * Your own picks for one round.
 *
 * Deliberately a single-document read. Listing the picks collection
 * while the round is open is refused by the rules, because that listing
 * would include everyone else's sealed picks.
 */
export function useMyPicks(roundId: string | null, uid: string | null) {
  const [myPicks, setMyPicks] = useState<PicksDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roundId || !uid) {
      setMyPicks(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(firestore(), "rounds", roundId, "picks", uid),
      (snap) => {
        setMyPicks(snap.exists() ? { ...(snap.data() as PicksDoc), uid: snap.id } : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [roundId, uid]);

  return { myPicks, loading };
}

export type Submission = { uid: string; count: number };

/**
 * Who has submitted this month, and how many holdings — never which.
 * Readable while the round is still open, unlike the picks themselves.
 */
export function useSubmissions(roundId: string | null) {
  const path = roundId ? `rounds/${roundId}/submissions` : "";
  const { data, loading } = useCollection<Submission>(path, Boolean(roundId));
  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data) m.set(s.id, s.count ?? 0);
    return m;
  }, [data]);
  return { submissions: map, loading };
}

export type RoundBundle = { roundId: string; pickDocs: PicksDoc[]; prices: Map<string, PriceDoc> };

/**
 * One-shot load of picks and prices for a set of rounds. Used by the
 * season table and the history page, where live updates are not worth
 * one subscription per month.
 */
export function useRoundBundles(roundIds: string[], enabled: boolean) {
  const key = roundIds.join(",");
  const [bundles, setBundles] = useState<Map<string, RoundBundle>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || roundIds.length === 0) {
      setBundles(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);

    (async () => {
      const db = firestore();
      const next = new Map<string, RoundBundle>();
      await Promise.all(
        key.split(",").map(async (roundId) => {
          const [pickSnap, priceSnap] = await Promise.all([
            getDocs(collection(db, `rounds/${roundId}/picks`)),
            getDocs(collection(db, `rounds/${roundId}/prices`)),
          ]);
          const prices = new Map<string, PriceDoc>();
          for (const d of priceSnap.docs) {
            prices.set(d.id, { ...(d.data() as PriceDoc), instrumentId: d.id });
          }
          next.set(roundId, {
            roundId,
            pickDocs: pickSnap.docs.map((d) => ({ ...(d.data() as PicksDoc), uid: d.id })),
            prices,
          });
        }),
      );
      if (!cancelled) {
        setBundles(next);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return { bundles, loading };
}

/** How many messages the board keeps on screen. */
const CHAT_WINDOW = 300;

/**
 * The league message board, live.
 *
 * Newest first from Firestore so the window keeps the recent end of the
 * conversation; the page re-orders what it needs. Timestamps are read as
 * estimates so your own message does not jump when the server clock
 * replaces the pending value.
 */
export function useChat(enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const unsubscribe = onSnapshot(
      query(collection(firestore(), "chat"), orderBy("createdAt", "desc"), limit(CHAT_WINDOW)),
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({
            ...(d.data({ serverTimestamps: "estimate" }) as Omit<ChatMessage, "id">),
            id: d.id,
          })),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [enabled]);

  return { messages, loading, error };
}

/** Countdown that re-renders once a second. */
export function useCountdown(target: Date | null): string {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return "";
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "closed";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000) % 24;
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}
