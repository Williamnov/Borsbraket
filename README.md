# BörsBråket

A monthly stock-picking league. Everyone picks up to five stocks at the start of the month,
prices are recorded once a week, and the month's return decides who takes the points.

Next.js on Vercel, Firebase Auth and Firestore behind it. The site is public; the league is
invite-only — anyone can sign in, but an admin has to approve the account before it can see or do
anything.

## The rules, briefly

- **Five stocks a month**, equal weight, one entry per ticker.
- **Picks lock** a few days into the month. After that, nothing moves.
- **Sealed until the lock** — other players' picks are not sent to your browser at all while the
  month is open. That is enforced in `firestore.rules`, not hidden in the interface.
- **Prices four times a month**, once a week, measured from a baseline taken *at the lock* —
  not at the start of the month. Measuring from the 1st would hand whoever submits last three
  days of hindsight; sealing and measuring at the same instant gives everyone one starting price.
- **Points**: 10 / 7 / 5 / 4 / 3 / 2, then 1 for everyone else who submitted.
- **Eligible markets**: 30 of them, holding 3,584 instruments — every Nordic list from Large Cap
  down to First North (Sweden, Finland, Denmark, Norway, Iceland), the main North American and UK
  markets, the large continental European venues (Xetra, Paris, SIX, Amsterdam, Madrid, Milan) and
  Tokyo and Sydney. Any of them can be closed from the admin panel.
- **No penny stocks.** Only instruments an admin has marked eligible can be picked, and that is
  checked when picks are saved. The filter is company size, not share price.

The full version lives at `/instructions` in the running app.

Picking this up after a break? [STATUS.md](STATUS.md) has the current state, the next step, and the
open decisions.

## Setting it up

### 1. Firebase

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Firestore Database → Create database** (production mode).
3. **Build → Authentication → Get started**, then enable the sign-in methods:
   - **Email/Password** → also switch on *Email link (passwordless sign-in)*
   - **Google** (optional but the smoothest option)
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

### 2. Environment

```bash
cp env.example .env.local
```

Fill it in. `env.example` explains which values are public and which are secret.

### 3. Seed the universe and make yourself admin

```bash
npm install
npm run seed
```

That writes the 30 markets, the 3,584 instruments and the league settings. Every write is a merge on
a stable document id, so it is safe to run again — but note that it only ever adds and updates.
Nothing in it deletes, so an instrument that has left the exchange, or moved between the Large and
Mid Cap segments, keeps its old document and stays pickable until someone marks it ineligible in the
admin panel.

Then start the app, sign in once so your account exists, and promote it:

```bash
npm run dev
# sign in at http://localhost:3000/login, then:
npm run seed -- --admin you@example.com
```

Your email is passed on the command line rather than stored in the repo.

### 4. Vercel

1. Import the repository at <https://vercel.com/new>.
2. Add every variable from `.env.local` under **Settings → Environment Variables**. For
   `FIREBASE_PRIVATE_KEY`, paste the whole quoted string including the `\n` sequences.
3. Deploy.
4. `vercel.json` registers a **daily** cron at 06:00 UTC, which is within Hobby's limits. It is a
   backstop: the real price job runs in GitHub Actions (see **Prices**). Daily rather than
   weekly because what gets recorded is decided by the round's clock, and the lock is rarely a
   Monday.
5. Go back to Firebase and add the deployed domain to **Authorized domains**.

## Running a month

From the **Admin** page:

1. **Open next month** — creates the round with sensible dates (opens on the 1st, locks on the 4th).
2. Players submit picks before the lock.
3. The **baseline** is recorded automatically on the first run at or after the lock. Each column
   in the price grid carries the date it is due, so entering one by hand means the same thing
   the job means by it.
4. Each week, fill in anything the feed could not price — type into the grid or paste a block of
   `TICKER price` lines into the chosen week.
5. **Settle month** at the end. Points are awarded and the month moves to History.

Missing prices are left out of the average rather than counted as zero, and the table marks a
portfolio as partly priced until they arrive.

## Prices

Prices come from Yahoo's chart and spark endpoints, which cover every market in the universe above
— all five Nordic exchanges included, which is the part most free feeds do not. No key and no plan.

**Twelve Data was the first choice and could not do it.** Its free tier covers US equities, forex
and crypto; every international exchange, which is to say every Nordic list and the whole premise of
this league, starts at a paid plan. The same demo key that prices `AAPL` returns a 401 for `ERIC.B`
on `XSTO`. Nothing was ever scored on it — the secrets were never set, so the workflow had been
exiting green without making a single call.

What Yahoo costs instead is a guarantee. It is an undocumented endpoint that can change shape
without warning and has nobody to ask. Three things make that survivable: a failed run emails you, a
missed checkpoint is reported rather than backfilled with a wrong number, and the admin grid takes
prices by hand at any time.

**The job runs in GitHub Actions, not on Vercel**, for the alert. A failed workflow emails you,
which is what a job whose failure mode is silence badly needs; a Vercel cron that stops running
tells nobody. It also keeps the Firebase key in Vercel and nothing sensitive in GitHub.

Yahoo throttles by address, and a GitHub runner is a shared datacentre IP that plenty of other
people are also pointing at Yahoo. So the fetcher batches: `spark` takes twenty symbols per request,
which turns a month's whole universe into three or four calls a day rather than seventy. Anything a
batch could not price is then asked for one at a time through `chart`, which also reports the
currency — the one cross-check available, since a document whose currency disagrees with its
exchange is a seeding mistake worth catching.

Set two repository secrets to switch it on: `SITE_URL` and `CRON_SECRET` (the same value as
Vercel's). Until they exist the workflow exits green and says so, and prices are typed into the
admin panel as before.

Then run the workflow by hand once and read the log, because there is one thing a laptop cannot
test: whether a runner's shared address is already throttled. A clean run prints a price per symbol.
A throttled one prints `HTTP 429` and stops on the first batch rather than retrying seventy times,
which is deliberate — being refused is about the address, not the symbol, and hammering it is how a
soft limit becomes a hard one.

The split keeps the decisions in one place. `GET /api/cron/weekly-prices?plan=1` says what is
needed, `POST` takes prices someone else fetched, and the script in
[`scripts/fetch-prices.mjs`](scripts/fetch-prices.mjs) is deliberately ignorant: it is handed symbols
with their market codes and hands back numbers. Which checkpoint a price belongs to, and whether it
may be written at all, is decided by the route — and a quote for something the run did not ask for is
dropped, so a replayed request cannot rewrite a checkpoint that is already final.

The plan asks for what is held, not for everything. It reads the month's picks, queries the two
benchmarks, and fetches those instruments by id — it does **not** read the instruments collection.
At four hundred names that distinction was academic; at three and a half thousand it is a few
thousand reads a day, every day, against a fifty thousand read quota this project has already
exhausted once.

## The universe

Nothing in [`lib/universe.instruments.ts`](lib/universe.instruments.ts) is typed out by hand. Each
market is generated from a source that is accountable for the list: Nasdaq's own Nordic screener
(which is where the Large, Mid, Small and First North segments come from — the exchange's
classification, not a guess at it), Nasdaq's US screener with its market caps, JPX's listed-company
master with its TOPIX size classes, and index constituent tables for the rest. The scripts that did
it are in [`scripts/build-universe/`](scripts/build-universe/README.md), along with the size floors,
what is regenerated versus merged, and why Euronext is not among the sources.

That makes it right about what is listed and says nothing about what the price feed calls it, which
is the part that matters on the Monday somebody's pick needs a number. A name nobody can price is
worse than a name nobody can pick: it looks fine in the pick editor, it looks fine at submission,
and it becomes a gap halfway through a month.

So [`scripts/verify-universe.ts`](scripts/verify-universe.ts) asks the feed about every symbol,
using the same mapping the fetcher uses — from the same module, [`scripts/yahoo-symbol.mjs`](scripts/yahoo-symbol.mjs),
because a second copy of that mapping would have had the checker answering the question about
itself. Run it from the **Verify universe** workflow in the Actions tab after changing the universe.
It needs no secrets and takes about a quarter of an hour.

It costs nothing in money — the feed needs no key and the runner minutes are free on a public
repository — but it does spend the goodwill of an address the weekly price job depends on. Hence the
shape: twenty symbols per request for the whole universe, then a closer look only at what that could
not resolve, plus a sample of each market to catch a suffix aimed at the wrong exchange. `--deep`
checks all of them individually and takes two hours.

Seven markets are deliberately empty — Spotlight, NGM, NGM PepMarket, Nordic SME, Spotlight Denmark
and the two Euronext Growth/Expand lists in Oslo. None of those venues publishes a list this could
read. Add those names from the admin panel; the markets exist so they have somewhere to go.

Translating a market code into whatever a particular feed calls that exchange lives in the fetcher,
beside the feed, because each one spells it differently: Twelve Data wanted an ISO 10383 MIC, Yahoo
wants a suffix on the ticker. What the app hands out is the market code, which is its own fact rather
than any vendor's.

Stooq was the other obvious free alternative and is not usable: it now gates every endpoint behind a
JavaScript proof-of-work challenge.

## Data model

```
profiles/{uid}                          status, isAdmin, handle, alias, description, icon, photoUrl, chatReadAt
contacts/{uid}                          the sign-in address — owner and admins only
rateLimits/{uid}                        how fast one player may post; written with each message
chat/{messageId}                        the message board — uid, body, parentId, createdAt
markets/{code}                          the pickable lists
instruments/{marketCode_SYMBOL}         symbol, name, currency, eligible, isBenchmark
settings/league                         league-wide settings
rounds/{YYYY-MM}                        dates, picksPerRound, status, announcedOpen/Lock
rounds/{YYYY-MM}/picks/{uid}            picks keyed by instrument id — sealed until the lock
rounds/{YYYY-MM}/submissions/{uid}      that you picked and how many, never what
rounds/{YYYY-MM}/prices/{instrumentId}  w0 (baseline, at the lock) plus w1-w4 weekly checkpoints
priceRuns/{id}                          one row per cron run, so a missed week is visible
```

## Security

The repository is public, so the split matters:

- **Public by design**: the `NEXT_PUBLIC_FIREBASE_*` config. A Firebase web API key identifies a
  project and grants nothing on its own — access is decided server-side by
  [`firestore.rules`](firestore.rules). Review that file, not the API key.
- **Real secrets**: `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` and `CRON_SECRET`. These live in
  Vercel's environment variables and in `.env.local`, both of which are git-ignored. The service
  account bypasses all rules and is used by exactly two callers: the price route and the seed
  script.
- `.gitignore` blocks `.env*`, keys and certificates, cloud credentials, database dumps and CSV
  exports. Add to it before committing anything new.
- No player data is in the repository. Emails, picks, messages and results live only in Firestore.
- **Email addresses are not on the profile.** Every approved player reads every profile document, so
  anything stored there is league-wide public. The address lives in `contacts/{uid}`, which the rules
  open to its owner and to admins and to nobody else; the profile keeps `handle`, the part before the
  `@`, which is what the table falls back to when a player has not set a display name. The rules
  refuse a handle containing an `@`.
- **The board is rate-limited** at ten seconds between messages and sixty an hour, per player.
  Firestore rules cannot count documents, so the counter is a document: a message is only accepted
  as part of a transaction that also stamps `rateLimits/{uid}`, and the rules on that row are what
  set the pace. Admins get read and delete on that row but **not** write: a blanket write let an
  admin stamp their own counter and post as fast as they liked, because the chat rule checks that the
  counter was written, not that it was written honestly.
- **A Content-Security-Policy** is set in [`middleware.ts`](middleware.ts), currently **report-only**
  — violations post to `/api/csp-report` and land in the Vercel logs. Set `CSP_ENFORCE=1` once a full
  session produces none. It carries no nonce, deliberately: every page here is prerendered, and Next
  only stamps nonces onto pages it renders per request, so a nonce-based policy blocked every inline
  script and served a blank white page with a green build. `script-src` therefore allows inline
  scripts and the policy is honest about being weaker than it looks. `scripts/smoke.mjs` asserts the
  header and the HTML still agree, so that particular outage cannot recur unnoticed.
- **App Check** is wired up but dormant until `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` is set. See
  `env.example` for the rollout order — enforcing before tokens are arriving locks everyone out.
- **Profile pictures** are cropped and resized in the browser and stored as data URLs on the profile
  document, not in Cloud Storage — which on the free plan is not an option at all, since Firebase now
  requires a billing account to provision a bucket. It keeps one access-control story instead of two,
  but it also means every approved player downloads every other player's picture with the league
  table. They are written at 192px, and the rules cap each one at 200 KB. Nothing is public: an unapproved account cannot read a single profile but its own.
- **The message board** is readable and writable only by approved players. Messages cannot be
  edited after posting — by anyone, including admins — so a thread cannot be rewritten underneath
  the replies. Authors and admins can delete.
- **The admin panel** is hidden from the navigation, redirects non-admins, and — the part that
  matters — is backed by `isAdmin()` on every admin write in the rules. The first two are
  convenience; the third is the control.

If a service account key ever leaks, revoke it in **Firebase console → Project settings → Service
accounts** and generate a new one; nothing in this repository needs changing.

## Development

```bash
npm run dev         # http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run seed        # markets, instruments, settings
npm test            # the scoring functions — no emulator, no network
npm run test:rules  # firestore.rules against the emulator
npm run smoke       # check a deployed URL actually renders
npm run verify      # ask the price feed about every instrument
```

`verify` talks to a feed that throttles by address and that the weekly price job also depends on, so
prefer running it from the **Verify universe** workflow rather than from a laptop sharing an office
address. `npm run verify -- --market SE_FN` checks one market.

### The rules tests

`npm run test:rules` starts the Firestore emulator, runs
[`tests/rules`](tests/rules) against `firestore.rules` verbatim, and shuts it down again. The
emulator needs a Java runtime (`java -version` should work); `firebase-tools` downloads the rest by
itself on the first run.

Most of what they cover is the seal on the picks, because that is the one place where a rules bug is
both silent and permanent — nobody gets an error when a pick leaks, and a pick that has been seen
cannot be unseen.
