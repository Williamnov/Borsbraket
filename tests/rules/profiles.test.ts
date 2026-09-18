import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { anonymous, as, makeTestEnv, seed } from "./helpers";

/**
 * Profiles, and the addresses that are deliberately not on them.
 *
 * Every approved player reads every profile document, so anything stored
 * there is league-wide public. The sign-in address lives in contacts/,
 * which only its owner and admins can read.
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
    profiles: [
      { uid: "anna" },
      { uid: "björn" },
      { uid: "carl", status: "pending" },
      { uid: "admin", isAdmin: true },
    ],
    contacts: [
      { uid: "anna", email: "anna@example.com" },
      { uid: "björn", email: "björn@example.com" },
    ],
  });
});

describe("addresses", () => {
  it("are readable by their owner", async () => {
    await assertSucceeds(getDoc(doc(as(env, "anna"), "contacts", "anna")));
  });

  it("are not readable by another player, approved or not", async () => {
    await assertFails(getDoc(doc(as(env, "björn"), "contacts", "anna")));
    await assertFails(getDoc(doc(as(env, "carl"), "contacts", "anna")));
    await assertFails(getDoc(doc(anonymous(env), "contacts", "anna")));
  });

  it("cannot be listed by a player, only by an admin", async () => {
    await assertFails(getDocs(collection(as(env, "björn"), "contacts")));
    await assertSucceeds(getDocs(collection(as(env, "admin"), "contacts")));
  });

  it("are pinned to the address on the auth token", async () => {
    // as() puts <uid>@example.com on the token, so this is the one value
    // the rules will accept — a player cannot file someone else's
    // address under their own uid, or claim a nicer one.
    const björn = as(env, "björn");
    await assertSucceeds(
      setDoc(doc(björn, "contacts", "björn"), { uid: "björn", email: "björn@example.com" }),
    );
    await assertFails(
      setDoc(doc(björn, "contacts", "björn"), { uid: "björn", email: "someone@else.com" }),
    );
  });

  it("cannot be written under another player's uid", async () => {
    const björn = as(env, "björn");
    await assertFails(
      setDoc(doc(björn, "contacts", "anna"), { uid: "anna", email: "björn@example.com" }),
    );
  });
});

describe("profiles", () => {
  it("do not carry an address for the league to read", async () => {
    const björn = as(env, "björn");
    const snapshot = await getDoc(doc(björn, "profiles", "anna"));
    const data = snapshot.data() ?? {};

    // The assertion is on the field's absence rather than on a rule:
    // rules cannot stop a document carrying a field nobody wrote, so
    // this guards the shape the client writes.
    if ("email" in data) {
      throw new Error("a profile document carried an email address");
    }
  });

  it("let a player edit their own cosmetics", async () => {
    const anna = as(env, "anna");
    await assertSucceeds(
      updateDoc(doc(anna, "profiles", "anna"), { alias: "Anna", motto: "Buys tops", emoji: "🦊" }),
    );
  });

  it("refuse a player promoting themselves, or approving themselves", async () => {
    const carl = as(env, "carl");
    await assertFails(updateDoc(doc(carl, "profiles", "carl"), { isAdmin: true }));
    await assertFails(updateDoc(doc(carl, "profiles", "carl"), { status: "approved" }));
  });

  it("refuse a player changing their handle", async () => {
    // The handle is what the league table shows when there is no alias.
    // Letting it move would let someone impersonate another player in
    // every table at once.
    const anna = as(env, "anna");
    await assertFails(updateDoc(doc(anna, "profiles", "anna"), { handle: "björn" }));
  });

  it("refuse a handle that is a whole address", async () => {
    const dagny = as(env, "dagny");
    await assertFails(
      setDoc(doc(dagny, "profiles", "dagny"), {
        uid: "dagny",
        handle: "dagny@example.com",
        alias: null,
        emoji: "📈",
        color: 1,
        motto: null,
        photoUrl: null,
        status: "pending",
        isAdmin: false,
      }),
    );
  });

  it("let a new account register itself as pending", async () => {
    const dagny = as(env, "dagny");
    await assertSucceeds(
      setDoc(doc(dagny, "profiles", "dagny"), {
        uid: "dagny",
        handle: "dagny",
        alias: null,
        emoji: "📈",
        color: 1,
        motto: null,
        photoUrl: null,
        status: "pending",
        isAdmin: false,
      }),
    );
  });

  it("refuse a new account registering itself as approved", async () => {
    const dagny = as(env, "dagny");
    await assertFails(
      setDoc(doc(dagny, "profiles", "dagny"), {
        uid: "dagny",
        handle: "dagny",
        alias: null,
        emoji: "📈",
        color: 1,
        motto: null,
        photoUrl: null,
        status: "approved",
        isAdmin: false,
      }),
    );
  });

  it("refuse a photo over the cap, or one that is not an image", async () => {
    const anna = as(env, "anna");
    const tooBig = `data:image/jpeg;base64,${"A".repeat(200_001)}`;
    await assertFails(updateDoc(doc(anna, "profiles", "anna"), { photoUrl: tooBig }));
    await assertFails(
      updateDoc(doc(anna, "profiles", "anna"), { photoUrl: "https://example.com/me.jpg" }),
    );
    await assertSucceeds(
      updateDoc(doc(anna, "profiles", "anna"), { photoUrl: "data:image/jpeg;base64,AAAA" }),
    );
  });

  it("let an admin approve and promote", async () => {
    const admin = as(env, "admin");
    await assertSucceeds(updateDoc(doc(admin, "profiles", "carl"), { status: "approved" }));
    await assertSucceeds(updateDoc(doc(admin, "profiles", "carl"), { isAdmin: true }));
  });

  it("keep everything else closed to a signed-out visitor", async () => {
    const nobody = anonymous(env);
    await assertFails(getDocs(collection(nobody, "profiles")));
    await assertFails(getDocs(collection(nobody, "instruments")));
    await assertFails(getDocs(collection(nobody, "rounds")));
  });
});
