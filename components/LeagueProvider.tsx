"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCollection } from "@/lib/hooks";
import type { Instrument, LeagueSettings, Market, Profile, Round } from "@/lib/types";

/**
 * One set of listeners for the whole session.
 *
 * This replaces a `useLeagueBase(true)` call in each of six pages. Each
 * of those opened its own five subscriptions, so every client-side
 * navigation re-read every collection — and the instruments collection
 * is ~300 documents. Opening the chat tab cost about 330 document reads
 * to render some avatars. The project went through the Spark plan's
 * 50,000 reads in a day on one person browsing.
 *
 * Mounted once in the root layout, the listeners survive navigation:
 * moving between tabs now costs nothing. Combined with the on-disk cache
 * in lib/firebase/client.ts, even a reload bills only for documents that
 * changed since the last visit.
 *
 * Two further rules this enforces:
 *
 *  - Nothing subscribes until the viewer can actually play. The rules
 *    refuse these collections to everyone else, so subscribing earlier
 *    bought a permission error per collection per visitor.
 *
 *  - The universe — instruments and markets, the expensive half — is
 *    subscribed only once a page asks for it through useUniverse(). The
 *    league, profile and chat pages never need a ticker list, so they no
 *    longer pay for one.
 */

type LeagueValue = {
  profiles: Profile[];
  profileMap: Map<string, Profile>;
  rounds: Round[];
  settings: LeagueSettings;
  loading: boolean;
  error: string | null;

  instruments: Instrument[];
  instrumentMap: Map<string, Instrument>;
  markets: Market[];
  universeLoading: boolean;

  /** Called by useUniverse; starts the instruments/markets listeners. */
  requestUniverse: () => void;
};

const FALLBACK_SETTINGS: LeagueSettings = {
  leagueName: "BörsBråket",
  picksPerRound: 5,
  minMarketCapMusd: 300,
};

const LeagueContext = createContext<LeagueValue>({
  profiles: [],
  profileMap: new Map(),
  rounds: [],
  settings: FALLBACK_SETTINGS,
  loading: true,
  error: null,
  instruments: [],
  instrumentMap: new Map(),
  markets: [],
  universeLoading: true,
  requestUniverse: () => {},
});

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { canPlay, loading } = useAuth();

  // The resolved answer, not the optimistic one. useAuth reports canPlay
  // from a cached hint before the session has been restored, which is
  // right for deciding what to paint and wrong for opening a listener:
  // subscribing before the auth token exists gets the listener refused,
  // and it would not retry once the token arrived.
  const ready = !loading && canPlay;

  // Once a page has asked for the universe it stays subscribed for the
  // rest of the session: navigating back to the month page should not
  // pay for the ticker list a second time.
  const [wantUniverse, setWantUniverse] = useState(false);

  // Stable across renders, so the effect in useUniverse that calls it
  // runs once on mount rather than after every snapshot.
  const requestUniverse = useCallback(() => setWantUniverse(true), []);

  const profiles = useCollection<Profile>("profiles", ready);
  const rounds = useCollection<Round>("rounds", ready);
  const settings = useCollection<LeagueSettings>("settings", ready);

  const universeOn = ready && wantUniverse;
  const instruments = useCollection<Instrument>("instruments", universeOn);
  const markets = useCollection<Market>("markets", universeOn);

  const value = useMemo<LeagueValue>(() => {
    const profileList = profiles.data.map((p) => ({ ...p, uid: p.id }));
    const profileMap = new Map<string, Profile>();
    for (const p of profileList) profileMap.set(p.uid, p);

    const instrumentMap = new Map<string, Instrument>();
    for (const i of instruments.data) instrumentMap.set(i.id, i);

    const league = settings.data.find((s) => s.id === "league");

    return {
      profiles: profileList,
      profileMap,
      rounds: [...rounds.data].sort((a, b) => a.id.localeCompare(b.id)),
      settings: {
        leagueName: league?.leagueName ?? FALLBACK_SETTINGS.leagueName,
        picksPerRound: league?.picksPerRound ?? FALLBACK_SETTINGS.picksPerRound,
        minMarketCapMusd: league?.minMarketCapMusd ?? FALLBACK_SETTINGS.minMarketCapMusd,
      },
      loading: profiles.loading || rounds.loading || settings.loading,
      error: profiles.error ?? rounds.error ?? settings.error,

      instruments: instruments.data,
      instrumentMap,
      markets: [...markets.data].sort((a, b) => a.sortOrder - b.sortOrder),
      universeLoading: !wantUniverse || instruments.loading || markets.loading,

      requestUniverse,
    };
  }, [profiles, rounds, settings, instruments, markets, wantUniverse, requestUniverse]);

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

/**
 * Players, rounds and league settings. Cheap: a handful of documents,
 * already subscribed, shared by every page.
 */
export function useLeagueBase() {
  return useContext(LeagueContext);
}

/**
 * The pickable universe — instruments and markets.
 *
 * Asking for it is what starts the listeners, so a page that does not
 * call this never reads the 450 instrument documents.
 */
export function useUniverse() {
  const league = useContext(LeagueContext);
  const { requestUniverse } = league;

  useEffect(() => {
    requestUniverse();
  }, [requestUniverse]);

  return {
    instruments: league.instruments,
    instrumentMap: league.instrumentMap,
    markets: league.markets,
    loading: league.universeLoading,
  };
}
