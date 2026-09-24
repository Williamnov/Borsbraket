# BörsBråket

A monthly stock-picking league for a group of friends.

Everyone picks up to five stocks at the start of the month. Nobody sees anyone else's picks until
the month locks. Prices are recorded weekly from there, and the month's return decides who takes the
points.

**[borsbraket.vercel.app](https://borsbraket.vercel.app)** — the site is public, the league is
invite-only. Anyone can sign in; an admin approves the account before it can see or do anything.

---

## How a month works

| | |
|---|---|
| **Five stocks** | Equal weight, one entry per ticker |
| **Picks lock** | A few days into the month. After that, nothing moves |
| **Sealed** | Other players' picks are not sent to your browser at all while the month is open |
| **Four checkpoints** | Prices weekly, measured from a baseline taken *at the lock* |
| **Points** | 10 / 7 / 5 / 4 / 3 / 2, then 1 for everyone else who submitted |

Measuring from the lock rather than the 1st is deliberate. If the baseline were the month's opening
price, whoever submitted last would have seen three days of trading and could pick something that
had already moved. Sealing and measuring at the same instant gives everyone one starting price.

**Where you can pick from:** every Nordic list — Large, Mid and Small Cap and First North in
Stockholm, Helsinki, Copenhagen and Reykjavík, Spotlight and NGM's two markets beside them, and Oslo
Børs with Euronext Expand and Growth — plus the main North American and UK markets, the large
continental European venues (Xetra, Paris, SIX, Amsterdam, Madrid, Milan), and Tokyo and Sydney.

The Nordic half of that is not maintained by hand. Each of those exchanges publishes its own current
listing, segment by segment, and `scripts/build-universe.mjs` takes it from them — so Mid Cap means
what Nasdaq says it means this year, and nothing is typed, matched or guessed at.

**Finding a stock** works two ways, and the difference is a read cost rather than a preference.
Choose a market and the picker loads that market, so the search box filters a list already in your
browser and matches anywhere in a name. Choose **All markets** and it loads nothing at all: what you
type goes to the server, which returns the handful of documents that match. That costs a few reads
per search instead of the whole universe per visit — which matters, because subscribing to the whole
`instruments` collection is the read that exhausted the daily quota once already. The trade is that
All markets matches the *beginning* of a name or ticker: "volvo" finds Volvo, "olvo" finds nothing.

The full rules live at `/instructions` in the running app.

## What's in it

- **League table** — season standings, compounded return, sortable on every column
- **The month** — your picks, who has submitted, live returns once the month locks
- **History** — every settled month, each holding, and a record book
- **Message board** — rate-limited, and a posted message can never be edited, by anyone
- **Player pages** — a profile and a season history for everyone in the league
- **Admin** — approvals, opening and settling months, the price grid, the instrument universe

## Built with

Next.js on Vercel, with Firebase Auth and Firestore behind it. TypeScript throughout. Prices are
fetched on a schedule and can always be entered by hand.

[`firestore.rules`](firestore.rules) is the access-control system — not the interface. The picks
seal, the approval gate, the rate limit on the board and the split that keeps email addresses off
public profiles are all enforced there, and the rules are tested against the Firestore emulator on
every push.

## Running it yourself

```bash
cp env.example .env.local   # fill in your Firebase project's values
npm install
npm run seed                # markets, instruments, league settings
npm run dev                 # http://localhost:3000
```

`env.example` explains which values are public and which are secret. [SETUP.md](SETUP.md) has the
full walkthrough — Firebase project, security rules, Vercel, and the price feed.

```bash
npm run typecheck    # tsc --noEmit
npm test             # the scoring functions
npm run test:rules   # firestore.rules against the emulator
npm run build
```

Refreshing the Nordic universe — worth doing when the exchanges reshuffle their segments, which
Nasdaq does once a year:

```bash
npm run universe                           # ask the exchanges, report, change nothing
npm run universe -- --write                # rewrite lib/universe.generated.ts
npm run seed                               # and put it in Firestore
npm run seed -- --retire                   # ...including retiring what is no longer listed
```

Read the report before writing. It names what moved between segments, what was renamed and what has
stopped being listed anywhere, which is the part worth a second of attention: a seed only ever adds,
so a company that changes segment leaves a document behind under the segment it left.

## A note on secrets

This repository is public, and deliberately contains nothing that needs to be private.

The `NEXT_PUBLIC_FIREBASE_*` values are safe to publish: a Firebase web API key identifies a project
and grants nothing on its own. What anyone may read or write is decided server-side by
[`firestore.rules`](firestore.rules).

The real secrets — the service account and the cron token — live in Vercel's environment variables
and in a git-ignored `.env.local`. No player data is in this repository: addresses, picks, messages
and results exist only in Firestore, and an unapproved account cannot read a single profile but its
own.

---

*Picking this up after a break? [STATUS.md](STATUS.md) has the current state and the open questions.*
