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
  /**
   * The part of the sign-in address before the @, and the fallback the
   * league table shows when someone has not set a display name.
   *
   * The address itself is deliberately not here. Everyone approved reads
   * every profile document, so anything on it is league-wide public;
   * `contacts/{uid}` holds the address and is readable only by its owner
   * and by admins. firestore.rules refuses a handle containing an @.
   */
  handle: string;
  alias: string | null;
  emoji: string;
  color: number;
  motto: string | null;
  /**
   * A square JPEG data URL, resized in the browser before it is saved.
   * Null means the emoji is used instead. Stored on the profile document
   * rather than in Cloud Storage: the images are a few tens of kilobytes,
   * every reader of the league table already reads this document, and it
   * keeps the whole access story inside firestore.rules.
   */
  photoUrl: string | null;
  status: ProfileStatus;
  isAdmin: boolean;
  createdAt?: Instant;
  approvedAt?: Instant;
};

/** The hard ceiling the rules also enforce, in characters of data URL. */
export const MAX_PHOTO_CHARS = 200_000;

/**
 * contacts/{uid} — the sign-in address, kept off the public profile.
 *
 * Readable by its owner and by admins only, so the approval queue can
 * still show who is asking to join without the address being visible to
 * the rest of the league.
 */
export type Contact = {
  uid: string;
  email: string;
};

/**
 * rateLimits/{uid} — how fast one player may post to the board.
 *
 * Written in the same transaction as the message itself; the rules read
 * it back with getAfter() and refuse the message if the pace is wrong.
 * Not something any page renders.
 */
export type RateLimit = {
  uid: string;
  lastPostAt?: Instant;
  windowStart?: Instant;
  count: number;
};

/** Both halves of the posting limit the rules enforce. */
export const CHAT_MIN_GAP_SECONDS = 10;
export const CHAT_MAX_PER_HOUR = 60;

/**
 * chat/{messageId} — the league's message board.
 *
 * One flat collection with a single level of replies: `parentId` is null
 * for a new thread and the thread's id for a reply. Flat keeps the whole
 * board readable in one subscription.
 */
export type ChatMessage = {
  id: string;
  uid: string;
  body: string;
  parentId: string | null;
  createdAt?: Instant;
};

/** Matches the ceiling firestore.rules enforces. */
export const MAX_MESSAGE_CHARS = 2000;

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
