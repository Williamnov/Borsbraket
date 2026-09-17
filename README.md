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
- **Prices four times a month**, once a week, measured against an opening price.
- **Points**: 10 / 7 / 5 / 4 / 3 / 2, then 1 for everyone else who submitted.
- **Eligible markets**: every Nordic list (Sweden, Finland, Denmark, Norway, Iceland), plus NYSE,
  Nasdaq, NYSE American, the Toronto Stock Exchange and the London main market.
- **No penny stocks.** Only instruments an admin has marked eligible can be picked, and that is
  checked when picks are saved. The filter is company size, not share price.

The full version lives at `/instructions` in the running app.

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

That writes the markets, the starting instrument list and the league settings. Then start the app,
sign in once so your account exists, and promote it:

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
4. `vercel.json` already registers the weekly cron (Mondays 06:00 UTC). Cron jobs need a Pro plan;
   on Hobby, trigger the same endpoint from any scheduler with an
   `Authorization: Bearer <CRON_SECRET>` header.
5. Go back to Firebase and add the deployed domain to **Authorized domains**.

## Running a month

From the **Admin** page:

1. **Open next month** — creates the round with sensible dates (opens on the 1st, locks on the 4th).
2. Players submit picks before the lock.
3. Enter the **opening price** for every held ticker in the weekly price grid, or let the cron do it.
4. Each week, fill in that week's column — type into the grid or paste a block of
   `TICKER price` lines into the chosen week.
5. **Settle month** at the end. Points are awarded and the month moves to History.

Missing prices are left out of the average rather than counted as zero, and the table marks a
portfolio as partly priced until they arrive.

## Prices

There is no price feed wired up. `PRICE_PROVIDER=manual` is the default: the weekly cron still
runs, still logs to the `priceRuns` collection, and still reports which tickers are waiting, but the
figures are typed into the admin panel.

To automate it, implement `httpProvider.fetchQuotes` in [`lib/prices/index.ts`](lib/prices/index.ts)
against whichever vendor you use, put the credentials in `PRICE_API_KEY` / `PRICE_API_BASE_URL`, and
set `PRICE_PROVIDER=http`. The interface is four lines; the reason it ships empty is that request
and response shapes differ per vendor, and a guessed shape fails silently at 06:00 on a Monday.

## Data model

```
profiles/{uid}                          status, isAdmin, alias, emoji, colour, motto
markets/{code}                          the pickable lists
instruments/{marketCode_SYMBOL}         symbol, name, currency, eligible, isBenchmark
settings/league                         league-wide settings
rounds/{YYYY-MM}                        dates, picksPerRound, status
rounds/{YYYY-MM}/picks/{uid}            picks keyed by instrument id — sealed until the lock
rounds/{YYYY-MM}/submissions/{uid}      that you picked and how many, never what
rounds/{YYYY-MM}/prices/{instrumentId}  w0 (opening) plus w1-w4 weekly checkpoints
priceRuns/{id}                          one row per cron run, so a missed week is visible
```

## Security

The repository is public, so the split matters:

- **Public by design**: the `NEXT_PUBLIC_FIREBASE_*` config. A Firebase web API key identifies a
  project and grants nothing on its own — access is decided server-side by
  [`firestore.rules`](firestore.rules). Review that file, not the API key.
- **Real secrets**: `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` and `CRON_SECRET`. These live in
  Vercel's environment variables and in `.env.local`, both of which are git-ignored. The service
  account bypasses all rules and is used by exactly two callers: the weekly cron and the seed
  script.
- `.gitignore` blocks `.env*`, keys and certificates, cloud credentials, database dumps and CSV
  exports. Add to it before committing anything new.
- No player data is in the repository. Emails, picks and results live only in Firestore.

If a service account key ever leaks, revoke it in **Firebase console → Project settings → Service
accounts** and generate a new one; nothing in this repository needs changing.

## Development

```bash
npm run dev         # http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run seed        # markets, instruments, settings
```
