import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";

/**
 * Shared setup for the rules tests.
 *
 * Everything here runs against the Firestore emulator with
 * firestore.rules loaded verbatim, so a test failing means the deployed
 * rules would behave the same way. `npm run test:rules` starts the
 * emulator around the run; there is nothing to start by hand.
 */

const PROJECT_ID = "borsbraket-rules-test";

export async function makeTestEnv(): Promise<RulesTestEnvironment> {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      // Relative to the project root, which is where vitest runs from.
      // Not __dirname: these files are transpiled to ESM, where it does
      // not exist.
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
      host,
      port: Number(port),
    },
  });
}

/**
 * A signed-in browser for one player, with an address on the token —
 * which is what the contacts rules check against.
 *
 * The cast is because the testing library carries its own copy of the
 * Firestore types; it is the same object either way.
 */
export function as(env: RulesTestEnvironment, uid: string): Firestore {
  return env
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore() as unknown as Firestore;
}

export function anonymous(env: RulesTestEnvironment): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

/**
 * A Firestore handle with the rules switched off, for arranging a test's
 * preconditions. Never used to assert anything.
 */
export async function withoutRules(
  env: RulesTestEnvironment,
  write: (db: Firestore) => Promise<void>,
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore() as unknown as Firestore);
  });
}

type SeedProfile = {
  uid: string;
  status?: "pending" | "approved" | "rejected";
  isAdmin?: boolean;
};

/**
 * Writes the fixtures with the rules switched off.
 *
 * Deliberately not done through the rules: a test that has to pass the
 * rules to set up its own preconditions stops being a test of the thing
 * it is actually about, and one broken rule then fails everything.
 */
export async function seed(
  env: RulesTestEnvironment,
  fixtures: {
    profiles?: SeedProfile[];
    instruments?: { id: string; eligible?: boolean }[];
    rounds?: {
      id: string;
      status?: "open" | "live" | "settled";
      locksAt: Date;
      picksPerRound?: number;
    }[];
    rateLimits?: { uid: string; lastPostAt: Date; windowStart: Date; count: number }[];
    contacts?: { uid: string; email: string }[];
  },
): Promise<void> {
  await withoutRules(env, async (db) => {
    for (const profile of fixtures.profiles ?? []) {
      await setDoc(doc(db, "profiles", profile.uid), {
        uid: profile.uid,
        handle: profile.uid,
        alias: null,
        description: null,
        photoUrl: null,
        status: profile.status ?? "approved",
        isAdmin: profile.isAdmin ?? false,
      });
    }

    for (const instrument of fixtures.instruments ?? []) {
      await setDoc(doc(db, "instruments", instrument.id), {
        symbol: instrument.id,
        name: instrument.id,
        marketCode: "TEST",
        currency: "SEK",
        eligible: instrument.eligible ?? true,
        marketCapMusd: null,
        tags: [],
      });
    }

    for (const round of fixtures.rounds ?? []) {
      await setDoc(doc(db, "rounds", round.id), {
        id: round.id,
        year: 2026,
        month: 1,
        opensAt: new Date(0),
        locksAt: round.locksAt,
        startsOn: "2026-01-01",
        endsOn: "2026-01-31",
        picksPerRound: round.picksPerRound ?? 5,
        status: round.status ?? "open",
      });
    }

    for (const rate of fixtures.rateLimits ?? []) {
      await setDoc(doc(db, "rateLimits", rate.uid), {
        uid: rate.uid,
        lastPostAt: rate.lastPostAt,
        windowStart: rate.windowStart,
        count: rate.count,
      });
    }

    for (const contact of fixtures.contacts ?? []) {
      await setDoc(doc(db, "contacts", contact.uid), contact);
    }
  });
}

/** Picks in the shape the rules expect, keyed by instrument id. */
export function picksPayload(uid: string, instrumentIds: string[]) {
  return {
    uid,
    roundId: "2026-01",
    picks: Object.fromEntries(
      instrumentIds.map((id, index) => [
        id,
        { symbol: id, name: id, marketCode: "TEST", slot: index + 1 },
      ]),
    ),
  };
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const ago = (ms: number) => new Date(Date.now() - ms);
export const ahead = (ms: number) => new Date(Date.now() + ms);
