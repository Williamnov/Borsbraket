# Status

Where the project stands, so you can pick it up without re-reading anything.

Last updated: 2026-09-24

## State

Deployed and running. CI builds it, typechecks it and runs both test suites on every push, and
`scripts/smoke.mjs` checks the deployed URL after each deploy — which, as of today, it genuinely
does; see the note in Known gaps about the four days it spent grading Vercel's login page.

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

1. **`npm run seed`**, and this time it matters more than usual. The universe in the code is a long
   way ahead of Firestore: **1,986 instruments across 37 markets**, of which 1,643 are the Nordic
   lists taken straight from the exchanges on 2026-09-24. Firestore has the 450 from 2026-09-22.
   Until the seed runs, every market that was empty stays empty and the pick editor says "No
   eligible stock in this market matches that" — nothing is broken, the instruments simply live in
   Firestore and the seed is what puts them there.

   Every write is a merge on a stable document id, so it is safe to repeat and it only ever adds.

   Then consider **`npm run seed -- --retire`**. Because a merge only adds, a company that has
   changed segment — Nasdaq reshuffles annually — leaves a document behind under the segment it
   left, still pickable, under a heading that is now wrong. The seed names every such instrument at
   the end of its run and changes nothing; `--retire` marks them ineligible, never deleting them,
   because settled picks point at them. Three are known already: `SE_MID_TOBII` (Tobii is Small Cap
   now), `NO_OSE_SCHA` (Schibsted A — the company is Vend Marketplaces now and the A/B classes are
   one line, `VEND`) and `IS_LARGE_SIMINN` (Síminn is not in Nasdaq Iceland's list at all any more).

   One thing the seed will not do is remove a market. Renaming one is covered — it rewrites the
   market document — but removing is the admin panel.

   The seed also writes `nameLower` on every instrument, which is what the picker's **All markets**
   search matches company names against. Until it runs, that option finds things by ticker and not
   by name — no error, just half the results. Choosing a named market is unaffected.
2. **Two GitHub repository secrets** to switch the price feed on: `SITE_URL` and `CRON_SECRET` (the
   same value as Vercel's). Until they exist the workflow exits green and says so. The price source
   needs no key — see the Twelve Data note below for why it is no longer three secrets.

   Then **run the Prices workflow by hand once** from the Actions tab and read the log. The one
   thing that could not be tested from a laptop is whether a GitHub runner's shared address is
   already in Yahoo's bad books. A clean run prints a price per symbol; a throttled one prints
   `HTTP 429` and stops on the first batch, on purpose. If it is throttled, nothing is broken —
   prices go in by hand from the admin grid, as they do today — but the feed needs a different
   source and that is worth knowing before a month is riding on it.
3. **Turn the CSP to enforcing.** Sign in, post a message, upload a photo, then check the Vercel
   logs for `[csp]` lines. If clean, set `CSP_ENFORCE=1`.
4. **App Check**, if you want it: set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`, watch the console's
   metrics until tokens are arriving, *then* enable enforcement. That order matters — enforcing
   first locks every player out.

## The Nordic universe comes from the exchanges now

Every Nordic market is generated by `scripts/build-universe.mjs`, which asks each venue for its own
current listing. 1,643 instruments across 22 markets, where there used to be four hand-typed large
cap lists and a set of Swedish segments matched by name:

| | before | now | |
| --- | --- | --- | --- |
| Stockholm | 56 typed + 709 matched | 979 | Nasdaq's screener, plus Spotlight and NGM |
| Helsinki | 13 | 194 | Large/Mid/Small and First North |
| Copenhagen | 14 | 144 | Large/Mid/Small and First North |
| Oslo | 17 | 294 | Børs, Expand and Growth |
| Reykjavík | 9 | 32 | Large/Mid/Small and First North |

Nothing there is matched, inferred or typed. Each row arrives from the venue that lists it, already
carrying the segment it is in and the ticker that venue quotes it under, which also retired the
whole category of problem that `resolve-tickers.mjs` existed for: 57 Swedish names it could not
match or could not choose a share class for, and the judgement calls behind Large/Mid/Small when the
exchange publishes the real segmentation. That script and the `scripts/data/SE_*.txt` lists behind
it are gone.

Three of the four sources look unreachable until one detail is right, and this is the second time
that has cost a market on this project, so they are written down beside the fetch that needs them:

- **NGM** answers `406` to any request without a browser user-agent — every path, not just the API.
- **Spotlight** publishes no list at all, only a search box under `/Umbraco/`; without that path
  segment the domain still answers `200`, from its own 404 page. The script asks it for each letter
  and digit and unions the answers.
- **Euronext's** generic `/pd/data/stocks` endpoint returns the right row count and every field
  blank, which is why Oslo was once written off and filled from the OBX index instead. Each market
  page names its own working route in a `jsongateway` field; that is what the script uses, and it
  checks a cell rather than the count so the blank-row failure cannot come back silently. Euronext
  writes every name in capitals, so the names come from Oslo Børs's own NewsWeb issuer list instead,
  joined on the ticker.

**What this does not promise is that the price feed can price all of it.** The exchanges say what
they list; they say nothing about what Yahoo calls the same instrument. The symbols follow the same
"ERIC B" convention `scripts/fetch-prices.mjs` already translates, so they should — but Yahoo
answered `429` from this machine too on the day this was built, so not one of the new symbols has
been round-tripped through the feed. That is the first thing to check when an address that Yahoo
will talk to is available.

## An unmerged branch worth knowing about

`universe-from-exchanges` was the first attempt at this, and the Nordic half of it has now been
redone on `main` from the same sources. What is still only on the branch: **Nasdaq's US screener**,
which carries market caps — they are null everywhere in the universe today, which is why the league
cannot filter on company size — and **JPX's company master** for Tokyo with its TOPIX size classes.
Its `verify-universe` script, which asks the feed about every symbol in one pass, is the other
useful piece, and it has to run from a domestic address rather than a GitHub runner.

## Picking this up again

Everything is committed and pushed, CI and the post-deploy check are green, and the site is live.

One loose end closed itself: **Bufab and ShaMaran** were in Firestore but not in the seed, added by
hand because the old Stockholm lists missed them. Nasdaq lists both, so they now come back from a
fresh seed like everything else — ShaMaran as `SNM SDB` on First North, and again as `SNM` on
Euronext Growth Oslo, where it is also listed.

## The price feed does not work from GitHub Actions

Yahoo refuses GitHub's address ranges outright. Two price runs on two different runners both came
back `HTTP 429` on the first request, and a probe from a third runner found no way in at all:
`query1` and `query2`, `spark` and `chart`, and a cookie-and-crumb session of the kind `yfinance`
uses were all 429. Stooq, the obvious fallback, still answers its challenge page. This is not
pacing — the runs ask for two symbols in one request.

The code is correct and the symbols are right; the address is the problem. So the options are:

1. **Enter prices by hand** from the admin grid, which is what happens today and works.
2. **Run `scripts/fetch-prices.mjs` from a machine with a domestic address** — a laptop on a cron,
   or anything not in a datacentre. It needs only `SITE_URL` and `CRON_SECRET` and posts back to
   the same route, so nothing else changes.
3. **Find a feed that serves datacentre addresses.** Twelve Data does, but not the Nordics without
   paying. This is the one that would settle it properly.

## Open decisions

- **Cloud Storage for profile pictures is not available.** The project is on the Spark plan and
  Firebase now requires a billing account to provision a bucket. Pictures are therefore data URLs on
  the profile document, written at 192px, which every reader of the league table downloads. Upgrading
  to Blaze is what unblocks it — and would also lift the daily read cap. In practice this is cheaper
  than it sounds: a 192px JPEG lands around 10 KB, so the 200 KB ceiling in the rules is a guard
  rail and not the going rate, and the whole league's pictures are a few hundred kilobytes.
- **Two Nordic markets are still empty, and both are arguably right.** **NGM PepMarket** is a
  private-placement platform rather than a quoted market — NGM's own equity API reports exactly two
  segments and that is not one of them — and **Spotlight Denmark** has nothing that Spotlight's
  search knows about. Both can be closed from the admin panel.

  **`SE_SME` is NGM Growth Market**, not Nordic SME. NGM's site does not use the old name anywhere.
  The market code is unchanged so no instrument id moves; only the name players see.

  **Market caps are still null everywhere**, which no longer affects the Nordic segment labels —
  those are Nasdaq's own now — but does mean the league cannot filter on company size. The
  `minMarketCapMusd` setting exists and has nothing to compare against. Nasdaq's US screener carries
  the number; see the branch note above.
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
- **The universe is 1,986 instruments now**, up from 450, and four times the ~300 that exhausted the
  daily read quota once. That is survivable only because no player-facing page reads the collection
  any more: `/month` loads one market at a time or queries a prefix, `/history` asks for
  `isBenchmark` and gets two documents, and the picks carry their own symbols and names so no table
  needs the universe at all.

  **The admin page is the exception** — it subscribes to all of it, and that is now a two-thousand
  document read on a cold cache. One person opens it, rarely, and the cache is persistent, so it is
  not urgent. But it is the page to look at first if the quota is ever close again, and the fix is
  the same one the picker already uses: load a market at a time rather than the lot.
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
- **The Nordic segments are not a judgement call and never need to be one.** Every one of those
  exchanges publishes its own current listing; three of them just answer oddly until one header or
  one path segment is right, and each of those has now cost this project a market that looked empty
  and was not. Before concluding that a venue publishes nothing a script can read, check the
  user-agent, the path and whether the fields came back blank rather than absent — see the note
  above `build-universe.mjs`'s fetches.
- **Yahoo throttles by address**, and hard. Twenty-two symbols at a seventh of a second apart got
  all but one of them a 429, from a domestic connection — a shared runner IP will be worse. That is
  why the fetcher batches through `spark` at twenty symbols a request: a month's whole universe is
  three or four calls a day. Do not "simplify" it back to one request per symbol.
