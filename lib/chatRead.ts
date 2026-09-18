"use client";

/**
 * How far each player has read the message board.
 *
 * Kept in localStorage rather than Firestore on purpose. A read marker is
 * per-device by nature, it changes far more often than anything else a
 * player touches, and writing it to Firestore would mean a document write
 * on every visit to the Chat tab plus a rule to go with it — all to
 * decide whether a small number appears next to a link.
 *
 * The cost is that the badge is per-browser: reading the board on your
 * phone does not clear it on your laptop. For a league of a few people
 * arguing about stocks that is the right trade.
 */

const PREFIX = "borsbraket:chat-read:";

/** Changes made in this tab; the storage event only fires in other tabs. */
const listeners = new Set<() => void>();

function key(uid: string): string {
  return `${PREFIX}${uid}`;
}

/**
 * The moment this browser last saw the board, in epoch milliseconds.
 *
 * A browser that has never opened the board is marked as caught up right
 * now rather than treated as having read nothing — otherwise signing in
 * on a new device would greet you with every message ever posted.
 */
export function chatReadMark(uid: string): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const stored = window.localStorage.getItem(key(uid));
    const parsed = stored === null ? NaN : Number(stored);
    if (Number.isFinite(parsed)) return parsed;
    const now = Date.now();
    window.localStorage.setItem(key(uid), String(now));
    return now;
  } catch {
    // Private browsing, or storage switched off. Treating that as caught
    // up means no badge rather than a permanent one.
    return Date.now();
  }
}

/** Marks the board as read up to `at`. Never moves the mark backwards. */
export function markChatRead(uid: string, at: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    const current = Number(window.localStorage.getItem(key(uid)) ?? 0);
    if (Number.isFinite(current) && current >= at) return;
    window.localStorage.setItem(key(uid), String(at));
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

/** Fires whenever the mark moves, in this tab or another one. */
export function subscribeChatRead(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}
