# Status

Where the project stands, so you can pick it up without re-reading anything.

Last updated: 2026-09-23

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

1. **`npm run seed`** — needed again, for NGM. The universe in the code is ahead of Firestore:
   `SE_NGM` has 6 names and `SE_SME` 88, and neither is in the database yet, which is why the pick
   editor shows "No eligible stock in this market matches that" when NGM is selected. Nothing is
   broken; the instruments simply live in Firestore and the seed is what puts them there.

   It was last run on 2026-09-22, when Firestore took 37 markets and 450 instruments. Re-run it
   whenever `lib/universe.ts` or `lib/universe.generated.ts` changes — every write is a merge on a
   stable document id, so it is safe to repeat and it only ever adds.

   One thing it will not do is rename a market. `SE_SME` is "NGM Growth Market" in the code now and
   the seed does update the market document, so that one is covered — but if a market ever needs
   removing rather than renaming, that is the admin panel.
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

## An unmerged branch worth knowing about

`universe-from-exchanges` holds a second, broader attempt at the universe: 3,818 instruments across
33 of the 37 markets, generated from each exchange's own lists rather than matched by name —
Nasdaq's Nordic screener for the Large/Mid/Small segments of all four Nasdaq countries, Nasdaq's US
screener with market caps, JPX's company master for Tokyo, index constituent tables for the rest.
The generator and its README are on the branch under `scripts/build-universe/`.

It is **not merged and not verified**. None of those 3,818 names has been through the matching that
`resolve-tickers.mjs` does, and the machine that built it was answered `HTTP 429` by Yahoo on every
request, so it could not be checked against the feed either. Only the NGM part was brought across,
through the existing matcher, which is why NGM's names are trustworthy and the rest are not yet.

What is worth taking from it, in rough order of value: Nasdaq's segment-filtered screener would
replace the judgement calls behind the Large/Mid/Small labels and fill Helsinki, Copenhagen and
Reykjavík; the US screener carries market caps, which are null everywhere today; and the branch's
`verify-universe` script asks the feed about every symbol in one pass — though after the finding
above it has to run from a domestic address, not a GitHub runner.

## Picking this up again

Everything is committed and pushed, CI and the post-deploy check are green, and the site is live.
Two loose ends, neither of them urgent:

- **Bufab and ShaMaran are in Firestore but not in the seed.** They were added by hand before the
  Stockholm lists were generated, and the generated lists do not contain them — ShaMaran because the
  First North constituents do not list it (it trades as a depository receipt), Bufab because the
  name did not match. They work and are pickable; they would just not come back from a fresh seed
  somewhere else. Either add them to `INSTRUMENTS` in `lib/universe.ts`, or leave them.
- **57 names of ~770 were left unmatched or ambiguous** when the Swedish lists were resolved. Run
  `node scripts/resolve-tickers.mjs` to see them. Most are renames the ticker source spells
  differently — "Know IT" against "Knowit", "Mekonomen" against "MEKO" — and the ambiguous ones are
  real share-class choices (SBB B or SBB D). Each needs a person to say which, which is why none of
  them were guessed.

  Three of them are NGM's: `Obducat PREF B` and `Preservia Hyresfastigheter PREF` are ambiguous
  between the ordinary and the preference line, and `Northern CapSek Ventures PREF` is the one name
  TradingView does not carry at all. All three are preference shares, which is a fair thing for the
  match to refuse to guess at.

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
- **NGM is filled now; only PepMarket is still empty.** NGM publishes a list after all. Its market
  pages are a single-page app whose own bundle names the API behind them, and it returns every NGM
  equity with its segment. The catch that hid it the first time: `ngm.se` answers `406` to any
  request without a browser user-agent, which reads exactly like a venue that publishes nothing.
  Worth remembering before writing another one off.

  `resolve-tickers.mjs` fetches it alongside Spotlight and puts the names through the same matcher,
  so NGM's tickers are confirmed against a real listing rather than taken on NGM's word —
  TradingView's Swedish screener carries 239 NGM listings, which is what makes that work. 94 of 97
  resolved; the three left are named below.

  **`SE_SME` is NGM Growth Market now**, not Nordic SME. NGM's site does not use the old name
  anywhere and its API reports exactly two equity segments. The market code is unchanged so no
  instrument id moves; only the name players see.

  Still empty: **NGM PepMarket**, which is a private-placement platform rather than a quoted market
  — NGM's equity API reports two segments and that is not one of them — and **Spotlight Denmark**.
  Both are arguably correct as empty and both can be closed from the admin panel.

  Market caps are all null, so the Large/Mid/Small labels are placement by judgement rather than by
  the current Nasdaq segmentation. Nothing depends on them but the heading a company appears under,
  and moving one is a dropdown in the admin panel. **Nasdaq does publish the real segmentation** —
  `api.nasdaq.com/api/nordic/screener/shares` takes `market` and `segment` filters and returns the
  whole Nordic main market, 701 names with the exchange's own Large/Mid/Small split. That would
  replace the judgement calls and fill Helsinki, Copenhagen and Reykjavík the same way. It is on the
  `universe-from-exchanges` branch, unmerged — see the note at the end.
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
- **The universe is 450 instruments now, not the ~300 it was** when the quota blew up. `/month` and
  the admin panel genuinely need it. `/history` used to buy all of it to draw two benchmark pills
  and now queries `isBenchmark` instead, which is a handful of documents — the picks carry their own
  symbols and names, so no page needs the universe to render a table.
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
