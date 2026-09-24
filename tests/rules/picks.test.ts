import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { MINUTE, ago, ahead, as, makeTestEnv, picksPayload, seed, withoutRules } from "./helpers";

/**
 * The seal on the picks.
 *
 * This is the one place where a rules bug is both silent and permanent:
 * nobody gets an error when a pick leaks, and a pick that has been seen
 * cannot be unseen. Everything else in the app can be fixed after the
 * fact; a month where one player read another's picks before the lock
 * cannot.
 */

const OPEN = "2026-01";
const LOCKED = "2026-02";

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
    profiles: [
      { uid: "anna" },
      { uid: "björn" },
      { uid: "carl", status: "pending" },
      { uid: "admin", isAdmin: true },
    ],
    instruments: [
      { id: "ERIC" },
      { id: "VOLV" },
      { id: "SAAB" },
      { id: "NOKIA", eligible: false },
    ],
    rounds: [
      { id: OPEN, status: "open", locksAt: ahead(7 * 24 * 60 * MINUTE) },
      { id: LOCKED, status: "live", locksAt: ago(24 * 60 * MINUTE) },
    ],
  });
});

function picksDoc(db: ReturnType<typeof as>, roundId: string, uid: string) {
  return doc(db, "rounds", roundId, "picks", uid);
}

describe("while a round is open", () => {
  it("lets a player write and read back their own picks", async () => {
    const anna = as(env, "anna");
    await assertSucceeds(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["ERIC", "VOLV"])));
    await assertSucceeds(getDoc(picksDoc(anna, OPEN, "anna")));
  });

  it("refuses to show one player another player's picks", async () => {
    const anna = as(env, "anna");
    await setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["ERIC"]));

    const björn = as(env, "björn");
    await assertFails(getDoc(picksDoc(björn, OPEN, "anna")));
  });

  it("refuses to list the picks collection at all", async () => {
    // This is the load-bearing one. A list that succeeded would hand the
    // whole field's picks to anyone who opened the network tab, whatever
    // the interface chose to render.
    const björn = as(env, "björn");
    await assertFails(getDocs(collection(björn, "rounds", OPEN, "picks")));
  });

  it("refuses a write into someone else's picks document", async () => {
    const björn = as(env, "björn");
    await assertFails(setDoc(picksDoc(björn, OPEN, "anna"), picksPayload("anna", ["ERIC"])));
  });

  it("refuses an ineligible instrument", async () => {
    const anna = as(env, "anna");
    await assertFails(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["NOKIA"])));
  });

  it("refuses an instrument that does not exist", async () => {
    const anna = as(env, "anna");
    await assertFails(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["MADE-UP"])));
  });

  it("refuses more picks than the round allows", async () => {
    await env.clearFirestore();
    await seed(env, {
      profiles: [{ uid: "anna" }],
      instruments: ["A", "B", "C", "D"].map((id) => ({ id })),
      rounds: [{ id: OPEN, status: "open", locksAt: ahead(60 * MINUTE), picksPerRound: 3 }],
    });

    const anna = as(env, "anna");
    await assertFails(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["A", "B", "C", "D"])));
    await assertSucceeds(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["A", "B", "C"])));
  });

  it("refuses an empty picks document", async () => {
    const anna = as(env, "anna");
    await assertFails(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", [])));
  });

  it("keeps a player who is only pending out entirely", async () => {
    const carl = as(env, "carl");
    await assertFails(setDoc(picksDoc(carl, OPEN, "carl"), picksPayload("carl", ["ERIC"])));
    await assertFails(getDocs(collection(carl, "instruments")));
  });

  it("lets a player change and withdraw their own picks", async () => {
    const anna = as(env, "anna");
    await setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["ERIC"]));
    await assertSucceeds(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["VOLV", "SAAB"])));
    await assertSucceeds(deleteDoc(picksDoc(anna, OPEN, "anna")));
  });
});

describe("once a round has locked", () => {
  it("opens every player's picks to the league", async () => {
    await withoutRules(env, async (db) => {
      await setDoc(doc(db, "rounds", LOCKED, "picks", "anna"), picksPayload("anna", ["ERIC"]));
    });

    const björn = as(env, "björn");
    await assertSucceeds(getDoc(picksDoc(björn, LOCKED, "anna")));
    await assertSucceeds(getDocs(collection(björn, "rounds", LOCKED, "picks")));
  });

  it("refuses a late submission, and a late edit", async () => {
    const anna = as(env, "anna");
    await assertFails(setDoc(picksDoc(anna, LOCKED, "anna"), picksPayload("anna", ["ERIC"])));
    await assertFails(deleteDoc(picksDoc(anna, LOCKED, "anna")));
  });

  it("locks on the clock even while the round still says it is open", async () => {
    // roundOpen() checks request.time against locksAt as well as the
    // status field, so a month nobody has settled yet still closes on
    // time rather than staying open until an admin notices.
    await env.clearFirestore();
    await seed(env, {
      profiles: [{ uid: "anna" }],
      instruments: [{ id: "ERIC" }],
      rounds: [{ id: OPEN, status: "open", locksAt: ago(MINUTE) }],
    });

    const anna = as(env, "anna");
    await assertFails(setDoc(picksDoc(anna, OPEN, "anna"), picksPayload("anna", ["ERIC"])));
  });
});

describe("submission markers", () => {
  it("say that a player has picked without saying what", async () => {
    const anna = as(env, "anna");
    const marker = doc(anna, "rounds", OPEN, "submissions", "anna");
    await assertSucceeds(setDoc(marker, { uid: "anna", count: 2, submittedAt: new Date() }));

    // Readable by the rest of the league while the picks themselves
    // are not — that is the whole point of the marker.
    const björn = as(env, "björn");
    await assertSucceeds(getDocs(collection(björn, "rounds", OPEN, "submissions")));
  });

  it("refuse any field beyond the count", async () => {
    const anna = as(env, "anna");
    await assertFails(
      setDoc(doc(anna, "rounds", OPEN, "submissions", "anna"), {
        uid: "anna",
        count: 2,
        submittedAt: new Date(),
        picks: { ERIC: true },
      }),
    );
  });
});
