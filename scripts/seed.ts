/**
 * Seeds markets, instruments and league settings into Firestore, and
 * promotes one account to admin.
 *
 * Reads credentials from .env.local (or the shell) and writes with the
 * Admin SDK, so it bypasses firestore.rules. Safe to run more than once:
 * every write is a merge on a stable document id.
 *
 *   npm run seed
 *   npm run seed -- --admin you@example.com
 *   npm run seed -- --retire          # see below
 *
 * The email is passed on the command line on purpose — it never gets
 * committed to the repository.
 *
 * ── What a merge cannot do ────────────────────────────────────────────
 *
 * Merging only ever adds. That is the right default — a picked
 * instrument must not vanish from under a settled month — but it means
 * Firestore keeps everything the universe has ever contained, and the
 * universe moves: Nasdaq reshuffles its segments every year, so a
 * company promoted from Small Cap to Mid Cap leaves a document behind
 * under the segment it left, pickable, under a heading that is now
 * wrong. Companies are also taken over and delisted.
 *
 * So the last thing this does is name every instrument in Firestore that
 * the universe no longer contains. It changes nothing by default,
 * because a name that is merely missing from the seed might have been
 * added by hand from the admin panel on purpose. `--retire` marks them
 * ineligible — never deleted, because past picks point at them — and
 * prints each one as it goes.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { INSTRUMENTS, MARKETS, instrumentId } from "../lib/universe";

function loadEnvFile(file: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env.local: assume the variables are already in the shell.
  }
}

loadEnvFile(".env.local");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY.\n" +
      "Copy env.example to .env.local and paste the values from your service account JSON.",
  );
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

function adminEmailArg(): string | null {
  const index = process.argv.indexOf("--admin");
  return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

async function commitInChunks(
  entries: [DocumentReference, Record<string, unknown>][],
  describe: string,
): Promise<void> {
  for (let start = 0; start < entries.length; start += 400) {
    const batch = db.batch();
    for (const [ref, data] of entries.slice(start, start + 400)) {
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  }
  console.log(`  ${entries.length} ${describe}`);
}

/**
 * Everything in Firestore that the universe no longer lists.
 *
 * Reported always, acted on only with --retire. An instrument that is
 * already ineligible is left alone and not counted: it has been dealt
 * with, by this or by a person in the admin panel.
 */
async function reportStale(seeded: Set<string>): Promise<void> {
  const retire = process.argv.includes("--retire");
  const snapshot = await db.collection("instruments").get();

  const stale = snapshot.docs.filter(
    (doc) => !seeded.has(doc.id) && doc.get("eligible") === true && doc.get("isBenchmark") !== true,
  );

  if (stale.length === 0) {
    console.log("\n  Nothing in Firestore that the universe has dropped.");
    return;
  }

  console.log(`\n  ${stale.length} instrument(s) in Firestore that the universe no longer lists:`);
  for (const doc of stale) {
    console.log(`    ${doc.id}  ${String(doc.get("name") ?? "")}`);
  }

  if (!retire) {
    console.log("\n  Left alone. Re-run with --retire to mark them ineligible,");
    console.log("  or block them one at a time in the admin panel.");
    return;
  }

  const entries: [DocumentReference, Record<string, unknown>][] = stale.map((doc) => [
    doc.ref,
    { eligible: false },
  ]);
  await commitInChunks(entries, "marked ineligible");
}

async function main(): Promise<void> {
  console.log("Seeding BörsBråket…");

  await commitInChunks(
    MARKETS.map((market) => [db.doc(`markets/${market.code}`), { ...market, isEnabled: true }]),
    "markets",
  );

  await commitInChunks(
    INSTRUMENTS.map((instrument) => {
      const id = instrumentId(instrument.marketCode, instrument.symbol);
      return [
        db.doc(`instruments/${id}`),
        {
          symbol: instrument.symbol,
          name: instrument.name,
          // What the picker's "All markets" search matches on. Firestore
          // compares case-sensitively and cannot lower-case in a query,
          // so the lower-cased name has to be a field of its own.
          nameLower: instrument.name.toLowerCase(),
          marketCode: instrument.marketCode,
          currency: instrument.currency,
          isBenchmark: instrument.isBenchmark === true,
          eligible: instrument.isBenchmark !== true,
          marketCapMusd: null,
          tags: [],
        },
      ];
    }),
    "instruments",
  );

  await db
    .doc("settings/league")
    .set({ leagueName: "BörsBråket", picksPerRound: 5, minMarketCapMusd: 0 }, { merge: true });
  console.log("  league settings");

  await reportStale(new Set(INSTRUMENTS.map((i) => instrumentId(i.marketCode, i.symbol))));

  const adminEmail = adminEmailArg();
  if (adminEmail) {
    // Addresses live in contacts/, not on the profile — see the note in
    // firestore.rules. The document id there is the uid, so one query
    // finds the account and the profile is a direct write.
    const matches = await db.collection("contacts").where("email", "==", adminEmail).get();
    if (matches.empty) {
      console.log(
        `\n  No account for ${adminEmail} yet. Sign in to the site once, then re-run:\n` +
          `    npm run seed -- --admin ${adminEmail}`,
      );
    } else {
      for (const match of matches.docs) {
        await db
          .doc(`profiles/${match.id}`)
          .set({ isAdmin: true, status: "approved", approvedAt: new Date() }, { merge: true });
      }
      console.log(`  ${adminEmail} is now an approved admin`);
    }
  } else {
    console.log("\n  No --admin given. Promote yourself with:");
    console.log("    npm run seed -- --admin you@example.com");
  }

  console.log("\nDone.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
