/** Anything Firestore may hand back for a moment in time. */
export type Instant = { toDate: () => Date } | Date | string | number | null | undefined;

export function toDate(value: Instant): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ProfileStatus = "pending" | "approved" | "rejected";
export type RoundStatus = "open" | "live" | "settled";

export type Profile = {
  uid: string;
  email: string;
  alias: string | null;
  emoji: string;
  color: number;
  motto: string | null;
  status: ProfileStatus;
  isAdmin: boolean;
  createdAt?: Instant;
  approvedAt?: Instant;
};

export type Market = {
  code: string;
  name: string;
  country: string;
  region: string;
  currency: string;
  isEnabled: boolean;
  sortOrder: number;
};

export type Instrument = {
  id: string;
  symbol: string;
  name: string;
  marketCode: string;
  currency: string;
  eligible: boolean;
  isBenchmark: boolean;
  marketCapMusd: number | null;
  tags: string[];
};

export type Round = {
  id: string;
  year: number;
  month: number;
  opensAt: Instant;
  locksAt: Instant;
  startsOn: string;
  endsOn: string;
  picksPerRound: number;
  status: RoundStatus;
  settledAt?: Instant;
};

/** One entry in a player's monthly portfolio. */
export type PickItem = {
  symbol: string;
  name: string;
  marketCode: string;
  slot: number;
};

/** rounds/{roundId}/picks/{uid} — keyed by instrument id, so no duplicates. */
export type PicksDoc = {
  uid: string;
  roundId: string;
  picks: Record<string, PickItem>;
  submittedAt?: Instant;
};

/** rounds/{roundId}/prices/{instrumentId} */
export type PriceDoc = {
  instrumentId: string;
  symbol: string;
  currency: string;
  w0: number | null;
  w1: number | null;
  w2: number | null;
  w3: number | null;
  w4: number | null;
  source?: string;
  updatedAt?: Instant;
};

export type LeagueSettings = {
  leagueName: string;
  picksPerRound: number;
  minMarketCapMusd: number;
};

export type ScoredPick = {
  instrumentId: string;
  symbol: string;
  name: string;
  open: number | null;
  latest: number | null;
  latestWeek: number | null;
  ret: number | null;
};

export type ScoredEntry = {
  uid: string;
  picks: ScoredPick[];
  ret: number | null;
  priced: number;
  total: number;
  rank: number | null;
  points: number | null;
};

export type SeasonRow = {
  uid: string;
  points: number;
  wins: number;
  played: number;
  cumulative: number | null;
  average: number | null;
  monthly: { roundId: string; ret: number }[];
};

export const EMPTY_PRICE: Omit<PriceDoc, "instrumentId" | "symbol" | "currency"> = {
  w0: null,
  w1: null,
  w2: null,
  w3: null,
  w4: null,
};
