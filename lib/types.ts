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
  /** The display name, chosen by the player. Falls back to the handle. */
  alias: string | null;
  /** A line about yourself. Replaces the old "battle cry". */
  description: string | null;
  /**
   * A small badge in the corner of the avatar rather than the avatar
   * itself. The picture is the identity now; this is flair on top of it.
   */
  icon: string;
  /**
   * A square JPEG data URL, resized in the browser before it is saved.
   * Stored on the profile document rather than in Cloud Storage: the
   * images are a few tens of kilobytes, every reader of the league table
   * already reads this document, and it keeps the whole access story
   * inside firestore.rules.
   *
   * This is also the app's largest bandwidth cost, and the reason to
   * move to Cloud Storage once the league outgrows a handful of players.
   */
  photoUrl: string | null;
  status: ProfileStatus;
  isAdmin: boolean;
  createdAt?: Instant;
  approvedAt?: Instant;

  /**
   * How far this player has read the message board.
   *
   * On the profile rather than in localStorage so that reading the board
   * on a phone clears the badge on a laptop. It is nearly free: every
   * page already subscribes to the profiles collection, so this arrives
   * on a document that was being read anyway, and it costs one write per
   * visit to the board rather than one per message.
   *
   * localStorage is still consulted alongside it — see lib/chatRead.ts —
   * because it updates instantly and works while offline. Whichever mark
   * is later wins.
   */
  chatReadAt?: Instant;

  /**
   * Written by earlier versions and read only so that a profile saved
   * before the rename still renders. Saving a profile clears them.
   * `color` is gone entirely: the avatar's tint is derived from the uid,
   * which is one less thing to store and cannot clash with itself.
   */
  motto?: string | null;
  emoji?: string;
  color?: number;

  /**
   * Older still: before the address moved to contacts/{uid}, the public
   * profile carried it directly and had no `handle` at all. Those rows
   * are read here only so they can show a name and be given a handle;
   * nothing writes this field any more.
   */
  email?: string;
};

/** The badge to show, tolerating documents written before the rename. */
export function profileIcon(profile: Pick<Profile, "icon" | "emoji"> | null | undefined): string {
  return profile?.icon || profile?.emoji || "";
}

/** The description, tolerating documents that still say `motto`. */
export function profileDescription(
  profile: Pick<Profile, "description" | "motto"> | null | undefined,
): string {
  return (profile?.description ?? profile?.motto ?? "").trim();
}

/**
 * The avatar's tint, derived rather than stored.
 *
 * Eight tints and a stable hash of the uid: the same player is always
 * the same colour, nobody has to pick one, and there is no field to keep
 * in step. Colours repeat above eight players, which is fine — it is a
 * background wash behind a picture or a pair of initials, not an
 * identifier.
 */
export function profileTint(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return (hash % 8) + 1;
}

/** Up to two letters from the display name, for an avatar with no photo. */
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Matches the ceiling firestore.rules enforces. */
export const MAX_DESCRIPTION_CHARS = 140;
export const MAX_ALIAS_CHARS = 24;

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

/**
 * The author of a message the league itself posted.
 *
 * Only the weekly job writes these, through the Admin SDK, which is the
 * one caller the rules do not apply to — a signed-in client cannot claim
 * this uid, because the chat rule pins the author to the auth token.
 * There is no profile document behind it, so the board renders it as the
 * league rather than as a player.
 */
export const SYSTEM_UID = "system";

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
  /**
   * `name` lower-cased, written at seed time and by the admin panel.
   *
   * Firestore has no case-insensitive comparison and no substring
   * search, so searching every market at once — which is what the "All
   * markets" option in the picker does — needs a field that is already
   * in the case the query will be in. Optional because a document
   * written before this existed will not have one; those are simply not
   * found by name until the next seed, which is why useInstrumentSearch
   * searches the symbol as well.
   */
  nameLower?: string;
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

  /**
   * Whether the board has already been told this month opened, and that
   * it sealed. Flags on the round rather than a search of the chat: the
   * job runs daily, and "have I said this already" should cost a field
   * that is already loaded rather than a query per run.
   */
  announcedOpen?: boolean;
  announcedLock?: boolean;
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

/**
 * One row per run of the price job.
 *
 * Written by the cron, read by the admin panel, and the only record that
 * a week was ever attempted. A job whose failure mode is silence needs
 * somewhere its silence becomes visible: `written` short of `awaiting`,
 * or no row at all for a week, is what a missed checkpoint looks like.
 */
export type PriceRun = {
  id: string;
  roundId: string;
  /** 0-4; 0 is the baseline taken at the lock. */
  checkpoint: number;
  field: string;
  dueAt: string | null;
  source: string;
  written: number;
  /** Instruments this run wanted and did not get. */
  awaiting: number;
  /** A sample of earlier checkpoints still empty, capped when written. */
  gaps: string[];
  gapCount: number;
  /** Whatever went wrong, if anything did. */
  note: string | null;
  createdAt?: Instant;
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
