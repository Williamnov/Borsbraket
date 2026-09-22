# Setting it up

Everything needed to run your own BörsBråket, and the notes worth reading before changing how
prices or security work.

## 1. Firebase

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Firestore Database → Create database** (production mode).
3. **Build → Authentication → Get started**, then enable the sign-in methods:
   - **Email/Password** → also switch on *Email link (passwordless sign-in)*
   - **Google** (optional, but the smoothest option)
4. **Authentication → Settings → Authorized domains**: add your Vercel domain and any custom
   domain. `localhost` is there by default.
5. **Project settings → General → Your apps → Web app**: copy the config values.
6. **Project settings → Service accounts → Generate new private key**: this downloads a JSON file
   containing a real secret. Copy three values out of it and then delete the file — do not leave it
   in the project directory.

Deploy the security rules:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only firestore:rules
```

## 2. Environment

```bash
cp env.example .env.local
```

Fill it in. `env.example` explains which values are public and which are secret.

## 3. Seed the universe, and make yourself admin

```bash
npm install
npm run seed
```

That writes the markets, the instrument list and the league settings. Every write is a merge on a
stable document id, so it is safe to run again whenever `lib/universe.ts` changes.

Then start the app, sign in once so your account exists, and promote it:

```bash
npm run dev
# sign in at http://localhost:3000/login, then:
npm run seed -- --admin you@example.com
```

Your address is passed on the command line rather than stored in the repository.

## 4. Vercel

1. Import the repository at <https://vercel.com/new>.
2. Add every variable from `.env.local` under **Settings → Environment Variables**. For
   `FIREBASE_PRIVATE_KEY`, paste the whole quoted string including the `\n` sequences.
3. Deploy.
4. `vercel.json` registers a daily cron at 06:00 UTC, which is within Hobby's limits. It announces
   a month opening and sealing, and records that a run happened.
5. Go back to Firebase and add the deployed domain to **Authorized domains**.

## Running a month

From the **Admin** page:

1. **Open next month** — creates the round with sensible dates (opens on the 1st, locks on the 4th).
2. Players submit picks before the lock.
3. The **baseline** is recorded on the first run at or after the lock. Each column in the price grid
   carries the date it is due, so entering one by hand means the same thing the job means by it.
4. Each week, fill in anything the feed could not price — type into the grid, or paste a block of
   `TICKER price` lines into the chosen week.
5. **Settle month** at the end. Points are awarded and the month moves to History.

Missing prices are left out of the average rather than counted as zero, and the table marks a
portfolio as partly priced until they arrive.

## Prices

`scripts/fetch-prices.mjs` asks the app what it needs, looks those symbols up, and posts the numbers
back. Every decision about which checkpoint a price belongs to, and whether it may be written at
all, stays in the app — a quote for something the run did not ask for is dropped, so a replayed
request cannot rewrite a checkpoint that is already final.

It needs `SITE_URL` and `CRON_SECRET`, and nothing else. Without them it exits quietly and prices go
in by hand.

**It does not currently run from GitHub Actions.** The feed refuses requests from datacentre address
ranges, so runs from CI come back empty; see [STATUS.md](STATUS.md) for the evidence and the
options. Running the same script from an ordinary machine works, and the admin grid always works.

## How the data is arranged

```
profiles/{uid}                          status, isAdmin, handle, alias, description, icon, photo
contacts/{uid}                          the sign-in address — owner and admins only
rateLimits/{uid}                        how fast one player may post
chat/{messageId}                        the message board
markets/{code}                          the pickable lists
instruments/{marketCode_SYMBOL}         symbol, name, currency, eligible, isBenchmark
settings/league                         league-wide settings
rounds/{YYYY-MM}                        dates, picksPerRound, status
rounds/{YYYY-MM}/picks/{uid}            picks — sealed until the lock
rounds/{YYYY-MM}/submissions/{uid}      that you picked and how many, never what
rounds/{YYYY-MM}/prices/{instrumentId}  baseline plus four weekly checkpoints
priceRuns/{id}                          one row per run, so a missed week is visible
```

## Security

The repository is public, so the split matters.

**Public by design:** the `NEXT_PUBLIC_FIREBASE_*` config. A Firebase web API key identifies a
project and grants nothing on its own — access is decided server-side by
[`firestore.rules`](firestore.rules). Review that file, not the API key.

**Real secrets:** `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` and `CRON_SECRET`. These live in
Vercel's environment variables and in `.env.local`, both git-ignored. The service account bypasses
all rules and is used by exactly two callers: the price route and the seed script.

A few decisions worth knowing before changing them:

- **Picks are sealed at the database level, not in the interface.** While a round is open the app
  reads only your own picks document, because listing the collection is refused by the rules.
- **Email addresses are not on the profile.** Every approved player reads every profile document, so
  anything stored there is league-wide public. The address lives in `contacts/{uid}`, open to its
  owner and to admins. The profile keeps the part before the `@`, and the rules refuse a handle
  containing one.
- **The board is rate-limited** at ten seconds between messages and sixty an hour. Firestore rules
  cannot count documents, so the counter is a document: a message is only accepted as part of a
  transaction that also stamps it. Admins can delete that counter but not write it — a blanket write
  would let an admin stamp their own and post as fast as they liked.
- **Messages cannot be edited after posting**, by anyone, so a thread cannot be rewritten underneath
  the replies. Authors and admins can delete.
- **The admin panel** is hidden from the navigation and redirects non-admins, but the control is
  `isAdmin()` on every admin write in the rules. The first two are convenience.
- **A Content-Security-Policy** is set in [`middleware.ts`](middleware.ts), currently report-only.
  It carries no nonce, deliberately — read the note at the top of that file before adding one back.
- **Profile pictures** are resized in the browser to 192px and stored on the profile document, since
  Cloud Storage needs a billing account. The rules cap each one.

If a service account key ever leaks, revoke it in **Firebase console → Project settings → Service
accounts** and generate a new one. Nothing in this repository needs changing.

## Tests

```bash
npm test             # scoring — pure functions, no emulator, no network
npm run test:rules   # firestore.rules against the Firestore emulator
npm run smoke        # check a deployed URL actually renders
```

`npm run test:rules` needs a Java runtime (`java -version` should work); `firebase-tools` downloads
the rest itself on the first run. Most of what it covers is the seal on the picks, because that is
the one place where a rules bug is both silent and permanent — nobody gets an error when a pick
leaks, and a pick that has been seen cannot be unseen.
