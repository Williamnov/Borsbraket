"use client";

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import {
  CHAT_MAX_PER_HOUR,
  CHAT_MIN_GAP_SECONDS,
  MAX_MESSAGE_CHARS,
  toDate,
  type RateLimit,
} from "@/lib/types";

const HOUR_MS = 3_600_000;

/**
 * Post one message to the board.
 *
 * The message and the poster's rateLimits/{uid} counter are written in a
 * single transaction, because firestore.rules only accepts the message if
 * getAfter() shows the counter being stamped at the same instant. That is
 * the whole rate limit: the rules cannot count documents, so the counter
 * is a document, and writing it is the thing that is policed.
 *
 * The one place this can disagree with the server is the hour boundary.
 * The client decides whether the window has rolled over using its own
 * clock, and the rules decide using theirs; a few seconds of skew at
 * exactly the wrong moment gets the write refused. So a refusal is
 * retried once with the opposite decision, which costs one round trip and
 * saves the player an error they could do nothing about.
 */
export async function postChatMessage(
  db: Firestore,
  uid: string,
  body: string,
  parentId: string | null,
): Promise<void> {
  const text = body.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!text) return;

  try {
    await attempt(db, uid, text, parentId, null);
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    // Either the pace was genuinely too fast — in which case this second
    // attempt fails the same way and the message below is what the player
    // sees — or the two clocks disagreed about the hour.
    try {
      await attempt(db, uid, text, parentId, "flip");
    } catch (second) {
      if (isPermissionDenied(second)) throw new Error(tooFastMessage());
      throw second;
    }
  }
}

async function attempt(
  db: Firestore,
  uid: string,
  text: string,
  parentId: string | null,
  mode: "flip" | null,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const rateRef = doc(db, "rateLimits", uid);
    const snap = await tx.get(rateRef);
    const now = serverTimestamp();

    if (!snap.exists()) {
      tx.set(rateRef, { uid, lastPostAt: now, windowStart: now, count: 1 });
    } else {
      const current = snap.data() as RateLimit;
      const startedAt = toDate(current.windowStart);
      const elapsed = startedAt ? Date.now() - startedAt.getTime() : Infinity;
      const rolled = mode === "flip" ? elapsed < HOUR_MS : elapsed >= HOUR_MS;

      tx.set(
        rateRef,
        rolled
          ? { uid, lastPostAt: now, windowStart: now, count: 1 }
          : {
              uid,
              lastPostAt: now,
              windowStart: current.windowStart,
              count: (current.count ?? 0) + 1,
            },
      );
    }

    // A generated id rather than addDoc, because the message has to go in
    // the same transaction as the counter above.
    tx.set(doc(collection(db, "chat")), {
      uid,
      body: text,
      parentId,
      createdAt: now,
    });
  });
}

function tooFastMessage(): string {
  return (
    `Posting too quickly. There is a ${CHAT_MIN_GAP_SECONDS}-second gap between messages ` +
    `and a ceiling of ${CHAT_MAX_PER_HOUR} an hour.`
  );
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "permission-denied"
  );
}
