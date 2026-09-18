"use client";

/**
 * A remembered answer to "could this browser play, last time?"
 *
 * Signing in is two asynchronous steps: Firebase Auth restores the
 * session from IndexedDB, and only then can the profile document be
 * read to find out whether the account is approved. Until both finish
 * the app knows nothing, and the landing page rendered no button at all
 * — a few hundred milliseconds of empty space followed by a pop-in.
 *
 * So the last known answer is kept here and used to paint the first
 * frame. It is a hint about what to render, never a permission: every
 * page worth protecting is behind RequirePlayer, and firestore.rules
 * decides what may actually be read either way. The worst a stale hint
 * can do is offer a link that immediately redirects.
 *
 * It is read through useSyncExternalStore rather than useState so that
 * the server snapshot is honestly null. The prerendered HTML has no
 * localStorage to consult, and a first client render that disagreed
 * with it would be a hydration mismatch.
 */

const KEY = "borsbraket:auth-hint";

export type AuthHint = { canPlay: boolean; isAdmin: boolean };

const listeners = new Set<() => void>();

/**
 * useSyncExternalStore compares snapshots by identity and re-renders
 * forever if a new object comes back each time, so the parsed value is
 * held here and only replaced when the stored text actually changes.
 */
let lastRaw: string | null = null;
let lastParsed: AuthHint | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Private browsing, or storage switched off.
    return null;
  }
}

export function getHint(): AuthHint | null {
  if (typeof window === "undefined") return null;
  const raw = read();
  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as AuthHint) : null;
    lastParsed =
      parsed && typeof parsed.canPlay === "boolean" && typeof parsed.isAdmin === "boolean"
        ? parsed
        : null;
  } catch {
    lastParsed = null;
  }
  return lastParsed;
}

/** Null on the server, always — see the note above about hydration. */
export function getServerHint(): AuthHint | null {
  return null;
}

export function setHint(hint: AuthHint | null): void {
  if (typeof window === "undefined") return;
  try {
    if (hint === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(hint));
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

export function subscribeHint(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}
