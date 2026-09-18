# Status

Where the project stands, so you can pick it up without re-reading anything.

Last updated: 2026-09-18

## State

The application is written and pushed. **It has never been built or run.** `npm` was unavailable
in the environment it was written in, so there is no typecheck or build behind it — Vercel's first
deploy is the first real compile. Budget for one or two type errors.

Nothing is connected yet: no Firebase project, no Vercel project, no data.

## Next steps, in order

1. **Create the Firebase project** — Firestore, plus Auth with Email link and Google enabled.
2. **`cp env.example .env.local`** and fill it in.
3. **`npm install && npm run typecheck`** — do this before deploying; it catches the compile
   errors that were never checked.
4. **`npm run seed`** — writes markets, instruments and league settings.
5. **`npm run dev`**, sign in once, then **`npm run seed -- --admin your@email.com`** to make
   yourself admin.
6. **`firebase deploy --only firestore:rules`** — easy to forget, and without it Firestore denies
   everything. The rules now also cover `chat/` and the profile photo cap, so a stale deploy makes
   the Chat tab and picture upload fail with a permission error rather than anything clearer.
7. **Import the repo on Vercel**, add the same environment variables, deploy.
8. **Firebase → Authentication → Settings → Authorized domains** — add the Vercel domain, or
   sign-in fails silently.
9. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL and redeploy.

Full detail for each step is in the [README](README.md).

## Open decisions

- **Price feed.** Nothing is wired up. `PRICE_PROVIDER=manual` means prices are typed into the
  admin panel; the weekly cron still runs and reports which tickers are waiting. To automate,
  implement `httpProvider.fetchQuotes` in [`lib/prices/index.ts`](lib/prices/index.ts). The
  interface was left empty rather than guessed, because request and response shapes differ per
  vendor and a wrong guess fails silently at 06:00 on a Monday.
- **Vercel plan.** `vercel.json` schedules the cron for Mondays 06:00 UTC. Hobby-plan cron is
  limited to roughly one run a day with no timing guarantee. Running it daily is harmless — each
  run overwrites one named week field rather than adding checkpoints — but if it does not fire at
  all, use an external scheduler with an `Authorization: Bearer <CRON_SECRET>` header.

## Known gaps

- **Mid Cap, Small Cap and the Nordic growth lists are seeded empty.** The markets exist and work;
  only listings that were unambiguous got seeded, because segment membership reshuffles annually.
  Add names from the admin panel.
- **Market caps are all null.** `minMarketCapMusd` is only enforced where a value is set, so the
  real penny-stock guard is the curated `eligible` flag you control in the admin panel.
- **No tests.**

## Things worth not re-litigating

- Firebase, not Supabase. An earlier Supabase implementation was removed.
- The Firebase web config in `NEXT_PUBLIC_FIREBASE_*` is public by design and safe in this repo.
  [`firestore.rules`](firestore.rules) is the actual access control — review that file, not the
  API key.
- Picks are sealed until the month locks at the database level, not in the interface. That is why
  the app reads only your own picks document while a round is open: listing the collection is
  refused by the rules, deliberately.
