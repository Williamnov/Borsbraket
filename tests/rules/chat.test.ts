import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { HOUR, MINUTE, ago, as, makeTestEnv, seed, withoutRules } from "./helpers";

/**
 * The message board, and the rate limit on it.
 *
 * The limit is enforced across two documents: the message is only
 * accepted if the same write stamps the poster's rateLimits row, and the
 * rules on that row are what set the pace. Tests here drive that pairing
 * directly rather than through lib/chat.ts, so a change to the client
 * cannot quietly make the rules look stricter than they are.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await makeTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, {
    profiles: [{ uid: "anna" }, { uid: "björn" }, { uid: "carl", status: "pending" }],
  });
});

/** The message and the counter, exactly as lib/chat.ts writes them. */
async function post(
  db: ReturnType<typeof as>,
  uid: string,
  body: string,
  counter: { windowStart: unknown; count: number } | "first",
) {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(
    doc(db, "rateLimits", uid),
    counter === "first"
      ? { uid, lastPostAt: now, windowStart: now, count: 1 }
      : { uid, lastPostAt: now, windowStart: counter.windowStart, count: counter.count },
  );
  batch.set(doc(collection(db, "chat")), {
    uid,
    body,
    parentId: null,
    createdAt: now,
  });

  return batch.commit();
}

describe("posting", () => {
  it("accepts a first message", async () => {
    await assertSucceeds(post(as(env, "anna"), "anna", "Volvo to the moon", "first"));
  });

  it("refuses a message that does not stamp the counter", async () => {
    const anna = as(env, "anna");
    await assertFails(
      setDoc(doc(collection(anna, "chat")), {
        uid: "anna",
        body: "sneaking one past",
        parentId: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("refuses a second message inside the ten-second gap", async () => {
    await seed(env, {
      rateLimits: [{ uid: "anna", lastPostAt: ago(2_000), windowStart: ago(2_000), count: 1 }],
    });

    const anna = as(env, "anna");
    await assertFails(post(anna, "anna", "and another thing", { windowStart: ago(2_000), count: 2 }));
  });

  it("accepts one once the gap has passed", async () => {
    const windowStart = ago(5 * MINUTE);
    await seed(env, {
      rateLimits: [{ uid: "anna", lastPostAt: ago(30_000), windowStart, count: 4 }],
    });

    await assertSucceeds(post(as(env, "anna"), "anna", "as I was saying", { windowStart, count: 5 }));
  });

  it("refuses the sixty-first message in an hour", async () => {
    const windowStart = ago(20 * MINUTE);
    await seed(env, {
      rateLimits: [{ uid: "anna", lastPostAt: ago(MINUTE), windowStart, count: 60 }],
    });

    await assertFails(post(as(env, "anna"), "anna", "still going", { windowStart, count: 61 }));
  });

  it("lets the count start again once the hour is over", async () => {
    await seed(env, {
      rateLimits: [
        { uid: "anna", lastPostAt: ago(MINUTE), windowStart: ago(HOUR + MINUTE), count: 60 },
      ],
    });

    // A fresh window: windowStart becomes request.time and count returns
    // to one, which is the only reset the rules permit.
    await assertSucceeds(post(as(env, "anna"), "anna", "new hour, new takes", "first"));
  });

  it("refuses a counter that skips ahead to buy headroom", async () => {
    const windowStart = ago(20 * MINUTE);
    await seed(env, {
      rateLimits: [{ uid: "anna", lastPostAt: ago(MINUTE), windowStart, count: 10 }],
    });

    // Anything other than exactly one more is refused, in either
    // direction — counting backwards is how you would buy yourself
    // another fifty messages.
    const anna = as(env, "anna");
    await assertFails(post(anna, "anna", "reset please", { windowStart, count: 1 }));
    await assertFails(post(anna, "anna", "jump", { windowStart, count: 12 }));
  });

  it("refuses one player winding down another player's counter", async () => {
    await seed(env, {
      rateLimits: [{ uid: "anna", lastPostAt: ago(MINUTE), windowStart: ago(MINUTE), count: 40 }],
    });

    const björn = as(env, "björn");
    await assertFails(
      updateDoc(doc(björn, "rateLimits", "anna"), {
        uid: "anna",
        lastPostAt: serverTimestamp(),
        windowStart: serverTimestamp(),
        count: 1,
      }),
    );
  });

  it("keeps a player who is only pending off the board", async () => {
    const carl = as(env, "carl");
    await assertFails(post(carl, "carl", "let me in", "first"));
    await assertFails(getDocs(collection(carl, "chat")));
  });

  it("refuses a message posted under someone else's name", async () => {
    const björn = as(env, "björn");
    await assertFails(post(björn, "anna", "anna said this, honest", "first"));
  });

  it("refuses a message over the length cap", async () => {
    const anna = as(env, "anna");
    await assertFails(post(anna, "anna", "x".repeat(2001), "first"));
  });
});

describe("what happens to a message afterwards", () => {
  beforeEach(async () => {
    await withoutRules(env, async (db) => {
      await setDoc(doc(db, "chat", "m1"), {
        uid: "anna",
        body: "original",
        parentId: null,
        createdAt: new Date(),
      });
    });
  });

  it("can never be edited, not even by its author", async () => {
    const anna = as(env, "anna");
    await assertFails(updateDoc(doc(anna, "chat", "m1"), { body: "rewritten" }));
  });

  it("can be deleted by its author but not by anyone else", async () => {
    const björn = as(env, "björn");
    await assertFails(setDoc(doc(björn, "chat", "m1"), { body: "gone" }));

    const anna = as(env, "anna");
    await assertSucceeds(deleteDoc(doc(anna, "chat", "m1")));
  });
});
