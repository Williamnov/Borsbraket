# Status

Where the project stands, so you can pick it up without re-reading anything.

Last updated: 2026-09-23

## State

Deployed and running. CI builds it, typechecks it and runs both test suites on every push, and
`scripts/smoke.mjs` checks the deployed URL after each deploy — which, as of today, it genuinely
does; see the note in Known gaps about the four days it spent grading Vercel's login page.

**The universe is 3,818 instruments across 30 markets as of today, and none of it is in Firestore.**
That is the whole reason the pick editor still looks empty: the instruments live in Firestore, not in
the code, and nothing reaches the site until somebody runs `npm run seed`. Steps 1 and 2 below, in
that order.

The lists are generated from each exchange's own — Nasdaq's Nordic screener, Nasdaq's US screener,
JPX's company master, NGM's and Spotlight's market APIs, index constituent tables for the rest — so
nothing in them is a guess about what is listed, and everything in them is a guess about what Yahoo
calls it. None of it has been checked against the price feed yet.

The faults found so far, all worth knowing about because every one of them failed in a way that
looked like success:

- **The CSP blanked the site.** A nonce-based policy compiled, built, deployed and served 200s with
  every inline script blocked. Every page here is prerendered, and Next only stamps nonces onto
  pages it renders per request, so the HTML went out with no nonce while the middleware attached a
  fresh one to each response. React booted with no hydration payload and cleared the DOM. The
  policy no longer uses a nonce and ships report-only; `scripts/smoke.mjs` asserts the header and
  the HTML agree so it cannot recur unnoticed.
- **The Firestore free quota ran out.** 54,786 reads in a day against a 50,000 limit, from one
  person clicking around: `useLeagueBase` subscribed to five collections including ~300 instruments,
  and six pages each called it, so every navigation re-read the lot. Now one shared provider, a
  persistent on-disk cache, and the expensive half loaded only by pages that ask.
- **The rules were never deployed.** The live ruleset predated the chat entirely, so `chat/`,
  `rateLimits/` and `contacts/` fell to the catch-all deny. The chat showed a permission error; the
  admin panel's address list was broken silently.
- **The price feed could never have worked.** Twelve Data's free tier is US-only; the README said it
  covered the Nordics. The workflow had been exiting green for days without making a single call,
  because its secrets were never set — so the thing that would have exposed it was the one step
  nobody had taken. Now Yahoo, which covers every market in the universe.
- **The post-deploy smoke check had never run.** It pointed at Vercel's per-deployment URL, which is
  behind Deployment Protection, so it followed a 302 to `vercel.com/login` and graded that: 200, no
  markup, failing every deploy. A check that is always red is one nobody reads, and this was the
  check standing between a green build and the blank white page above. It now checks the public
  alias and refuses outright to grade a page it was redirected away from.
- **The login page went blank without localStorage.** It read the remembered sign-in address inside
  an effect with no guard, and in a private window the getter throws rather than returning null — so
  the exception took down the one page a player who cannot get in has to be able to use. Every other
  storage access in the app was already wrapped; this was the one that was missed.

## Next steps, in order

1. **Run the Verify universe workflow**, from the Actions tab, before seeding. The universe went
   from 403 instruments to 3,818 and **not one of them has been checked against the price feed** —
   the machine that built it was answered `HTTP 429` by Yahoo on every single request, for the whole
   session, so the check the old list was held to could not be run. The names come from each
   exchange's own lists, so they are right about what is listed; whether Yahoo spells them the same
   way is the open question, and this is what answers it. No secrets, about a quarter of an hour,
   and it prints every symbol it could not price.

   It also settles the other thing a laptop could never test: whether a GitHub runner's shared
   address is already in Yahoo's bad books. It makes a couple of hundred requests from one.

2. **`npm run seed`** — 3,818 instruments across 30 markets are in the code and not in Firestore.
   **This is the step that makes any of it appear in the pick editor.** Worth reading the Verify
   report first and deleting anything it could not price.

   **Then retire twelve documents by hand, once.** The instrument id is `marketCode_SYMBOL`, and
   seeding is a merge that only ever adds — so a name that changed segment or exchange gets a new
   document while its old one stays behind, still eligible, and the same company appears twice in
   the pick editor. Exactly twelve are in that state, and they are the whole list:

   - Moved segment — the old list had Iceland's Mid Cap filed under Large Cap. All seven are in
     `IS_MID` now: `IS_LARGE_BRIM`, `IS_LARGE_EIM`, `IS_LARGE_FESTI`, `IS_LARGE_HAGA`,
     `IS_LARGE_ICEAIR`, `IS_LARGE_KVIKA`, `IS_LARGE_SJOVA`.
   - Moved exchange: `US_NYSE_WMT` and `US_NYSE_SHOP` are in `US_NASDAQ` now, and `UK_LSE_FERG` is
     in `US_NYSE`.
   - Gone: `IS_LARGE_SIMINN`, which Nasdaq Iceland no longer lists, and `US_NASDAQ_EA`, which is
     absent from Nasdaq's screener — Electronic Arts was taken private.

   Set `eligible: false` on each from the admin panel after seeding. Nothing else moved: every
   Swedish, Finnish and Danish name in the old list is still in the segment it was filed under.

3. **Two GitHub repository secrets** to switch the price feed on: `SITE_URL` and `CRON_SECRET` (the
   same value as Vercel's). Until they exist the workflow exits green and says so. The price source
   needs no key — see the Twelve Data note below for why it is no longer three secrets.

   Then **run the Prices workflow by hand once** and read the log. A clean run prints a price per
   symbol; a throttled one prints `HTTP 429` and stops on the first batch, on purpose. If it is
   throttled, nothing is broken — prices go in by hand from the admin grid, as they do today — but
   the feed needs a different source and that is worth knowing before a month is riding on it.

4. **Turn the CSP to enforcing.** Sign in, post a message, upload a photo, then check the Vercel
   logs for `[csp]` lines. If clean, set `CSP_ENFORCE=1`.

5. **App Check**, if you want it: set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`, watch the console's
   metrics until tokens are arriving, *then* enable enforcement. That order matters — enforcing
   first locks every player out.

## What this costs to run: nothing, and here is the whole list

A standing constraint, so check it before adding a dependency. Every outbound call the deployed site
or any workflow makes, and what each one is billed at:

| Where | What | Cost |
| --- | --- | --- |
| `query1.finance.yahoo.com` | prices, and `scripts/verify-universe.ts` | no key, no account, free |
| Firebase Auth, Firestore | everything | Spark plan — **no billing account, so it cannot charge**; exceeding the daily quota stops reads until midnight rather than costing money |
| `recaptcha.net`, `firebaseappcheck.googleapis.com` | App Check | dormant until a site key is set, and free below 10k assessments a month |
| Vercel | hosting and one daily cron | Hobby, free (Hobby allows two crons; one is used) |
| GitHub Actions | CI, smoke, prices, verify | the repository is **public**, so runner minutes are unmetered |

There is no LLM, AI or paid API anywhere in the app. `PRICE_API_KEY` in `env.example` belongs to the
unimplemented `http` provider template in `lib/prices/index.ts`; the default is `manual` and nothing
reads it.

The scrapers that built the universe — Nasdaq's screeners, JPX's company master, index constituent
tables — ran once, on a laptop, and are not in the repository and not on any schedule. The app never
calls them.

The one budget that is real and not denominated in money is Yahoo's patience with an address. The
weekly price job and the verify job share the GitHub runners, which is why verify is manual, batched
twenty symbols to a request, and stops the moment it is refused.

## Open decisions

- **Cloud Storage for profile pictures is not available.** The project is on the Spark plan and
  Firebase now requires a billing account to provision a bucket. Pictures are therefore data URLs on
  the profile document, written at 192px, which every reader of the league table downloads. Upgrading
  to Blaze is what unblocks it — and would also lift the daily read cap. In practice this is cheaper
  than it sounds: a 192px JPEG lands around 10 KB, so the 200 KB ceiling in the rules is a guard
  rail and not the going rate, and the whole league's pictures are a few hundred kilobytes.
- **Three markets are empty, and only one of them for want of data.** Market caps are still all
  null.

  NGM PepMarket is a private-placement platform rather than a quoted market — NGM's equity API
  reports two segments and that is not one of them — and Spotlight Denmark has no instruments at
  all, since every id Spotlight's search returns is on XSAT, its Swedish market. Both are arguably
  correct as empty, and both can be closed from the admin panel.

  **Euronext Expand and Euronext Growth in Oslo** are the ones that are empty because the data could
  not be got. Euronext's listing endpoint answers with the right row count and every field blank
  unless the request carries a browser session, and the CSV download redirects to an antibot page.
  Those names go in from the admin panel.

  Spotlight and NGM were on this list too, until they were looked at a second time — the first
  attempt failed on a missing browser user-agent (NGM answers 406 without one) and a missing
  `/Umbraco` path segment on Spotlight's search, both of which read exactly like "this venue
  publishes nothing". They are worth 236 instruments between them.

  **Modular Finance's own Holdings and Dataflow cover all of these venues**, and would replace the
  whole scraped arrangement with one authoritative source including the market caps. The MCP
  connectors for it need an authorisation this session could not perform. That is still the right
  answer for Oslo, and for the market caps.
- **`w0` changed meaning.** It is now the price at the lock, not the price at the start of the
  month — measuring from the 1st handed whoever submitted last three days of hindsight. Any prices
  recorded before this change still carry the old meaning. There were no settled months at the time,
  so this is likely moot, but it is the one thing that would quietly corrupt a comparison.

## Known gaps

- **`useRoundBundles` still recomputes settled months** on the league, history and profile pages.
  A per-round summary document written once at settle time would collapse it properly, and that is
  still the right end state — but it is a lower priority than it reads. A settled round's picks and
  prices never change again, so the cache-first read means a device pays for each settled month
  exactly once, ever; the saving is only on a cold cache. Weigh that against the risk, which is
  that this is the scoring read path and a wrong summary is a wrong scoreboard, silently. With no
  settled month in the database there is nothing to check a summary against yet, so the honest order
  is: settle a month, then build it, then verify the two agree before the recomputation is removed.
- **The universe is 3,818 instruments now, not the 403 it was**, and that is nine times the number
  that blew the read quota. Worth knowing exactly where that lands before it surprises anyone:

  - **The daily price job no longer reads it.** It used to fetch the whole instruments collection to
    resolve a few dozen symbols, which at this size would have been several thousand reads a day for
    nothing. It now reads the picks, queries the two benchmarks, and fetches the held instruments by
    id. That is the one place the growth would have cost something every day, and it is fixed.
  - **`/month` and the admin panel still read all of it, once per device.** Both genuinely need the
    whole list — one to pick from, one to edit. It is `onSnapshot` over a persistent cache, so a
    device pays the 3,818 once and then only for what changed; the exposure is a cold cache, and
    around thirteen of those in a day would reach the free tier's 50,000.
  - **`/history`, `/league` and the profile pages read none of it.** They query `isBenchmark`, and
    the picks carry their own symbols and names.

  If it does start biting, the fix is to load the universe one market at a time rather than whole —
  `PickEditor` already filters by market and nothing else needs more than that.
- **The benchmarks are probably not priceable, and never have been.** `OMXS30` and `SPX` go through
  the same symbol mapping as everything else and come out as `OMXS30.ST` and `SPX`, where Yahoo
  calls those indices `^OMX` and `^GSPC`. Every price run includes the benchmarks, so if this is
  right, every run has two unpriced symbols and exits red — which nobody has seen, because the
  Prices workflow has never run with its secrets set. The fix is a few lines in
  `scripts/yahoo-symbol.mjs`, but it is a guess until the feed confirms the spelling, and a wrong
  guess here is worse than a gap. **The Verify universe workflow checks both benchmarks
  individually, by design** — run it and the log says which spelling is wanted.
- **Tests cover the rules and the scoring.** `tests/rules` exercises the picks seal, the chat rate
  limit, the profile/contacts split and the legacy-handle path; `tests/unit` covers compounding,
  equal weighting, the sort tie-breaks and the checkpoint model. There is no test of the pages or
  the price route.
- **The price job's failure is visible; a Vercel cron's absence still is not.** A failed GitHub
  Action emails you, which is why the fetching moved there. The daily Vercel cron remains as a
  backstop and nothing notices if it stops. The **Price runs** panel in the admin page is where a
  missed week shows up: no row for a week, or `awaiting` above zero, is what one looks like.
## Things worth not re-litigating

- Firebase, not Supabase. An earlier Supabase implementation was removed.
- The Firebase web config in `NEXT_PUBLIC_FIREBASE_*` is public by design and safe in this repo.
  [`firestore.rules`](firestore.rules) is the actual access control — review that file, not the
  API key.
- Picks are sealed until the month locks at the database level, not in the interface. That is why
  the app reads only your own picks document while a round is open: listing the collection is
  refused by the rules, deliberately.
- The CSP carries no nonce, and that is not an oversight. See the note at the top of
  [`middleware.ts`](middleware.ts) before adding one back.
- Prices are fetched from GitHub Actions rather than a Vercel cron, because a failed workflow emails
  you and a Vercel cron that stops running tells nobody.
- **Twelve Data cannot price this league.** Its free tier is US equities, forex and crypto; every
  international exchange starts at a paid plan. The same demo key that prices `AAPL` returns a 401
  for `ERIC.B` on `XSTO`. The README claimed the opposite for a while. Nothing was scored on it —
  the secrets were never set, so the workflow had been exiting green without making a call.
- Stooq is not a usable free price source either. It gates every endpoint behind a JavaScript
  proof-of-work challenge.
- **Yahoo throttles by address**, and hard. Twenty-two symbols at a seventh of a second apart got
  all but one of them a 429, from a domestic connection — a shared runner IP will be worse. That is
  why the fetcher batches through `spark` at twenty symbols a request: a month's whole universe is
  three or four calls a day. Do not "simplify" it back to one request per symbol.
