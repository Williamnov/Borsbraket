/**
 * Throws away a month's picks and opens it again on new dates.
 *
 * For the case where a round has to start over: picks were made against
 * the wrong schedule, or the month was opened before anyone was ready to
 * play it. It deletes every pick and submission marker for the round,
 * deletes the weekly prices with them, and rewrites the dates so picking
 * is open again.
 *
 *   npx tsx scripts/restart-round.ts 2026-10 --locks 2026-10-14T22:00Z --ends 2026-10-26
 *   npx tsx scripts/restart-round.ts 2026-10 ... --yes
 *
 * It prints what it would do and changes nothing until `--yes`, because
 * the picks it deletes cannot be recovered and nobody can tell you what
 * they were — they are sealed from everyone but their owner until the
 * lock.
 *
 * The prices go too, and that is the point rather than tidiness. `w0` is
 * the price at the lock, so a round that locks again on a new date has a
 * new baseline; leaving the old checkpoints in place would score the new
 * picks from the old month's opening price.
 *
 * ── Why this is a script and not a button ─────────────────────────────
 *
 * The admin panel can already move a round's dates — that half is
 * `Use the standard schedule` and `Save round`. What it deliberately
 * cannot do is delete somebody's picks, and a one-click way to wipe the
 * league's holdings sitting next to the date fields is a worse thing to
 * own than a command that has to be typed twice.
 *
 * Reads credentials from .env.local and writes with the Admin SDK, so it
 * bypasses firestore.rules exactly as the seed does.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Query } from "firebase-admin/firestore";
import { monthLabel } from "../lib/format";

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

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

async function emptyCollection(query: Query, apply: boolean): Promise<number> {
  const snapshot = await query.get();
  if (apply && snapshot.size > 0) {
    for (let start = 0; start < snapshot.size; start += 400) {
      const batch = db.batch();
      for (const doc of snapshot.docs.slice(start, start + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
  }
  return snapshot.size;
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id || !/^\d{4}-\d{2}$/.test(id)) {
    console.error("Usage: npx tsx scripts/restart-round.ts <YYYY-MM> --locks <ISO> --ends <YYYY-MM-DD> [--yes]");
    process.exit(1);
  }

  const apply = process.argv.includes("--yes");
  const ref = db.doc(`rounds/${id}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    console.error(`No round ${id}. Open it from the admin panel first.`);
    process.exit(1);
  }
  const round = snapshot.data() ?? {};

  if (round.status === "settled") {
    console.error(
      `${monthLabel(id)} is settled — its points are already in the season table.\n` +
        "Reopen it from the admin panel first if you really mean to restart it.",
    );
    process.exit(1);
  }

  const locksArg = flag("locks");
  const endsArg = flag("ends");
  if (!locksArg || !endsArg) {
    console.error("Both --locks <ISO datetime> and --ends <YYYY-MM-DD> are required.");
    process.exit(1);
  }
  const locks = new Date(locksArg);
  if (Number.isNaN(locks.getTime())) {
    console.error(`--locks is not a date I can read: ${locksArg}`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endsArg)) {
    console.error(`--ends wants a plain date, as YYYY-MM-DD: ${endsArg}`);
    process.exit(1);
  }

  // The lock is the baseline, so it is also the first day of the scoring
  // window — the same rule `defaultRoundShape` follows.
  const startsOn = locks.toISOString().slice(0, 10);
  const now = new Date();

  console.log(`${apply ? "Restarting" : "Would restart"} ${monthLabel(id)}:\n`);
  console.log(`  picks close  ${round.locksAt?.toDate?.().toISOString() ?? "?"}  →  ${locks.toISOString()}`);
  console.log(`  first day    ${round.startsOn ?? "?"}  →  ${startsOn}`);
  console.log(`  last day     ${round.endsOn ?? "?"}  →  ${endsArg}`);
  if (locks <= now) {
    console.log("\n  Note: that lock time is in the past, so the round reopens already sealed.");
  }
  console.log("");

  const picks = await emptyCollection(ref.collection("picks"), apply);
  const submissions = await emptyCollection(ref.collection("submissions"), apply);
  const prices = await emptyCollection(ref.collection("prices"), apply);
  console.log(`  ${apply ? "deleted" : "would delete"} ${picks} pick document(s)`);
  console.log(`  ${apply ? "deleted" : "would delete"} ${submissions} submission marker(s)`);
  console.log(`  ${apply ? "deleted" : "would delete"} ${prices} weekly price document(s)`);

  if (!apply) {
    console.log("\nNothing was changed. Add --yes to go ahead.");
    return;
  }

  await ref.set(
    {
      opensAt: Timestamp.fromDate(now),
      locksAt: Timestamp.fromDate(locks),
      startsOn,
      endsOn: endsArg,
      status: "open",
      settledAt: null,
    },
    { merge: true },
  );

  console.log(`\n${monthLabel(id)} is open for picks again.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
